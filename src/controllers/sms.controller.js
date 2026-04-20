const { sendSmsService, normalizePhone } = require('../services/sms.service');
const {
  getSmsLogs,
  getSmsLogById,
  getSmsStatsByTenant,
  createSmsLog
} = require('../models/sms.model');
const {supabaseAdmin:db }= require('../config/supabase'); 
/**
 * Lazy-loaded queue accessor
 * Prevents Redis/Bull initialization during module import (fixes Jest leaks)
 */
function getQueue() {
  return require('../queues/sms.queue');
}

// ─────────────────────────────────────────────────────────────
// SEND SMS (immediate)
// ─────────────────────────────────────────────────────────────
async function sendSMS(req, res) {
  const { recipients, message, type, tenantId, sentBy } = req.body;

  if (!recipients?.length || !message || !type || !tenantId) {
    return res.status(400).json({
      error: 'recipients, message, type, and tenantId are required'
    });
  }

  try {
    const results = await sendSmsService(
      tenantId,
      recipients,
      message,
      type,
      sentBy
    );

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: true,
      summary: {
        total: recipients.length,
        succeeded,
        failed
      },
      results
    });

  } catch (err) {
    console.error('[SmsController] sendSMS error:', err.message);

    return res.status(500).json({
      error: 'SMS sending failed'
    });
  }
}

// ─────────────────────────────────────────────────────────────
// QUEUE SMS (async / bulk)
// ─────────────────────────────────────────────────────────────
async function queueSMS(req, res) {
  const { recipients, message, type, tenantId, sentBy } = req.body;

  if (!recipients?.length || !message || !type || !tenantId) {
    return res.status(400).json({
      error: 'recipients, message, type, and tenantId are required'
    });
  }

  try {
    const { enqueueSms } = getQueue();

    const jobs = [];

    for (const raw of recipients) {
      const phone = normalizePhone(raw);

      const log = await createSmsLog(tenantId, {
        recipient: phone,
        message,
        type,
        sent_by: sentBy ?? null
      });

      const job = await enqueueSms({
        smsLogId: log.id,
        tenantId,
        recipient: phone,
        message
      });

      jobs.push({
        phone,
        logId: log.id,
        jobId: job.id
      });
    }

    return res.status(202).json({
      success: true,
      queued: jobs.length,
      jobs
    });

  } catch (err) {
    console.error('[SmsController] queueSMS error:', err.message);

    return res.status(500).json({
      error: 'Failed to queue SMS'
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET SMS LOGS
// ─────────────────────────────────────────────────────────────
async function getSmsLogsHandler(req, res) {
  const { tenantId, limit, offset, status, type, sentBy } = req.query;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' });
  }

  try {
    const { rows, count } = await getSmsLogs(tenantId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      status,
      type,
      sentBy
    });

    return res.status(200).json({
      success: true,
      count,
      rows
    });

  } catch (err) {
    console.error('[SmsController] getSmsLogs error:', err.message);

    return res.status(500).json({
      error: 'Failed to fetch SMS logs'
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET SINGLE LOG
// ─────────────────────────────────────────────────────────────
async function getSmsLogByIdHandler(req, res) {
  const { id } = req.params;
  const { tenantId } = req.query;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' });
  }

  try {
    const row = await getSmsLogById(tenantId, id);

    if (!row) {
      return res.status(404).json({
        error: 'SMS log not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: row
    });

  } catch (err) {
    console.error('[SmsController] getSmsLogById error:', err.message);

    return res.status(500).json({
      error: 'Failed to fetch SMS log'
    });
  }
}
// ─────────────────────────────────────────────────────────────
// SEND EVENT SMS (bulk — queued)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// SEND EVENT SMS (bulk — queued)
// ─────────────────────────────────────────────────────────────
async function sendEventSMS(req, res) {
  const { eventId } = req.params;
  const { tenantId, sentBy, eventName, eventDate, eventTime, recipients } = req.body;

  console.log('[sendEventSMS] called:', { eventId, tenantId, eventName, recipientCount: recipients?.length });

  if (!tenantId || !eventId) {
    return res.status(400).json({ error: 'tenantId and eventId are required' });
  }

  if (!eventName || !eventDate || !eventTime) {
    return res.status(400).json({ error: 'eventName, eventDate and eventTime are required' });
  }

  if (!recipients?.length) {
    return res.status(400).json({ error: 'No recipients provided' });
  }

  try {
    const message =
      `Reminder: "${eventName}" on ${eventDate} at ${eventTime}. God bless you!`;

    console.log('[sendEventSMS] message built, loading queue...');
    const { enqueueSms } = getQueue();
    console.log('[sendEventSMS] queue loaded');

    const jobs = [];

    for (const phone of recipients) {
      const normalized = normalizePhone(phone);
      console.log('[sendEventSMS] processing:', normalized);

      try {
        const log = await createSmsLog(tenantId, {
          recipient: normalized,
          message,
          type:     'event_notification',
          sent_by:  sentBy ?? null
        });
        console.log('[sendEventSMS] log created:', log.id);

        const job = await enqueueSms({
          smsLogId:  log.id,
          tenantId,
          recipient: normalized,
          message
        });
        console.log('[sendEventSMS] job queued:', job.id);

        jobs.push({ phone: normalized, logId: log.id, jobId: job.id });

      } catch (loopErr) {
        console.error('[sendEventSMS] failed for', normalized, ':', loopErr.message);
      }
    }

    return res.status(202).json({
      success: true,
      event:   eventName,
      queued:  jobs.length,
      jobs
    });

  } catch (err) {
    console.error('[SmsController] sendEventSMS error:', err.message);
    console.error('[SmsController] sendEventSMS stack:', err.stack);
    return res.status(500).json({ error: 'Failed to send event SMS' });
  }
}
// ─────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────
async function getSmsStatsHandler(req, res) {
  const { tenantId } = req.query;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' });
  }

  try {
    const { getQueueStats } = getQueue();

    const [smsStats, queueStats] = await Promise.all([
      getSmsStatsByTenant(tenantId),
      getQueueStats()
    ]);

    return res.status(200).json({
      success: true,
      sms: smsStats,
      queue: queueStats
    });

  } catch (err) {
    console.error('[SmsController] getSmsStats error:', err.message);

    return res.status(500).json({
      error: 'Failed to fetch stats'
    });
  }
}

module.exports = {
  sendSMS,
  queueSMS,
  getSmsLogsHandler,
  getSmsLogByIdHandler,
  sendEventSMS,
  getSmsStatsHandler
};