#!/bin/bash
# ============================================================
# YorFinance — Deploy Script
# Usage: bash scripts/deploy.sh <domain>
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/yorfinance"
REPO="https://github.com/aldiyoria/yorfinance.git"

echo "=========================================="
echo "  YorFinance Deploy"
echo "=========================================="

# ---- 1. Clone or pull ----
if [ ! -d "$APP_DIR/.git" ]; then
  echo "[1/4] Cloning repository..."
  mkdir -p /opt
  git clone "$REPO" "$APP_DIR"
else
  echo "[1/4] Pulling latest changes..."
  cd "$APP_DIR"
  git pull origin master
fi

cd "$APP_DIR"

# ---- 2. Setup .env ----
echo "[2/4] Checking .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "  ⚠️  .env file created from template."
  echo "  Edit it with your actual values:"
  echo "    nano $APP_DIR/.env"
  echo ""
  echo "  Required variables:"
  echo "    - TELEGRAM_BOT_TOKEN"
  echo "    - OPENAI_API_KEY"
  echo "    - SMTP_USER + SMTP_PASS"
  echo "    - ADMIN_API_KEY"
  echo "    - DB_PASSWORD (same as POSTGRES_PASSWORD)"
  echo ""
  exit 1
fi

# ---- 3. Build & start ----
echo "[3/3] Building and starting containers..."
docker compose up -d --build

# ---- 4. Setup Nginx + SSL ----
if [ -n "$DOMAIN" ]; then
  echo "[4/4] Configuring Nginx for $DOMAIN..."

  # Get server IP
  SERVER_IP=$(curl -s ifconfig.me)

  # Copy production nginx config
  sed "s/DOMAIN_ANDA/$DOMAIN/g" nginx/yorfinance.conf > /etc/nginx/sites-available/yorfinance
  nginx -t && systemctl reload nginx

  # Setup Certbot auto-renewal
  if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo ""
    echo "  SSL certificate not found for $DOMAIN"
    echo "  Make sure DNS is pointing to $SERVER_IP"
    echo "  Then run:"
    echo "    sudo certbot certonly --webroot -w /var/www/certbot -d $DOMAIN -d www.$DOMAIN"
    echo ""
  fi

  # Add certbot renewal cron
  if ! crontab -l 2>/dev/null | grep -q certbot; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
    echo "  Certbot auto-renewal cron added."
  fi
fi

echo ""
echo "=========================================="
echo "  Deploy Complete!"
echo "=========================================="
echo ""
echo "  App:       http://localhost:3000"
echo "  Landing:   http://localhost:3000/web/index.html"
echo "  API Docs:  http://localhost:3000/api-docs"
echo "  Health:    http://localhost:3000/health"
echo ""
if [ -n "$DOMAIN" ]; then
  echo "  Domain:    https://$DOMAIN"
fi
echo ""
echo "  Logs: docker compose logs -f app"
echo "  Stop:  docker compose down"
echo ""
