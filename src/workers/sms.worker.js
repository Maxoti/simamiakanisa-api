const Bull   = require('bull');
const env    = require('../config/env');
const { sendToMobiWave }              = require('../services/mobiwave.service');
const { markSent, markFailed }        = require('../models/sms.model');
const { smsQueue }                    = require('../queues/sms.queue');

/**
 * SMS Worker — processes jobs from smsQueue.
 *
 * Each job payload (SmsJobData):
 * @typedef {Object} SmsJobData
 * @property {string} smsLogId   - UUID of the already-inserted sms_logs row
 * @property {string} tenantId
 * @property {string} recipient  - Normalized E.164 digits (no +)
 * @property {string} message
 */

smsQueue.process(async (job) => {
  const { smsLogId, tenantId, recipient, message } = job.data;

  console.log(`[SmsWorker] Processing job ${job.id} | log: ${smsLogId} | to: ${recipient}`);

  try {
    const result = await sendToMobiWave({
      recipients: [{ phone: recipient }],
      message
    });

    await markSent(tenantId, smsLogId, {
      mobiwave_id: result.messageId ?? null,
      cost:        result.cost      ?? 0
    });

    console.log(`[SmsWorker] Job ${job.id} succeeded`);
    return { success: true, messageId: result.messageId };

  } catch (err) {
    // On final attempt, persist failure; otherwise let Bull retry
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

    if (isFinalAttempt) {
      await markFailed(tenantId, smsLogId, err.message);
      console.error(`[SmsWorker] Job ${job.id} permanently failed: ${err.message}`);
    } else {
      console.warn(`[SmsWorker] Job ${job.id} attempt ${job.attemptsMade + 1} failed — retrying`);
    }

    throw err; // re-throw so Bull applies backoff / retry
  }
});

// Worker-level event hooks
smsQueue.on('active',    (job) => console.log(`[SmsWorker] Active  job ${job.id}`));
smsQueue.on('completed', (job) => console.log(`[SmsWorker] Done    job ${job.id}`));
smsQueue.on('failed',    (job, err) => console.error(`[SmsWorker] Failed  job ${job.id}: ${err.message}`));

console.log('[SmsWorker] Listening for SMS jobs...');

module.exports = smsQueue;