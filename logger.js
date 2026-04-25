const fs   = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function getLogFile() {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  return path.join(LOG_DIR, `${date}.log`);
}

function timestamp() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
}

function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(getLogFile(), line + '\n'); } catch {}
}

module.exports = {
  info:  (msg) => write('INFO ', msg),
  warn:  (msg) => write('WARN ', msg),
  error: (msg) => write('ERROR', msg),
  success: (msg) => write('OK   ', msg),
};
