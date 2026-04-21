const { sendToMobiWave }                        = require('./mobiwave.service');
const { createSmsLog, markSent, markFailed }    = require('../models/sms.model');

/**
 * Normalize any Kenyan phone format → E.164 digits without leading +
 * e.g.  0712345678   → 254712345678
 *       +254712345678 → 254712345678
 *       254712345678  → 254712345678
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  const stripped = phone.trim().replace(/\s+/g, '');
  if (stripped.startsWith('0'))  return '254' + stripped.slice(1);
  if (stripped.startsWith('+'))  return stripped.slice(1);
  return stripped;
}

/**
 * Send one or many SMS messages.
 *
 * Flow per recipient:
 *   1. Insert sms_logs row  (status = pending)
 *   2. Send to Mobiwave
 *   3. markSent / markFailed based on result
 *
 * Returns a per-recipient result array so the controller
 * can report partial failures without throwing globally.
 *
 * @param {string}   tenantId
 * @param {string[]} recipient  - Raw phone numbers (any format)
 * @param {string}   message
 * @param {import('../models/sms.model').SmsType} type
 * @param {string}   [sentBy]    - Staff UID
 * @returns {Promise<Array<{ phone: string, logId: string, success: boolean, error?: string }>>}
 */
async function sendSmsService(tenantId, recipients, message, type, sentBy) {
  const results = [];

  for (const raw of recipients) {
    const phone = normalizePhone(raw);
    let log;

    // 1. Create the log row first — always have an audit trail
    try {
      log = await createSmsLog(tenantId, {
        recipient: phone,
        message,
        type,
        sent_by: sentBy ?? null
      });
    } catch (dbErr) {
      console.error(`[SmsService] Failed to create log for ${phone}:`, dbErr.message);
      results.push({ phone, logId: null, success: false, error: dbErr.message });
      continue;
    }

    // 2. Dispatch to Mobiwave
    try {
      const result = await sendToMobiWave({
        recipients: [{ phone }],
        message
      });

      await markSent(tenantId, log.id, {
        mobiwave_id: result.messageId ?? null,
        cost:        result.cost      ?? 0
      });

      results.push({ phone, logId: log.id, success: true });

    } catch (smsErr) {
      console.error(`[SmsService] Mobiwave error for ${phone}:`, smsErr.message);
      await markFailed(tenantId, log.id, smsErr.message);
      results.push({ phone, logId: log.id, success: false, error: smsErr.message });
    }
  }

  return results;
}

module.exports = { sendSmsService, normalizePhone };