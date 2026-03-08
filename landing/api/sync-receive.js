import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { device, users: incoming } = req.body || {};

  if (!incoming || !Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Invalid sync data.' });
  }

  // Load existing users from Redis
  let allUsers = (await redis.get('sync:users')) || [];
  let added = 0;

  for (const entry of incoming) {
    const name = (entry.name || '').trim();
    if (!name) continue;

    const srcDevice = entry.deviceId || (device && device.deviceId) || 'unknown';
    const srcDeviceName = entry.deviceName || (device && device.deviceName) || 'unknown';
    const ts = entry.timestamp || entry.queuedAt || new Date().toISOString();

    const existing = allUsers.find(
      u => u.name.toLowerCase() === name.toLowerCase() && u.deviceId === srcDevice
    );

    if (existing) {
      if (ts > existing.lastSeen) existing.lastSeen = ts;
      existing.visits = (existing.visits || 1) + 1;
    } else {
      allUsers.push({
        name,
        deviceId: srcDevice,
        deviceName: srcDeviceName,
        firstSeen: ts,
        lastSeen: ts,
        visits: 1
      });
      added++;
    }
  }

  // Save back to Redis
  await redis.set('sync:users', allUsers);

  // Track device registration
  if (device && device.deviceId) {
    const devices = (await redis.get('sync:devices')) || [];
    const existingDevice = devices.find(d => d.deviceId === device.deviceId);
    if (existingDevice) {
      existingDevice.lastSync = new Date().toISOString();
      existingDevice.pushCount = (existingDevice.pushCount || 0) + 1;
    } else {
      devices.push({
        ...device,
        firstSync: new Date().toISOString(),
        lastSync: new Date().toISOString(),
        pushCount: 1
      });
    }
    await redis.set('sync:devices', devices);
  }

  return res.json({ success: true, received: incoming.length, added });
}
