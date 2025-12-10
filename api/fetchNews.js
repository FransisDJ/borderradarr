
/**
 * Lightweight fetchNews for Vercel standard edition
 * - Fetches RSS feeds from trusted sources
 * - Filters by keywords
 * - Simple dedupe via Gist
 * - Sends Telegram messages for verified items (1-source allowed here for speed)
 *
 * ENV:
 * - TELEGRAM_TOKEN
 * - TELEGRAM_CHAT_ID
 * - GIST_TOKEN
 * - GIST_ID
 */

const fetch = require('node-fetch');
const RSSParser = require('rss-parser');
const crypto = require('crypto');

const parser = new RSSParser({ requestOptions: { headers: { 'User-Agent': 'Borderadar-Vercel' } } });

// Trusted RSS sources (standard set). You can add more.
const SOURCES = [
  { name: 'Reuters', url: 'https://www.reuters.com/world/rss' },
  { name: 'AP', url: 'https://apnews.com/hub/asia-pacific?format=rss' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'BBC', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' }
];

const RELEVANT_KEYWORDS = ['border','clash','air strike','airstrike','rocket','drone','artillery','fired','clashes','flee','evacuate','killed','injured','shelling','strike','attack','troop','military'];

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;
const GIST_ID = process.env.GIST_ID;
const GIST_API = 'https://api.github.com/gists';

function md5(s){ return crypto.createHash('md5').update(s).digest('hex'); }

async function loadState(){
  if (!GIST_TOKEN || !GIST_ID) return { lastIds: [], events: [] };
  const res = await fetch(`${GIST_API}/${GIST_ID}`, { headers: { Authorization: `token ${GIST_TOKEN}`, 'User-Agent': 'Borderadar' }});
  if (!res.ok) return { lastIds: [], events: [] };
  const j = await res.json();
  try {
    const file = j.files['borderadar_state.json'];
    return JSON.parse(file.content);
  } catch(e){
    return { lastIds: [], events: [] };
  }
}

async function saveState(state){
  if (!GIST_TOKEN || !GIST_ID) return;
  const payload = { files: { 'borderadar_state.json': { content: JSON.stringify(state, null, 2) } } };
  await fetch(`${GIST_API}/${GIST_ID}`, { method: 'PATCH', headers: { Authorization: `token ${GIST_TOKEN}`, 'User-Agent': 'Borderadar', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function sendTelegram(text){
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Missing telegram env');
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const body = { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' };
  await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
}

function detectSector(text){
  const lower = (text||'').toLowerCase();
  const sectors = [
    { id:'preah_vihear', name:'Preah Vihear / Oddar Meanchey', lat:13.833, lon:103.5, keywords:['preah vihear','oddar meanchey'] },
    { id:'surin', name:'Surin / Sisaket', lat:14.8, lon:103.5, keywords:['surin','sisaket'] },
    { id:'battambang', name:'Battambang / Banteay', lat:13.1, lon:103.1, keywords:['battambang','banteay'] }
  ];
  for (const s of sectors){
    for (const kw of s.keywords) if (lower.includes(kw)) return s;
  }
  return null;
}

exports.default = async function(req, res){
  try {
    const state = await loadState();
    const items = [];
    for (const src of SOURCES){
      try {
        const feed = await parser.parseURL(src.url);
        for (const it of feed.items.slice(0,10)){
          const title = it.title || '';
          const content = (it.contentSnippet || it.content || '').toString();
          const txt = (title + ' ' + content).toLowerCase();
          if (!RELEVANT_KEYWORDS.some(k => txt.includes(k))) continue;
          const id = md5(title + (it.link||''));
          if (state.lastIds && state.lastIds.includes(id)) continue;
          items.push({ id, source: src.name, title, link: it.link, pubDate: it.pubDate || new Date().toISOString(), snippet: content });
        }
      } catch(e){
        console.log('feed error', src.name, e.message);
      }
    }

    // simple dedupe by title
    const uniq = [];
    const seen = new Set();
    for (const it of items){
      const key = md5(it.title);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(it);
    }

    // send up to 3 items per run to avoid spam
    const toSend = uniq.slice(0,3);
    for (const ev of toSend){
      const sector = detectSector(ev.title + ' ' + ev.snippet);
      let text = `<b>Borderadar — Verified Update</b>\n`;
      text += `<b>Source:</b> ${ev.source}\n`;
      text += `<b>Time:</b> ${new Date(ev.pubDate).toUTCString()}\n\n`;
      text += `<b>${ev.title}</b>\n`;
      if (ev.snippet) text += `${ev.snippet}\n`;
      text += `\n🔗 ${ev.link}\n`;
      if (sector) text += `📍 Sector: ${sector.name}\nhttps://www.google.com/maps/search/?api=1&query=${sector.lat},${sector.lon}\n`;
      try {
        await sendTelegram(text);
        state.lastIds = state.lastIds || [];
        state.lastIds.push(ev.id);
        state.events = state.events || [];
        state.events.unshift({ id: ev.id, title: ev.title, link: ev.link, pubDate: ev.pubDate, source: ev.source, sector: sector ? sector : null, fetchedAt: new Date().toISOString() });
        if (state.events.length > 200) state.events = state.events.slice(0,200);
      } catch(e){
        console.log('send err', e.message);
      }
    }

    await saveState(state);
    res.status(200).json({ ok: true, sent: toSend.length });
  } catch(err){
    console.log('fatal', err.message);
    res.status(500).json({ ok:false, error: err.message });
  }
};
