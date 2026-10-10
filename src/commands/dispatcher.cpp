#include "redisx/commands/dispatcher.h"
#include "redisx/memory/accounting.h"
#include "redisx/proto/resp_writer.h"

#include <cctype>
#include <string>

namespace redisx::commands {

namespace {

std::string to_lower(std::string_view sv) {
    std::string s;
    s.reserve(sv.size());
    for (char c : sv) {
        s.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    }
    return s;
}

} // namespace

Dispatcher::Dispatcher() = default;

void Dispatcher::register_command(CommandSpec spec) {
    std::string key = spec.name;
    for (char &c : key) {
        c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    }
    commands_[key] = std::move(spec);
}

const CommandSpec *Dispatcher::find_command(std::string_view name) const {
    std::string key(name);
    for (char &c : key) {
        c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    }
    auto it = commands_.find(key);
    if (it != commands_.end()) {
        return &it->second;
    }
    return nullptr;
}

void Dispatcher::dispatch(
    const proto::Command &cmd,
    db::Keyspace &keyspace,
    std::size_t db_idx,
    core::Buffer &out_buf,
    std::size_t &out_db_idx,
    memory::EvictionManager *evict_mgr,
    db::TTLManager *ttl_mgr
) const {
    if (cmd.empty()) {
        return;
    }

    const std::string &name_upper = cmd.name_upper();
    const CommandSpec *spec = find_command(name_upper);

    if (spec == nullptr) {
        std::string err = "ERR unknown command '" + name_upper + "'";
        if (cmd.arg_count() > 1) {
            err += ", with args: ";
            for (std::size_t i = 1; i < cmd.arg_count(); ++i) {
                if (i > 1) {
                    err += ", ";
                }
                err += "'" + cmd.arg(i) + "'";
            }
        }
        proto::RespWriter::write_error(out_buf, err);
        return;
    }

    // Arity validation
    bool arity_valid = true;
    if (spec->arity > 0) {
        if (cmd.arg_count() != static_cast<std::size_t>(spec->arity)) {
            arity_valid = false;
        }
    } else if (spec->arity < 0) {
        if (cmd.arg_count() < static_cast<std::size_t>(-spec->arity)) {
            arity_valid = false;
        }
    }

    if (!arity_valid) {
        std::string err = "ERR wrong number of arguments for '" + to_lower(spec->name) + "' command";
        proto::RespWriter::write_error(out_buf, err);
        return;
    }

    // Pre-command memory check & eviction
    if (evict_mgr != nullptr && ttl_mgr != nullptr) {
        if (evict_mgr->maxmemory() > 0) {
            bool under_limit = evict_mgr->perform_eviction(keyspace, *ttl_mgr);
            if (!under_limit && (spec->flags & CMD_FLAG_DENYOOM)) {
                proto::RespWriter::write_error(
                    out_buf, "OOM command not allowed when used memory > 'maxmemory'");
                return;
            }
        }
    }

    // Execute command handler
    spec->handler(cmd, keyspace, db_idx, out_buf, out_db_idx);
}

} // namespace redisx::commands
