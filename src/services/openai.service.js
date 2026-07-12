const openai = require('../config/openai');
const env = require('../config/env');
const logger = require('../utils/logger');
const {
  INTENT_SYSTEM_PROMPT,
  buildExtractionSystemPrompt,
  SUMMARY_SYSTEM_PROMPT,
  CATEGORIES,
} = require('../prompts/financePrompts');

const MODEL = env.openai.model;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Membungkus pemanggilan API dengan retry + exponential backoff khusus
 * error 429 (rate limit). Provider free tier (mis. Gemini AI Studio) sering
 * membatasi request per menit; retry singkat biasanya sudah lolos.
 */
async function withRetry(fn, { retries = 3, baseDelayMs = 2000 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (err?.status === 429 && attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        logger.warn({ attempt: attempt + 1, delay }, 'Kena rate limit (429), mencoba lagi...');
        await sleep(delay);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Helper: memanggil Chat Completions dengan response_format JSON dan
 * mem-parse hasilnya dengan aman.
 */
async function chatJson(messages) {
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages,
    })
  );
  const raw = completion.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw);
  } catch (err) {
    logger.error({ raw }, 'Gagal parse JSON dari OpenAI');
    throw new Error('Respons OpenAI bukan JSON valid');
  }
}

/**
 * Menentukan intent dari pesan teks user.
 * @returns {Promise<'add_transaction'|'summary_query'|'other'>}
 */
async function detectIntent(text) {
  const result = await chatJson([
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    { role: 'user', content: text },
  ]);
  const intent = result.intent;
  return ['add_transaction', 'summary_query', 'recap', 'set_budget', 'check_budget', 'other'].includes(intent) ? intent : 'other';
}

/**
 * Menormalkan & memvalidasi hasil ekstraksi transaksi.
 */
function normalizeTransaction(data) {
  const type = data.type === 'income' ? 'income' : 'expense';
  const amount = Math.abs(Math.round(Number(data.amount) || 0));
  const category = CATEGORIES.includes(data.category) ? data.category : 'Lainnya';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date)
    ? data.date
    : new Date().toISOString().slice(0, 10);
  return {
    type,
    amount,
    category,
    item: String(data.item || '').trim() || 'Tidak diketahui',
    date,
    note: String(data.note || '').trim(),
    confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
  };
}

/**
 * Ekstraksi transaksi dari TEKS natural.
 */
async function extractTransactionFromText(text) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const result = await chatJson([
    { role: 'system', content: buildExtractionSystemPrompt(todayIso) },
    { role: 'user', content: text },
  ]);
  return normalizeTransaction(result);
}

/**
 * Ekstraksi transaksi dari GAMBAR struk/nota (vision).
 * @param {string} base64Image - data gambar base64 (tanpa prefix data URI).
 * @param {string} mimeType - mis. "image/jpeg".
 * @param {string} [caption] - teks tambahan dari user (opsional).
 */
async function extractTransactionFromImage(base64Image, mimeType, caption = '') {
  const todayIso = new Date().toISOString().slice(0, 10);
  const result = await chatJson([
    { role: 'system', content: buildExtractionSystemPrompt(todayIso) },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: caption
            ? `Ekstrak transaksi dari struk berikut. Catatan user: "${caption}"`
            : 'Ekstrak transaksi dari struk/nota berikut.',
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` },
        },
      ],
    },
  ]);
  return normalizeTransaction(result);
}

/**
 * Menjawab pertanyaan summary secara natural berdasarkan data agregat.
 * @param {string} question - pertanyaan asli user.
 * @param {object} aggregate - data agregat (hasil query dari Sheet/DB).
 */
async function answerSummary(question, aggregate) {
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `DATA:\n${JSON.stringify(aggregate)}\n\nPERTANYAAN:\n${question}`,
        },
      ],
    })
  );
  return completion.choices[0]?.message?.content?.trim() || 'Maaf, saya belum bisa menjawab itu.';
}

module.exports = {
  detectIntent,
  extractTransactionFromText,
  extractTransactionFromImage,
  answerSummary,
};
