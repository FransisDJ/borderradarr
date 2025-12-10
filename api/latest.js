
/**
 * returns latest events from Gist
 * ENV: GIST_TOKEN, GIST_ID
 */
const fetch = require('node-fetch');
const GIST_TOKEN = process.env.GIST_TOKEN;
const GIST_ID = process.env.GIST_ID;
const GIST_API = 'https://api.github.com/gists';

async function loadState(){
  if (!GIST_TOKEN || !GIST_ID) return { events: [] };
  const res = await fetch(`${GIST_API}/${GIST_ID}`, { headers: { Authorization: `token ${GIST_TOKEN}`, 'User-Agent': 'Borderadar' }});
  if (!res.ok) return { events: [] };
  const j = await res.json();
  try {
    const file = j.files['borderadar_state.json'];
    return JSON.parse(file.content);
  } catch(e){
    return { events: [] };
  }
}

exports.default = async function(req, res){
  try {
    const state = await loadState();
    res.setHeader('Content-Type','application/json');
    res.status(200).send(JSON.stringify({ events: state.events || [] }));
  } catch(e){
    res.status(500).json({ events: [] });
  }
};
