#include "redisx/config/config.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/core/logging.h"
#include "redisx/memory/eviction.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <fstream>
#include <sstream>

namespace redisx::config {

ConfigManager::ConfigManager() {
    register_default_params();
}

void ConfigManager::register_param(ConfigParam param) {
    std::string key = param.name;
    std::transform(key.begin(), key.end(), key.begin(), ::tolower);
    params_[key] = std::move(param);
}

void ConfigManager::register_default_params() {
    register_param({"port", ParamType::Int, "6379", "6379", 1, 65535, false, {}});
    register_param({"bind", ParamType::String, "127.0.0.1", "127.0.0.1", 0, 0, false, {}});
    register_param({"requirepass", ParamType::String, "", "", 0, 0, true, {}});
    register_param({"maxmemory", ParamType::Size, "0", "0", 0, 100LL * 1024 * 1024 * 1024, true, {}});
    register_param({"maxmemory-policy", ParamType::Enum, "noeviction", "noeviction", 0, 0, true, {"noeviction", "allkeys-lru", "volatile-lru", "allkeys-random", "volatile-random", "allkeys-lfu", "volatile-lfu", "volatile-ttl"}});
    register_param({"dir", ParamType::String, ".", ".", 0, 0, true, {}});
    register_param({"dbfilename", ParamType::String, "dump.rdb", "dump.rdb", 0, 0, true, {}});
    register_param({"appendonly", ParamType::Bool, "no", "no", 0, 0, true, {}});
    register_param({"appendfilename", ParamType::String, "appendonly.aof", "appendonly.aof", 0, 0, true, {}});
    register_param({"slowlog-log-slower-than", ParamType::Int, "10000", "10000", -1, 10000000, true, {}});
    register_param({"slowlog-max-len", ParamType::Int, "128", "128", 0, 1000000, true, {}});
    register_param({"notify-keyspace-events", ParamType::String, "KEA", "KEA", 0, 0, true, {}});
    register_param({"metrics-port", ParamType::Int, "9121", "9121", 0, 65535, false, {}});
    register_param({"tls-port", ParamType::Int, "0", "0", 0, 65535, false, {}});
    register_param({"tls-cert-file", ParamType::String, "", "", 0, 0, true, {}});
    register_param({"tls-key-file", ParamType::String, "", "", 0, 0, true, {}});
}

bool ConfigManager::load_file(const std::string &file_path) {
    std::ifstream ifs(file_path);
    if (!ifs.is_open()) return false;
    loaded_config_file_ = file_path;

    std::string line;
    while (std::getline(ifs, line)) {
        size_t comment = line.find('#');
        if (comment != std::string::npos) line = line.substr(0, comment);
        std::istringstream iss(line);
        std::string key, val;
        if (iss >> key >> val) {
            std::string err;
            config_set(key, val, err);
        }
    }
    return true;
}

void ConfigManager::load_cli_args(int argc, char **argv) {
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg.rfind("--", 0) == 0 && i + 1 < argc) {
            std::string key = arg.substr(2);
            std::string val = argv[++i];
            std::string err;
            config_set(key, val, err);
        }
    }
}

std::vector<std::pair<std::string, std::string>> ConfigManager::config_get(const std::string &pattern) const {
    std::vector<std::pair<std::string, std::string>> res;
    std::string pat = pattern;
    std::transform(pat.begin(), pat.end(), pat.begin(), ::tolower);

    for (const auto &[name, param] : params_) {
        if (commands::string_match_glob(pat, name)) {
            res.emplace_back(param.name, param.value);
        }
    }
    return res;
}

bool ConfigManager::config_set(const std::string &param_name, const std::string &value, std::string &err_msg) {
    std::string key = param_name;
    std::transform(key.begin(), key.end(), key.begin(), ::tolower);

    auto it = params_.find(key);
    if (it == params_.end()) {
        err_msg = "ERR Unsupported configuration parameter '" + param_name + "'";
        return false;
    }

    auto &param = it->second;

    if (!param.is_mutable) {
        err_msg = "ERR Parameter '" + param_name + "' is read-only / immutable";
        return false;
    }

    if (param.type == ParamType::Int || param.type == ParamType::Size) {
        try {
            std::int64_t val = std::stoll(value);
            if (param.min_val != 0 || param.max_val != 0) {
                if (val < param.min_val || val > param.max_val) {
                    err_msg = "ERR Invalid argument for '" + param_name + "'";
                    return false;
                }
            }
        } catch (...) {
            err_msg = "ERR Invalid integer value for '" + param_name + "'";
            return false;
        }
    } else if (param.type == ParamType::Enum) {
        std::string val_lower = value;
        std::transform(val_lower.begin(), val_lower.end(), val_lower.begin(), ::tolower);
        if (std::find(param.enum_choices.begin(), param.enum_choices.end(), val_lower) == param.enum_choices.end()) {
            err_msg = "ERR Invalid enum value for '" + param_name + "'";
            return false;
        }
    }

    param.value = value;
    return true;
}

bool ConfigManager::config_rewrite(const std::string &file_path) {
    std::string target = file_path.empty() ? loaded_config_file_ : file_path;
    if (target.empty()) target = "redis.conf";

    std::ofstream ofs(target);
    if (!ofs.is_open()) return false;

    ofs << "# Generated by redisx CONFIG REWRITE\r\n";
    for (const auto &[key, param] : params_) {
        ofs << param.name << " " << param.value << "\r\n";
    }
    return true;
}

std::string ConfigManager::get_string(const std::string &param_name, const std::string &def) const {
    std::string key = param_name;
    std::transform(key.begin(), key.end(), key.begin(), ::tolower);
    auto it = params_.find(key);
    return (it != params_.end()) ? it->second.value : def;
}

std::int64_t ConfigManager::get_int(const std::string &param_name, std::int64_t def) const {
    std::string key = param_name;
    std::transform(key.begin(), key.end(), key.begin(), ::tolower);
    auto it = params_.find(key);
    if (it != params_.end()) {
        try { return std::stoll(it->second.value); } catch (...) {}
    }
    return def;
}

bool ConfigManager::get_bool(const std::string &param_name, bool def) const {
    std::string val = get_string(param_name, def ? "yes" : "no");
    std::transform(val.begin(), val.end(), val.begin(), ::tolower);
    return (val == "yes" || val == "true" || val == "1");
}

void register_config_commands(commands::Dispatcher &dispatcher, ConfigManager &config_mgr, memory::EvictionManager *evict_mgr) {
    // CONFIG GET / SET / REWRITE
    dispatcher.register_command({"CONFIG", -2, commands::CMD_FLAG_ADMIN, [&config_mgr, evict_mgr](
                                                                               const proto::Command &cmd,
                                                                               db::Keyspace &,
                                                                               std::size_t,
                                                                               core::Buffer &out_buf,
                                                                               std::size_t &
                                                                           ) {
        std::string sub = cmd.arg(1);
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);

        if (sub == "GET" && cmd.arg_count() >= 3) {
            auto pairs = config_mgr.config_get(cmd.arg(2));
            proto::RespWriter::write_array_header(out_buf, pairs.size() * 2);
            for (const auto &[k, v] : pairs) {
                proto::RespWriter::write_bulk_string(out_buf, k);
                proto::RespWriter::write_bulk_string(out_buf, v);
            }
        } else if (sub == "SET" && cmd.arg_count() >= 4) {
            std::string err;
            if (config_mgr.config_set(cmd.arg(2), cmd.arg(3), err)) {
                if (evict_mgr != nullptr) {
                    std::string param_lower = cmd.arg(2);
                    std::transform(param_lower.begin(), param_lower.end(), param_lower.begin(), ::tolower);
                    if (param_lower == "maxmemory") {
                        try { evict_mgr->set_maxmemory(std::stoull(cmd.arg(3))); } catch (...) {}
                    } else if (param_lower == "maxmemory-policy") {
                        evict_mgr->set_policy(memory::parse_eviction_policy(cmd.arg(3)));
                    }
                }
                proto::RespWriter::write_simple_string(out_buf, "OK");
            } else {
                proto::RespWriter::write_error(out_buf, err);
            }
        } else if (sub == "REWRITE") {
            if (config_mgr.config_rewrite("")) {
                proto::RespWriter::write_simple_string(out_buf, "OK");
            } else {
                proto::RespWriter::write_error(out_buf, "ERR Failed to rewrite config file");
            }
        } else if (sub == "RESETSTAT") {
            proto::RespWriter::write_simple_string(out_buf, "OK");
        } else {
            proto::RespWriter::write_error(out_buf, "ERR Unknown CONFIG subcommand '" + cmd.arg(1) + "'");
        }
    }});
}

} // namespace redisx::config
