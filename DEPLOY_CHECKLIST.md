# Deployment checklist

- [ ] Create Telegram bot with BotFather
- [ ] Set numeric `ADMIN_IDS`
- [ ] Create Firebase RTDB and service account
- [ ] Add all environment variables in Vercel
- [ ] Add bot as admin to storage/announcement channels
- [ ] Deploy and verify `/api/cron/health`
- [ ] POST `/api/setup-webhook` with `Authorization: Bearer <SETUP_SECRET>`
- [ ] Test `/start`, `/search`, `/request`
- [ ] Test `/adddrama` and admin upload caption `DRAMA_ID | 1 | 720p`
- [ ] Test episode delivery and announcement channel
- [ ] Test maintenance mode, ban/unban, `/stats`, `/checkfiles`
- [ ] Verify daily/weekly cron execution in Vercel logs
- [ ] Confirm you have rights to distribute every video you index/share
