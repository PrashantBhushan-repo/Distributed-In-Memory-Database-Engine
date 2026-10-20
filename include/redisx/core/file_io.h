#ifndef REDISX_CORE_FILE_IO_H
#define REDISX_CORE_FILE_IO_H
#include <cerrno>
#include <filesystem>
#include <fcntl.h>
#include <unistd.h>
#include <cstdlib>
#include <vector>
#include <string>
namespace redisx::core {
class TemporaryFile {
public:
    explicit TemporaryFile(const std::string &prefix) {
        const auto pattern = prefix + ".XXXXXX";
        std::vector<char> name(pattern.begin(), pattern.end()); name.push_back('\0');
        const int fd = ::mkstemp(name.data());
        if (fd >= 0) { path_ = name.data(); ::close(fd); }
    }
    ~TemporaryFile() { if (!path_.empty()) { std::error_code error; std::filesystem::remove(path_, error); } }
    TemporaryFile(const TemporaryFile &) = delete;
    TemporaryFile &operator=(const TemporaryFile &) = delete;
    [[nodiscard]] const std::string &path() const { return path_; }
private:
    std::string path_;
};

inline bool sync_fd(int fd) {
    int result;
    do { result = ::fsync(fd); } while (result < 0 && errno == EINTR);
    return result == 0;
}
inline bool sync_file(const std::string &path) {
    int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC);
    if (fd < 0) return false;
    const bool success = sync_fd(fd);
    ::close(fd);
    return success;
}
inline bool sync_parent_directory(const std::string &path) {
    auto directory = std::filesystem::path(path).parent_path();
    if (directory.empty()) directory = ".";
    int fd = ::open(directory.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (fd < 0) return false;
    const bool success = sync_fd(fd);
    ::close(fd);
    return success;
}
}
#endif
