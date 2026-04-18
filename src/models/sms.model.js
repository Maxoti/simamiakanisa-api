const { supabaseAdmin } = require('../config/supabase');

const TABLE = 'sms_logs';

/**
 * @typedef {'event_reminder'|'contribution'|'pledge'|'broadcast'} SmsType
 * @typedef {'pending'|'sent'|'delivered'|'failed'} SmsStatus
 *
 * @typedef {Object} SmsRecord
 * @property {string}      id
 * @property {string}      tenant_id
 * @property {string}      recipient      - E.164 phone e.g. +254712345678
 * @property {string}      message
 * @property {SmsType}     type
 * @property {SmsStatus}   status
 * @property {string}      [mobiwave_id]  - Reference ID from Mobiwave
 * @property {number}      cost
 * @property {string}      [sent_by]      - Staff UID
 * @property {string}      sent_at
 * @property {string}      [delivered_at]
 * @property {string}      [error_msg]
 */

// ── Tenant context ────────────────────────────────────────────────────────────
// Service role bypasses RLS by default. We add .eq('tenant_id', tenantId)
// on every query as defence-in-depth alongside the RLS policy.

function tenantClient() {
  return supabaseAdmin;
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Insert a new SMS log row.
 * @param {string} tenantId
 * @param {Pick<SmsRecord, 'recipient'|'message'|'type'|'sent_by'>} data
 * @returns {Promise<SmsRecord>}
 */
async function createSmsLog(tenantId, data) {
  const { data: row, error } = await tenantClient()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      recipient: data.recipient,
      message:   data.message,
      type:      data.type,
      status:    'pending',
      sent_by:   data.sent_by ?? null,
      cost:      0
    })
    .select()
    .single();

  if (error) throw new Error(`[SmsModel] createSmsLog: ${error.message}`);
  return row;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Fetch a single SMS log by ID, scoped to tenant.
 * @param {string} tenantId
 * @param {string} id
 * @returns {Promise<SmsRecord|null>}
 */
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

/**
 * Paginated list of SMS logs for a tenant.
 * @param {string} tenantId
 * @param {{
 *   limit?:   number,
 *   offset?:  number,
 *   status?:  SmsStatus,
 *   type?:    SmsType,
 *   sentBy?:  string
 * }} options
 * @returns {Promise<{ rows: SmsRecord[], count: number }>}
 */
async function getSmsLogs(tenantId, { limit = 50, offset = 0, status, type, sentBy } = {}) {
  let query = tenantClient()
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status)  query = query.eq('status', status);
  if (type)    query = query.eq('type', type);
  if (sentBy)  query = query.eq('sent_by', sentBy);

  const { data: rows, error, count } = await query;
  if (error) throw new Error(`[SmsModel] getSmsLogs: ${error.message}`);
  return { rows, count };
}

/**
 * Aggregate counts grouped by status for a tenant (dashboard stats).
 * @param {string} tenantId
 * @returns {Promise<Record<SmsStatus, number>>}
 */
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

/**
 * Mark an SMS as sent — sets status, mobiwave_id, cost.
 * @param {string} tenantId
 * @param {string} id
 * @param {{ mobiwave_id: string, cost?: number }} data
 * @returns {Promise<SmsRecord>}
 */
async function markSent(tenantId, id, { mobiwave_id, cost = 0 }) {
  const { data: row, error } = await tenantClient()
    .from(TABLE)
    .update({
      status:      'sent',
      mobiwave_id,
      cost,
      sent_at:     new Date().toISOString()
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`[SmsModel] markSent: ${error.message}`);
  return row;
}

/**
 * Mark an SMS as delivered — sets delivered_at timestamp.
 * @param {string} tenantId
 * @param {string} id
 * @returns {Promise<SmsRecord>}
 */
async function markDelivered(tenantId, id) {
  const { data: row, error } = await tenantClient()
    .from(TABLE)
    .update({
      status:       'delivered',
      delivered_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`[SmsModel] markDelivered: ${error.message}`);
  return row;
}

/**
 * Mark an SMS as failed — records the error message.
 * @param {string} tenantId
 * @param {string} id
 * @param {string} errorMsg
 * @returns {Promise<SmsRecord>}
 */
async function markFailed(tenantId, id, errorMsg) {
  const { data: row, error } = await tenantClient()
    .from(TABLE)
    .update({
      status:    'failed',
      error_msg: errorMsg
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`[SmsModel] markFailed: ${error.message}`);
  return row;
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Hard delete a log row — admin/cleanup use only.
 * @param {string} tenantId
 * @param {string} id
 * @returns {Promise<void>}
 */
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