import { handleUpdate } from '../lib/bot.js';
import { alertAdmins } from '../lib/telegram.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).send('Unauthorized');
  try { await handleUpdate(req.body || {}); return res.status(200).json({ ok: true }); }
  catch (e) { console.error(e); await alertAdmins(`Webhook error: ${e.message}`); return res.status(200).json({ ok: false }); }
}
