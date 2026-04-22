const { sendToMobiWave }                     = require('./mobiwave.service');
const { createSmsLog, markSent, markFailed } = require('../models/sms.model');

/**
 * Normalize any Kenyan phone format → E.164 digits without leading +
 * e.g.  0712345678    → 254712345678
 *       +254712345678 → 254712345678
 *       254712345678  → 254712345678  (unchanged)
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  const stripped = phone.trim().replace(/\s+/g, '');
  if (stripped.startsWith('0'))   return '254' + stripped.slice(1);
  if (stripped.startsWith('+'))   return stripped.slice(1);
  return stripped;
}

/**
 * Send one or many SMS messages.
 * Flow per recipient:
 *   1. Insert sms_logs row (status = pending)
 *   2. Send to Mobiwave
 *   3. markSent / markFailed based on result
 *
 * @param {string}   tenantId
 * @param {string[]} recipients - Raw phone numbers (any format)
 * @param {string}   message
 * @param {string}   type
 * @param {string}   [sentBy]
 * @returns {Promise<Array<{ phone, logId, success, error? }>>}
 */
async function sendSmsService(tenantId, recipients, message, type, sentBy) {
  const results = [];

  for (const raw of recipients) {
    const phone = normalizePhone(raw);
    let log;

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

    try {
      const result = await sendToMobiWave({
        recipient: phone,   // ← singular string, matches mobiwave.service.js
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