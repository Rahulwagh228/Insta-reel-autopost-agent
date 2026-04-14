const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const TOKEN_PATH = 'token.json';

console.log( TOKEN_PATH, SCOPES );
async function getAuthClient() {
  const credentials = JSON.parse(fs.readFileSync('credentials.json'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }

  // First time only — run this manually to get token
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('Authorize here:', authUrl);
  // After visiting URL, paste the code below:
  // const { tokens } = await oAuth2Client.getToken('PASTE_CODE_HERE');
  // fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  return oAuth2Client;
}

module.exports = { getAuthClient };

getAuthClient(); // Run on startup to ensure token is generated if not present