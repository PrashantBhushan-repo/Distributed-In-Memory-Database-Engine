#include "redisx/commands/dispatcher.h"
#include "redisx/memory/accounting.h"
#include "redisx/proto/resp_writer.h"

#include <cctype>
#include <string>
#include <stdexcept>
#include "redisx/commands/keys.h"

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
std::vector<CommandSpec> Dispatcher::command_specs() const {
    std::vector<CommandSpec> specs;
    for (const auto &[name, spec] : commands_) { (void)name; specs.push_back(spec); }
    std::sort(specs.begin(), specs.end(), [](const auto &a, const auto &b) { return a.name < b.name; });
    return specs;
}

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

    if (!db::TTLManager::loading_aof && (spec->flags & CMD_FLAG_WRITE) && write_guard_ && !write_guard_()) {
        proto::RespWriter::write_error(out_buf, "MISCONF Append-only persistence failed; writes are disabled"); return;
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

    if (ttl_mgr != nullptr) ttl_mgr->attach(keyspace);

    bool set_condition_failed = false;
    if (name_upper == "SET" && cmd.arg_count() > 3) {
        const bool exists = keyspace.db_exists(db_idx, cmd.arg(1));
        for (std::size_t i = 3; i < cmd.arg_count(); ++i) {
            const auto option = to_lower(cmd.arg(i));
            if ((option == "nx" && exists) || (option == "xx" && !exists)) set_condition_failed = true;
            if (option == "ex" || option == "px" || option == "exat" || option == "pxat") ++i;
        }
    }
    // Use a dedicated reply buffer so failure/parking markers cannot consume earlier pipelined replies.
    core::Buffer reply;
    try { spec->handler(cmd, keyspace, db_idx, reply, out_db_idx); }
    catch (const std::invalid_argument &) { proto::RespWriter::write_error(out_buf, "ERR value is not a valid number"); return; }
    catch (const std::out_of_range &) { proto::RespWriter::write_error(out_buf, "ERR value is out of range"); return; }
    for (const auto index : command_key_indices(cmd)) keyspace.get_db(db_idx).update_accounting(cmd.arg(index));
    const auto response = reply.peek_string_view();
    if (!db::TTLManager::loading_aof && write_observer_ && !set_condition_failed && (spec->flags & CMD_FLAG_WRITE) && !response.empty() &&
        response.front() != '-' && !response.starts_with("+PARK_") &&
        !write_observer_(cmd, keyspace, db_idx, response)) {
        proto::RespWriter::write_error(out_buf, "MISCONF Append-only persistence failed; writes are disabled");
        return;
    }
    out_buf.append(response);
}

} // namespace redisx::commands
