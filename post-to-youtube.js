require('dotenv').config();
const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');
const log        = require('./logger');

const TOKENS_FILE  = path.join(__dirname, 'youtube-tokens.json');
const TRACKER_FILE = path.join(__dirname, 'posted.json');
const BRANDED_DIR  = process.env.OUTPUT_DIR || './branded';
const YT_TITLE     = process.env.YT_TITLE       || 'Motivational Reel';
const YT_DESC      = process.env.YT_DESCRIPTION || process.env.DEFAULT_CAPTION || '';

// ── OAuth client ─────────────────────────────────────────────────────────────

function getOAuthClient() {
  if (!fs.existsSync(TOKENS_FILE)) {
    throw new Error('YouTube not authorized. Run: node auth-youtube.js');
  }
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials(tokens);

  // Persist refreshed tokens automatically
  oauth2Client.on('tokens', (fresh) => {
    const updated = { ...tokens, ...fresh };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(updated, null, 2));
  });

  return oauth2Client;
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadToYouTube(filePath, title, description) {
  const auth    = getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title:       `${title} #Shorts`,
        description: `${description}\n\n#Shorts`,
        tags:        ['Shorts', 'motivation', 'reels'],
        categoryId:  '22',   // People & Blogs
      },
      status: {
        privacyStatus:             'public',
        selfDeclaredMadeForKids:   false,
      },
    },
    media: {
      mimeType: 'video/mp4',
      body:     fs.createReadStream(filePath),
    },
  });

  return res.data.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function postOneToYouTube() {
  let posted = {};
  if (fs.existsSync(TRACKER_FILE)) {
    try { posted = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8')); } catch { posted = {}; }
  }

  // Pick first branded file not yet uploaded to YouTube
  const file = fs.readdirSync(BRANDED_DIR)
    .filter(f => f.endsWith('.mp4') && !posted[f]?.youtubeId)[0];

  if (!file) {
    log.info('No new reels to post to YouTube.');
    return null;
  }

  const filePath = path.join(BRANDED_DIR, file);
  log.info(`Uploading to YouTube Shorts: ${file}`);

  const videoId = await uploadToYouTube(filePath, YT_TITLE, YT_DESC);
  log.success(`YouTube uploaded! https://youtube.com/shorts/${videoId}`);

  posted[file] = {
    ...posted[file],
    youtubeId:       videoId,
    youtubePostedAt: new Date().toISOString(),
  };
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(posted, null, 2));

  return videoId;
}

module.exports = { postOneToYouTube };

if (require.main === module) {
  postOneToYouTube().catch(err => {
    console.error('❌ YouTube Error:', err.response?.data?.error?.message || err.message);
    process.exit(1);
  });
}
