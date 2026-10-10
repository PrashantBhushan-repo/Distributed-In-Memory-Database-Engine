#include "redisx/security/acl.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/security/auth.h"

#include <algorithm>

namespace redisx::security {

AclEngine::AclEngine() {
    User default_u;
    default_u.name = "default";
    default_u.enabled = true;
    default_u.nopass = true;
    default_u.category_mask = CMD_CAT_ALL;
    default_u.key_patterns = {"*"};
    default_u.channel_patterns = {"*"};
    users_["default"] = default_u;
}

const User *AclEngine::get_user(const std::string &username) const {
    auto it = users_.find(username);
    return (it != users_.end()) ? &it->second : nullptr;
}

User *AclEngine::get_user_mut(const std::string &username) {
    auto it = users_.find(username);
    return (it != users_.end()) ? &it->second : nullptr;
}

bool AclEngine::del_user(const std::string &username) {
    if (username == "default") return false;
    return users_.erase(username) > 0;
}

std::vector<std::string> AclEngine::list_users() const {
    std::vector<std::string> res;
    for (const auto &[name, u] : users_) {
        res.push_back(name);
    }
    return res;
}

std::vector<std::string> AclEngine::list_categories() const {
    return {"read", "write", "admin", "dangerous", "pubsub", "fast", "slow", "all"};
}

bool AclEngine::set_user_rules(const std::string &username, const std::vector<std::string> &rules, std::string &err_msg) {
    auto it = users_.find(username);
    if (it == users_.end()) {
        User u;
        u.name = username;
        u.enabled = true;
        u.nopass = true;
        u.category_mask = CMD_CAT_NONE;
        users_[username] = u;
    }
    User &u = users_[username];

    for (const auto &rule : rules) {
        if (rule == "on") {
            u.enabled = true;
        } else if (rule == "off") {
            u.enabled = false;
        } else if (rule == "nopass") {
            u.nopass = true;
            u.password_hashes.clear();
        } else if (rule.rfind(">", 0) == 0) {
            std::string raw_pass = rule.substr(1);
            u.password_hashes.push_back(sha256_hex(raw_pass));
            u.nopass = false;
        } else if (rule.rfind("~", 0) == 0) {
            u.key_patterns.push_back(rule.substr(1));
        } else if (rule.rfind("&", 0) == 0) {
            u.channel_patterns.push_back(rule.substr(1));
        } else if (rule == "+@all") {
            u.category_mask = CMD_CAT_ALL;
        } else if (rule == "-@all") {
            u.category_mask = CMD_CAT_NONE;
        } else if (rule == "+@read") {
            u.category_mask |= CMD_CAT_READ;
        } else if (rule == "-@read") {
            u.category_mask &= ~CMD_CAT_READ;
        } else if (rule == "+@write") {
            u.category_mask |= CMD_CAT_WRITE;
        } else if (rule == "-@write") {
            u.category_mask &= ~CMD_CAT_WRITE;
        } else if (rule == "+@admin") {
            u.category_mask |= CMD_CAT_ADMIN;
        } else if (rule == "-@admin") {
            u.category_mask &= ~CMD_CAT_ADMIN;
        } else if (rule == "+@dangerous") {
            u.category_mask |= CMD_CAT_DANGEROUS;
        } else if (rule == "-@dangerous") {
            u.category_mask &= ~CMD_CAT_DANGEROUS;
        } else if (rule.rfind("+", 0) == 0) {
            std::string c = rule.substr(1);
            std::transform(c.begin(), c.end(), c.begin(), ::toupper);
            u.allowed_commands.insert(c);
            u.disabled_commands.erase(c);
        } else if (rule.rfind("-", 0) == 0) {
            std::string c = rule.substr(1);
            std::transform(c.begin(), c.end(), c.begin(), ::toupper);
            u.disabled_commands.insert(c);
            u.allowed_commands.erase(c);
        } else {
            err_msg = "ERR Unrecognized ACL rule '" + rule + "'";
            return false;
        }
    }
    return true;
}

bool AclEngine::check_permission(
    const User &user,
    const proto::Command &cmd,
    const commands::CommandSpec *spec
) const {
    if (!user.enabled) return false;

    std::string name = cmd.name_upper();

    if (user.disabled_commands.count(name)) return false;

    if (user.allowed_commands.count(name)) {
        // Explicitly allowed
    } else {
        std::uint32_t cmd_cat = CMD_CAT_READ;
        if (spec) {
            if (spec->flags & commands::CMD_FLAG_ADMIN) cmd_cat = CMD_CAT_ADMIN | CMD_CAT_DANGEROUS;
            else if (spec->flags & commands::CMD_FLAG_WRITE) cmd_cat = CMD_CAT_WRITE;
        }

        if ((user.category_mask & cmd_cat) == 0) {
            return false;
        }
    }

    // Key pattern checks
    if (!user.key_patterns.empty() && cmd.arg_count() >= 2) {
        std::string key = cmd.arg(1);
        bool matched = false;
        for (const auto &pat : user.key_patterns) {
            if (pat == "*" || commands::string_match_glob(pat, key)) {
                matched = true;
                break;
            }
        }
        if (!matched) return false;
    }

    return true;
}

void register_acl_commands(commands::Dispatcher &dispatcher, AclEngine &acl_engine) {
    // ACL SETUSER / GETUSER / LIST / WHOAMI / CAT / DELUSER
    dispatcher.register_command({"ACL", -2, commands::CMD_FLAG_ADMIN, [&acl_engine](
                                                                            const proto::Command &cmd,
                                                                            db::Keyspace &,
                                                                            std::size_t,
                                                                            core::Buffer &out_buf,
                                                                            std::size_t &
                                                                        ) {
        std::string sub = cmd.arg(1);
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);

        if (sub == "SETUSER" && cmd.arg_count() >= 3) {
            std::string username = cmd.arg(2);
            std::vector<std::string> rules;
            for (std::size_t i = 3; i < cmd.arg_count(); ++i) {
                rules.push_back(cmd.arg(i));
            }
            std::string err;
            if (acl_engine.set_user_rules(username, rules, err)) {
                proto::RespWriter::write_simple_string(out_buf, "OK");
            } else {
                proto::RespWriter::write_error(out_buf, err);
            }
        } else if (sub == "GETUSER" && cmd.arg_count() >= 3) {
            const User *u = acl_engine.get_user(cmd.arg(2));
            if (!u) {
                proto::RespWriter::write_null_bulk(out_buf);
            } else {
                proto::RespWriter::write_array_header(out_buf, 4);
                proto::RespWriter::write_bulk_string(out_buf, "flags");
                proto::RespWriter::write_array_header(out_buf, u->enabled ? 1 : 0);
                if (u->enabled) proto::RespWriter::write_bulk_string(out_buf, "on");

                proto::RespWriter::write_bulk_string(out_buf, "passwords");
                proto::RespWriter::write_array_header(out_buf, u->password_hashes.size());
                for (const auto &p : u->password_hashes) {
                    proto::RespWriter::write_bulk_string(out_buf, p);
                }
            }
        } else if (sub == "LIST") {
            auto users = acl_engine.list_users();
            proto::RespWriter::write_array_header(out_buf, users.size());
            for (const auto &u : users) {
                proto::RespWriter::write_bulk_string(out_buf, "user " + u);
            }
        } else if (sub == "WHOAMI") {
            proto::RespWriter::write_bulk_string(out_buf, "default");
        } else if (sub == "CAT") {
            auto cats = acl_engine.list_categories();
            proto::RespWriter::write_array_header(out_buf, cats.size());
            for (const auto &c : cats) {
                proto::RespWriter::write_bulk_string(out_buf, c);
            }
        } else if (sub == "DELUSER" && cmd.arg_count() >= 3) {
            if (acl_engine.del_user(cmd.arg(2))) {
                proto::RespWriter::write_integer(out_buf, 1);
            } else {
                proto::RespWriter::write_integer(out_buf, 0);
            }
        } else {
            proto::RespWriter::write_error(out_buf, "ERR Unknown ACL subcommand '" + cmd.arg(1) + "'");
        }
    }});
}

} // namespace redisx::security
