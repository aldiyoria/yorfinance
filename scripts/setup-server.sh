#!/bin/bash
# ============================================================
# YorFinance — Setup Server (run once)
# Installs: Docker, Nginx, Certbot, UFW
# Configures: Nginx HTTP proxy, firewall
# Usage: sudo bash scripts/setup-server.sh <domain> <email>
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: sudo bash scripts/setup-server.sh <domain> <email>"
  echo ""
  echo "Example:"
  echo "  sudo bash scripts/setup-server.sh yorfinance.tech yoriaditya17@gmail.com"
  exit 1
fi

echo "=========================================="
echo "  YorFinance — Server Setup"
echo "  Domain:  $DOMAIN"
echo "  Email:   $EMAIL"
echo "=========================================="

# ---- 1. System Update ----
echo ""
echo "[1/6] Updating system..."
apt update -qq && apt upgrade -y -qq

# ---- 2. Install Docker ----
echo ""
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  echo "  Docker installed."
else
  echo "  Docker already installed."
fi

# ---- 3. Install Docker Compose plugin ----
echo ""
echo "[3/6] Checking Docker Compose..."
if docker compose version &> /dev/null; then
  echo "  Docker Compose ready."
else
  echo "  Installing Docker Compose plugin..."
  apt install -y docker-compose-plugin
fi

# ---- 4. Install Nginx + Certbot ----
echo ""
echo "[4/6] Installing Nginx & Certbot..."
if ! command -v nginx &> /dev/null; then
  apt install -y nginx
  systemctl enable nginx
  echo "  Nginx installed."
else
  echo "  Nginx already installed."
fi

if ! command -v certbot &> /dev/null; then
  apt install -y certbot python3-certbot-nginx
  echo "  Certbot installed."
else
  echo "  Certbot already installed."
fi

# ---- 5. Setup Firewall ----
echo ""
echo "[5/6] Configuring firewall (UFW)..."
if command -v ufw &> /dev/null; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  echo "  Firewall: SSH + HTTP + HTTPS allowed."
else
  echo "  UFW not found, skipping."
fi

# ---- 6. Setup Nginx (HTTP only,暂时 for certbot) ----
echo ""
echo "[6/6] Configuring Nginx..."

mkdir -p /var/www/certbot

# Temporary HTTP-only config for certbot challenge + initial access
cat > /etc/nginx/sites-available/yorfinance <<NGINX_CONF
# HTTP — Certbot challenge + proxy
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

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
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/yorfinance /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "  Server IP: $(curl -s ifconfig.me)"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Point DNS to this server:"
echo "     A Record:    @       → $(curl -s ifconfig.me)"
echo "     CNAME:       www     → $DOMAIN"
echo ""
echo "  2. Wait for DNS propagation (5-30 min), verify with:"
echo "     dig $DOMAIN"
echo ""
echo "  3. Deploy the app:"
echo "     cd $APP_DIR"
echo "     bash scripts/deploy.sh $DOMAIN $EMAIL"
echo ""
