/**
 * Local Development Server
 * Menjalankan bot dalam mode polling (tanpa webhook).
 * Gunakan: npm run dev
 */

require('dotenv').config();

const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// — Validasi env
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = process.env.OWNER_ID;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY || !OWNER_ID) {
  console.error('❌ Pastikan BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, dan OWNER_ID diisi di file .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// — Middleware: Owner only
bot.use((ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (userId !== OWNER_ID) {
    return ctx.replyWithHTML('⛔ <b>Akses ditolak.</b>\nBot ini hanya bisa digunakan oleh owner.');
  }
  return next();
});

// — Helper
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseCommaArgs(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

// — /start
bot.start((ctx) => {
  const nama = ctx.from.first_name || 'User';
  return ctx.replyWithHTML(
    `👋 <b>Halo, ${escapeHtml(nama)}!</b>\n\n` +
      `Saya adalah Bot Manajemen Pelanggan.\n` +
      `Berikut perintah yang tersedia:\n\n` +
      `📦 <b>Tambah Layanan</b>\n` +
      `<code>tambah layanan [nama layanan]</code>\n` +
      `Contoh: <code>tambah layanan Internet Fiber</code>\n\n` +
      `👤 <b>Tambah Pelanggan</b>\n` +
      `<code>tambah pelanggan [nama], [layanan], [durasi]</code>\n` +
      `Contoh: <code>tambah pelanggan Yanto, Internet Fiber, 30 Hari</code>\n\n` +
      `📋 <b>Daftar Layanan</b>\n` +
      `<code>daftar layanan</code>`
  );
});

// — tambah layanan
bot.hears(/^tambah layanan\s+(.+)/i, async (ctx) => {
  try {
    const namaLayanan = ctx.match[1].trim();
    if (!namaLayanan) {
      return ctx.replyWithHTML(`⚠️ <b>Nama layanan tidak boleh kosong!</b>\nContoh: <code>tambah layanan Internet Fiber</code>`);
    }
    const { data, error } = await supabase.from('layanan').insert({ nama_layanan: namaLayanan }).select().single();
    if (error) {
      if (error.code === '23505') return ctx.replyWithHTML(`❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> sudah terdaftar.`);
      console.error('[tambah layanan]', error);
      return ctx.replyWithHTML(`❌ Gagal menambah layanan.\n<code>${escapeHtml(error.message)}</code>`);
    }
    return ctx.replyWithHTML(`✅ Layanan berhasil ditambahkan!\n\n📦 <b>Nama:</b> ${escapeHtml(data.nama_layanan)}\n🆔 <b>ID:</b> ${data.id}`);
  } catch (err) {
    console.error('[tambah layanan]', err);
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// — tambah pelanggan
bot.hears(/^tambah pelanggan\s+(.+)/i, async (ctx) => {
  try {
    const rawText = ctx.match[1].trim();
    const parsed = parseCommaArgs(rawText);
    if (parsed.length < 3) {
      return ctx.replyWithHTML(
        `⚠️ <b>Argumen tidak lengkap!</b>\n\nContoh: <code>tambah pelanggan Yanto, Internet Fiber, 30 Hari</code>`
      );
    }
    const [namaPelanggan, namaLayanan, durasiWaktu] = parsed;

    const { data: layanan } = await supabase.from('layanan').select('nama_layanan').eq('nama_layanan', namaLayanan).single();
    if (!layanan) {
      return ctx.replyWithHTML(`❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> belum terdaftar!\nTambahkan: <code>tambah layanan ${escapeHtml(namaLayanan)}</code>`);
    }

    const { data, error } = await supabase.from('pelanggan').insert({ nama_pelanggan: namaPelanggan, nama_layanan: namaLayanan, durasi_waktu: durasiWaktu }).select().single();
    if (error) {
      if (error.code === '23503') return ctx.replyWithHTML(`❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> belum terdaftar!`);
      console.error('[tambah pelanggan]', error);
      return ctx.replyWithHTML(`❌ Gagal menambah pelanggan.\n<code>${escapeHtml(error.message)}</code>`);
    }

    const tanggal = new Date(data.tanggal_masuk).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return ctx.replyWithHTML(
      `✅ Pelanggan berhasil ditambahkan!\n\n` +
        `👤 <b>Nama:</b> ${escapeHtml(data.nama_pelanggan)}\n` +
        `📦 <b>Layanan:</b> ${escapeHtml(data.nama_layanan)}\n` +
        `⏱️ <b>Durasi:</b> ${escapeHtml(data.durasi_waktu)}\n` +
        `📅 <b>Tanggal:</b> ${tanggal}`
    );
  } catch (err) {
    console.error('[tambah pelanggan]', err);
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// — daftar layanan
bot.hears(/^daftar layanan$/i, async (ctx) => {
  try {
    const { data, error } = await supabase.from('layanan').select('id, nama_layanan').order('id', { ascending: true });
    if (error) return ctx.replyWithHTML(`❌ Gagal mengambil data.\n<code>${escapeHtml(error.message)}</code>`);
    if (!data || data.length === 0) return ctx.replyWithHTML(`📭 Belum ada layanan. Tambahkan: <code>tambah layanan [nama]</code>`);
    const list = data.map((item, i) => `${i + 1}. ${escapeHtml(item.nama_layanan)}`).join('\n');
    return ctx.replyWithHTML(`📋 <b>Daftar Layanan:</b>\n\n${list}\n\nTotal: <b>${data.length}</b> layanan`);
  } catch (err) {
    console.error('[daftar layanan]', err);
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// — Launch polling
bot.launch()
  .then(() => console.log('🤖 Bot berjalan dalam mode polling (lokal)...'))
  .catch((err) => {
    console.error('❌ Gagal menjalankan bot:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
