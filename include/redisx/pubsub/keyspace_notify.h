#ifndef REDISX_PUBSUB_KEYSPACE_NOTIFY_H
#define REDISX_PUBSUB_KEYSPACE_NOTIFY_H

#include "redisx/pubsub/pubsub.h"

#include <cstddef>
#include <string>

namespace redisx::pubsub {

void notify_keyspace_event(
    PubSubManager &pubsub,
    std::size_t db_idx,
    const std::string &event,
    const std::string &key,
    char type_flag = 'g',
    const std::string &config_flags = "KEA"
);

} // namespace redisx::pubsub

#endif // REDISX_PUBSUB_KEYSPACE_NOTIFY_H
