#include "redisx/pubsub/keyspace_notify.h"

namespace redisx::pubsub {

void notify_keyspace_event(
    PubSubManager &pubsub,
    std::size_t db_idx,
    const std::string &event,
    const std::string &key,
    char type_flag,
    const std::string &config_flags
) {
    if (config_flags.empty()) return;

    bool keyspace = (config_flags.find('K') != std::string::npos);
    bool keyevent = (config_flags.find('E') != std::string::npos);

    if (!keyspace && !keyevent) return;

    bool type_enabled = (config_flags.find('A') != std::string::npos) ||
                         (config_flags.find(type_flag) != std::string::npos);

    if (!type_enabled) return;

    std::string db_str = std::to_string(db_idx);

    if (keyspace) {
        std::string channel = "__keyspace@" + db_str + "__:" + key;
        pubsub.publish(channel, event);
    }

    if (keyevent) {
        std::string channel = "__keyevent@" + db_str + "__:" + event;
        pubsub.publish(channel, key);
    }
}

} // namespace redisx::pubsub
