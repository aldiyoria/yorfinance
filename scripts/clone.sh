#!/bin/bash
# ============================================================
# YorFinance — Clone Repository
# Jalankan sekali saat pertama kali setup VPS
# Usage: bash scripts/clone.sh
# ============================================================
set -euo pipefail

APP_DIR="/opt/yorfinance"
REPO="git@github.com:aldiyoria/yorfinance.git"

echo "=========================================="
echo "  YorFinance — Clone Repository"
echo "=========================================="

# ---- 1. Install Git ----
if ! command -v git &> /dev/null; then
  echo "[1/3] Installing git..."
  apt update -qq && apt install -y -qq git
else
  echo "[1/3] Git already installed."
fi

# ---- 2. Clone or pull ----
echo ""
if [ ! -d "$APP_DIR/.git" ]; then
  echo "[2/3] Cloning repository..."
  mkdir -p /opt
  git clone "$REPO" "$APP_DIR"
  echo "  Repository cloned to $APP_DIR"
else
  echo "[2/3] Repository already exists. Pulling latest..."
  cd "$APP_DIR"
  git pull origin master
  echo "  Updated to latest version."
fi

# ---- 3. Show next step ----
cd "$APP_DIR"
CURRENT=$(git log --oneline -1)
echo ""
echo "[3/3] Current commit: $CURRENT"
echo ""
echo "=========================================="
echo "  Clone Complete!"
echo "=========================================="
echo ""
echo "  Next: Setup server dependencies"
echo "    sudo bash scripts/setup-server.sh yorfinance.tech yoriaditya17@gmail.com"
echo ""
