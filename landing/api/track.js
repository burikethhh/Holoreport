import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  // POST /api/track — record a download
  if (req.method === 'POST') {
    const { type } = req.body || {};
    const variant = type === 'portable' ? 'portable' : 'installer';

    // Increment total and variant-specific counters
    const [total, variantCount] = await Promise.all([
      redis.incr('downloads:total'),
      redis.incr(`downloads:${variant}`)
    ]);

    // Log the download event with timestamp
    await redis.lpush('downloads:log', JSON.stringify({
      type: variant,
      ts: new Date().toISOString(),
      ua: (req.headers['user-agent'] || '').substring(0, 200)
    }));

    // Keep log trimmed to last 500 entries
    await redis.ltrim('downloads:log', 0, 499);

    return res.status(200).json({ success: true, total, [variant]: variantCount });
  }

  // GET /api/track — return download stats
  if (req.method === 'GET') {
    const [total, installer, portable] = await Promise.all([
      redis.get('downloads:total'),
      redis.get('downloads:installer'),
      redis.get('downloads:portable')
    ]);

    return res.status(200).json({
      total: total || 0,
      installer: installer || 0,
      portable: portable || 0
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
