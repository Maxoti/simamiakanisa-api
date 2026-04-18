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

module.exports = { getSmsQueue };