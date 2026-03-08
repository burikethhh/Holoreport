import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple admin check via query param
  const { key } = req.query;
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [total, installer, portable, recentLog] = await Promise.all([
    redis.get('downloads:total'),
    redis.get('downloads:installer'),
    redis.get('downloads:portable'),
    redis.lrange('downloads:log', 0, 49) // Last 50 download events
  ]);

  // Parse log entries
  const recent = (recentLog || []).map(entry => {
    try { return JSON.parse(entry); } catch { return entry; }
  });

  res.status(200).json({
    total: total || 0,
    installer: installer || 0,
    portable: portable || 0,
    recent
  });
}
