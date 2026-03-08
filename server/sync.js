/**
 * Sync module — offline-first user data sync.
 * 
 * Each device keeps a local users.json + a sync-queue.json.
 * When network is available, queued entries are pushed to the central sync server.
 * The sync server URL is stored in sync-config.json.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const DATA_DIR = path.join(__dirname, '..');
const QUEUE_FILE = path.join(DATA_DIR, 'sync-queue.json');
const CONFIG_FILE = path.join(DATA_DIR, 'sync-config.json');
const DEVICE_FILE = path.join(DATA_DIR, 'device-id.json');

// ===== DEVICE ID =====
function getDeviceInfo() {
  if (fs.existsSync(DEVICE_FILE)) {
    try { return JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf-8')); } catch {}
  }
  const info = {
    deviceId: uuidv4(),
    deviceName: os.hostname(),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(DEVICE_FILE, JSON.stringify(info, null, 2));
  return info;
}

// ===== SYNC QUEUE =====
function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); } catch { return []; }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function addToQueue(userEntry) {
  const queue = loadQueue();
  const device = getDeviceInfo();
  queue.push({
    ...userEntry,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    queuedAt: new Date().toISOString()
  });
  saveQueue(queue);
}

// ===== SYNC CONFIG =====
function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaults = { syncUrl: '', enabled: false };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return { syncUrl: '', enabled: false }; }
}

function setConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ===== NETWORK CHECK =====
function checkOnline() {
  return new Promise((resolve) => {
    const req = http.get('http://clients3.google.com/generate_204', { timeout: 5000 }, (res) => {
      resolve(res.statusCode === 204 || res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ===== PUSH SYNC =====
async function pushSync() {
  const config = getConfig();
  if (!config.enabled || !config.syncUrl) return { pushed: 0, status: 'disabled' };

  const queue = loadQueue();
  if (queue.length === 0) return { pushed: 0, status: 'empty' };

  const online = await checkOnline();
  if (!online) return { pushed: 0, status: 'offline' };

  // POST the queue to the sync server
  try {
    const result = await postJSON(config.syncUrl + '/api/sync/receive', {
      device: getDeviceInfo(),
      users: queue
    });

    if (result.success) {
      // Clear the queue on success
      saveQueue([]);
      console.log(`[Sync] Pushed ${queue.length} users to central server.`);
      return { pushed: queue.length, status: 'ok' };
    }
    return { pushed: 0, status: 'server-error' };
  } catch (err) {
    console.log('[Sync] Push failed:', err.message);
    return { pushed: 0, status: 'error', error: err.message };
  }
}

function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); } catch { resolve({ success: false }); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ===== AUTO SYNC LOOP =====
let syncInterval = null;

function startAutoSync(intervalMs = 30000) {
  if (syncInterval) return;
  console.log(`[Sync] Auto-sync started (every ${intervalMs / 1000}s)`);
  syncInterval = setInterval(async () => {
    const result = await pushSync();
    if (result.pushed > 0) {
      console.log(`[Sync] Auto-synced ${result.pushed} entries.`);
    }
  }, intervalMs);
  // Also try immediately
  pushSync();
}

function stopAutoSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

module.exports = {
  getDeviceInfo,
  addToQueue,
  loadQueue,
  saveQueue,
  getConfig,
  setConfig,
  checkOnline,
  pushSync,
  startAutoSync,
  stopAutoSync
};
