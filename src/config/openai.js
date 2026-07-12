const OpenAI = require('openai');
const env = require('./env');

const openai = new OpenAI({
  apiKey: env.openai.apiKey,
  // Bila baseUrl diisi (mis. endpoint OpenAI-compatible milik Google Gemini),
  // SDK OpenAI akan menembak endpoint tersebut. Bila null, memakai OpenAI resmi.
  ...(env.openai.baseUrl ? { baseURL: env.openai.baseUrl } : {}),
});

module.exports = openai;
