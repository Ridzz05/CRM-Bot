const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Validasi env
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = process.env.OWNER_ID;

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = async (req, res) => {
  // Hanya izinkan akses jika ada Authorization header (opsional, untuk Vercel Cron)
  // if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).end('Unauthorized');
  // }

  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Ambil pelanggan yang expired < 1 hari dan belum dinotifikasi
    const { data, error } = await supabase
      .from('pelanggan')
      .select('*')
      .lt('tanggal_expired', tomorrow.toISOString())
      .eq('notifikasi_sent', false);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(200).json({ status: 'ok', message: 'Tidak ada pelanggan yang mendekati tenggat.' });
    }

    // Kelompokkan pesan
    let message = `⚠️ <b>PENGINGAT TENGGAT WAKTU</b>\n\nPelanggan berikut akan segera habis masa aktifnya (kurang dari 1 hari):\n\n`;
    
    for (const p of data) {
      const tgl = new Date(p.tanggal_expired).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      message += `• 👤 <b>${escapeHtml(p.nama_pelanggan)}</b>\n  📦 Layanan: ${escapeHtml(p.nama_layanan)}\n  📅 Exp: ${tgl}\n\n`;
    }

    message += `Mohon segera lakukan follow-up.`;

    // Kirim ke owner
    await bot.telegram.sendMessage(OWNER_ID, message, { parse_mode: 'HTML' });

    // Update status notifikasi_sent agar tidak dikirim berulang kali
    const ids = data.map(p => p.id);
    await supabase.from('pelanggan').update({ notifikasi_sent: true }).in('id', ids);

    res.status(200).json({ status: 'ok', notified_count: data.length });
  } catch (err) {
    console.error('[cron] Error:', err);
    res.status(500).json({ error: err.message });
  }
};
