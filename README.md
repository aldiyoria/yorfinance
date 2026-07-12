# YorFinance — Telegram Bot SaaS Manajemen Keuangan

Bot Telegram untuk mencatat keuangan pribadi otomatis. User mengirim teks natural
("beli kopi 25rb") atau **foto struk**, bot mengubahnya jadi data terstruktur via
**Google Gemini** (endpoint OpenAI-compatible), lalu menuliskannya ke **Google Sheets**
(one master spreadsheet, one sheet/tab per user). Sistem **subscription** (PostgreSQL + Prisma)
dengan pengecekan akses di setiap pesan masuk.

## Tech Stack

| Komponen | Teknologi | Keterangan |
|----------|-----------|------------|
| **Runtime** | Node.js 20+ | CommonJS modules |
| **Bot Framework** | node-telegram-bot-api | Polling mode |
| **LLM** | Google Gemini 3.1 Flash Lite | Via OpenAI-compatible SDK |
| **Database** | PostgreSQL 16 | ORM: Prisma 5.x |
| **Spreadsheet** | Google Sheets API v4 | One master spreadsheet, sheet per user |
| **Email** | Nodemailer + Gmail SMTP | Kirim redeem code & info sheet |
| **HTTP Server** | Express.js | Swagger UI docs + landing page + DOKU notifications |
| **Docs** | Swagger UI + swagger-jsdoc | `/api-docs` |
| **Logger** | Pino + pino-pretty | Structured logging |
| **Container** | Docker + Docker Compose | Multi-stage build, PostgreSQL |

---

## Quick Start (Docker — Recommended)

### 1. Prasyarat
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/) terinstall.
- Akun Telegram (BotFather).
- Akun Google (Gemini API key + Google Sheets + Service Account).
- Akun Gmail (SMTP App Password).
- Akun DOKU (untuk pembayaran).

### 2. Clone & Setup
```bash
git clone https://github.com/YORIDORI/mankeu.git
cd mankeu
cp .env.example .env
```

### 3. Isi `.env`
Buka `.env` dan isi semua value (lihat `.env.example` untuk panduan). Yang wajib diisi:

| Variable | Deskripsi |
|----------|-----------|
| `TELEGRAM_BOT_TOKEN` | Token dari @BotFather |
| `OPENAI_API_KEY` | API key dari Google AI Studio |
| `GOOGLE_SPREADSHEET_ID` | ID master spreadsheet |
| `SMTP_USER` + `SMTP_PASS` | Gmail + App Password |
| `ADMIN_API_KEY` | Secret acak untuk admin API |
| `DB_PASSWORD` | Password PostgreSQL (buat sendiri) |

### 4. Setup Google Service Account
Buat file `credentials/google-service-account.json` (jangan di-commit):
```bash
mkdir -p credentials
# Copy file JSON key dari Google Cloud Console ke sini
```

### 5. Jalankan!
```bash
docker compose up -d
```

**Done!** Semua berjalan:
- **Bot Telegram**: langsung aktif (polling)
- **Landing page**: `http://localhost:3000/web/index.html`
- **API docs**: `http://localhost:3000/api-docs`
- **Database**: PostgreSQL otomatis migrate saat pertama kali jalan
- **Health check**: `http://localhost:3000/health`

### Perintah Berguna
```bash
# Lihat log
docker compose logs -f app

# Stop
docker compose down

# Stop + hapus database
docker compose down -v

# Rebuild setelah update code
docker compose up -d --build

# Jalankan perintah di dalam container
docker compose exec app node scripts/check-users.js
```

---

## Deploy ke VPS (Production)

### Arsitektur

```
Internet
  ↓
DNS (A Record → VPS IP)
  ↓
VPS (Ubuntu 22.04/24.04)
  ├── Nginx (port 80/443) — reverse proxy + SSL/TLS
  └── Docker
      ├── App (Node.js, port 3000 → localhost only)
      └── PostgreSQL (port 5433 → localhost only)
```

### 1. Beli VPS & Domain
- **VPS**: DigitalOcean / Hetzner / Vultr / AWS (recommended: 2 vCPU, 2GB RAM, Ubuntu 24.04)
- **Domain**: Namecheap / Cloudflare / Google Domains

### 2. Setup DNS
Di panel DNS domain kamu, tambahkan:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `IP_VPS_KAMU` | Auto |
| CNAME | `www` | `domain.com` | Auto |

Contoh: domain `yorfinance.com` → A record `@` → `123.45.67.89`

### 3. Setup VPS (sekali saja)
SSH ke VPS, lalu jalankan:
```bash
# Clone repo dulu
git clone https://github.com/YORIDORI/mankeu.git /opt/yorfinance
cd /opt/yorfinance

# Jalankan setup script
sudo bash scripts/setup-server.sh yorfinance.com admin@yorfinance.com
```

Script akan install: Docker, Nginx, Certbot, Firewall (UFW).

### 4. Deploy App
```bash
cd /opt/yorfinance

# Isi .env dengan values produksi
nano .env

# Taruh Google credentials
mkdir -p credentials
# Upload google-service-account.json ke credentials/

# Jalankan deploy
bash scripts/deploy.sh yorfinance.com
```

### 5. Setup SSL (HTTPS)
Setelah DNS propagate (5-30 menit):
```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d yorfinance.com \
  -d www.yorfinance.com \
  --email admin@yorfinance.com \
  --agree-tos
```

Certbot auto-renewal sudah di-setup oleh script (cron).

### 6. Update DOKU Callback URL
Di DOKU dashboard, ganti notification URL ke:
```
https://yorfinance.com/api/payments/callback
```

### Perintah Berguna di VPS
```bash
# Lihat log app
docker compose logs -f app

# Restart app
docker compose restart app

# Update code
cd /opt/yorfinance && git pull && docker compose up -d --build

# Backup database
docker compose exec db pg_dump -U yorfinance mankeu > backup_$(date +%Y%m%d).sql

# Restore database
cat backup.sql | docker compose exec -T db psql -U yorfinance mankeu

# Cek status semua service
docker compose ps
systemctl status nginx
```

---

## Setup Manual (Tanpa Docker)

### Prasyarat
- Node.js 20+ dan PostgreSQL berjalan.
- Akun Google (untuk Google Sheets API key).
- Akun Gmail (untuk SMTP App Password).

### Install dependencies
```bash
npm install
```

### Konfigurasi
```bash
cp .env.example .env
# Isi semua variabel di .env
```

### Setup Google Sheets
1. Buat spreadsheet baru, beri nama **"YorFinance Master"**.
2. Tambah 1 baris header di kolom A–G:
   ```
   Tanggal | Tipe | Kategori | Item | Nominal | Catatan | Dicatat Pada
   ```
3. Buat sheet/tab bernama **"Template"** (copy header ke sini).
4. Ambil spreadsheet ID dari URL: `https://docs.google.com/spreadsheets/d/{ID}/edit`
5. Share ke service account: `yorfinance@yorfinance.iam.gserviceaccount.com` (Editor)

### Setup Google Cloud Service Account
1. [Google Cloud Console](https://console.cloud.google.com/) → Buat project "yorfinance".
2. IAM & Admin → Service Accounts → Create: `yorfinance@yorfinance.iam.gserviceaccount.com`
3. Keys → Add Key → Create new key → JSON.
4. Simpan sebagai `credentials/google-service-account.json`.

### Setup Gemini API Key
1. [Google AI Studio](https://aistudio.google.com/apikey) → Create API key.
2. Model: `OPENAI_MODEL=gemini-3.1-flash-lite`

### Setup Telegram Bot
1. @BotFather → `/newbot` → dapatkan token.

### Setup Gmail SMTP
1. myaccount.google.com → Security → aktifkan 2-Step Verification.
2. Search "App Passwords" → Mail + Other → Generate → copy 16 char password.

### Setup DOKU
1. [sandbox.doku.com](https://sandbox.doku.com) → Activate Merchant → Generate API Key.
2. Copy Client-Id + Secret Key ke `.env`.

### Migrasi database
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### Jalankan
```bash
npm run dev
```

---

## Mengaktifkan Subscription (Admin API)

```bash
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "x-api-key: <ADMIN_API_KEY>" \
  -d '{
    "email": "user@gmail.com",
    "name": "Budi",
    "plan": "basic",
    "durationDays": 30
  }'
```

Sistem akan:
1. Membuat user + subscription (status PENDING)
2. Mengirim email **redeem code** ke user
3. User buka Telegram → `/start` → masukkan redeem code
4. Bot otomatis **copy sheet "Template"** ke sheet baru → rename → protect
5. User mulai catat keuangan

## Contoh Penggunaan (chat Telegram)

- `beli kopi 25rb` → dicatat sebagai Pengeluaran.
- `gaji masuk 5jt` → dicatat sebagai Pemasukan.
- Kirim **foto struk** → nominal & item diekstrak otomatis.
- `berapa pengeluaran bulan ini?` → bot menjawab dari data Google Sheets.
- `/help` → tampilkan daftar perintah.
- `/rekap` → rekap keuangan bulanan.
- `/hari` → rekap transaksi hari ini.
- `/minggu` → rekap transaksi minggu ini.
- `/bulan` → rekap transaksi bulan ini.
- `/tanggal 12-07-2026` → rekap tanggal spesifik.
- `/tanggal 01-07-2026 s/d 12-07-2026` → rekap rentang tanggal.
- `/budget` → cek status budget.
- `/status` → cek status langganan.
- `/kategori` → lihat daftar kategori transaksi.

## Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/subscriptions` | Buat subscription baru + kirim email |
| `GET` | `/api/subscriptions/:id/redeem-code` | Ambil redeem code |
| `POST` | `/api/payments/create` | Buat DOKU Checkout → return payment URL |
| `POST` | `/api/payments/callback` | DOKU notification (auto-called by DOKU) |
| `GET` | `/api/payments/status/:externalId` | Cek status pembayaran |
| `POST` | `/api/sandbox/payment-callback` | Simulasi DOKU notification (testing) |
| `GET` | `/health` | Health check |

## Arsitektur

```
mankeu/
├── credentials/                    # Google Service Account key (NOT in git)
├── nginx/
│   └── yorfinance.conf             # Nginx reverse proxy config
├── prisma/
│   ├── schema.prisma               # User, Subscription, Payment, Budget
│   └── migrations/                 # Database migrations
├── src/
│   ├── config/                     # env, google, openai, swagger
│   ├── db/                         # Prisma client
│   ├── prompts/                    # LLM prompts
│   ├── services/                   # Business logic
│   ├── controllers/                # HTTP handlers
│   ├── middlewares/                 # API key auth
│   ├── routes/                     # Express routes
│   ├── utils/                      # Logger
│   ├── app.js                      # Express app
│   └── server.js                   # Bootstrap
├── web/                            # Landing page + checkout
├── public/                         # Static assets (logo)
├── scripts/
│   ├── setup-server.sh             # VPS setup (Docker + Nginx + Certbot)
│   └── deploy.sh                   # Deploy & update script
├── Dockerfile                      # Multi-stage build
├── docker-compose.yml              # App + PostgreSQL
├── docker-entrypoint.sh            # Migrate + start
├── .env.example                    # Environment template
└── package.json
```

## Catatan Produksi

- Simpan kredensial hanya via `.env` / secret manager, jangan commit.
- Google Sheets free tier: 100 sheet per spreadsheet, 10 juta cell — cukup untuk MVP.
- Untuk polling Telegram, pertimbangkan webhook untuk production load.
- Backup database & spreadsheet secara berkala.
- Deploy ke server: `docker compose up -d --build` setelah `git pull`.
