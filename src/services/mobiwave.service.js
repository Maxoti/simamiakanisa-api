const {
  MOBIWAVE_API_URL,
  MOBIWAVE_API_TOKEN,
  MOBIWAVE_SENDER_ID
} = require('../config/env');

async function sendToMobiWave({ recipients, message }) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error('Invalid recipients list');
  }

  if (!message || typeof message !== 'string') {
    throw new Error('Invalid message');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(MOBIWAVE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MOBIWAVE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        sender_id: MOBIWAVE_SENDER_ID,
        message,
        recipients
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`MobiWave error ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendToMobiWave };