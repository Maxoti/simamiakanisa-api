const {
  MOBIWAVE_BASE_URL,
  MOBIWAVE_API_KEY,
  MOBIWAVE_SENDER_ID
} = require('../config/env');

/**
 * Send ONE SMS via MobiWave
 * @param {Object} params
 * @param {string} params.recipient - E.164 format (e.g. 2547XXXXXXXX)
 * @param {string} params.message
 */
async function sendToMobiWave({ recipient, message }) {
  if (!recipient) {
    throw new Error('MobiWave: recipient is required');
  }

  if (!message) {
    throw new Error('MobiWave: message is required');
  }

  const payload = {
    sender_id: MOBIWAVE_SENDER_ID,
    recipient: recipient, // ✅ critical fix
    message: message
  };

  console.log('[Mobiwave] Payload:', JSON.stringify(payload));

  let response;
  let data;

  try {
    response = await fetch(MOBIWAVE_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MOBIWAVE_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    data = await response.json().catch(() => null);

    console.log('[Mobiwave] Response:', JSON.stringify(data));

  } catch (networkError) {
    // Network-level failure (DNS, timeout, etc.)
    throw new Error(`MobiWave network error: ${networkError.message}`);
  }

  // HTTP-level failure
  if (!response.ok) {
    throw new Error(`MobiWave HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  // API-level failure
  if (!data || data.status !== 'success') {
    throw new Error(`MobiWave API error: ${JSON.stringify(data)}`);
  }

  // Return raw response for mapping at higher level
  return data;
}

module.exports = { sendToMobiWave };