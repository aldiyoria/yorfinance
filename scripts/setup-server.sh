#!/bin/bash
# ============================================================
# YorFinance — VPS Setup Script (run once)
# OS: Ubuntu 22.04/24.04
# Usage: sudo bash scripts/setup-server.sh
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: sudo bash scripts/setup-server.sh <domain> <email>"
  echo "Example: sudo bash scripts/setup-server.sh yorfinance.com admin@yorfinance.com"
  exit 1
fi

echo "=========================================="
echo "  YorFinance VPS Setup"
echo "  Domain: $DOMAIN"
echo "  Email:  $EMAIL"
echo "=========================================="

# ---- 1. System Update ----
echo ""
echo "[1/7] Updating system..."
apt update -qq && apt upgrade -y -qq

# ---- 2. Install Docker ----
echo ""
echo "[2/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  echo "Docker installed."
else
  echo "Docker already installed."
fi

# ---- 3. Install Docker Compose plugin ----
echo ""
echo "[3/7] Checking Docker Compose..."
docker compose version || {
  echo "Installing Docker Compose plugin..."
  apt install -y docker-compose-plugin
}

# ---- 4. Install Nginx ----
echo ""
echo "[4/7] Installing Nginx..."
if ! command -v nginx &> /dev/null; then
  apt install -y nginx
  systemctl enable nginx
  echo "Nginx installed."
else
  echo "Nginx already installed."
fi

# ---- 5. Install Certbot ----
echo ""
echo "[5/7] Installing Certbot..."
if ! command -v certbot &> /dev/null; then
  apt install -y certbot python3-certbot-nginx
  echo "Certbot installed."
else
  echo "Certbot already installed."
fi

# ---- 6. Setup Firewall ----
echo ""
echo "[6/7] Configuring firewall (UFW)..."
if command -v ufw &> /dev/null; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  echo "Firewall configured: SSH + HTTP + HTTPS"
else
  echo "UFW not found, skipping firewall."
fi

# ---- 7. Setup Nginx config ----
echo ""
echo "[7/7] Configuring Nginx..."

# Create certbot webroot
mkdir -p /var/www/certbot

# Temp config for initial cert request (HTTP only)
cat > /etc/nginx/sites-available/yorfinance <<NGINX_TEMP
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_TEMP

ln -sf /etc/nginx/sites-available/yorfinance /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Point DNS to this server's IP:"
echo "     A Record:    $DOMAIN → $(curl -s ifconfig.me)"
echo "     CNAME:       www.$DOMAIN → $DOMAIN"
echo ""
echo "  2. Wait for DNS propagation (5-30 min), then run:"
echo "     sudo certbot certonly --webroot -w /var/www/certbot -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos"
echo ""
echo "  3. Deploy the app:"
echo "     cd /opt/yorfinance"
echo "     bash scripts/deploy.sh $DOMAIN"
echo ""
