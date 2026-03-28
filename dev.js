/**
 * Local Development Server
 * Menjalankan bot dalam mode polling (tanpa webhook).
 * Gunakan: npm run dev
 */

require('dotenv').config();

const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { HttpsProxyAgent } = require('https-proxy-agent');

// — Validasi env
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = process.env.OWNER_ID;
const HTTPS_PROXY = process.env.HTTPS_PROXY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY || !OWNER_ID) {
  console.error('❌ Pastikan BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, dan OWNER_ID diisi di file .env');
  process.exit(1);
}

// Konfigurasi Proxy (untuk mengatasi ETIMEDOUT di ISP tertentu)
const agent = HTTPS_PROXY ? new HttpsProxyAgent(HTTPS_PROXY) : undefined;
const bot = new Telegraf(BOT_TOKEN, {
  telegram: { agent }
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// — Middleware: Owner only
bot.use((ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (userId !== OWNER_ID) {
    return ctx.replyWithHTML('⛔ <b>Akses ditolak.</b>\nBot ini hanya bisa digunakan oleh owner.');
  }
  return next();
});

// — Helpers
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseCommaArgs(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

function calculateExpiryDate(startDate, durationStr) {
  const date = new Date(startDate);
  const match = durationStr.match(/(\d+)\s*(hari|bulan|tahun|day|month|year)/i);
  if (!match) return new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 hari

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('hari') || unit.startsWith('day')) {
    date.setDate(date.getDate() + amount);
  } else if (unit.startsWith('bulan') || unit.startsWith('month')) {
    date.setMonth(date.getMonth() + amount);
  } else if (unit.startsWith('tahun') || unit.startsWith('year')) {
    date.setFullYear(date.getFullYear() + amount);
  }
  return date;
}

// — /start
bot.start((ctx) => {
  const nama = ctx.from.first_name || 'User';
  return ctx.replyWithHTML(
    `👋 <b>Halo, ${escapeHtml(nama)}!</b>\n\n` +
      `Saya adalah Bot Manajemen Pelanggan.\n` +
      `Berikut perintah yang tersedia:\n\n` +
      `📦 <b>Tambah Layanan</b>\n` +
      `<code>tambah layanan [nama layanan]</code>\n\n` +
      `👤 <b>Tambah Pelanggan</b>\n` +
      `<code>tambah pelanggan [nama], [layanan], [durasi]</code>\n` +
      `Contoh: <code>tambah pelanggan Yanto, Internet Fiber, 30 Hari</code>\n\n` +
      `📋 <b>Daftar Layanan</b>\n` +
      `<code>daftar layanan</code>\n\n` +
      `🔍 <b>Cek Pelanggan</b>\n` +
      `<code>cek pelanggan [nama layanan]</code>`
  );
});

// — tambah layanan
bot.hears(/^tambah layanan\s+(.+)/i, async (ctx) => {
  try {
    const namaLayanan = ctx.match[1].trim();
    const { data, error } = await supabase.from('layanan').insert({ nama_layanan: namaLayanan }).select().single();
    if (error) {
      if (error.code === '23505') return ctx.replyWithHTML(`❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> sudah terdaftar.`);
      return ctx.replyWithHTML(`❌ Gagal menambah layanan.\n<code>${escapeHtml(error.message)}</code>`);
    }
    return ctx.replyWithHTML(`✅ Layanan berhasil ditambahkan!\n📦 <b>Nama:</b> ${escapeHtml(data.nama_layanan)}`);
  } catch (err) {
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// — tambah pelanggan
bot.hears(/^tambah pelanggan\s+(.+)/i, async (ctx) => {
  try {
    const rawText = ctx.match[1].trim();
    const parsed = parseCommaArgs(rawText);
    if (parsed.length < 3) {
      return ctx.replyWithHTML(`⚠️ <b>Argumen tidak lengkap!</b>\nContoh: <code>tambah pelanggan Yanto, Internet Fiber, 30 Hari</code>`);
    }
    const [namaPelanggan, namaLayanan, durasiWaktu] = parsed;

    const { data: layanan } = await supabase.from('layanan').select('nama_layanan').eq('nama_layanan', namaLayanan).single();
    if (!layanan) return ctx.replyWithHTML(`❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> belum terdaftar!`);

    const expiryDate = calculateExpiryDate(new Date(), durasiWaktu);
    const { data, error } = await supabase.from('pelanggan').insert({ 
      nama_pelanggan: namaPelanggan, 
      nama_layanan: namaLayanan, 
      durasi_waktu: durasiWaktu,
      tanggal_expired: expiryDate.toISOString()
    }).select().single();

    if (error) return ctx.replyWithHTML(`❌ Gagal menambah pelanggan.\n<code>${escapeHtml(error.message)}</code>`);

    const tglExp = new Date(data.tanggal_expired).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    return ctx.replyWithHTML(
      `✅ Pelanggan berhasil ditambahkan!\n\n` +
        `👤 <b>Nama:</b> ${escapeHtml(data.nama_pelanggan)}\n` +
        `📅 <b>Tenggat:</b> ${tglExp}\n` +
        `⏱️ <b>Durasi:</b> ${escapeHtml(data.durasi_waktu)}`
    );
  } catch (err) {
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// — daftar layanan
bot.hears(/^daftar layanan$/i, async (ctx) => {
  try {
    const { data, error } = await supabase.from('layanan').select('nama_layanan').order('id', { ascending: true });
    if (error) return ctx.replyWithHTML(`❌ Gagal mengambil data.`);
    if (!data.length) return ctx.replyWithHTML(`📭 Belum ada layanan.`);
    const list = data.map((item, i) => `${i + 1}. ${escapeHtml(item.nama_layanan)}`).join('\n');
    return ctx.replyWithHTML(`📋 <b>Daftar Layanan:</b>\n\n${list}`);
  } catch (err) {
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// — cek pelanggan [layanan]
bot.hears(/^cek pelanggan\s+(.+)/i, async (ctx) => {
  try {
    const namaLayanan = ctx.match[1].trim();
    const { data, error } = await supabase.from('pelanggan').select('*').eq('nama_layanan', namaLayanan).order('tanggal_expired', { ascending: true });
    if (error) return ctx.replyWithHTML(`❌ Gagal mengambil data.`);
    if (!data.length) return ctx.replyWithHTML(`📭 Tidak ada pelanggan untuk layanan <b>"${escapeHtml(namaLayanan)}"</b>.`);

    const list = data.map((p, i) => {
      const tgl = new Date(p.tanggal_expired).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const diff = new Date(p.tanggal_expired) - new Date();
      const sisaHari = Math.ceil(diff / (1000 * 60 * 60 * 24));
      const status = sisaHari < 0 ? '❌ EXPIRED' : sisaHari <= 3 ? '⚠️ SEGERA' : '✅ AKTIF';
      return `${i + 1}. <b>${escapeHtml(p.nama_pelanggan)}</b>\n   📅 Exp: ${tgl} (${sisaHari} hari) [${status}]`;
    }).join('\n\n');

    return ctx.replyWithHTML(`📋 <b>Pelanggan Layanan: ${escapeHtml(namaLayanan)}</b>\n\n${list}`);
  } catch (err) {
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// — Launch polling
bot.launch()
  .then(() => console.log('🤖 Bot berjalan dalam mode polling (lokal)...'))
  .catch((err) => {
    console.error('❌ Gagal menjalankan bot:', err);
    if (err.code === 'ETIMEDOUT') {
      console.log('\n💡 TIPS: Jika Anda di Indonesia, coba gunakan VPN atau Cloudflare WARP.');
      console.log('Atau atur HTTPS_PROXY di file .env Anda.');
    }
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
