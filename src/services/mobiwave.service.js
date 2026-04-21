const {
  MOBIWAVE_BASE_URL,   // ✅ matches env.js
  MOBIWAVE_API_KEY,    // ✅ matches env.js
  MOBIWAVE_SENDER_ID
} = require('../config/env');

async function sendToMobiWave({ recipient, message }) {
  if (!recipient) {
    throw new Error('Invalid recipient');
  }

  if (!message || typeof message !== 'string') {
    throw new Error('Invalid message');
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(MOBIWAVE_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MOBIWAVE_API_KEY}`,
        'Content-Type': 'application/json',
        Accept:         'application/json'
      },
      body: JSON.stringify({
        sender_id:  MOBIWAVE_SENDER_ID,
        message,
        recipients
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);
console.log('[Mobiwave] Response:', JSON.stringify(data));
    if (!response.ok) {
      throw new Error(`MobiWave error ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;

  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendToMobiWave };