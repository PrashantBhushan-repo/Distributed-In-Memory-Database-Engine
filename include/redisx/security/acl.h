#ifndef REDISX_SECURITY_ACL_H
#define REDISX_SECURITY_ACL_H

#include "redisx/commands/dispatcher.h"
#include "redisx/proto/command.h"

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace redisx::security {

enum CommandCategory : std::uint32_t {
    CMD_CAT_NONE = 0,
    CMD_CAT_READ = 1 << 0,
    CMD_CAT_WRITE = 1 << 1,
    CMD_CAT_ADMIN = 1 << 2,
    CMD_CAT_DANGEROUS = 1 << 3,
    CMD_CAT_PUBSUB = 1 << 4,
    CMD_CAT_FAST = 1 << 5,
    CMD_CAT_SLOW = 1 << 6,
    CMD_CAT_ALL = 0xFFFFFFFF
};

struct User {
    std::string name;
    bool enabled{true};
    bool nopass{true};
    std::vector<std::string> password_hashes;
    std::unordered_set<std::string> allowed_commands;
    std::unordered_set<std::string> disabled_commands;
    std::uint32_t category_mask{CMD_CAT_ALL};
    std::vector<std::string> key_patterns{"*"};
    std::vector<std::string> channel_patterns{"*"};
};

class AclEngine {
  public:
    AclEngine();

    bool set_user_rules(const std::string &username, const std::vector<std::string> &rules, std::string &err_msg);
    [[nodiscard]] const User *get_user(const std::string &username) const;
    [[nodiscard]] User *get_user_mut(const std::string &username);
    bool del_user(const std::string &username);

    [[nodiscard]] std::vector<std::string> list_users() const;
    [[nodiscard]] std::vector<std::string> list_categories() const;

    [[nodiscard]] bool check_permission(
        const User &user,
        const proto::Command &cmd,
        const commands::CommandSpec *spec
    ) const;

  private:
    std::unordered_map<std::string, User> users_;
};

void register_acl_commands(commands::Dispatcher &dispatcher, AclEngine &acl_engine);

} // namespace redisx::security

#endif // REDISX_SECURITY_ACL_H
