#ifndef REDISX_CONFIG_CONFIG_H
#define REDISX_CONFIG_CONFIG_H

#include "redisx/commands/dispatcher.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

namespace redisx::config {

enum class ParamType {
    String,
    Int,
    Bool,
    Size,
    Enum
};

struct ConfigParam {
    std::string name;
    ParamType type;
    std::string value;
    std::string default_val;
    std::int64_t min_val{0};
    std::int64_t max_val{0};
    bool is_mutable{true};
    std::vector<std::string> enum_choices;
};

class ConfigManager {
  public:
    ConfigManager();

    void register_param(ConfigParam param);

    bool load_file(const std::string &file_path);
    void load_cli_args(int argc, char **argv);

    [[nodiscard]] std::vector<std::pair<std::string, std::string>> config_get(const std::string &pattern) const;
    bool config_set(const std::string &param_name, const std::string &value, std::string &err_msg);
    bool config_rewrite(const std::string &file_path);

    [[nodiscard]] std::string get_string(const std::string &param_name, const std::string &def = "") const;
    [[nodiscard]] std::int64_t get_int(const std::string &param_name, std::int64_t def = 0) const;
    [[nodiscard]] bool get_bool(const std::string &param_name, bool def = false) const;

  private:
    void register_default_params();
    std::unordered_map<std::string, ConfigParam> params_;
    std::string loaded_config_file_;
};

#include "redisx/memory/eviction.h"

void register_config_commands(commands::Dispatcher &dispatcher, ConfigManager &config_mgr, memory::EvictionManager *evict_mgr = nullptr);

} // namespace redisx::config

#endif // REDISX_CONFIG_CONFIG_H
