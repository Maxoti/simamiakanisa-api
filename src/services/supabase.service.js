// services/supabase.service.js

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Set tenant context for RLS ─────────────────────────────
// Call this before every query to enforce tenant isolation

async function setTenantContext(tenantId) {
  await supabase.rpc('set_tenant_context', { tenant: tenantId });
}

// ── Log every SMS sent ─────────────────────────────────────

async function logSMS({
  tenantId,
  recipient,
  message,
  type,
  status,
  mobiwaveId,
  cost,
  sentBy
}) {
  const { data, error } = await supabase
    .from('sms_logs')
    .insert([{
      tenant_id:   tenantId,
      recipient,
      message,
      type,
      status,
      mobiwave_id: mobiwaveId || null,
      cost:        cost       || 0,
      sent_by:     sentBy     || null
    }])
    .select()
    .single();

  if (error) {
    console.error('❌ SMS log error:', error.message);
    return null;
  }

  console.log(`✅ SMS logged for tenant: ${tenantId}`);
  return data;
}

// ── Update delivery status from Mobiwave callback ──────────

async function updateSMSStatus(mobiwaveId, status) {
  const { error } = await supabase
    .from('sms_logs')
    .update({
      status,
      delivered_at: status === 'delivered' ? new Date().toISOString() : null
    })
    .eq('mobiwave_id', mobiwaveId);

  if (error) console.error('❌ Status update error:', error.message);
}

// ── Get SMS history for ONE tenant only ────────────────────

async function getTenantSMSHistory(tenantId, limit = 50) {
  const { data, error } = await supabase
    .from('sms_logs')
    .select('*')
    .eq('tenant_id', tenantId)        // ← Always filter by tenant
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ History fetch error:', error.message);
    return [];
  }

  return data;
}

// ── Get monthly SMS stats for ONE tenant ───────────────────

async function getTenantMonthlyStats(tenantId, year, month) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate   = `${year}-${String(month + 1).padStart(2,'0')}-01`;

  const { data, error } = await supabase
    .from('sms_logs')
    .select('type, status, cost')
    .eq('tenant_id', tenantId)        // ← Always filter by tenant
    .gte('sent_at', startDate)
    .lt('sent_at',  endDate);

  if (error || !data) return null;

  return {
    total:     data.length,
    delivered: data.filter(s => s.status === 'delivered').length,
    failed:    data.filter(s => s.status === 'failed').length,
    totalCost: data.reduce((sum, s) => sum + (s.cost || 0), 0).toFixed(4),
    byType: {
      event_reminder:  data.filter(s => s.type === 'event_reminder').length,
      contribution:    data.filter(s => s.type === 'contribution').length,
      pledge:          data.filter(s => s.type === 'pledge').length,
      broadcast:       data.filter(s => s.type === 'broadcast').length
    }
  };
}

// ── Maxwell only — all tenants overview ────────────────────
// Only called from superadmin — never exposed to churches

async function getAllTenantsStats() {
  const { data, error } = await supabase
    .from('sms_logs')
    .select('tenant_id, status, cost, sent_at');

  if (error || !data) return [];

  // Group by tenant
  const stats = {};
  data.forEach(row => {
    if (!stats[row.tenant_id]) {
      stats[row.tenant_id] = { total: 0, cost: 0 };
    }
    stats[row.tenant_id].total++;
    stats[row.tenant_id].cost += row.cost || 0;
  });

  return stats;
}

module.exports = {
  logSMS,
  updateSMSStatus,
  getTenantSMSHistory,
  getTenantMonthlyStats,
  getAllTenantsStats
};