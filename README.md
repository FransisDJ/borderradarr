
# Borderadar (Vercel - Standard)

This is the **lighter** Vercel-ready version of Borderadar:
- Cron (1 min) triggers `/api/fetchNews`
- `/api/fetchNews` fetches trusted RSS feeds, filters, geotags, dedupes, persists to GitHub Gist, and sends Telegram messages
- `/api/latest` serves the recent events for the map
- `public/index.html` shows a Leaflet map + event list

ENV required (set in Vercel project settings - Environment Variables):
- TELEGRAM_TOKEN
- TELEGRAM_CHAT_ID
- GIST_TOKEN
- GIST_ID

Steps to deploy:
1. Push this repo to GitHub.
2. On Vercel: Import Project → pick GitHub repo → Deploy.
3. In Vercel Dashboard: Project Settings → Environment Variables → add the 4 envs above.
4. Vercel will run the cron every minute (no extra UI required).

Notes:
- Keep your GIST with filename `borderadar_state.json` and initial content:
  {
    "lastIds": [],
    "events": []
  }
- Do NOT share tokens publicly.
