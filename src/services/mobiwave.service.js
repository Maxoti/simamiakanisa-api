const {
  MOBIWAVE_BASE_URL,   // ✅ matches env.js
  MOBIWAVE_API_KEY,    // ✅ matches env.js
  MOBIWAVE_SENDER_ID
} = require('../config/env');

async function sendToMobiWave({ recipients, message }) {
  // Mobiwave expects array of objects with 'mobile' field
  const formattedRecipients = recipients.map(r => ({
    mobile: typeof r === 'string' ? r : r.phone
  }));

  console.log('[Mobiwave] Sending to:', JSON.stringify(formattedRecipients));

  const body = JSON.stringify({
    sender_id:  MOBIWAVE_SENDER_ID,
    message,
    recipients: formattedRecipients
  });

  const response = await fetch(MOBIWAVE_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MOBIWAVE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept:         'application/json'
    },
    body
  });

  const data = await response.json().catch(() => null);
  console.log('[Mobiwave] Response:', JSON.stringify(data));

  if (!response.ok) {
    throw new Error(`MobiWave error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

module.exports = { sendToMobiWave };