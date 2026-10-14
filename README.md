# K-DRAMA HUB Telegram File Bot (Vercel + Firebase RTDB)

A serverless Telegram bot starter for indexing and sharing **videos you have permission to distribute**. It stores Telegram `file_id` references and catalogue metadata in Firebase Realtime Database; the actual video remains in Telegram. The bot token is read only from environment variables.

## Included now

- Public `/start`, `/help`, `/search`, `/recent`, `/trending`, `/random`, `/language`, `/request`
- Inline menus, EP buttons, episode pagination, Hindi/English language preference
- Search across title, alternate titles, actor/actress, genre, year and language
- Favorites, watchlist, recently viewed records, request queue, search and file-request analytics
- Admin-only add/edit/delete drama and episode commands, bulk upload by caption, multiple admin IDs
- Duplicate title/file/episode checks, channel-post indexing, new-episode announcements and user alerts
- Force-subscribe option, ban/unban, maintenance mode, activity log, counts, basic export
- Daily and weekly reports with Vercel Cron, health endpoint and admin error alerts
- Firebase RTDB data model and environment-variable configuration

## Important implementation notes

- `file_id` references are indexed, not video bytes downloaded to Vercel. Add the bot as an administrator in the storage channel and grant permission to post/read messages as needed. Telegram Bot API updates for channel posts require the bot to be an administrator.
- Channel indexing expects the post caption format `DRAMA_ID | EPISODE_NUMBER | QUALITY`, for example `my-drama | 3 | 720p`. The drama record must exist first.
- Private admin uploads to the bot use the same caption format. The bot indexes the incoming file's `file_id`.
- Telegram does not expose a guaranteed bulk “is this file_id still sendable?” API. `/checkfiles` checks the catalogue for missing references; it cannot fully prove every file will deliver. Actual send failures trigger alerts.
- Vercel Cron is available according to plan limits and runs in UTC. Daily report schedule is 03:15 UTC; weekly is Monday 03:30 UTC. Confirm your Vercel plan supports the desired cron frequency.
- Firebase service-account credentials are highly sensitive. Never commit them or paste them into chat. Use a dedicated service account with the minimum practical database access.
- This is a feature-rich starter, not a substitute for staging tests. For very large broadcasts, queue and batch messages to avoid Telegram rate limits and Vercel function timeouts.

## 1. Create Telegram bot

1. Open [@BotFather](https://t.me/BotFather), run `/newbot`, and copy the token.
2. Find your numeric Telegram user ID using a trusted ID utility bot; add every admin ID to `ADMIN_IDS` as comma-separated numbers.
3. Create a private storage channel and/or public announcement channel. Add the bot as an administrator.
4. Optional: set a force-subscribe channel in `FORCE_SUBSCRIBE_CHANNEL`.

## 2. Create Firebase RTDB

1. Create a Firebase project and enable Realtime Database.
2. In Project Settings → Service Accounts, create a service-account key. Keep the JSON private.
3. Encode the JSON file to base64 locally and set it as `FIREBASE_SERVICE_ACCOUNT_BASE64`. Example with Node: `node -e "const fs=require('fs'); console.log(Buffer.from(fs.readFileSync('service-account.json')).toString('base64'))"`
4. Set `FIREBASE_DATABASE_URL` to the exact RTDB URL shown in Firebase Console.
5. Recommended RTDB rules: deny all client access; this backend uses the Admin SDK. Do not expose service-account credentials to the client.

## 3. Deploy to Vercel

1. Push this folder to a private Git repository, import it into Vercel, and deploy with Node.js 20.
2. Add all variables from `.env.example` in Vercel → Project → Settings → Environment Variables. Set `TELEGRAM_BOT_TOKEN`, `ADMIN_IDS`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_BASE64`, `CRON_SECRET`, and `PUBLIC_BASE_URL` at minimum.
3. Also set a long random `TELEGRAM_WEBHOOK_SECRET` and a separate `SETUP_SECRET`.
4. Redeploy after adding or changing environment variables.
5. Set the webhook by sending an authenticated POST to `https://YOUR_DOMAIN/api/setup-webhook` with header `Authorization: Bearer YOUR_SETUP_SECRET`. This setup endpoint is intentionally protected and only accepts POST.
6. Open `https://YOUR_DOMAIN/api/cron/health` and confirm the configuration flags are true.
7. Message the bot `/start`; test search, admin commands and file delivery before announcing it.

## Environment variables

Copy `.env.example` into your deployment settings. Never commit `.env` or the real bot token.

- `TELEGRAM_BOT_TOKEN`: token from BotFather
- `ADMIN_IDS`: comma-separated numeric Telegram user IDs
- `STORAGE_CHANNEL_ID`: channel username or numeric chat ID for indexing (optional)
- `ANNOUNCEMENT_CHANNEL_ID`: destination for new-episode announcements (optional)
- `FORCE_SUBSCRIBE_CHANNEL`: optional channel users must join
- `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_BASE64`: Firebase backend access
- `CRON_SECRET`: bearer secret used by Vercel Cron
- `SETUP_SECRET`: bearer secret protecting the webhook setup endpoint
- `TELEGRAM_WEBHOOK_SECRET`: Telegram webhook request verification secret
- `SETUP_SECRET`: protects webhook setup endpoint
- `TELEGRAM_WEBHOOK_SECRET`: verifies Telegram webhook requests
- `PUBLIC_BASE_URL`: deployed URL, no trailing slash
- `REPORT_TIMEZONE`: reserved for future timezone-aware formatting; current cron schedules are UTC
- `ERROR_ALERT_ADMIN_IDS`: optional list of alert recipients

## Admin commands

- `/admin` — command guide
- `/adddrama Title | year | language | genre | actors | description`
- `/editdrama DRAMA_ID | field | value`
- `/deleteDrama DRAMA_ID`
- `/addEpisode DRAMA_ID | episode number | file_id | quality | size_MB`
- `/deleteEpisode DRAMA_ID | EPISODE_ID`
- `/bulkhelp` — upload videos with caption `DRAMA_ID | EPISODE_NUMBER | QUALITY`
- `/announce message`
- `/maintenance on` or `/maintenance off`
- `/stats`, `/export`, `/backup`, `/checkfiles`
- `/ban TELEGRAM_USER_ID`, `/unban TELEGRAM_USER_ID`

## Database structure

- `/dramas/{dramaId}` — title, year, language, genre, actors, description, flags
- `/episodes/{dramaId}/{episodeId}` — number, Telegram file ID, quality, size, source message metadata
- `/users/{telegramUserId}` — profile, language, favorites, watchlist, recent history, banned flag
- `/requests`, `/analytics/searches`, `/analytics/fileRequests`, `/adminActivity`, `/reports`, `/settings`

## Feature status / known follow-up work

The core flows are implemented in this starter. Some requested features need production hardening before large-scale use: robust multi-message bulk-upload sessions, paged exports for large RTDB trees, actual test-send file validation, language-specific broadcast templates, per-drama notification preferences, scheduled cleanup, rate-limited broadcast queues, and full trending scoring. `/checkfiles` cannot independently verify all Telegram references; it detects missing IDs and runtime send failures. The `/export` command returns a small export in chat and recommends Firebase Console export for large catalogues.
