require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const FOLDER_ID = process.env.FOLDER_ID;
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || './downloads';
const MAX_DOWNLOADS = parseInt(process.env.MAX_DOWNLOADS_PER_RUN) || 3;

const auth = new google.auth.GoogleAuth({
  keyFile: "./credentials.json",
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });

// Simple local tracker (so we don't re-download same reels)
const TRACKER_FILE = path.join(__dirname, 'processed.json');
let processed = {};
if (fs.existsSync(TRACKER_FILE)) {
  try { processed = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8')); } catch { processed = {}; }
}

async function listUnprocessedFiles() {
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size)',
    orderBy: 'createdTime', // or 'name' if you want alphabetical
  });

  return res.data.files.filter(file => {
    if (!file.name.toLowerCase().endsWith('.mp4') && !file.name.toLowerCase().endsWith('.mov')) return false; // only videos
    return !processed[file.id];
  });
}

async function downloadFile(file) {
  const destPath = path.join(DOWNLOAD_DIR, file.name);
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const dest = fs.createWriteStream(destPath);

  await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'stream' }
  ).then(res => {
    return new Promise((resolve, reject) => {
      res.data
        .on('end', () => {
          console.log(`✅ Downloaded: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
          processed[file.id] = true;
          fs.writeFileSync(TRACKER_FILE, JSON.stringify(processed, null, 2));
          resolve();
        })
        .on('error', err => reject(err))
        .pipe(dest);
    });
  });
}

async function main() {
  console.log('🔍 Fetching unprocessed reels...');
  const files = await listUnprocessedFiles();

  if (files.length === 0) {
    console.log('🎉 No new reels left!');
    return;
  }

  console.log(`📥 Found ${files.length} new reels. Downloading first ${MAX_DOWNLOADS}...`);

  const toDownload = files.slice(0, MAX_DOWNLOADS);
  for (const file of toDownload) {
    await downloadFile(file).catch(console.error);
  }

  console.log('✅ Done for today!');
}

module.exports = { downloadReels: main };

if (require.main === module) main();