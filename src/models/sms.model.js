const { supabaseAdmin } = require('../config/supabase');
const pool = require('../config/db');

const TABLE = 'sms_logs';

function tenantClient() {
  return supabaseAdmin;
}

// ── Create ────────────────────────────────────────────────────────────────────
async function createSmsLog(tenantId, data) {
  const result = await pool.query(
    `INSERT INTO sms_logs 
      (tenant_id, recipient, message, type, status, sent_by, cost)
     VALUES ($1, $2, $3, $4, 'pending', $5, 0)
     RETURNING *`,
    [tenantId, data.recipient, data.message, data.type, data.sent_by ?? null]
  );
  return result.rows[0];
}

// ── Read ──────────────────────────────────────────────────────────────────────
async function getSmsLogById(tenantId, id) {
  const { data: row, error } = await tenantClient()
    .from(TABLE).select('*')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw new Error(`[SmsModel] getSmsLogById: ${error.message}`);
  return row;
}

async function getSmsLogs(tenantId, { limit = 50, offset = 0, status, type, sentBy } = {}) {
  let query = tenantClient()
    .from(TABLE).select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq('status', status);
  if (type)   query = query.eq('type', type);
  if (sentBy) query = query.eq('sent_by', sentBy);
  const { data: rows, error, count } = await query;
  if (error) throw new Error(`[SmsModel] getSmsLogs: ${error.message}`);
  return { rows, count };
}

async function getSmsStatsByTenant(tenantId) {
  const { data, error } = await tenantClient()
    .from(TABLE).select('status').eq('tenant_id', tenantId);
  if (error) throw new Error(`[SmsModel] getSmsStatsByTenant: ${error.message}`);
  const defaults = { pending: 0, sent: 0, delivered: 0, failed: 0 };
  return data.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, defaults);
}

// ── Update (all use pg pool) ──────────────────────────────────────────────────
async function markSent(tenantId, id, { mobiwave_id, cost = 0 }) {
  const result = await pool.query(
    `UPDATE sms_logs
     SET status = 'sent', mobiwave_id = $1, cost = $2, sent_at = NOW()
     WHERE id = $3 AND tenant_id = $4
     RETURNING *`,
    [mobiwave_id, cost, id, tenantId]
  );
  return result.rows[0];
}

async function markDelivered(tenantId, id) {
  const result = await pool.query(
    `UPDATE sms_logs
     SET status = 'delivered', delivered_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId]
  );
  return result.rows[0];
}

async function markFailed(tenantId, id, errorMsg) {
  const result = await pool.query(
    `UPDATE sms_logs
     SET status = 'failed', error_msg = $1
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [errorMsg, id, tenantId]
  );
  return result.rows[0];
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteSmsLog(tenantId, id) {
  await pool.query(
    `DELETE FROM sms_logs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

module.exports = {
  createSmsLog,
  getSmsLogById,
  getSmsLogs,
  getSmsStatsByTenant,
  markSent,
  markDelivered,
  markFailed,
  deleteSmsLog
};