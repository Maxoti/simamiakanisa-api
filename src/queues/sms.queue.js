const Bull = require('bull');

let queue;

function getSmsQueue() {
  if (!queue) {
    const redisUrl = process.env.REDIS_URL;
    console.log('[Queue] REDIS_URL:', redisUrl ? 'SET ' : 'MISSING ❌ using localhost');

    if (!redisUrl) {
      throw new Error('REDIS_URL is not set');
    }

    const url = new URL(redisUrl);
    const isTLS = redisUrl.startsWith('rediss://');

    queue = new Bull('smsQueue', {
      redis: {
        host:     url.hostname,
        port:     parseInt(url.port) || 6379,
        password: decodeURIComponent(url.password),
        username: url.username || 'default',
        tls:      isTLS ? { rejectUnauthorized: false } : undefined
      }
    });

    queue.on('error',  err  => console.error('[Queue] error:', err.message));
    queue.on('ready',  ()   => console.log('[Queue] Connected to Redis ✅'));
    queue.on('failed', (job, err) => console.error('[Queue] job failed:', err.message));
  }
  return queue;
}

async function enqueueSms(data) {
  const q = getSmsQueue();
  const job = await q.add(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });
  return job;
}

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