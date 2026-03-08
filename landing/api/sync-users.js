import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin token to view all user data
  const secret = req.headers['x-admin-token'];
  const expectedSecret = (process.env.KILLSWITCH_SECRET || '').trim();
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const allUsers = (await redis.get('sync:users')) || [];
  const devices = (await redis.get('sync:devices')) || [];

  return res.json({
    totalUsers: allUsers.length,
    totalDevices: devices.length,
    users: allUsers,
    devices
  });
}
