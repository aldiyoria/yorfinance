#!/bin/bash
# ============================================================
# YorFinance — Deploy Application
# Builds Docker, configures Nginx HTTPS, sets up SSL
# Usage: bash scripts/deploy.sh <domain> <email>
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/opt/yorfinance"

echo "=========================================="
echo "  YorFinance — Deploy"
echo "=========================================="

cd "$APP_DIR"

# ---- 1. Setup .env ----
echo ""
echo "[1/5] Checking .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "  ⚠️  .env created from template."
  echo "  Edit it with your actual values:"
  echo "    nano $APP_DIR/.env"
  echo ""
  echo "  Required:"
  echo "    - TELEGRAM_BOT_TOKEN"
  echo "    - OPENAI_API_KEY"
  echo "    - SMTP_USER + SMTP_PASS"
  echo "    - ADMIN_API_KEY"
  echo "    - DB_PASSWORD"
  echo ""
  exit 1
fi
echo "  .env found."

# ---- 2. Build & start Docker ----
echo ""
echo "[2/5] Building and starting containers..."
docker compose up -d --build

# ---- 3. Wait for app to be healthy ----
echo ""
echo "[3/5] Waiting for app to start..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "  App is healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ⚠️  App may still be starting. Check: docker compose logs app"
  fi
  sleep 2
done

# ---- 4. Setup Nginx + SSL ----
if [ -n "$DOMAIN" ]; then
  echo ""
  echo "[4/5] Configuring Nginx + SSL for $DOMAIN..."

  # Get server IP
  SERVER_IP=$(curl -s ifconfig.me)
  echo "  Server IP: $SERVER_IP"

  # Check if SSL certificate already exists
  if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo ""
    echo "  SSL certificate not found."
    echo "  Make sure DNS A Record points to $SERVER_IP"
    echo ""

    # Try to get certificate
    echo "  Requesting SSL certificate..."
    certbot certonly --webroot \
      -w /var/www/certbot \
      -d "$DOMAIN" -d "www.$DOMAIN" \
      --email "$EMAIL" \
      --agree-tos \
      --non-interactive || {
        echo ""
        echo "  ⚠️  SSL certificate request failed."
        echo "  Make sure DNS is pointing to $SERVER_IP, then run:"
        echo "    sudo certbot certonly --webroot -w /var/www/certbot -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos"
        echo ""
        echo "  Continuing without SSL for now..."
      }
  fi

  # Apply full Nginx config (HTTP → HTTPS redirect + HTTPS proxy)
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "  Applying production Nginx config with SSL..."
    sed "s/DOMAIN_ANDA/$DOMAIN/g" nginx/yorfinance.conf > /etc/nginx/sites-available/yorfinance
    nginx -t && systemctl reload nginx
    echo "  Nginx HTTPS configured."
  fi

  # Setup certbot auto-renewal cron
  if ! crontab -l 2>/dev/null | grep -q certbot; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
    echo "  Certbot auto-renewal cron added."
  fi
else
  echo ""
  echo "[4/5] No domain specified, skipping Nginx config."
fi

# ---- 5. Summary ----
echo ""
echo "[5/5] Done!"
echo ""
echo "=========================================="
echo "  Deploy Complete!"
echo "=========================================="
echo ""
echo "  App:       http://localhost:3000"
echo "  Health:    http://localhost:3000/health"
echo "  API Docs:  http://localhost:3000/api-docs"
echo "  Landing:   http://localhost:3000/web/index.html"
echo ""
if [ -n "$DOMAIN" ]; then
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "  Website:   https://$DOMAIN"
  else
    echo "  Website:   http://$DOMAIN (SSL pending)"
  fi
fi
echo ""
echo "  Logs:      docker compose logs -f app"
echo "  Restart:   docker compose restart app"
echo "  Stop:      docker compose down"
echo "  Update:    git pull && docker compose up -d --build"
echo ""
