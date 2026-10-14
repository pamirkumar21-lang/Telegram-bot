import { get, set, push, update, transaction } from './firebase.js';
import { tg, sendMessage, answerCallback, copyMessage, alertAdmins } from './telegram.js';

const now = () => new Date().toISOString();
const admins = () => (process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const isAdmin = id => admins().includes(String(id));
const clean = s => String(s || '').trim().slice(0, 300);
const norm = s => clean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const langOf = async id => (await get(`users/${id}/language`, 'en')) === 'hi' ? 'hi' : 'en';
const tr = (lang, en, hi) => lang === 'hi' ? hi : en;
async function log(action, userId, details = {}) { await push('adminActivity', { action, userId: String(userId), details, at: now() }); }
async function touchUser(user) {
  const id = String(user.id);
  const current = await get(`users/${id}`, {});
  await update(`users/${id}`, { id, username: user.username || current.username || '', firstName: user.first_name || current.firstName || '', lastSeenAt: now(), createdAt: current.createdAt || now(), banned: current.banned || false, language: current.language || 'en' });
}
async function maintenance() { return Boolean(await get('settings/maintenance', false)); }
async function checkMember(userId) {
  const channel = process.env.FORCE_SUBSCRIBE_CHANNEL;
  if (!channel) return true;
  try { const r = await tg('getChatMember', { chat_id: channel, user_id: userId }); return ['creator','administrator','member'].includes(r.status) || (r.status === 'restricted' && r.is_member); }
  catch { return false; }
}
function keyboard(rows) { return { inline_keyboard: rows }; }
function mainMenu(lang='en') {
  return keyboard([
    [{text:tr(lang,'🔎 Search dramas','🔎 ड्रामा खोजें'),callback_data:'menu:search'},{text:tr(lang,'🆕 Recently added','🆕 नए ड्रामा'),callback_data:'menu:recent'}],
    [{text:tr(lang,'🔥 Trending','🔥 लोकप्रिय'),callback_data:'menu:trending'},{text:tr(lang,'🎲 Random drama','🎲 कोई भी ड्रामा'),callback_data:'menu:random'}],
    [{text:tr(lang,'❤️ Favorites','❤️ पसंदीदा'),callback_data:'menu:favorites'},{text:tr(lang,'📋 Watchlist','📋 वॉचलिस्ट'),callback_data:'menu:watchlist'}],
    [{text:tr(lang,'📩 Request drama','📩 ड्रामा रिक्वेस्ट'),callback_data:'menu:request'},{text:tr(lang,'🌐 Language','🌐 भाषा'),callback_data:'menu:language'}],
    [{text:tr(lang,'ℹ️ Help','ℹ️ मदद'),callback_data:'menu:help'}]
  ]);
}
async function dramas() { const v = await get('dramas', {}); return Object.entries(v || {}).map(([id,d]) => ({ id, ...d })).filter(d => d.active !== false); }
async function episodes(dramaId) { const v = await get(`episodes/${dramaId}`, {}); return Object.entries(v || {}).map(([id,e]) => ({ id, ...e })).filter(e => e.active !== false).sort((a,b) => Number(a.number || 0)-Number(b.number || 0)); }
async function renderDrama(chatId, userId, drama, lang='en') {
  const eps = await episodes(drama.id);
  const fav = Boolean(await get(`users/${userId}/favorites/${drama.id}`, false));
  const watch = Boolean(await get(`users/${userId}/watchlist/${drama.id}`, false));
  await push(`users/${userId}/recentlyViewed`, { dramaId: drama.id, at: now() });
  const caption = `🎬 <b>${esc(drama.title || 'Untitled')}</b>\n${drama.year ? `📅 ${esc(drama.year)}  ` : ''}${drama.language ? `🌐 ${esc(drama.language)}` : ''}\n${drama.genre ? `🏷 ${esc(Array.isArray(drama.genre) ? drama.genre.join(', ') : drama.genre)}\n` : ''}${drama.actors ? `⭐ ${esc(Array.isArray(drama.actors) ? drama.actors.join(', ') : drama.actors)}\n` : ''}\n${esc(drama.description || '')}\n\n📺 ${eps.length} episode(s)`;
  const rows = eps.slice(0, 8).map(e => [{ text: `▶️ EP ${e.number ?? e.title ?? '?'}`, callback_data: `ep:${drama.id}:${e.id}` }]);
  rows.push([{text: fav ? '💔 Remove favorite' : '❤️ Favorite', callback_data:`fav:${drama.id}`},{text:watch?'➖ Remove watchlist':'📋 Watchlist',callback_data:`watch:${drama.id}`}]);
  if (eps.length > 8) rows.push([{text:'Next episodes ➡️',callback_data:`eps:${drama.id}:8`}]);
  await sendMessage(chatId, caption, { parse_mode:'HTML', reply_markup:keyboard(rows) });
}
async function showResults(chatId, userId, query, page=0, filters={}) {
  const lang = await langOf(userId); const all = await dramas();
  const q = norm(query);
  let found = all.filter(d => {
    const text = norm([d.title,d.alternativeTitles,d.actors,d.genre,d.year,d.language].flat().join(' '));
    return (!q || text.includes(q)) && (!filters.language || norm(d.language).includes(norm(filters.language))) && (!filters.genre || norm(d.genre).includes(norm(filters.genre))) && (!filters.year || String(d.year) === String(filters.year));
  }).sort((a,b) => Number(b.searchCount||0)-Number(a.searchCount||0));
  await push(`analytics/searches`, { userId:String(userId), query:clean(query), resultCount:found.length, at:now() });
  // Count only matched dramas for a lightweight trending score.
  await Promise.all(found.slice(0, 20).map(d => transaction(`dramas/${d.id}/searchCount`, n => (Number(n) || 0) + 1).catch(() => null)));
  if (!found.length) return sendMessage(chatId, tr(lang,`No dramas found for “${clean(query)}”. Try another title.`,`“${clean(query)}” के लिए ड्रामा नहीं मिला। दूसरा नाम आज़माएँ।`), { reply_markup: mainMenu(lang) });
  const pageSize=8, start=page*pageSize, slice=found.slice(start,start+pageSize);
  const rows=slice.map(d=>[{text:`🎬 ${String(d.title||'Untitled').slice(0,50)}${d.year?` (${d.year})`:''}`,callback_data:`drama:${d.id}`}]);
  const nav=[]; if(page>0) nav.push({text:'⬅️ Previous',callback_data:`searchpage:${encodeURIComponent(query)}:${page-1}`}); if(start+pageSize<found.length) nav.push({text:'Next ➡️',callback_data:`searchpage:${encodeURIComponent(query)}:${page+1}`}); if(nav.length) rows.push(nav);
  await sendMessage(chatId, tr(lang,`🔎 Results for “${clean(query)}” — ${found.length} found`,`🔎 “${clean(query)}” के परिणाम — ${found.length} मिले`), {reply_markup:keyboard(rows)});
}
async function adminHelp(chatId) {
  await sendMessage(chatId, `🛠️ <b>Admin commands</b>\n/adddrama Title | year | language | genre | actors | description\n/addEpisode DRAMA_ID | episode number | file_id | quality | size_MB\n/editdrama DRAMA_ID | field | value\n/deleteDrama DRAMA_ID\n/deleteEpisode DRAMA_ID | EPISODE_ID\n/bulkhelp — bulk upload instructions\n/announce message\n/maintenance on|off\n/stats\n/export\n/checkfiles\n/backup`, {parse_mode:'HTML'});
}
async function adminCommand(msg, command, args) {
 const chatId=msg.chat.id, uid=msg.from.id;
 if (!isAdmin(uid)) { await sendMessage(chatId,'⛔ Admin only.'); return true; }
 if (command==='/admin') { await adminHelp(chatId); return true; }
 if (command==='/adddrama') {
   const p=args.split('|').map(s=>s.trim()); if(!p[0]) return sendMessage(chatId,'Usage: /adddrama Title | year | language | genre | actors | description');
   const key=norm(p[0]).replace(/ /g,'-').slice(0,70); const all=await dramas();
   if(all.some(d=>norm(d.title)===norm(p[0]))) return sendMessage(chatId,'⚠️ Duplicate title detected. Use /editdrama or a distinct title.');
   await set(`dramas/${key}`,{title:p[0],year:p[1]||'',language:p[2]||'Hindi Dubbed',genre:p[3]||'',actors:p[4]||'',description:p[5]||'',active:true,createdAt:now(),createdBy:String(uid),searchCount:0});
   await log('add_drama',uid,{id:key,title:p[0]}); await sendMessage(chatId,`✅ Drama added. ID: ${key}`); return true;
 }
 if(command==='/editdrama') { const [id,field,...rest]=args.split('|').map(s=>s.trim()); const value=rest.join('|'); const allowed=['title','year','language','genre','actors','description','poster','active']; if(!id||!allowed.includes(field)||!value) return sendMessage(chatId,'Usage: /editdrama ID | field | value'); await update(`dramas/${id}`,{[field]:field==='active'?value==='true':value,updatedAt:now()}); await log('edit_drama',uid,{id,field}); await sendMessage(chatId,'✅ Drama updated.'); return true; }
 if(command==='/deleteDrama') { const id=args.trim(); if(!id) return sendMessage(chatId,'Usage: /deleteDrama DRAMA_ID'); await set(`dramas/${id}`,null); await set(`episodes/${id}`,null); await log('delete_drama',uid,{id}); await sendMessage(chatId,'🗑️ Drama and its episode index deleted. Telegram channel copies are not deleted.'); return true; }
 if(command==='/addEpisode') { const p=args.split('|').map(s=>s.trim()); if(p.length<3) return sendMessage(chatId,'Usage: /addEpisode DRAMA_ID | episode number | Telegram file_id | quality | size_MB'); const [dramaId,number,fileId,quality='',size='']=p; if(!await get(`dramas/${dramaId}`)) return sendMessage(chatId,'Drama ID not found.'); const eps=await episodes(dramaId); if(eps.some(e=>e.fileId===fileId || Number(e.number)===Number(number))) return sendMessage(chatId,'⚠️ Duplicate file ID or episode number.'); const id=`ep${String(number).replace(/[^0-9a-z]/gi,'')}`; await set(`episodes/${dramaId}/${id}`,{number:Number(number)||number,fileId,quality,sizeMB:Number(size)||null,active:true,createdAt:now(),createdBy:String(uid)}); await log('add_episode',uid,{dramaId,id,number}); await sendMessage(chatId,`✅ Episode added: ${dramaId} / EP ${number}`); await announceNewEpisode(dramaId,number); return true; }
 if(command==='/deleteEpisode') { const [dramaId,epId]=args.split('|').map(s=>s.trim()); if(!dramaId||!epId) return sendMessage(chatId,'Usage: /deleteEpisode DRAMA_ID | EPISODE_ID'); await set(`episodes/${dramaId}/${epId}`,null); await log('delete_episode',uid,{dramaId,epId}); await sendMessage(chatId,'🗑️ Episode index deleted.'); return true; }
 if(command==='/announce') { const text=args.trim(); if(!text) return sendMessage(chatId,'Usage: /announce your message'); const channel=process.env.ANNOUNCEMENT_CHANNEL_ID; if(!channel) return sendMessage(chatId,'ANNOUNCEMENT_CHANNEL_ID is not configured.'); await sendMessage(channel,`🎬 <b>K-DRAMA HUB UPDATE</b>\n\n${esc(text)}`,{parse_mode:'HTML'}); await log('announcement',uid,{text:text.slice(0,200)}); await sendMessage(chatId,'✅ Announcement sent.'); return true; }
 if(command==='/maintenance') { const val=args.trim().toLowerCase(); if(!['on','off'].includes(val)) return sendMessage(chatId,'Usage: /maintenance on|off'); await set('settings/maintenance',val==='on'); await log('maintenance',uid,{enabled:val==='on'}); await sendMessage(chatId,`Maintenance mode ${val==='on'?'enabled':'disabled'}.`); return true; }
 if(command==='/stats') { const ds=await dramas(); let count=0; for(const d of ds) count+=(await episodes(d.id)).length; const users=await get('users',{}); const requests=await get('requests',{}); await sendMessage(chatId,`📊 <b>K-DRAMA HUB Stats</b>\nDramas: ${ds.length}\nEpisodes indexed: ${count}\nRegistered users: ${Object.keys(users||{}).length}\nDrama requests: ${Object.keys(requests||{}).length}`,{parse_mode:'HTML'}); return true; }
 if(command==='/export'||command==='/backup') { const snapshot={exportedAt:now(),dramas:await get('dramas',{}),episodes:await get('episodes',{}),settings:await get('settings',{})}; const text=JSON.stringify(snapshot,null,2); if(text.length<3500) await sendMessage(chatId,`<pre>${esc(text)}</pre>`,{parse_mode:'HTML'}); else { await sendMessage(chatId,'Export is large; use the Firebase console export for a full JSON backup. A short summary follows.'); await sendMessage(chatId,`Dramas: ${Object.keys(snapshot.dramas||{}).length}; episode groups: ${Object.keys(snapshot.episodes||{}).length}`); } await log('export_backup',uid,{}); return true; }
 if(command==='/checkfiles') { const ds=await dramas(); let checked=0,broken=0; for(const d of ds) for(const e of await episodes(d.id)) { checked++; if(!e.fileId) {broken++; await update(`episodes/${d.id}/${e.id}`,{broken:true,lastCheckedAt:now()});} else await update(`episodes/${d.id}/${e.id}`,{lastCheckedAt:now(),broken:false}); } await sendMessage(chatId,`File reference check complete.\nChecked: ${checked}\nMissing file_id: ${broken}\nNote: Telegram does not provide a reliable bulk validity test for every stored file_id; test-send is needed to confirm delivery.`); await log('check_files',uid,{checked,broken}); return true; }
 if(command==='/bulkhelp') { await sendMessage(chatId,'Bulk upload: send each video/document to this bot from an admin account with caption: DRAMA_ID | EPISODE_NUMBER | QUALITY (e.g. my-drama | 3 | 720p). The bot indexes the Telegram file_id and rejects duplicate episode numbers.'); return true; }
 if(command==='/ban'||command==='/unban') { const target=args.trim(); if(!/^\d+$/.test(target)) return sendMessage(chatId,`Usage: ${command} TELEGRAM_USER_ID`); await set(`users/${target}/banned`,command==='/ban'); await log(command.slice(1),uid,{target}); await sendMessage(chatId,`User ${target} ${command==='/ban'?'banned':'unbanned'}.`); return true; }
 if(command==='/setadmin') { await sendMessage(chatId,'For security, manage ADMIN_IDS in Vercel Environment Variables and redeploy.'); return true; }
 return false;
}
async function announceNewEpisode(dramaId, number) {
 const d=await get(`dramas/${dramaId}`); if(!d) return;
 const channel=process.env.ANNOUNCEMENT_CHANNEL_ID; if(channel) await sendMessage(channel,`🆕 <b>New Episode Added</b>\n🎬 ${esc(d.title)}\n📺 EP ${esc(number)}\n\nOpen @${(process.env.TELEGRAM_BOT_USERNAME||'').replace(/^@/,'')} and search the drama.`,{parse_mode:'HTML'}).catch(async e=>alertAdmins(`New episode announcement failed: ${e.message}`));
 const users=await get('users',{}); const tasks=[]; for(const [id,u] of Object.entries(users||{})) if(u?.newEpisodeAlerts!==false&&!u?.banned) tasks.push(sendMessage(id,`🆕 New episode available\n🎬 ${d.title}\n📺 EP ${number}`).catch(()=>null)); await Promise.allSettled(tasks.slice(0,100));
}
async function handleUpload(msg) {
 if(!isAdmin(msg.from.id)) return sendMessage(msg.chat.id,'⛔ Only admins can add files.');
 const file=msg.video || msg.document || msg.animation;
 if(!file) return false;
 const caption=clean(msg.caption||''); const p=caption.split('|').map(s=>s.trim());
 if(p.length<2) return sendMessage(msg.chat.id,'To index this file, add caption: DRAMA_ID | EPISODE_NUMBER | QUALITY (optional).');
 const [dramaId,number,quality='Original']=p; if(!await get(`dramas/${dramaId}`)) return sendMessage(msg.chat.id,'Drama ID not found. Add it first with /adddrama.');
 const fileId=file.file_id; const eps=await episodes(dramaId); if(eps.some(e=>e.fileId===fileId||String(e.number)===String(number))) return sendMessage(msg.chat.id,'⚠️ Duplicate file or episode detected; nothing added.');
 const epId=`ep${String(number).replace(/[^0-9a-z]/gi,'')}`; const data={number:Number(number)||number,fileId,fileUniqueId:file.file_unique_id,quality,sizeMB:file.file_size?Math.round(file.file_size/1048576*10)/10:null,active:true,createdAt:now(),createdBy:String(msg.from.id),sourceChatId:String(msg.chat.id),sourceMessageId:msg.message_id};
 await set(`episodes/${dramaId}/${epId}`,data); await log('upload_episode',msg.from.id,{dramaId,epId}); await sendMessage(msg.chat.id,`✅ Indexed ${dramaId} — EP ${number}.`); await announceNewEpisode(dramaId,number); return true;
}
export async function handleUpdate(updateObj) {
 try {
  if(updateObj.callback_query) return await handleCallback(updateObj.callback_query);
  const msg=updateObj.message || updateObj.channel_post;
  if(!msg) return;
  if(msg.from) { await touchUser(msg.from); const u=await get(`users/${msg.from.id}`,{}); if(u.banned) return; }
  if(msg.chat?.type==='private' && msg.from) {
    if(await maintenance()&&!isAdmin(msg.from.id)) return sendMessage(msg.chat.id,'🛠️ Bot is temporarily under maintenance. Please try again later.');
    if(!await checkMember(msg.from.id)) return sendMessage(msg.chat.id,`Please join ${process.env.FORCE_SUBSCRIBE_CHANNEL} first, then press /start.`,{reply_markup:keyboard([[{text:'Join channel',url:`https://t.me/${String(process.env.FORCE_SUBSCRIBE_CHANNEL).replace('@','')}`}],[{text:'I joined — check again',callback_data:'checksub'}]])});
  }
  if(msg.video||msg.document||msg.animation) { if(msg.chat.type==='private') { const done=await handleUpload(msg); if(done) return; } if(msg.chat.type==='channel') { await indexChannelPost(msg); return; } }
  if(!msg.text) return;
  const text=msg.text.trim(); const [rawCmd,...rest]=text.split(/\s+/); const command=rawCmd.split('@')[0]; const args=text.slice(rawCmd.length).trim(); const chatId=msg.chat.id, uid=msg.from?.id;
  if(command.startsWith('/')) {
   const handled=await adminCommand(msg,command,args); if(handled) return;
   const lang=uid?await langOf(uid):'en';
   if(command==='/start') return sendMessage(chatId,`✨ <b>Welcome to K-DRAMA HUB</b>\nYour Korean drama discovery corner.\n\n🔎 Search dramas • 📺 Browse episodes • ❤️ Save favorites\n\nSend a drama name to search, or choose a menu below.`,{parse_mode:'HTML',reply_markup:mainMenu(lang)});
   if(command==='/help') return sendMessage(chatId,'Commands: /start /help /search title /recent /trending /random /language hi|en /request title\nAdmins: /admin');
   if(command==='/search') return showResults(chatId,uid,args);
   if(command==='/recent') return sendMessage(chatId,'🆕 Recently added dramas',{reply_markup:await dramaListKeyboard((await dramas()).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,20))});
   if(command==='/trending') { const ds=(await dramas()).sort((a,b)=>Number(b.searchCount||0)-Number(a.searchCount||0)); return sendMessage(chatId,'🔥 Trending dramas',{reply_markup:await dramaListKeyboard(ds.slice(0,20))}); }
   if(command==='/random') { const ds=await dramas(); if(!ds.length)return sendMessage(chatId,'No dramas added yet.'); return renderDrama(chatId,uid,ds[Math.floor(Math.random()*ds.length)],lang); }
   if(command==='/language') { const l=args.toLowerCase()==='hi'?'hi':'en'; await set(`users/${uid}/language`,l); return sendMessage(chatId,l==='hi'?'भाषा हिंदी कर दी गई।':'Language set to English.'); }
   if(command==='/request') { if(!args) return sendMessage(chatId,'Usage: /request Drama Name'); const id=await push('requests',{title:args,userId:String(uid),status:'pending',createdAt:now()}); await sendMessage(chatId,`📩 Request received: ${args}\nReference: ${id}`); for(const adminId of admins()) await sendMessage(adminId,`📩 Drama request\n${args}\nFrom: ${uid}\nID: ${id}`).catch(()=>null); return; }
  }
  if(uid) { const last=Number(await get(`users/${uid}/lastSearchAt`,0)); const ms=Date.now(); if(ms-last<1200) return; await set(`users/${uid}/lastSearchAt`,ms); return showResults(chatId,uid,text); }
 } catch(e) { console.error('Bot update error',e); await alertAdmins(`${e.message}\nUpdate ID: ${updateObj.update_id ?? 'unknown'}`); }
}
async function dramaListKeyboard(ds) { return keyboard(ds.map(d=>[{text:`🎬 ${String(d.title||'Untitled').slice(0,55)}`,callback_data:`drama:${d.id}`} ])); }
async function indexChannelPost(msg) {
 const channel=process.env.STORAGE_CHANNEL_ID; if(channel && String(msg.chat.id)!==String(channel) && msg.chat.username!==String(channel).replace('@','')) return;
 const file=msg.video||msg.document||msg.animation; if(!file) return;
 const caption=clean(msg.caption||''); const p=caption.split('|').map(s=>s.trim()); if(p.length<2) return;
 const [dramaId,number,quality='Original']=p; if(!await get(`dramas/${dramaId}`)) return;
 const eps=await episodes(dramaId); if(eps.some(e=>e.fileUniqueId===file.file_unique_id||String(e.number)===String(number))) return;
 const epId=`ep${String(number).replace(/[^0-9a-z]/gi,'')}`; await set(`episodes/${dramaId}/${epId}`,{number:Number(number)||number,fileId:file.file_id,fileUniqueId:file.file_unique_id,quality,sizeMB:file.file_size?Math.round(file.file_size/1048576*10)/10:null,sourceChatId:String(msg.chat.id),sourceMessageId:msg.message_id,active:true,createdAt:now()});
}
async function handleCallback(q) {
 const uid=q.from.id, chatId=q.message?.chat?.id, data=q.data||''; await touchUser(q.from);
 if(await get(`users/${uid}/banned`,false)) return answerCallback(q.id,'Access denied',true);
 if(data==='checksub') { const ok=await checkMember(uid); await answerCallback(q.id,ok?'Membership verified':'Please join the channel first',!ok); if(ok) await sendMessage(chatId,'Welcome to K-DRAMA HUB!',{reply_markup:mainMenu(await langOf(uid))}); return; }
 if(data.startsWith('menu:')) { const type=data.split(':')[1], lang=await langOf(uid); await answerCallback(q.id); if(type==='search') return sendMessage(chatId,'🔎 Send /search followed by a drama name, or just type the title.'); if(type==='recent') return sendMessage(chatId,'🆕 Recently added',{reply_markup:await dramaListKeyboard((await dramas()).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,20))}); if(type==='trending') return sendMessage(chatId,'🔥 Trending',{reply_markup:await dramaListKeyboard((await dramas()).sort((a,b)=>Number(b.searchCount||0)-Number(a.searchCount||0)).slice(0,20))}); if(type==='random') {const ds=await dramas(); if(ds.length) return renderDrama(chatId,uid,ds[Math.floor(Math.random()*ds.length)],lang); return sendMessage(chatId,'No dramas yet.');} if(type==='language') return sendMessage(chatId,'Choose language / भाषा चुनें:',{reply_markup:keyboard([[{text:'English',callback_data:'lang:en'},{text:'हिंदी',callback_data:'lang:hi'}]])}); if(type==='help') return sendMessage(chatId,'Send any drama title to search. Use /request Drama Name to request a title.'); if(type==='request') return sendMessage(chatId,'Send /request followed by the drama title.'); if(type==='favorites'||type==='watchlist') {const list=await get(`users/${uid}/${type}`,{}); const ds=await dramas(); const ids=Object.keys(list||{}).filter(k=>list[k]); const selected=ds.filter(d=>ids.includes(d.id)); return sendMessage(chatId,type==='favorites'?'❤️ Your favorites':'📋 Your watchlist',{reply_markup:await dramaListKeyboard(selected)}); } }
 if(data.startsWith('lang:')) {const lang=data.split(':')[1]==='hi'?'hi':'en'; await set(`users/${uid}/language`,lang); return answerCallback(q.id,lang==='hi'?'भाषा हिंदी कर दी गई':'Language updated');}
 if(data.startsWith('drama:')) {const id=data.split(':')[1], d=await get(`dramas/${id}`); await answerCallback(q.id); if(d) return renderDrama(chatId,uid,{id,...d},await langOf(uid)); return;}
 if(data.startsWith('ep:')) {const [,did,eid]=data.split(':'); const e=await get(`episodes/${did}/${eid}`), d=await get(`dramas/${did}`); await answerCallback(q.id); if(!e||!e.fileId) return sendMessage(chatId,'Sorry, this episode file is not available.'); await push(`analytics/fileRequests`,{userId:String(uid),dramaId:did,episodeId:eid,at:now()}); try { await tg('sendVideo',{chat_id:chatId,video:e.fileId,caption:`🎬 ${d?.title||did} — EP ${e.number}\n${e.quality||''}${e.sizeMB?` • ${e.sizeMB} MB`:''}`}); } catch { try {await tg('sendDocument',{chat_id:chatId,document:e.fileId,caption:`🎬 ${d?.title||did} — EP ${e.number}`});} catch(err) { await alertAdmins(`File send failed for ${did}/${eid}: ${err.message}`); return sendMessage(chatId,'⚠️ This file could not be sent. Admin has been notified.'); } } return; }
 if(data.startsWith('fav:')||data.startsWith('watch:')) {const [kind,id]=data.split(':'); const path=`users/${uid}/${kind==='fav'?'favorites':'watchlist'}/${id}`; const exists=Boolean(await get(path,false)); await set(path,!exists); await answerCallback(q.id,exists?'Removed':'Saved'); return;}
 if(data.startsWith('searchpage:')) {const [,qText,page]=data.split(':'); await answerCallback(q.id); return showResults(chatId,uid,decodeURIComponent(qText),Number(page)||0);}
 if(data.startsWith('eps:')) {const [,did,start]=data.split(':'); const es=await episodes(did), s=Number(start)||0; const rows=es.slice(s,s+8).map(e=>[{text:`▶️ EP ${e.number??e.title}`,callback_data:`ep:${did}:${e.id}`}]); if(s>0) rows.push([{text:'⬅️ Previous',callback_data:`eps:${did}:${Math.max(0,s-8)}`}]); if(s+8<es.length) rows.push([{text:'Next ➡️',callback_data:`eps:${did}:${s+8}`}]); await answerCallback(q.id); return sendMessage(chatId,'📺 Episodes',{reply_markup:keyboard(rows)}); }
 await answerCallback(q.id);
}
export async function runDailyReport() {
 const ds=await dramas(); let eps=0; for(const d of ds) eps+=(await episodes(d.id)).length; const users=await get('users',{}); const day=new Date().toISOString().slice(0,10); const msg=`📊 <b>K-DRAMA HUB Daily Report</b>\nDate: ${day}\nDramas: ${ds.length}\nIndexed episodes: ${eps}\nRegistered users: ${Object.keys(users||{}).length}\nStatus: operational (cron executed)`;
 for(const id of admins()) await sendMessage(id,msg,{parse_mode:'HTML'}); await push('reports/daily',{date:day,dramas:ds.length,episodes:eps,users:Object.keys(users||{}).length,createdAt:now()}); return {dramas:ds.length,episodes:eps,users:Object.keys(users||{}).length};
}
export async function runWeeklyReport() {
 const users=await get('users',{}), searches=await get('analytics/searches',{}), files=await get('analytics/fileRequests',{}), requests=await get('requests',{}); const since=Date.now()-7*86400000;
 const recentSearches=Object.values(searches||{}).filter(x=>Date.parse(x.at||0)>=since); const recentFiles=Object.values(files||{}).filter(x=>Date.parse(x.at||0)>=since); const recentReq=Object.values(requests||{}).filter(x=>Date.parse(x.createdAt||0)>=since);
 const top={}; for(const s of recentSearches) top[s.query]=(top[s.query]||0)+1; const topText=Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([q,n])=>`${q} (${n})`).join(', ')||'No searches';
 const msg=`📈 <b>K-DRAMA HUB Weekly Report</b>\nUsers total: ${Object.keys(users||{}).length}\nSearches: ${recentSearches.length}\nFile requests: ${recentFiles.length}\nDrama requests: ${recentReq.length}\nTop searches: ${esc(topText)}`;
 for(const id of admins()) await sendMessage(id,msg,{parse_mode:'HTML'}); await push('reports/weekly',{createdAt:now(),searches:recentSearches.length,fileRequests:recentFiles.length,requests:recentReq.length,topSearches:top}); return {searches:recentSearches.length,fileRequests:recentFiles.length,requests:recentReq.length};
}
