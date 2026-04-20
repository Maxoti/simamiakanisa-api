const { supabaseAdmin } = require('../config/supabase');
const pool = require('../config/db');  // ✅ pg pool at the top

const TABLE = 'sms_logs';

function tenantClient() {
  return supabaseAdmin;
}

// ── Create (uses pg pool — more reliable on Render) ───────────────────────────
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
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new Error(`[SmsModel] getSmsLogById: ${error.message}`);
  return row;
}

async function getSmsLogs(tenantId, { limit = 50, offset = 0, status, type, sentBy } = {}) {
  let query = tenantClient()
    .from(TABLE)
    .select('*', { count: 'exact' })
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
    .from(TABLE)
    .select('status')
    .eq('tenant_id', tenantId);

  if (error) throw new Error(`[SmsModel] getSmsStatsByTenant: ${error.message}`);

  const defaults = { pending: 0, sent: 0, delivered: 0, failed: 0 };
  return data.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, defaults);
}

// ── Update ────────────────────────────────────────────────────────────────────
async function markSent(tenantId, id, { mobiwave_id, cost = 0 }) {
  const { data: row, error } = await tenantClient()
    .from(TABLE)
    .update({ status: 'sent', mobiwave_id, cost, sent_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`[SmsModel] markSent: ${error.message}`);
  return row;
}

async function markDelivered(tenantId, id) {
  const { data: row, error } = await tenantClient()
    .from(TABLE)
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`[SmsModel] markDelivered: ${error.message}`);
  return row;
}

async function markFailed(tenantId, id, errorMsg) {
  const { data: row, error } = await tenantClient()
    .from(TABLE)
    .update({ status: 'failed', error_msg: errorMsg })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`[SmsModel] markFailed: ${error.message}`);
  return row;
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteSmsLog(tenantId, id) {
  const { error } = await tenantClient()
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) throw new Error(`[SmsModel] deleteSmsLog: ${error.message}`);
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