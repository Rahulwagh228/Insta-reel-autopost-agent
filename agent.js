require('dotenv').config();
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { getNewReels, downloadFile, markProcessed } = require('./drive');
const { addLogoOverlay } = require('./overlay');
const { postReel } = require('./instagram');
const { serveTmpFiles } = require('./server');

const SERVER_BASE_URL = process.env.SERVER_BASE_URL; // e.g. http://203.0.113.5:3000
const CAPTION = process.env.DEFAULT_CAPTION || '🎬 New reel! #content';

async function processNextReel() {
  console.log('[agent] Checking for new reels...');
  const newFiles = await getNewReels();
  if (newFiles.length === 0) return console.log('[agent] No new reels found.');

  const file = newFiles[0]; // process one at a time
  console.log(`[agent] Processing: ${file.name}`);

  const inputPath = await downloadFile(file.id, file.name);
  const outputName = `processed_${file.name}`;
  const outputPath = path.join('./tmp', outputName);

  await addLogoOverlay(inputPath, outputPath, 'bottom-right');
  console.log('[agent] Logo overlay added.');

  const publicUrl = `${SERVER_BASE_URL}/${outputName}`;
  const postId = await postReel(publicUrl, CAPTION);
  console.log(`[agent] Posted! Instagram post ID: ${postId}`);

  // Cleanup
  fs.unlinkSync(inputPath);
  fs.unlinkSync(outputPath);
  markProcessed(file.id);
  console.log('[agent] Done, temp files cleaned up.');
}

// Start static server for serving temp files
serveTmpFiles(3000);
console.log('[agent] Static server running on port 3000');

// Poll every hour — adjust as needed
cron.schedule('0 * * * *', processNextReel);

// Also run immediately on start
processNextReel();