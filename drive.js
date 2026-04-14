const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getAuthClient } = require('./auth');

const WATCH_FOLDER_ID = process.env.DRIVE_FOLDER_ID; // set in .env
const DOWNLOAD_DIR = './tmp';
const PROCESSED_LOG = './processed.json';

async function getNewReels() {
  const auth = await getAuthClient();
  
  const drive = google.drive({ version: 'v3', auth });

  const processed = fs.existsSync(PROCESSED_LOG)
    ? JSON.parse(fs.readFileSync(PROCESSED_LOG))
    : [];

  const res = await drive.files.list({
    q: `'${WATCH_FOLDER_ID}' in parents and mimeType contains 'video/' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
  });

  const newFiles = res.data.files.filter(f => !processed.includes(f.id));
  return newFiles;
}

async function downloadFile(fileId, fileName) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');
  const destPath = path.join('./tmp', fileName);

  const dest = fs.createWriteStream(destPath);
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  await new Promise((resolve, reject) => {
    res.data.pipe(dest);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });

  return destPath;
}

function markProcessed(fileId) {
  const processed = fs.existsSync(PROCESSED_LOG)
    ? JSON.parse(fs.readFileSync(PROCESSED_LOG))
    : [];
  processed.push(fileId);
  fs.writeFileSync(PROCESSED_LOG, JSON.stringify(processed));
}

module.exports = { getNewReels, downloadFile, markProcessed };