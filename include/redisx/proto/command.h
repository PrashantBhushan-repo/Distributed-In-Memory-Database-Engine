#ifndef REDISX_PROTO_COMMAND_H
#define REDISX_PROTO_COMMAND_H

#include <cctype>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace redisx::proto {

class Command {
  public:
    Command() = default;
    explicit Command(std::vector<std::string> args) : args_(std::move(args)) {
        if (!args_.empty()) {
            name_upper_ = args_[0];
            for (char &c : name_upper_) {
                c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
            }
        }
    }

    [[nodiscard]] const std::vector<std::string> &args() const noexcept { return args_; }
    [[nodiscard]] std::vector<std::string> &args() noexcept { return args_; }
    [[nodiscard]] std::size_t arg_count() const noexcept { return args_.size(); }
    [[nodiscard]] bool empty() const noexcept { return args_.empty(); }

    [[nodiscard]] const std::string &name_upper() const noexcept {
        return name_upper_;
    }

    [[nodiscard]] const std::string &arg(std::size_t index) const {
        return args_.at(index);
    }

  private:
    std::vector<std::string> args_;
    std::string name_upper_;
};

} // namespace redisx::proto

#endif // REDISX_PROTO_COMMAND_H
