const Bull = require('bull');
const Redis = require('ioredis');

let queue;

function getSmsQueue() {
  if (!queue) {
    const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    queue = new Bull('smsQueue', {
      redis: redis.options
    });
  }
  return queue;
}

// ── Enqueue a single SMS job ──────────────────────────────────
async function enqueueSms(data) {
  const q = getSmsQueue();
  const job = await q.add(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });
  return job;
}

// ── Get queue stats ───────────────────────────────────────────
async function getQueueStats() {
  const q = getSmsQueue();
  const [waiting, active, completed, failed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount()
  ]);
  return { waiting, active, completed, failed };
}

module.exports = { getSmsQueue, enqueueSms, getQueueStats };