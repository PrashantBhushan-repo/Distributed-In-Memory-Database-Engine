#!/usr/bin/env bash
# ==============================================================================
# One-Command Initial Setup Script for AWS EC2 (Ubuntu 22.04 / 24.04 LTS)
# Installs Docker, Docker Compose, Git, and prepares the host environment.
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "📦 Setting up Docker & Docker Compose on AWS EC2..."
echo "=========================================================="

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git

# Setup official Docker repository
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run Docker without sudo
sudo usermod -aG docker "$USER"

# ------------------------------------------------------------------------------
# Configure 2GB Swap Space (Prevents OOM Killer crashes on t2/t3.micro/small)
# ------------------------------------------------------------------------------
if ! swapon --show | grep -q "/swapfile"; then
  echo "⚙️  Configuring 2GB swap space..."
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
  echo "✅ 2GB Swap space successfully created and enabled."
else
  echo "ℹ️  Swap space already configured. Skipping."
fi

echo "=========================================================="
echo "✅ Docker & Docker Compose successfully installed!"
echo "   Run 'newgrp docker' or reconnect to apply group permissions."
echo "=========================================================="
