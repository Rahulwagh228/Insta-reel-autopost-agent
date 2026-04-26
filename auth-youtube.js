require('dotenv').config();
const { google } = require('googleapis');
const readline   = require('readline');
const fs         = require('fs');
const path       = require('path');

const TOKENS_FILE = path.join(__dirname, 'youtube-tokens.json');

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt:      'consent',
  scope:       ['https://www.googleapis.com/auth/youtube.upload'],
});

console.log('\n🔗 Open this URL in your browser and authorize the app:\n');
console.log(authUrl);
console.log();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
    console.log('\n✅ YouTube authorized! Tokens saved to youtube-tokens.json');
    console.log('   You only need to run this once — tokens auto-refresh.');
  } catch (err) {
    console.error('❌ Authorization failed:', err.message);
  }
});
