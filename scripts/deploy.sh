#!/bin/bash
# ============================================================
# YorFinance — Deploy Script
# Usage: bash scripts/deploy.sh <domain>
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/yorfinance"
REPO="https://github.com/YORIDORI/mankeu.git"

echo "=========================================="
echo "  YorFinance Deploy"
echo "=========================================="

# ---- 1. Clone or pull ----
if [ ! -d "$APP_DIR/.git" ]; then
  echo "[1/5] Cloning repository..."
  mkdir -p /opt
  git clone "$REPO" "$APP_DIR"
else
  echo "[1/5] Pulling latest changes..."
  cd "$APP_DIR"
  git pull origin main
fi

cd "$APP_DIR"

# ---- 2. Setup .env ----
echo "[2/5] Checking .env..."
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
  echo "    - GOOGLE_SPREADSHEET_ID"
  echo "    - SMTP_USER + SMTP_PASS"
  echo "    - ADMIN_API_KEY"
  echo "    - DB_PASSWORD (same as POSTGRES_PASSWORD)"
  echo ""
  exit 1
fi

# ---- 3. Setup credentials ----
echo "[3/5] Checking Google credentials..."
if [ ! -f credentials/google-service-account.json ]; then
  mkdir -p credentials
  echo ""
  echo "  ⚠️  Google Service Account not found!"
  echo "  Place your JSON key at:"
  echo "    $APP_DIR/credentials/google-service-account.json"
  echo ""
  exit 1
fi

# ---- 4. Build & start ----
echo "[4/5] Building and starting containers..."
docker compose up -d --build

# ---- 5. Setup Nginx + SSL ----
if [ -n "$DOMAIN" ]; then
  echo "[5/5] Configuring Nginx for $DOMAIN..."

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
