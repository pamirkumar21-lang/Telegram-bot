export default async function handler(req,res) {
 if(req.method!=='POST') return res.status(405).send('Method Not Allowed');
 if(!process.env.SETUP_SECRET || req.headers.authorization!==`Bearer ${process.env.SETUP_SECRET}`) return res.status(401).send('Unauthorized');
 const base=(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,''); if(!base||!process.env.TELEGRAM_BOT_TOKEN) return res.status(400).json({ok:false,error:'Set PUBLIC_BASE_URL and TELEGRAM_BOT_TOKEN'});
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
 const payload={url:`${base}/api/webhook`,allowed_updates:['message','callback_query','channel_post']}; if(secret) payload.secret_token=secret;
 const r=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); const data=await r.json(); return res.status(r.ok?200:502).json(data);
}
