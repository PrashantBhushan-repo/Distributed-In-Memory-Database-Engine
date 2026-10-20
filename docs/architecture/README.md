# Architecture drawing

[SVG](redisx.svg) · [Editable Excalidraw scene](redisx.excalidraw)

The drawing follows the native/WSL development setup: Studio and the gateway on the host, the C++ engine in Linux/WSL, and Prometheus/Grafana in Docker. Ports are defaults, not fixed protocol requirements. It was exported with Excalidraw 0.18.1 using its bundled Excalifont; the SVG embeds its font subset and renders without a font download.

## Read the paths

- **Studio → gateway → engine:** HTTP and WebSocket traffic is proxied to Fastify. The gateway's ioredis client talks RESP2 to the engine. It keeps a separate socket for each selected logical database.
- **Direct clients → engine:** redis-cli and redis-py can use the same TCP listener without Studio or the gateway.
- **Engine → disk:** persistence code appends the AOF and reads/writes the RedisX snapshot format. Background save/rewrite uses forked children. The disk box represents files, not a separate storage service.
- **Engine ↔ replica:** the optional replication stream sends canonical effects and receives acknowledgments. Automatic failover is outside the implemented scope.
- **Prometheus → engine:** the dashed scrape arrow is an HTTP GET initiated by Prometheus, every five seconds in the supplied local config. Grafana queries Prometheus. The gateway's one-second INFO sampler uses RESP2 separately.

The diagram is a component map, not a claim that every handler visits every component. Replies return on the same connection; error paths, TLS negotiation, transactions, and recovery internals are omitted to keep the main flow readable.

## Maintain the source

Open [Excalidraw](https://excalidraw.com/) and drag `redisx.excalidraw` onto the canvas, or load it through the file menu. Edit the grouped boxes, labels, and connectors. Export an SVG with a light background and embedded fonts, then replace `redisx.svg`. Keep the scene and export together in the same change.

The implementation references are [server composition](../../src/main.cpp), [event loop](../../src/net/event_loop.cpp), [RESP parser](../../src/proto/resp_reader.cpp), [command dispatch](../../src/commands/dispatcher.cpp), [persistence](../../src/persistence/service.cpp), [replication](../../src/replication/repl_stream.cpp), [gateway client](../../studio/gateway/src/redis/client.ts), and [metrics sampler](../../studio/gateway/src/metrics/sampler.ts).
