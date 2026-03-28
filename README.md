# 🤖 Manajemen Pelanggan Bot

Telegram Bot untuk mencatat dan mengelola data pelanggan ke database **Supabase**, di-deploy ke **Vercel** menggunakan metode **Webhook**.

Bot ini dirancang untuk membantu pemilik usaha/layanan dalam mencatat pelanggan secara cepat langsung dari Telegram, tanpa perlu membuka dashboard atau aplikasi terpisah.

---

## 📖 Penjelasan Project

### Arsitektur

```
┌──────────────┐     Webhook (POST)     ┌──────────────────┐     Query      ┌──────────────┐
│   Telegram   │ ──────────────────────► │  Vercel          │ ─────────────► │   Supabase   │
│   (User)     │ ◄────────────────────── │  Serverless Fn   │ ◄───────────── │   (Postgres) │
└──────────────┘     Bot Response        │  api/webhook.js  │     Result     └──────────────┘
                                         └──────────────────┘
```

**Alur Kerja:**
1. User mengirim pesan di Telegram (misal: `tambah layanan Internet Fiber`)
2. Telegram mengirim pesan tersebut ke webhook URL di Vercel (`/api/webhook`)
3. Vercel menjalankan serverless function (`api/webhook.js`)
4. Bot memproses perintah menggunakan **Telegraf** (parsing pesan, validasi input)
5. Bot melakukan query ke **Supabase** (insert/select data)
6. Bot mengirim respons balik ke user di Telegram

### Kenapa Webhook (bukan Polling)?

| Aspek | Webhook | Polling |
|-------|---------|---------|
| **Cara kerja** | Telegram mengirim update ke URL kita | Bot terus-menerus bertanya ke Telegram |
| **Resource** | Hemat — hanya aktif saat ada pesan | Boros — proses berjalan 24/7 |
| **Cocok untuk** | Serverless (Vercel, AWS Lambda) | Server tradisional (VPS) |
| **Latensi** | Real-time | Delay tergantung interval polling |

Karena project ini di-deploy ke **Vercel Serverless**, webhook adalah pilihan yang tepat karena function hanya berjalan ketika ada request masuk.

> 📝 Untuk development lokal, disediakan `dev.js` yang menggunakan mode **polling** karena localhost tidak bisa menerima webhook dari Telegram.

### Struktur Database

```
┌─────────────────────┐         ┌─────────────────────────────────────┐
│       layanan        │         │            pelanggan                │
├─────────────────────┤         ├─────────────────────────────────────┤
│ id (PK, SERIAL)     │    ┌──► │ id (PK, SERIAL)                    │
│ nama_layanan (UNIQUE)│◄───┘   │ nama_pelanggan (TEXT)               │
└─────────────────────┘    FK   │ nama_layanan (FK → layanan)         │
                                │ durasi_waktu (TEXT)                  │
                                │ tanggal_masuk (TIMESTAMPTZ, NOW())  │
                                └─────────────────────────────────────┘
```

- **Tabel `layanan`** — Menyimpan kategori layanan yang tersedia (misal: "Internet Fiber", "TV Kabel")
- **Tabel `pelanggan`** — Menyimpan data pelanggan yang terhubung ke layanan via Foreign Key
- Relasi: Satu layanan bisa dimiliki banyak pelanggan (**one-to-many**)
- `nama_layanan` pada tabel `pelanggan` merujuk ke `nama_layanan` di tabel `layanan`, sehingga tidak bisa menambah pelanggan dengan layanan yang belum terdaftar

### Keamanan

- **Owner-only access** — Bot hanya merespons pesan dari Telegram User ID yang terdaftar sebagai `OWNER_ID` di environment variable. User lain akan mendapat pesan "Akses ditolak".
- **Environment Variables** — Token dan API key tidak di-hardcode, melainkan disimpan di `.env` (lokal) atau Vercel Environment Variables (production).
- **Input Sanitization** — Semua output ke Telegram di-escape untuk mencegah HTML injection.

---

## Tech Stack

| Teknologi | Fungsi |
|-----------|--------|
| **Node.js** | Runtime JavaScript |
| **[Telegraf v4](https://telegraf.js.org/)** | Framework Telegram Bot — menangani command, parsing pesan, reply |
| **[@supabase/supabase-js](https://supabase.com/docs/reference/javascript)** | Client library untuk query ke database Supabase (PostgreSQL) |
| **[Vercel](https://vercel.com/)** | Platform deployment — menjalankan bot sebagai Serverless Function |
| **[dotenv](https://www.npmjs.com/package/dotenv)** | Mengelola environment variables dari file `.env` |

---

## 📁 Struktur Project

```
Manajemen-Pelanggan-Bot/
├── api/
│   └── webhook.js       # Handler utama (Vercel Serverless Function)
│                         # - Inisialisasi Telegraf & Supabase
│                         # - Middleware owner-only
│                         # - Semua perintah bot (hears + regex)
│                         # - Export handler: module.exports = async (req, res)
│
├── dev.js               # Development server (mode polling)
│                         # - Duplikasi logic dari webhook.js
│                         # - Menggunakan bot.launch() untuk polling
│                         # - Graceful shutdown (SIGINT/SIGTERM)
│
├── .env                 # Environment variables (TIDAK di-commit)
├── .env.example         # Template environment variables
├── .gitignore           # Ignore: node_modules/, .env, .vercel
├── package.json         # Dependencies & scripts
├── vercel.json          # Konfigurasi routing Vercel
└── README.md            # Dokumentasi
```

### Penjelasan File Utama

#### `api/webhook.js`
File ini adalah **jantung** dari bot. Berisi:
- **Inisialisasi** Telegraf bot instance dan Supabase client
- **Middleware** untuk memvalidasi bahwa hanya owner yang bisa menggunakan bot
- **Command handlers** menggunakan `bot.hears()` dengan regex pattern (case-insensitive)
- **Error handling** lengkap dengan try-catch dan pesan error yang informatif
- **Serverless export** — `module.exports = async (req, res)` yang memanggil `bot.handleUpdate()`

#### `dev.js`
File ini untuk **development lokal** saja. Menduplikasi logic dari `webhook.js` tapi menggunakan `bot.launch()` (polling mode) karena localhost tidak bisa menerima webhook dari Telegram.

#### `vercel.json`
Konfigurasi Vercel yang memetakan route `/api/webhook` ke file `api/webhook.js` menggunakan `@vercel/node` runtime.

---

## 📦 Setup Database (Supabase)

Buka **SQL Editor** di dashboard Supabase, lalu jalankan query berikut:

```sql
-- Tabel Layanan
CREATE TABLE layanan (
  id SERIAL PRIMARY KEY,
  nama_layanan TEXT NOT NULL UNIQUE
);

-- Tabel Pelanggan
CREATE TABLE pelanggan (
  id SERIAL PRIMARY KEY,
  nama_pelanggan TEXT NOT NULL,
  nama_layanan TEXT NOT NULL REFERENCES layanan(nama_layanan),
  durasi_waktu TEXT NOT NULL,
  tanggal_masuk TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk performa query
CREATE INDEX idx_pelanggan_layanan ON pelanggan(nama_layanan);
```

---

## ⚙️ Environment Variables

Buat file `.env` (untuk lokal) atau set di **Vercel Dashboard > Settings > Environment Variables**:

| Variable       | Keterangan                              |
| -------------- | --------------------------------------- |
| `BOT_TOKEN`    | Token bot dari [@BotFather](https://t.me/BotFather) |
| `SUPABASE_URL` | URL project Supabase (`https://xxx.supabase.co`) |
| `SUPABASE_KEY` | Anon key dari Supabase (Settings > API) |
| `OWNER_ID`     | Telegram User ID owner (cek via [@userinfobot](https://t.me/userinfobot)) |

---

## 💻 Development Lokal

```bash
# 1. Clone repository
git clone https://github.com/Ridzz05/Bot-Customer-Relations.git
cd Bot-Customer-Relations

# 2. Install dependencies
npm install

# 3. Buat file .env
cp .env.example .env
# Edit .env, isi semua variabel

# 4. Jalankan bot (polling mode)
npm run dev
```

---

## 🚀 Deploy ke Vercel

### 1. Push ke GitHub

```bash
git add .
git commit -m "Initial commit: Telegram Bot Manajemen Pelanggan"
git push origin main
```

### 2. Import Project di Vercel

1. Buka [vercel.com/new](https://vercel.com/new)
2. Import repository dari GitHub
3. Tambahkan **Environment Variables** (`BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`, `OWNER_ID`)
4. Klik **Deploy**

### 3. Set Webhook (Manual)

Setelah deploy berhasil, set webhook Telegram dengan membuka URL berikut di browser:

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<NAMA_PROJECT>.vercel.app/api/webhook
```

**Contoh:**

```
https://api.telegram.org/bot123456:ABC-DEF/setWebhook?url=https://manajemen-pelanggan-bot.vercel.app/api/webhook
```

Jika berhasil, akan muncul respons:

```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### Cek Status Webhook

```
https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
```

### Hapus Webhook (jika perlu)

```
https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook
```

---

## 🤖 Daftar Perintah

| Perintah | Contoh | Keterangan |
| -------- | ------ | ---------- |
| `/start` | `/start` | Menampilkan pesan selamat datang & panduan |
| `tambah layanan` | `tambah layanan Internet Fiber` | Menambah kategori layanan baru |
| `tambah pelanggan` | `tambah pelanggan "Budi" "Internet Fiber" "30 Hari"` | Menambah data pelanggan |
| `daftar layanan` | `daftar layanan` | Melihat daftar layanan yang tersedia |

> 💡 Perintah bersifat **case-insensitive** (huruf besar/kecil tidak berpengaruh).
> 💡 Gunakan tanda kutip `"..."` untuk nilai yang mengandung spasi.

### Contoh Penggunaan

```
User: /start
Bot:  👋 Halo, Ridz! Saya adalah Bot Manajemen Pelanggan...

User: tambah layanan Internet Fiber
Bot:  ✅ Layanan berhasil ditambahkan!
      📦 Nama: Internet Fiber
      🆔 ID: 1

User: tambah pelanggan "Budi Santoso" "Internet Fiber" "30 Hari"
Bot:  ✅ Pelanggan berhasil ditambahkan!
      👤 Nama: Budi Santoso
      📦 Layanan: Internet Fiber
      ⏱️ Durasi: 30 Hari
      📅 Tanggal Masuk: Jumat, 28 Maret 2026

User: daftar layanan
Bot:  📋 Daftar Layanan:
      1. Internet Fiber
      Total: 1 layanan
```

---

## License

MIT
