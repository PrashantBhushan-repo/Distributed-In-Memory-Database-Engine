# Local monitoring

Studio's Metrics page includes a Monitoring tools section with buttons for Prometheus and Grafana. Its Quick start walks through target health, temporary test keys, queries and expected results. Copy buttons copy text only; users run the commands themselves. Grafana opens the RedisX overview for the last 15 minutes with a five-second refresh.

The links default to the browser hostname on ports 9090 and 3002. For a different deployment, set `VITE_PROMETHEUS_URL` and `VITE_GRAFANA_URL` to public base URLs in `studio/web/.env.local`, then restart Vite or rebuild the frontend. Reverse-proxy path prefixes are supported. Studio's engine selector does not reconfigure the Prometheus scrape target.

The C++ engine exports real Prometheus metrics at HTTP port 9121 (`/metrics`). Database commands use RESP port 6379. Prometheus serves its UI/API on port 9090 and scrapes the engine every five seconds. Grafana reaches Prometheus through Docker DNS at `http://prometheus:9090` and is published at localhost:3002.

For a native/WSL engine, run from the repository root:

```sh
docker compose -p pbredisdb -f docker-compose.monitoring.yml config --quiet
docker compose -p pbredisdb -f docker-compose.monitoring.yml up -d --wait
```

The host scrape configuration is `infra/monitoring/prometheus.host.yml`. For the complete containerized engine stack, use `docker compose up -d`; its separate scrape configuration, `infra/monitoring/prometheus.yml`, targets the engine service `redisx:9121`.

## Verify the connection

- [Engine metrics](http://localhost:9121/metrics) must return Prometheus text.
- [Prometheus readiness](http://localhost:9090/-/ready) must return HTTP 200.
- [Targets](http://localhost:9090/targets) must show `redisx` as UP.
- Query `up{job="redisx"}`: the latest value must be `1`.
- Query `redis_commands_processed_total{job="redisx"}` for an actual engine counter. Rate graphs need multiple scrapes after startup.
- [Grafana health](http://localhost:3002/api/health) must report database `ok`. The provisioned Prometheus data source uses Docker's internal service address, not host localhost.

## Why port 9090 failed on this machine

The old `redisx-prometheus` container referenced a config bind mount under `C:\Users\prash\OneDrive\Desktop\pbRedisDB`, while the active checkout was `D:\pbRedisDB`. Docker failed to mount the missing file and the container exited before opening port 9090. Grafana's provisioning mounts also referenced the old checkout. Restarting an existing container does not change its saved mounts; Compose must recreate it from the current directory.

The original scrape target, `redisx:9121`, also requires a running engine container named `redisx` on the same Docker network. This development session runs the engine on the host, so the monitoring-only setup instead uses `host.docker.internal:9121`. Do not use container localhost to reach the host engine.

The Compose command recreates monitoring containers and retains `pbredisdb_prometheus-data` and `pbredisdb_grafana-data`. Do not use `down --volumes` when preserving history. Bind mounts use `create_host_path: false` so a missing config fails clearly rather than creating a directory where a file belongs.
