import { runDailyReport } from '../../lib/bot.js';
import { alertAdmins } from '../../lib/telegram.js';
export default async function handler(req,res) {
 if(req.method!=='GET') return res.status(405).send('Method Not Allowed');
 if(!process.env.CRON_SECRET || req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`) return res.status(401).send('Unauthorized');
 try { const report=await runDailyReport(); return res.status(200).json({ok:true,...report}); }
 catch(e) { console.error(e); await alertAdmins(`Daily cron failed: ${e.message}`); return res.status(500).json({ok:false,error:'Daily report failed'}); }
}
