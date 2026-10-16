#!/usr/bin/env bash
# ==============================================================================
# Automated Production SSL/TLS (Let's Encrypt + Nginx) Setup Script
# Usage:
#   sudo ./setup-ssl.sh <your-domain.com> <your-email@example.com>
# ==============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "❌ Error: Missing arguments."
  echo "Usage: sudo $0 <your-domain.com> <admin-email@example.com>"
  exit 1
fi

echo "=========================================================="
echo "🔒 Setting up SSL for $DOMAIN with Let's Encrypt..."
echo "=========================================================="

# 1. Install host Nginx & Certbot
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 2. Configure Host Nginx Reverse Proxy for Studio Web & API
cat <<EOF | sudo tee /etc/nginx/sites-available/pbredisdb
server {
    listen 80;
    server_name $DOMAIN;

    # Certbot ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP traffic to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/pbredisdb /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 3. Obtain SSL certificate via Certbot
echo "📜 Requesting SSL certificate from Let's Encrypt..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

# 4. Configure HTTPS Reverse Proxy to Docker Compose Web Container (Port 3000)
cat <<EOF | sudo tee /etc/nginx/sites-available/pbredisdb
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Studio Web Frontend + API Proxy (Forward to Docker container on port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket Real-Time Monitoring Channel
    location /ws/ {
        proxy_pass http://127.0.0.1:3000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx

echo "=========================================================="
echo "🎉 SSL setup complete! Your site is live at: https://$DOMAIN"
echo "   Auto-renewal is active via systemd certbot.timer."
echo "=========================================================="
