# Enterprise Production Deployment Guide

This guide describes how to deploy the entire **pbRedisDB** full-stack suite (C++20 RedisX Engine, Fastify API Gateway, React 18 Studio Web Visualizer, Prometheus, and Grafana) to an AWS EC2 instance using a **Zero-Source-Code** Continuous Deployment (CD) pipeline.

---

## 🏛️ Deployment Architecture

```
Developer Workstation (Windows / Linux)
      │
      │ git push origin <branch>
      ▼
GitHub Actions CI/CD Pipeline
      ├── 1. Buildx builds & pushes Docker images to GitHub Container Registry (ghcr.io)
      └── 2. Beams docker-compose.prod.yml + configs via SSH (SCP) to AWS EC2
               │
               ▼
AWS EC2 Production Server (Ubuntu 22.04 / 24.04 LTS)
      ├── 🛡️ Host Security: 2GB Swap Space (OOM protection)
      ├── 🔒 Least Privilege: Non-root execution (`node`, `redisx`)
      ├── 🪵 Disk Protection: Docker log rotation (3x10MB cap per container)
      └── 🐳 Docker Compose Stack:
             ├── redisx:6379 (C++20 In-Memory Engine) + :9121 (Prometheus Metrics)
             ├── gateway:4000 (Fastify TypeScript Safety API)
             ├── web:3000 (React 18 Studio UI + Nginx API Proxy)
             ├── prometheus:9090 (Telemetry & Timeseries Metrics)
             └── grafana:3002 (Observability Dashboards)
```

---

## 🛡️ Production Hardening Features

1. **Zero Plain-Text Source Code on Server**:
   Only pre-built container images and runtime configuration files exist on EC2. Proprietary C++ and TypeScript source code is never exposed on the virtual machine.
2. **Container Log Rotation**:
   All services utilize Docker's `json-file` logging driver with `max-size: "10m"` and `max-file: "3"`, guaranteeing that logs cannot exceed 30MB per container and crash the server with "Disk Full" errors.
3. **Non-Root Execution**:
   - `redisx` runs as user `redisx` (UID 999).
   - `gateway` runs as user `node` (UID 1000).
   This enforces the principle of least privilege and prevents container breakouts.
4. **2GB Swap Memory**:
   `infra/scripts/setup-ec2.sh` automatically provisions and mounts a 2GB persistent swapfile, preventing the Linux kernel OOM (Out-Of-Memory) killer from terminating database processes during traffic spikes.
5. **SSL/TLS & Domain Reverse Proxy**:
   `infra/scripts/setup-ssl.sh` enables one-command Let's Encrypt certificate issuance and automatic HTTPS redirect.

---

## 🚀 One-Time EC2 Server Provisioning

Run this command inside your EC2 terminal (or EC2 Instance Connect):

```bash
curl -fsSL https://raw.githubusercontent.com/PrashantBhushan-repo/Distributed-In-Memory-Database-Engine/feature/packaging-and-docs/infra/scripts/setup-ec2.sh | bash
```

### What this script configures:
- Installs Docker Engine, Docker Buildx, and Docker Compose Plugin.
- Adds user `ubuntu` to the `docker` group (no `sudo` required for Docker commands).
- Installs Git and basic utilities (`curl`, `gnupg`, `ca-certificates`).
- Allocates, formats, and activates a 2GB swap space persisted in `/etc/fstab`.

---

## 🔑 GitHub Secrets Configuration

Ensure the following repository secrets are set in **GitHub Settings -> Secrets and variables -> Actions**:

| Secret Name | Value Description | Example |
| :--- | :--- | :--- |
| `EC2_HOST` | Your EC2 Elastic Public IP | `13.210.234.73` |
| `EC2_USER` | SSH Username | `ubuntu` |
| `EC2_SSH_KEY` | Contents of your `.pem` RSA private key | `-----BEGIN RSA PRIVATE KEY----- ...` |

---

## 🔒 Optional: Custom Domain & Free SSL/TLS (HTTPS)

Once a custom domain (e.g., `redis.yourdomain.com`) points to your EC2 Elastic IP:

```bash
cd /opt/pbredisdb
sudo ./infra/scripts/setup-ssl.sh redis.yourdomain.com admin@yourdomain.com
```

This sets up:
- Host Nginx on ports 80 and 443
- Automatic HTTP to HTTPS redirection
- Automated Let's Encrypt certificate renewal via `certbot.timer`
- WebSocket proxying for real-time telemetry streaming

---

## 📊 Accessing Services

| Service | Port / Protocol | URL | Default Credentials |
| :--- | :--- | :--- | :--- |
| **Studio Web Visualizer** | `3000 / HTTP` | `http://<EC2_IP>:3000` | N/A |
| **Grafana Dashboards** | `3002 / HTTP` | `http://<EC2_IP>:3002` | Anonymous Viewer / `admin:admin` |
| **Fastify API Gateway** | `4000 / HTTP` | `http://<EC2_IP>:4000/health`| N/A |
| **RedisX Engine** | `6379 / RESP` | `redis-cli -h <EC2_IP> -p 6379` | `AUTH <password>` if enabled |
| **Prometheus Metrics** | `9090 / HTTP` | `http://<EC2_IP>:9090` | N/A |
