#include "redisx/config/config.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/core/logging.h"
#include "redisx/memory/eviction.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <charconv>
#include <iomanip>
#include <limits>
#include "redisx/proto/inline_commands.h"
#include <fstream>
#include <filesystem>
#include "redisx/core/file_io.h"
#include <sys/stat.h>
#include <sstream>

namespace redisx::config {
static std::string quote_config(std::string_view value) {
    constexpr char hex[] = "0123456789abcdef";
    std::string result = "\"";
    for (const auto character : value) {
        const auto c = static_cast<unsigned char>(character);
        if (c == '\\' || c == '"') { result += '\\'; result += static_cast<char>(c); }
        else if (c < 32 || c >= 127) { result += "\\x"; result += hex[c >> 4]; result += hex[c & 15]; }
        else result += static_cast<char>(c);
    }
    return result + '"';
}


ConfigManager::ConfigManager() {
    register_default_params();
}

void ConfigManager::register_param(ConfigParam param) {
    std::string key = param.name;
    std::transform(key.begin(), key.end(), key.begin(), ::tolower);
    params_[key] = std::move(param);
}

void ConfigManager::register_default_params() {
    register_param({"maxclients", ParamType::Int, "10000", "10000", 1, 1000000, false, {}});
    register_param({"tcp-backlog", ParamType::Int, "511", "511", 1, 65535, false, {}});
    register_param({"tcp-keepalive", ParamType::Int, "300", "300", 0, 86400, false, {}});
    register_param({"timeout", ParamType::Int, "0", "0", 0, 86400, false, {}});
    register_param({"save", ParamType::String, "", "", 0, 0, false, {}});
    register_param({"appendfsync", ParamType::Enum, "everysec", "everysec", 0, 0, false, {"always", "everysec", "no"}});
    register_param({"aof-load-truncated", ParamType::Bool, "yes", "yes", 0, 0, false, {}});
    register_param({"repl-backlog-size", ParamType::Size, "1048576", "1048576", 1, 1073741824, false, {}});
    register_param({"port", ParamType::Int, "6379", "6379", 1, 65535, false, {}});
    register_param({"bind", ParamType::String, "127.0.0.1", "127.0.0.1", 0, 0, false, {}});
    register_param({"requirepass", ParamType::String, "", "", 0, 0, true, {}});
    register_param({"maxmemory", ParamType::Size, "0", "0", 0, 100LL * 1024 * 1024 * 1024, true, {}});
    register_param({"maxmemory-policy", ParamType::Enum, "noeviction", "noeviction", 0, 0, true, {"noeviction", "allkeys-lru", "volatile-lru", "allkeys-random", "volatile-random", "allkeys-lfu", "volatile-lfu", "volatile-ttl"}});
    register_param({"dir", ParamType::String, ".", ".", 0, 0, false, {}});
    register_param({"dbfilename", ParamType::String, "dump.rdb", "dump.rdb", 0, 0, false, {}});
    register_param({"appendonly", ParamType::Bool, "no", "no", 0, 0, false, {}});
    register_param({"appendfilename", ParamType::String, "appendonly.aof", "appendonly.aof", 0, 0, false, {}});
    register_param({"slowlog-log-slower-than", ParamType::Int, "10000", "10000", -1, 10000000, true, {}});
    register_param({"slowlog-max-len", ParamType::Int, "128", "128", 0, 1000000, true, {}});
    register_param({"notify-keyspace-events", ParamType::String, "KEA", "KEA", 0, 0, true, {}});
    register_param({"metrics-port", ParamType::Int, "9121", "9121", 0, 65535, false, {}});
    register_param({"tls-port", ParamType::Int, "0", "0", 0, 65535, false, {}});
    register_param({"tls-cert-file", ParamType::String, "", "", 0, 0, false, {}});
    register_param({"tls-key-file", ParamType::String, "", "", 0, 0, false, {}});
}

bool ConfigManager::load_file(const std::string &file_path) {
    std::ifstream input(file_path);
    if (!input) return false;
    const auto previous = params_;
    std::string line;
    std::size_t number = 0;
    while (std::getline(input, line)) {
        ++number;
        char quote = 0;
        bool escaped = false;
        for (std::size_t i = 0; i < line.size(); ++i) {
            const char c = line[i];
            if (escaped) { escaped = false; continue; }
            if (c == '\\' && quote == '"') { escaped = true; continue; }
            if (quote) { if (c == quote) quote = 0; }
            else if (c == '"' || c == '\'') quote = c;
            else if (c == '#') { line.resize(i); break; }
        }
        auto parsed = proto::parse_inline_command(line);
        std::string error;
        if (parsed.is_error() || (!parsed.value().empty() &&
            (parsed.value().arg_count() != 2 || !config_set(parsed.value().arg(0), parsed.value().arg(1), error, true)))) {
            REDISX_LOG_ERROR("Invalid configuration at %s:%llu: %s", file_path.c_str(),
                static_cast<unsigned long long>(number), error.c_str());
            params_ = previous;
            return false;
        }
    }
    if (input.bad()) { params_ = previous; return false; }
    loaded_config_file_ = file_path;
    return true;
}

bool ConfigManager::load_cli_args(int argc, char **argv) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--version" || arg == "--help") continue;
        if (arg == "-c" || arg == "--config") { if (++i == argc) return false; continue; }
        if (!arg.starts_with('-')) continue;
        const std::string key = arg == "-p" ? "port" : arg == "-h" ? "bind" : arg.starts_with("--") ? arg.substr(2) : "";
        if (key.empty() || i + 1 == argc) return false;
        std::string error;
        if (!config_set(key, argv[++i], error, true)) {
            REDISX_LOG_ERROR("%s", error.c_str()); return false;
        }
    }
    return true;
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

bool ConfigManager::config_set(const std::string &param_name, const std::string &value, std::string &err_msg, bool startup) {
    std::string key = param_name;
    std::transform(key.begin(), key.end(), key.begin(), ::tolower);

    auto it = params_.find(key);
    if (it == params_.end()) {
        err_msg = "ERR Unsupported configuration parameter '" + param_name + "'";
        return false;
    }

    auto &param = it->second;

    if (!param.is_mutable && !startup) {
        err_msg = "ERR Parameter '" + param_name + "' is read-only / immutable";
        return false;
    }

    std::string normalized = value;
    if (param.type == ParamType::Int || param.type == ParamType::Size) {
        std::string_view digits(value);
        std::int64_t multiplier = 1;
        if (param.type == ParamType::Size) {
            std::string lower = value;
            for (char &c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
            for (const auto &[suffix, factor] : std::vector<std::pair<std::string, std::int64_t>>{
                {"kb", 1024}, {"mb", 1024 * 1024}, {"gb", 1024LL * 1024 * 1024},
                {"k", 1000}, {"m", 1000000}, {"g", 1000000000}}) {
                if (lower.ends_with(suffix)) { multiplier = factor; digits.remove_suffix(suffix.size()); break; }
            }
        }
        std::int64_t number = 0;
        auto [end, error] = std::from_chars(digits.data(), digits.data() + digits.size(), number);
        if (digits.empty() || error != std::errc{} || end != digits.data() + digits.size() ||
            number > std::numeric_limits<std::int64_t>::max() / multiplier ||
            number < std::numeric_limits<std::int64_t>::min() / multiplier) {
            err_msg = "ERR Invalid integer value for '" + param_name + "'"; return false;
        }
        number *= multiplier;
        if ((param.min_val != 0 || param.max_val != 0) && (number < param.min_val || number > param.max_val)) {
            err_msg = "ERR Invalid argument for '" + param_name + "'"; return false;
        }
        normalized = std::to_string(number);
    } else if (param.type == ParamType::Enum || param.type == ParamType::Bool) {
        for (char &c : normalized) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        if (param.type == ParamType::Bool) {
            if (normalized == "true" || normalized == "1") normalized = "yes";
            else if (normalized == "false" || normalized == "0") normalized = "no";
            if (normalized != "yes" && normalized != "no") {
                err_msg = "ERR argument must be 'yes' or 'no'"; return false;
            }
        } else if (std::find(param.enum_choices.begin(), param.enum_choices.end(), normalized) == param.enum_choices.end()) {
            err_msg = "ERR Invalid enum value for '" + param_name + "'"; return false;
        }
    }

    param.value = normalized;
    return true;
}

bool ConfigManager::config_rewrite(const std::string &file_path) {
    std::string target = file_path.empty() ? loaded_config_file_ : file_path;
    if (target.empty()) target = "redis.conf";

    core::TemporaryFile temporary_file(target + ".tmp");
    const auto &temporary = temporary_file.path();
    if (temporary.empty()) return false;
    std::ofstream ofs(temporary);
    if (!ofs.is_open()) return false;

    ofs << "# Generated by redisx CONFIG REWRITE\r\n";
    for (const auto &[key, param] : params_) {
        ofs << param.name << " " << quote_config(param.value) << "\r\n";
    }
    ofs.flush();
    if (!ofs) return false;
    ofs.close();
    if (::chmod(temporary.c_str(), 0600) != 0 || !core::sync_file(temporary)) return false;
    std::error_code error;
    std::filesystem::rename(temporary, target, error);
    return !error && core::sync_parent_directory(target);
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
                        try { evict_mgr->set_maxmemory(static_cast<std::size_t>(config_mgr.get_int("maxmemory"))); } catch (...) {}
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
