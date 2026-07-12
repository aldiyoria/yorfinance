const { google } = require('googleapis');
const path = require('path');
const env = require('./env');

const KEY_FILE_PATH = path.join(__dirname, '../../credentials/google-service-account.json');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE_PATH,
  scopes: SCOPES,
});

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

module.exports = { sheets, drive, auth };
