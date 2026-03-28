require('dotenv').config();

const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// =============================================================================
// Inisialisasi Bot & Supabase Client
// =============================================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = process.env.OWNER_ID;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY || !OWNER_ID) {
  throw new Error(
    'Environment variables BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, dan OWNER_ID harus diisi!'
  );
}

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================================================
// Middleware: Hanya owner yang bisa menggunakan bot
// =============================================================================

bot.use((ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (userId !== OWNER_ID) {
    return ctx.replyWithHTML('⛔ <b>Akses ditolak.</b>\nBot ini hanya bisa digunakan oleh owner.');
  }
  return next();
});

// =============================================================================
// Helper Functions
// =============================================================================

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

// =============================================================================
// Command: /start
// =============================================================================

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

// =============================================================================
// Perintah: tambah layanan {nama_layanan}
// =============================================================================

bot.hears(/^tambah layanan\s+(.+)/i, async (ctx) => {
  try {
    const namaLayanan = ctx.match[1].trim();

    if (!namaLayanan) {
      return ctx.replyWithHTML(
        `⚠️ <b>Nama layanan tidak boleh kosong!</b>\n\n` +
          `Contoh: <code>tambah layanan Internet Fiber</code>`
      );
    }

    const { data, error } = await supabase
      .from('layanan')
      .insert({ nama_layanan: namaLayanan })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return ctx.replyWithHTML(
          `❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> sudah terdaftar.`
        );
      }
      console.error('[tambah layanan] Supabase error:', error);
      return ctx.replyWithHTML(
        `❌ Gagal menambah layanan.\n<code>${escapeHtml(error.message)}</code>`
      );
    }

    return ctx.replyWithHTML(
      `✅ Layanan berhasil ditambahkan!\n\n` +
        `📦 <b>Nama:</b> ${escapeHtml(data.nama_layanan)}\n` +
        `🆔 <b>ID:</b> ${data.id}`
    );
  } catch (err) {
    console.error('[tambah layanan] Unexpected error:', err);
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal. Coba lagi nanti.');
  }
});

// =============================================================================
// Perintah: tambah pelanggan {nama} {layanan} {durasi}
// =============================================================================

bot.hears(/^tambah pelanggan\s+(.+)/i, async (ctx) => {
  try {
    const rawText = ctx.match[1].trim();
    const parsed = parseCommaArgs(rawText);

    if (parsed.length < 3) {
      return ctx.replyWithHTML(
        `⚠️ <b>Argumen tidak lengkap!</b>\n\n` +
          `Dibutuhkan 3 argumen: <b>nama</b>, <b>layanan</b>, <b>durasi</b>.\n` +
          `Pisahkan dengan tanda koma.\n\n` +
          `Contoh: <code>tambah pelanggan Yanto, Internet Fiber, 30 Hari</code>`
      );
    }

    const [namaPelanggan, namaLayanan, durasiWaktu] = parsed;

    // Cek apakah layanan sudah terdaftar
    const { data: layanan, error: layananErr } = await supabase
      .from('layanan')
      .select('nama_layanan')
      .eq('nama_layanan', namaLayanan)
      .single();

    if (layananErr || !layanan) {
      return ctx.replyWithHTML(
        `❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> belum terdaftar!\n\n` +
          `Silakan tambahkan dulu dengan:\n` +
          `<code>tambah layanan ${escapeHtml(namaLayanan)}</code>`
      );
    }

    // Insert pelanggan
    const expiryDate = calculateExpiryDate(new Date(), durasiWaktu);
    const { data, error } = await supabase
      .from('pelanggan')
      .insert({
        nama_pelanggan: namaPelanggan,
        nama_layanan: namaLayanan,
        durasi_waktu: durasiWaktu,
        tanggal_expired: expiryDate.toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23503') {
        return ctx.replyWithHTML(
          `❌ Layanan <b>"${escapeHtml(namaLayanan)}"</b> belum terdaftar!\n\n` +
            `Silakan tambahkan dulu dengan:\n` +
            `<code>tambah layanan ${escapeHtml(namaLayanan)}</code>`
        );
      }
      console.error('[tambah pelanggan] Supabase error:', error);
      return ctx.replyWithHTML(
        `❌ Gagal menambah pelanggan.\n<code>${escapeHtml(error.message)}</code>`
      );
    }

    const tanggal = new Date(data.tanggal_masuk).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return ctx.replyWithHTML(
      `✅ Pelanggan berhasil ditambahkan!\n\n` +
        `👤 <b>Nama:</b> ${escapeHtml(data.nama_pelanggan)}\n` +
        `📦 <b>Layanan:</b> ${escapeHtml(data.nama_layanan)}\n` +
        `⏱️ <b>Durasi:</b> ${escapeHtml(data.durasi_waktu)}\n` +
        `📅 <b>Tanggal Masuk:</b> ${tanggal}`
    );
  } catch (err) {
    console.error('[tambah pelanggan] Unexpected error:', err);
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal. Coba lagi nanti.');
  }
});

// =============================================================================
// Perintah: daftar layanan
// =============================================================================

bot.hears(/^daftar layanan$/i, async (ctx) => {
  try {
    const { data, error } = await supabase
      .from('layanan')
      .select('id, nama_layanan')
      .order('id', { ascending: true });

    if (error) {
      console.error('[daftar layanan] Supabase error:', error);
      return ctx.replyWithHTML(
        `❌ Gagal mengambil data layanan.\n<code>${escapeHtml(error.message)}</code>`
      );
    }

    if (!data || data.length === 0) {
      return ctx.replyWithHTML(
        `📭 Belum ada layanan terdaftar.\n\n` +
          `Tambahkan dengan: <code>tambah layanan [nama]</code>`
      );
    }

    const list = data
      .map((item, i) => `${i + 1}. ${escapeHtml(item.nama_layanan)}`)
      .join('\n');

    return ctx.replyWithHTML(
      `📋 <b>Daftar Layanan:</b>\n\n${list}\n\n` +
        `Total: <b>${data.length}</b> layanan`
    );
  } catch (err) {
    console.error('[daftar layanan] Unexpected error:', err);
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal. Coba lagi nanti.');
  }
});

// =============================================================================
// Perintah: cek pelanggan {nama_layanan}
// =============================================================================

bot.hears(/^cek pelanggan\s+(.+)/i, async (ctx) => {
  try {
    const namaLayanan = ctx.match[1].trim();
    const { data, error } = await supabase
      .from('pelanggan')
      .select('*')
      .eq('nama_layanan', namaLayanan)
      .order('tanggal_expired', { ascending: true });

    if (error) {
      console.error('[cek pelanggan] Supabase error:', error);
      return ctx.replyWithHTML(`❌ Gagal mengambil data.\n<code>${escapeHtml(error.message)}</code>`);
    }

    if (!data || data.length === 0) {
      return ctx.replyWithHTML(`📭 Tidak ada pelanggan untuk layanan <b>"${escapeHtml(namaLayanan)}"</b>.`);
    }

    const list = data.map((p, i) => {
      const tgl = new Date(p.tanggal_expired).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const diff = new Date(p.tanggal_expired) - new Date();
      const sisaHari = Math.ceil(diff / (1000 * 60 * 60 * 24));
      const status = sisaHari < 0 ? '❌ EXPIRED' : sisaHari <= 3 ? '⚠️ SEGERA' : '✅ AKTIF';
      
      return `${i + 1}. <b>${escapeHtml(p.nama_pelanggan)}</b>\n   📅 Exp: ${tgl} (${sisaHari} hari) [${status}]`;
    }).join('\n\n');

    return ctx.replyWithHTML(`📋 <b>Pelanggan Layanan: ${escapeHtml(namaLayanan)}</b>\n\n${list}`);
  } catch (err) {
    console.error('[cek pelanggan] Unexpected error:', err);
    return ctx.replyWithHTML('❌ Terjadi kesalahan internal.');
  }
});

// =============================================================================
// Vercel Serverless Handler (Webhook)
// =============================================================================

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).json({
        status: 'ok',
        bot: 'Manajemen Pelanggan Bot',
        message: 'Webhook endpoint aktif. Gunakan POST untuk update dari Telegram.',
      });
    }
  } catch (err) {
    console.error('[webhook] Error handling update:', err);
    res.status(200).json({ error: 'Internal error' });
  }
};
