require('dotenv').config();
const cron = require('node-cron');
const { downloadReels }      = require('./download-reels');
const { processBrandedReels } = require('./add-logo');
const { postOneReel }         = require('./post-to-instagram');

function log(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

async function runPipeline() {
  log('🔄 Running download + brand pipeline...');
  try {
    await downloadReels();
    await processBrandedReels();
    log('✅ Pipeline complete.');
  } catch (err) {
    log(`❌ Pipeline error: ${err.message}`);
  }
}

async function runPost() {
  log('📤 Scheduled post starting...');
  try {
    const mediaId = await postOneReel();
    if (mediaId) log(`✅ Posted successfully. Media ID: ${mediaId}`);
  } catch (err) {
    log(`❌ Post error: ${err.response?.data?.error?.message || err.message}`);
  }
}

// ── Schedule ─────────────────────────────────────────────────────────────────
//   8:00 AM  — download new reels from Drive + brand them
//   9:00 AM  — post 1 reel
//   1:00 PM  — post 1 reel
//   7:00 PM  — post 1 reel
//   9:00 PM  — post 1 reel

cron.schedule('0 8 * * *',  runPipeline, { timezone: 'Asia/Kolkata' });
cron.schedule('0 9 * * *',  runPost,     { timezone: 'Asia/Kolkata' });
cron.schedule('0 13 * * *', runPost,     { timezone: 'Asia/Kolkata' });
cron.schedule('0 19 * * *', runPost,     { timezone: 'Asia/Kolkata' });
cron.schedule('0 21 * * *', runPost,     { timezone: 'Asia/Kolkata' });

log('🕐 Scheduler started. Waiting for scheduled times...');
log('   08:00 AM IST — Download + Brand');
log('   09:00 AM IST — Post reel 1');
log('   01:00 PM IST — Post reel 2');
log('   07:00 PM IST — Post reel 3');
log('   09:00 PM IST — Post reel 4');
