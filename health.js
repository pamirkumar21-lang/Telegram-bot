export default function handler(req,res) {
 if(req.method!=='GET') return res.status(405).send('Method Not Allowed');
 return res.status(200).json({ok:true,service:'kdrama-hub-telegram-bot',timestamp:new Date().toISOString(),configured:{telegram:Boolean(process.env.TELEGRAM_BOT_TOKEN),firebase:Boolean(process.env.FIREBASE_DATABASE_URL&&process.env.FIREBASE_SERVICE_ACCOUNT_BASE64),admins:Boolean(process.env.ADMIN_IDS)}});
}
