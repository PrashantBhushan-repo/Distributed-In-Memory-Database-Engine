#ifndef REDISX_TX_TRANSACTION_H
#define REDISX_TX_TRANSACTION_H

#include "redisx/commands/dispatcher.h"
#include "redisx/tx/watch.h"

namespace redisx::tx {

void register_tx_commands(commands::Dispatcher &dispatcher, WatchManager &watch_mgr);

} // namespace redisx::tx

#endif // REDISX_TX_TRANSACTION_H
