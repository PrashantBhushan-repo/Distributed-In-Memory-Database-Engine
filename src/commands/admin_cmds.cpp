#include "redisx/commands/admin_cmds.h"
#include "redisx/commands/keys.h"
#include "redisx/commands/numeric.h"
#include "redisx/core/fault_injection.h"
#include "redisx/proto/resp_writer.h"
#include <algorithm>
#include <charconv>
#include <cmath>
#include <sstream>
namespace redisx::commands {
static std::string client_info(const net::Connection &conn) {
    auto &client = const_cast<net::Connection &>(conn);
    return "id=" + std::to_string(conn.fd()) + " addr=" + conn.peer_address() + " fd=" + std::to_string(conn.fd()) +
        " name=" + conn.client_name + " db=" + std::to_string(conn.selected_db) + " qbuf=" + std::to_string(client.in_buffer().readable_bytes()) +
        " obl=" + std::to_string(client.out_buffer().readable_bytes()) + "\n";
}
void register_admin_commands(Dispatcher &dispatcher,
    std::unordered_map<int, std::shared_ptr<net::Connection>> &active_clients,
    std::function<std::shared_ptr<net::Connection>()> current_client) {
    dispatcher.register_command({"CLIENT", -2, CMD_FLAG_ADMIN, [&active_clients, current_client](const proto::Command &cmd, db::Keyspace &, std::size_t, core::Buffer &out, std::size_t &) {
        auto sub = cmd.arg(1); std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
        auto current = current_client ? current_client() : nullptr;
        if (sub == "LIST" && cmd.arg_count() == 2) {
            std::string listing;
            for (const auto &[fd, conn] : active_clients) { (void)fd; listing += client_info(*conn); }
            proto::RespWriter::write_bulk_string(out, listing);
        } else if (sub == "KILL" && cmd.arg_count() == 4 && (cmd.arg(2) == "ID" || cmd.arg(2) == "id")) {
            const auto id = parse_integer(cmd.arg(3));
            auto found = id >= 0 && id <= INT32_MAX ? active_clients.find(static_cast<int>(id)) : active_clients.end();
            if (found == active_clients.end()) proto::RespWriter::write_integer(out, 0);
            else { found->second->close(); proto::RespWriter::write_integer(out, 1); }
        } else if (!current) proto::RespWriter::write_error(out, "ERR client context unavailable");
        else if (sub == "ID" && cmd.arg_count() == 2) proto::RespWriter::write_integer(out, current->fd());
        else if (sub == "INFO" && cmd.arg_count() == 2) proto::RespWriter::write_bulk_string(out, client_info(*current));
        else if (sub == "GETNAME" && cmd.arg_count() == 2) {
            if (current->client_name.empty()) proto::RespWriter::write_null_bulk(out);
            else proto::RespWriter::write_bulk_string(out, current->client_name);
        } else if (sub == "SETNAME" && cmd.arg_count() == 3) {
            if (std::any_of(cmd.arg(2).begin(), cmd.arg(2).end(), [](unsigned char c) { return c <= 32 || c >= 127; })) {
                proto::RespWriter::write_error(out, "ERR Client names cannot contain spaces or special characters"); return;
            }
            current->client_name = cmd.arg(2); proto::RespWriter::write_simple_string(out, "OK");
        } else proto::RespWriter::write_error(out, "ERR unsupported CLIENT subcommand or wrong number of arguments");
    }});
    dispatcher.register_command({"HELLO", -1, CMD_FLAG_READONLY, [current_client](const proto::Command &cmd, db::Keyspace &, std::size_t, core::Buffer &out, std::size_t &) {
        if (cmd.arg_count() > 1 && cmd.arg(1) != "2") { proto::RespWriter::write_error(out, "NOPROTO this version supports RESP2 only"); return; }
        if (cmd.arg_count() > 2) { proto::RespWriter::write_error(out, "ERR HELLO options are not supported; use AUTH and CLIENT SETNAME"); return; }
        auto current = current_client ? current_client() : nullptr;
        proto::RespWriter::write_array_header(out, 12);
        for (const auto &[key, value] : std::vector<std::pair<std::string, std::string>>{{"server", "redisx"}, {"version", "0.1.0"}}) {
            proto::RespWriter::write_bulk_string(out, key); proto::RespWriter::write_bulk_string(out, value);
        }
        proto::RespWriter::write_bulk_string(out, "proto"); proto::RespWriter::write_integer(out, 2);
        proto::RespWriter::write_bulk_string(out, "id"); proto::RespWriter::write_integer(out, current ? current->fd() : 0);
        proto::RespWriter::write_bulk_string(out, "mode"); proto::RespWriter::write_bulk_string(out, "standalone");
        proto::RespWriter::write_bulk_string(out, "modules"); proto::RespWriter::write_array_header(out, 0);
    }});
    dispatcher.register_command({"COMMAND", -1, CMD_FLAG_READONLY, [&dispatcher](const proto::Command &cmd, db::Keyspace &, std::size_t, core::Buffer &out, std::size_t &) {
        std::string sub = cmd.arg_count() > 1 ? cmd.arg(1) : "";
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
        auto specs = dispatcher.command_specs();
        if (sub == "COUNT") { proto::RespWriter::write_integer(out, static_cast<std::int64_t>(specs.size())); return; }
        if (sub == "DOCS") { proto::RespWriter::write_array_header(out, 0); return; }
        if (sub == "LIST") {
            proto::RespWriter::write_array_header(out, specs.size());
            for (const auto &spec : specs) proto::RespWriter::write_bulk_string(out, spec.name);
            return;
        }
        if (!sub.empty() && sub != "INFO") { proto::RespWriter::write_error(out, "ERR unsupported COMMAND subcommand"); return; }
        std::vector<const CommandSpec *> selected;
        if (sub == "INFO" && cmd.arg_count() > 2) for (std::size_t i = 2; i < cmd.arg_count(); ++i) selected.push_back(dispatcher.find_command(cmd.arg(i)));
        else for (const auto &spec : specs) selected.push_back(&spec);
        proto::RespWriter::write_array_header(out, selected.size());
        for (const auto *spec : selected) {
            if (!spec) { proto::RespWriter::write_null_array(out); continue; }
            std::string lower = spec->name; std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
            proto::RespWriter::write_array_header(out, 6);
            proto::RespWriter::write_bulk_string(out, lower); proto::RespWriter::write_integer(out, spec->arity);
            proto::RespWriter::write_array_header(out, 1);
            proto::RespWriter::write_bulk_string(out, (spec->flags & CMD_FLAG_WRITE) ? "write" : (spec->flags & CMD_FLAG_ADMIN) ? "admin" : "readonly");
            auto indices = command_key_indices(proto::Command({spec->name, "key", "key"}));
            proto::RespWriter::write_integer(out, indices.empty() ? 0 : 1);
            proto::RespWriter::write_integer(out, indices.size() > 1 ? -1 : indices.empty() ? 0 : 1);
            proto::RespWriter::write_integer(out, indices.empty() ? 0 : 1);
        }
    }});
    dispatcher.register_command({"DEBUG", -2, CMD_FLAG_ADMIN, [](const proto::Command &cmd, db::Keyspace &keys, std::size_t db, core::Buffer &out, std::size_t &) {
        auto sub = cmd.arg(1); std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
        if (sub == "FAILPOINT" && (cmd.arg_count() == 4 || cmd.arg_count() == 5)) {
            auto mode = cmd.arg(3); std::transform(mode.begin(), mode.end(), mode.begin(), ::tolower);
            core::FailpointMode selected;
            if (mode == "once") selected = core::FailpointMode::Once;
            else if (mode == "always") selected = core::FailpointMode::Always;
            else if (mode == "off") selected = core::FailpointMode::Off;
            else if (mode == "prob" || mode == "probabilistic") selected = core::FailpointMode::Probabilistic;
            else { proto::RespWriter::write_error(out, "ERR invalid failpoint mode"); return; }
            double probability = 1;
            if (cmd.arg_count() == 5) {
                const auto &text = cmd.arg(4);
                const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), probability);
                if (error != std::errc{} || end != text.data() + text.size() || !std::isfinite(probability) || probability < 0 || probability > 1) {
                    proto::RespWriter::write_error(out, "ERR invalid probability"); return;
                }
            }
            core::FaultInjection::instance().set_failpoint(cmd.arg(2), selected, probability);
            proto::RespWriter::write_simple_string(out, "OK");
        } else if (sub == "FAILPOINT-RESET" && cmd.arg_count() == 2) {
            core::FaultInjection::instance().reset(); proto::RespWriter::write_simple_string(out, "OK");
        } else if (sub == "OBJECT" && cmd.arg_count() == 3) {
            const auto *entry = keys.db_get(db, cmd.arg(2));
            if (!entry) { proto::RespWriter::write_error(out, "ERR no such key"); return; }
            std::ostringstream info;
            info << "Value at:" << static_cast<const void *>(entry) << " encoding:" << types::to_string(entry->value.object().encoding()) << " estimatedbytes:" << entry->accounted_bytes;
            proto::RespWriter::write_simple_string(out, info.str());
        } else proto::RespWriter::write_error(out, "ERR unsupported DEBUG subcommand or wrong number of arguments");
    }});
}
}
