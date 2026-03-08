import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — check kill switch status
  if (req.method === 'GET') {
    const killed = await redis.get('killswitch:active');
    const message = await redis.get('killswitch:message');
    return res.json({
      killed: killed === 'true' || killed === true,
      message: message || 'This version of HoloReport has been deactivated by the developer.'
    });
  }

  // POST — toggle kill switch (requires admin secret)
  if (req.method === 'POST') {
    const secret = req.headers['x-admin-token'];
    const expectedSecret = (process.env.KILLSWITCH_SECRET || '').trim();
    if (!expectedSecret || secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const { active, message } = req.body || {};
    await redis.set('killswitch:active', active ? 'true' : 'false');
    if (message) {
      await redis.set('killswitch:message', String(message));
    }
    return res.json({ success: true, killed: !!active });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
