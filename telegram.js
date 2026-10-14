const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
export async function tg(method, payload = {}) {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const res = await fetch(`${API()}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  return data.result;
}
export const sendMessage = (chat_id, text, extra = {}) => tg('sendMessage', { chat_id, text, ...extra });
export const answerCallback = (callback_query_id, text, show_alert = false) => tg('answerCallbackQuery', { callback_query_id, text, show_alert });
export const copyMessage = (chat_id, from_chat_id, message_id, extra = {}) => tg('copyMessage', { chat_id, from_chat_id, message_id, ...extra });
export async function alertAdmins(message) {
  const ids = (process.env.ERROR_ALERT_ADMIN_IDS || process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  await Promise.allSettled(ids.map(chat_id => sendMessage(chat_id, `⚠️ K-DRAMA HUB BOT ALERT\n${message}`)));
}
