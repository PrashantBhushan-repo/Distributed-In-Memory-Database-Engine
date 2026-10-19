#ifndef REDISX_COMMANDS_DISPATCHER_H
#define REDISX_COMMANDS_DISPATCHER_H

#include "redisx/core/buffer.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/memory/eviction.h"
#include "redisx/proto/command.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <string_view>
#include <unordered_map>

namespace redisx::commands {

enum CommandFlags : std::uint32_t {
    CMD_FLAG_NONE = 0,
    CMD_FLAG_WRITE = 1 << 0,
    CMD_FLAG_READONLY = 1 << 1,
    CMD_FLAG_DENYOOM = 1 << 2,
    CMD_FLAG_ADMIN = 1 << 3
};

using CommandHandler = std::function<void(
    const proto::Command &cmd,
    db::Keyspace &keyspace,
    std::size_t db_idx,
    core::Buffer &out_buf,
    std::size_t &out_db_idx
)>;

struct CommandSpec {
    std::string name;
    int arity; // Positive N: exact N args. Negative -N: at least N args.
    std::uint32_t flags;
    CommandHandler handler;
};

class Dispatcher {
  public:
    Dispatcher();

    void register_command(CommandSpec spec);
    [[nodiscard]] const CommandSpec *find_command(std::string_view name) const;

    [[nodiscard]] std::vector<CommandSpec> command_specs() const;
    using WriteObserver = std::function<bool(const proto::Command &, db::Keyspace &, std::size_t, std::string_view)>;
    void set_write_guard(std::function<bool()> guard) { write_guard_ = std::move(guard); }
    void set_write_observer(WriteObserver observer) { write_observer_ = std::move(observer); }
    void dispatch(
        const proto::Command &cmd,
        db::Keyspace &keyspace,
        std::size_t db_idx,
        core::Buffer &out_buf,
        std::size_t &out_db_idx,
        memory::EvictionManager *evict_mgr = nullptr,
        db::TTLManager *ttl_mgr = nullptr
    ) const;

  private:
    std::unordered_map<std::string, CommandSpec> commands_;
    WriteObserver write_observer_;
    std::function<bool()> write_guard_;
};

} // namespace redisx::commands

#endif // REDISX_COMMANDS_DISPATCHER_H
