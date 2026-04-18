require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const ngrok  = require('@ngrok/ngrok');

const IG_USER_ID     = process.env.IG_USER_ID;
const ACCESS_TOKEN   = process.env.IG_ACCESS_TOKEN;
const NGROK_TOKEN    = process.env.NGROK_AUTHTOKEN;
const PORT           = process.env.PORT || 3000;
const BRANDED_DIR    = process.env.OUTPUT_DIR || './branded';
const CAPTION        = process.env.IG_CAPTION || process.env.DEFAULT_CAPTION || '';
const TRACKER_FILE   = path.join(__dirname, 'posted.json');
const GRAPH          = 'https://graph.facebook.com/v21.0';

let posted = {};
if (fs.existsSync(TRACKER_FILE)) {
  try { posted = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8')); } catch { posted = {}; }
}

// ── File server ──────────────────────────────────────────────────────────────

function startFileServer() {
  const server = http.createServer((req, res) => {
    const filePath = path.join(BRANDED_DIR, decodeURIComponent(req.url));
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(); return; }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

// ── ngrok tunnel ─────────────────────────────────────────────────────────────

async function startTunnel() {
  const listener = await ngrok.forward({
    addr: PORT,
    authtoken: NGROK_TOKEN,
  });
  return { url: listener.url(), listener };
}

// ── Instagram Graph API helpers ──────────────────────────────────────────────

async function createMediaContainer(videoUrl, caption) {
  const res = await axios.post(`${GRAPH}/${IG_USER_ID}/media`, null, {
    params: {
      media_type:   'REELS',
      video_url:    videoUrl,
      caption:      caption,
      access_token: ACCESS_TOKEN,
    },
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
  if (!NGROK_TOKEN) throw new Error('Missing NGROK_AUTHTOKEN in .env');

  // Reload tracker each call so scheduler picks up changes between runs
  let current = {};
  if (fs.existsSync(TRACKER_FILE)) {
    try { current = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8')); } catch { current = {}; }
  }

  const file = fs.readdirSync(BRANDED_DIR)
    .filter(f => f.endsWith('.mp4') && !current[f])[0];

  if (!file) {
    console.log('🎉 No new branded reels to post.');
    return null;
  }

  console.log(`📡 Starting file server on port ${PORT}...`);
  const server = await startFileServer();

  console.log('🌐 Starting ngrok tunnel...');
  const { url: publicUrl, listener } = await startTunnel();
  console.log(`   Public URL: ${publicUrl}`);

  try {
    const videoUrl = `${publicUrl}/${encodeURIComponent(file)}`;
    console.log(`\n📤 Posting: ${file}`);
    console.log(`   URL: ${videoUrl}`);

    const containerId = await createMediaContainer(videoUrl, CAPTION);
    console.log(`   🗂  Container created: ${containerId}`);

    await waitUntilReady(containerId);

    const mediaId = await publishContainer(containerId);
    console.log(`   ✅ Published! Media ID: ${mediaId}`);

    current[file] = { mediaId, postedAt: new Date().toISOString() };
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(current, null, 2));

    return mediaId;
  } finally {
    await listener.close();
    server.close(() => console.log('\n🔌 Server & tunnel stopped.'));
  }
}

module.exports = { postOneReel };

if (require.main === module) {
  postOneReel().catch(err => {
    console.error('❌ Error:', err.response?.data || err.message);
    process.exit(1);
  });
}
