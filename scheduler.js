require('dotenv').config();
const cron = require('node-cron');

const { downloadReels }       = require('./download-reels');
const { processBrandedReels } = require('./add-logo');
const { postOneReel }         = require('./post-to-instagram');
const { postOneToYouTube }    = require('./post-to-youtube');

function log(msg) {
  console.log(`[${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

// ── Pipeline: download new reels from Drive + brand them ─────────────────────

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

// ── Post to both Instagram and YouTube ───────────────────────────────────────

async function runPost() {
  log('📤 Scheduled post starting...');

  const [igResult, ytResult] = await Promise.allSettled([
    postOneReel(),
    postOneToYouTube(),
  ]);

  if (igResult.status === 'fulfilled' && igResult.value) {
    log(`✅ Instagram posted. Media ID: ${igResult.value}`);
  } else if (igResult.status === 'rejected') {
    log(`❌ Instagram error: ${igResult.reason?.response?.data?.error?.message || igResult.reason?.message}`);
  }

  if (ytResult.status === 'fulfilled' && ytResult.value) {
    log(`✅ YouTube posted. https://youtube.com/shorts/${ytResult.value}`);
  } else if (ytResult.status === 'rejected') {
    log(`❌ YouTube error: ${ytResult.reason?.message}`);
  }
}

// ── Schedule (IST) ────────────────────────────────────────────────────────────
//   08:00 AM — download + brand new reels
//   09:00 AM — post reel 1
//   01:00 PM — post reel 2
//   07:00 PM — post reel 3
//   09:00 PM — post reel 4

cron.schedule('0 8  * * *', runPipeline, { timezone: 'Asia/Kolkata' });
cron.schedule('0 9  * * *', runPost,     { timezone: 'Asia/Kolkata' });
cron.schedule('0 13 * * *', runPost,     { timezone: 'Asia/Kolkata' });
cron.schedule('0 19 * * *', runPost,     { timezone: 'Asia/Kolkata' });
cron.schedule('0 21 * * *', runPost,     { timezone: 'Asia/Kolkata' });

log('🕐 Scheduler started.');
log('   08:00 AM IST — Download + Brand');
log('   09:00 AM IST — Post reel 1 (Instagram + YouTube)');
log('   01:00 PM IST — Post reel 2 (Instagram + YouTube)');
log('   07:00 PM IST — Post reel 3 (Instagram + YouTube)');
log('   09:00 PM IST — Post reel 4 (Instagram + YouTube)');
