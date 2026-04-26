require('dotenv').config();
const cron = require('node-cron');
const http = require('http');
const log  = require('./logger');

const { downloadReels }       = require('./download-reels');
const { processBrandedReels } = require('./add-logo');
const { postOneReel }         = require('./post-to-instagram');
const { postOneToYouTube }    = require('./post-to-youtube');

// ── Concurrency guard ─────────────────────────────────────────────────────────

const running = new Set();

async function withLock(name, fn) {
  if (running.has(name)) {
    log.warn(`Job "${name}" already running — skipping this trigger`);
    return;
  }
  running.add(name);
  try { await fn(); } finally { running.delete(name); }
}

// ── Retry helper ──────────────────────────────────────────────────────────────

async function withRetry(name, fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      if (attempt === maxAttempts) {
        log.error(`${name} failed after ${maxAttempts} attempts: ${msg}`);
        throw err;
      }
      const waitSec = attempt * 30;
      log.warn(`${name} attempt ${attempt} failed: ${msg}. Retrying in ${waitSec}s...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function runPipeline() {
  await withLock('pipeline', async () => {
    log.info('--- Pipeline: download + brand starting ---');
    try {
      await downloadReels();
      await processBrandedReels();
      log.success('Pipeline complete');
    } catch (err) {
      log.error(`Pipeline failed: ${err.message}`);
    }
  });
}

// ── Post ──────────────────────────────────────────────────────────────────────

async function runPost(slot) {
  await withLock('post', async () => {
    log.info(`--- Post slot [${slot}] starting ---`);

    const [igResult, ytResult] = await Promise.allSettled([
      withRetry('Instagram', postOneReel),
      withRetry('YouTube',   postOneToYouTube),
    ]);

    if (igResult.status === 'fulfilled' && igResult.value) {
      log.success(`Instagram posted | Media ID: ${igResult.value}`);
    } else if (igResult.status === 'rejected') {
      log.error(`Instagram failed | ${igResult.reason?.message}`);
    } else {
      log.info('Instagram: no new reels');
    }

    if (ytResult.status === 'fulfilled' && ytResult.value) {
      log.success(`YouTube posted | https://youtube.com/shorts/${ytResult.value}`);
    } else if (ytResult.status === 'rejected') {
      log.error(`YouTube failed | ${ytResult.reason?.message}`);
    } else {
      log.info('YouTube: no new reels');
    }

    log.info(`--- Post slot [${slot}] done ---`);
  });
}

// ── Health check ──────────────────────────────────────────────────────────────

const HEALTH_PORT = process.env.HEALTH_PORT || 3001;

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status:   'ok',
      uptime:   `${Math.floor(process.uptime())}s`,
      running:  [...running],
      time_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    }, null, 2));
  } else {
    res.writeHead(404); res.end();
  }
}).listen(HEALTH_PORT, () => log.info(`Health check → http://localhost:${HEALTH_PORT}/health`));

// ── Schedules (IST) ───────────────────────────────────────────────────────────
//  06:00 AM — download + brand
//  08:00 AM — post 1
//  01:00 PM — post 2
//  06:00 PM — post 3
//  07:30 PM — post 4
//  09:00 PM — post 5

cron.schedule('0  6 * * *',  () => runPipeline(),       { timezone: 'Asia/Kolkata' });
cron.schedule('0  8 * * *',  () => runPost('8:00 AM'),  { timezone: 'Asia/Kolkata' });
cron.schedule('0 13 * * *',  () => runPost('1:00 PM'),  { timezone: 'Asia/Kolkata' });
cron.schedule('0 18 * * *',  () => runPost('6:00 PM'),  { timezone: 'Asia/Kolkata' });
cron.schedule('30 19 * * *', () => runPost('7:30 PM'),  { timezone: 'Asia/Kolkata' });
cron.schedule('0 21 * * *',  () => runPost('9:00 PM'),  { timezone: 'Asia/Kolkata' });

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  log.info(`${signal} received — shutting down...`);
  const deadline = Date.now() + 120_000;
  while (running.size > 0 && Date.now() < deadline) {
    log.warn(`Waiting for: ${[...running].join(', ')}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  log.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  err => log.error(`Uncaught: ${err.message}`));
process.on('unhandledRejection', err => log.error(`Unhandled: ${err}`));

// ── Startup ───────────────────────────────────────────────────────────────────

log.info('============================================');
log.info('Insta Agent Scheduler — STARTED');
log.info('============================================');
log.info('  06:00 AM IST — Download + Brand');
log.info('  08:00 AM IST — Post 1 (Instagram + YouTube)');
log.info('  01:00 PM IST — Post 2 (Instagram + YouTube)');
log.info('  06:00 PM IST — Post 3 (Instagram + YouTube)');
log.info('  07:30 PM IST — Post 4 (Instagram + YouTube)');
log.info('  09:00 PM IST — Post 5 (Instagram + YouTube)');
log.info('============================================');
