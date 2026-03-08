const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { convertWithPowerPoint, convertWithLibreOffice, convertWithParser } = require('./converter');
const sync = require('./sync');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ADMIN AUTH =====
const ADMIN_USER = 'Keth';
// Store password hash, not plaintext
const ADMIN_PASS_HASH = crypto.createHash('sha256').update('Keth123').digest('hex');
const adminTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
  }
  next();
}

// Directories — use writable path when packaged (asar is read-only)
const dataDir = process.env.HOLOREPORT_DATA_DIR || path.join(__dirname, '..');
const uploadsDir = path.join(dataDir, 'uploads');
const outputDir = path.join(dataDir, 'output');
[uploadsDir, outputDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const fileFilter = (req, file, cb) => {
  const ok = file.originalname.endsWith('.pptx') || file.originalname.endsWith('.ppt');
  cb(ok ? null : new Error('Only .pptx/.ppt files allowed'), ok);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 100 * 1024 * 1024 } });

// Static
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/output', express.static(outputDir));

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const passHash = crypto.createHash('sha256').update(String(password || '')).digest('hex');
  if (username === ADMIN_USER && passHash === ADMIN_PASS_HASH) {
    const token = generateToken();
    adminTokens.add(token);
    console.log(`[Admin] Login successful for ${username}`);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid username or password.' });
  }
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) adminTokens.delete(token);
  res.json({ success: true });
});

// Verify token is still valid
app.get('/api/admin/verify', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  res.json({ valid: !!(token && adminTokens.has(token)) });
});

// ===== USERS =====
const usersFile = path.join(dataDir, 'users.json');

function loadUsers() {
  if (!fs.existsSync(usersFile)) return [];
  try { return JSON.parse(fs.readFileSync(usersFile, 'utf-8')); } catch { return []; }
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Register a user (called on every app entry)
app.post('/api/users', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name || name.length < 2 || name.length > 50) {
    return res.status(400).json({ error: 'Invalid name.' });
  }
  const device = sync.getDeviceInfo();
  const users = loadUsers();
  // Check if user already exists (case-insensitive) on this device
  const existing = users.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.lastSeen = new Date().toISOString();
    existing.visits = (existing.visits || 1) + 1;
  } else {
    users.push({
      name,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      visits: 1
    });
  }
  saveUsers(users);
  // Add to sync queue for pushing to central server
  sync.addToQueue({ name, action: 'visit', timestamp: new Date().toISOString() });
  console.log(`[User] ${name} (${existing ? 'returning' : 'new'})`);
  res.json({ success: true });
});

// List all users (admin only)
app.get('/api/users', requireAdmin, (req, res) => {
  res.json(loadUsers());
});

// ===== SYNC ENDPOINTS =====

// Receive synced users from remote devices
app.post('/api/sync/receive', (req, res) => {
  const { device, users: incoming } = req.body || {};
  if (!incoming || !Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Invalid sync data.' });
  }
  const localUsers = loadUsers();
  let added = 0;
  for (const entry of incoming) {
    const name = (entry.name || '').trim();
    if (!name) continue;
    const srcDevice = entry.deviceId || (device && device.deviceId) || 'unknown';
    const srcDeviceName = entry.deviceName || (device && device.deviceName) || 'unknown';
    const existing = localUsers.find(u => u.name.toLowerCase() === name.toLowerCase() && u.deviceId === srcDevice);
    if (existing) {
      const ts = entry.timestamp || entry.queuedAt || new Date().toISOString();
      if (ts > existing.lastSeen) existing.lastSeen = ts;
      existing.visits = (existing.visits || 1) + 1;
    } else {
      localUsers.push({
        name,
        deviceId: srcDevice,
        deviceName: srcDeviceName,
        firstSeen: entry.timestamp || entry.queuedAt || new Date().toISOString(),
        lastSeen: entry.timestamp || entry.queuedAt || new Date().toISOString(),
        visits: 1,
        synced: true
      });
      added++;
    }
  }
  saveUsers(localUsers);
  console.log(`[Sync] Received ${incoming.length} entries from ${device?.deviceName || 'unknown'} (${added} new)`);
  res.json({ success: true, received: incoming.length, added });
});

// Get/set sync config (admin only)
app.get('/api/sync/config', requireAdmin, (req, res) => {
  res.json(sync.getConfig());
});

app.post('/api/sync/config', requireAdmin, (req, res) => {
  const { syncUrl, enabled } = req.body || {};
  const config = sync.getConfig();
  if (syncUrl !== undefined) config.syncUrl = String(syncUrl).trim();
  if (enabled !== undefined) config.enabled = Boolean(enabled);
  sync.setConfig(config);
  if (config.enabled) sync.startAutoSync();
  else sync.stopAutoSync();
  res.json({ success: true, config });
});

// Sync status (admin only)
app.get('/api/sync/status', requireAdmin, async (req, res) => {
  const online = await sync.checkOnline();
  const queue = sync.loadQueue();
  const config = sync.getConfig();
  const device = sync.getDeviceInfo();
  res.json({ online, queueLength: queue.length, config, device });
});

// Force push sync now (admin only)
app.post('/api/sync/push', requireAdmin, async (req, res) => {
  const result = await sync.pushSync();
  res.json(result);
});

// Upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const filePath = req.file.path;
    const id = path.basename(filePath, path.extname(filePath));
    const presDir = path.join(outputDir, id);
    fs.mkdirSync(presDir, { recursive: true });

    let result;
    // Method 1: PowerPoint COM (true 1:1 fidelity)
    try {
      result = await convertWithPowerPoint(filePath, presDir, id);
      console.log(`[PowerPoint] Exported ${result.slideCount} slides as images.`);
    } catch (e) {
      console.log('[PowerPoint unavailable]', e.message);
      // Method 2: LibreOffice headless
      try {
        result = await convertWithLibreOffice(filePath, presDir, id);
        console.log(`[LibreOffice] Converted ${result.slideCount} slides to images.`);
      } catch (e2) {
        console.log('[LibreOffice unavailable]', e2.message);
        // Method 3: XML parser fallback
        result = await convertWithParser(filePath, presDir, id);
        console.log(`[XML Parser] Parsed ${result.slideCount} slides from XML.`);
      }
    }

    fs.writeFileSync(path.join(presDir, 'data.json'), JSON.stringify(result, null, 2));

    // Cleanup: remove uploaded source file after processing
    try { fs.unlinkSync(filePath); } catch {}

    res.json({ success: true, id, ...result });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process presentation.' });
  }
});

app.get('/api/presentation/:id', (req, res) => {
  const id = req.params.id;
  if (!/^[a-f0-9-]+$/i.test(id)) return res.status(400).json({ error: 'Invalid ID.' });
  const p = path.join(outputDir, id, 'data.json');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
});

// Error handler (must be after all routes)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 100 MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message === 'Only .pptx/.ppt files allowed') {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Export for Electron, or auto-start when run directly
function startServer(port) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      const server = app.listen(p, () => {
        const actualPort = server.address().port;
        console.log(`\n  HoloReport PPT Viewer → http://localhost:${actualPort}\n`);
        resolve(actualPort);
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${p} in use, trying ${p + 1}...`);
          server.close();
          tryPort(p + 1);
        } else {
          reject(err);
        }
      });
    };
    tryPort(port || PORT);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
