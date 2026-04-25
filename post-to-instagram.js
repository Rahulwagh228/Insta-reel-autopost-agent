require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');

const IG_USER_ID     = process.env.IG_USER_ID;
const ACCESS_TOKEN   = process.env.IG_ACCESS_TOKEN;
const NGROK_TOKEN    = process.env.NGROK_AUTHTOKEN;
const PORT           = process.env.PORT || 3000;
const BRANDED_DIR    = process.env.OUTPUT_DIR || './branded';
const CAPTION        = process.env.IG_CAPTION || process.env.DEFAULT_CAPTION || '';
const TRACKER_FILE   = path.join(__dirname, 'posted.json');
const GRAPH          = 'https://graph.facebook.com/v21.0';

// If SERVER_URL is set to a real public address, skip ngrok entirely
const PUBLIC_SERVER_URL = (() => {
  const url = process.env.SERVER_URL || '';
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) return url;
  return null;
})();

// ── File server ──────────────────────────────────────────────────────────────

function startFileServer() {
  const server = http.createServer((req, res) => {
    const filePath = path.join(BRANDED_DIR, decodeURIComponent(req.url));
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(); return; }

    const stat     = fs.statSync(filePath);
    const fileSize = stat.size;
    const range    = req.headers.range;

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fileSize, 'Accept-Ranges': 'bytes' });
      res.end();
      return;
    }

    if (range) {
      const [s, e]  = range.replace(/bytes=/, '').split('-');
      const start   = parseInt(s, 10);
      const end     = e ? parseInt(e, 10) : fileSize - 1;
      res.writeHead(206, {
        'Content-Type':  'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fileSize, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(filePath).pipe(res);
    }
  });
  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

// ── ngrok tunnel (local only) ─────────────────────────────────────────────────

async function startTunnel() {
  const ngrok    = require('@ngrok/ngrok');
  const listener = await ngrok.forward({ addr: PORT, authtoken: NGROK_TOKEN });
  return { url: listener.url(), listener };
}

// ── Instagram Graph API helpers ──────────────────────────────────────────────

async function createMediaContainer(videoUrl, caption) {
  const res = await axios.post(`${GRAPH}/${IG_USER_ID}/media`, null, {
    params: { media_type: 'REELS', video_url: videoUrl, caption, access_token: ACCESS_TOKEN },
  });
  return res.data.id;
}

async function waitUntilReady(containerId, maxWaitMs = 5 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await axios.get(`${GRAPH}/${containerId}`, {
      params: { fields: 'status_code,status', access_token: ACCESS_TOKEN },
    });
    const { status_code, status } = res.data;
    console.log(`   ⏳ Status: ${status_code} — ${status}`);
    if (status_code === 'FINISHED') return true;
    if (status_code === 'ERROR') throw new Error(`Container error: ${status}`);
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error('Timed out waiting for video to process');
}

async function publishContainer(containerId) {
  const res = await axios.post(`${GRAPH}/${IG_USER_ID}/media_publish`, null, {
    params: { creation_id: containerId, access_token: ACCESS_TOKEN },
  });
  return res.data.id;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function postOneReel() {
  if (!IG_USER_ID || !ACCESS_TOKEN) throw new Error('Missing env vars: IG_USER_ID, IG_ACCESS_TOKEN');
  if (!PUBLIC_SERVER_URL && !NGROK_TOKEN) throw new Error('Set SERVER_URL (on server) or NGROK_AUTHTOKEN (local)');

  let current = {};
  if (fs.existsSync(TRACKER_FILE)) {
    try { current = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8')); } catch { current = {}; }
  }

  const file = fs.readdirSync(BRANDED_DIR)
    .filter(f => f.endsWith('.mp4') && !current[f]?.mediaId)[0];

  if (!file) {
    console.log('🎉 No new branded reels to post to Instagram.');
    return null;
  }

  console.log(`📡 Starting file server on port ${PORT}...`);
  const server = await startFileServer();

  let publicUrl;
  let listener = null;

  if (PUBLIC_SERVER_URL) {
    // On a real server — use public IP directly, no ngrok needed
    publicUrl = PUBLIC_SERVER_URL;
    console.log(`🌐 Using server URL: ${publicUrl}`);
  } else {
    // Local machine — start ngrok tunnel
    console.log('🌐 Starting ngrok tunnel...');
    const tunnel = await startTunnel();
    publicUrl = tunnel.url;
    listener  = tunnel.listener;
    console.log(`   Public URL: ${publicUrl}`);
  }

  try {
    const videoUrl    = `${publicUrl}/${encodeURIComponent(file)}`;
    console.log(`\n📤 Posting: ${file}`);
    console.log(`   URL: ${videoUrl}`);

    const containerId = await createMediaContainer(videoUrl, CAPTION);
    console.log(`   🗂  Container created: ${containerId}`);

    await waitUntilReady(containerId);

    const mediaId = await publishContainer(containerId);
    console.log(`   ✅ Published! Media ID: ${mediaId}`);

    current[file] = { ...current[file], mediaId, postedAt: new Date().toISOString() };
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(current, null, 2));

    return mediaId;
  } finally {
    if (listener) await listener.close();
    server.close(() => console.log('\n🔌 File server stopped.'));
  }
}

module.exports = { postOneReel };

if (require.main === module) {
  postOneReel().catch(err => {
    console.error('❌ Error:', err.response?.data || err.message);
    process.exit(1);
  });
}
