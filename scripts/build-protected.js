/**
 * Build script: obfuscates JS source files, then runs electron-builder.
 * Creates a temporary .build/ directory with obfuscated code,
 * builds the Electron app from it, then cleans up.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, '.build');

// Obfuscation settings — high protection, keeps functionality
const OBFUSCATE_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.7,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'node'
};

// Client-side JS gets browser target
const CLIENT_OBFUSCATE_OPTIONS = {
  ...OBFUSCATE_OPTIONS,
  target: 'browser',
  selfDefending: false // selfDefending can break browser code with strict CSP
};

// Files to obfuscate
const SERVER_JS_FILES = [
  'electron-main.js',
  'server/index.js',
  'server/converter.js',
  'server/sync.js'
];

const CLIENT_JS_FILES = [
  'public/app.js'
];

// Directories/files to copy into .build/
const COPY_TARGETS = [
  'electron-main.js',
  'server',
  'public',
  'uploads',
  'output',
  'parsed',
  'package.json'
];

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function obfuscateFile(filePath, options) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const result = JavaScriptObfuscator.obfuscate(code, options);
  fs.writeFileSync(filePath, result.getObfuscatedCode());
}

// ===== MAIN =====
console.log('\n=== HoloReport Protected Build ===\n');

// Step 1: Clean and create .build directory
console.log('[1/5] Preparing build directory...');
cleanDir(BUILD_DIR);

// Step 2: Copy source files to .build
console.log('[2/5] Copying source files...');
for (const target of COPY_TARGETS) {
  const src = path.join(ROOT, target);
  const dest = path.join(BUILD_DIR, target);
  copyRecursive(src, dest);
}

// Also copy node_modules (needed for packaging)
console.log('      Copying node_modules (this may take a moment)...');
copyRecursive(path.join(ROOT, 'node_modules'), path.join(BUILD_DIR, 'node_modules'));

// Step 3: Obfuscate server-side JS
console.log('[3/5] Obfuscating server-side code...');
for (const file of SERVER_JS_FILES) {
  const filePath = path.join(BUILD_DIR, file);
  if (fs.existsSync(filePath)) {
    process.stdout.write(`      ${file}...`);
    obfuscateFile(filePath, OBFUSCATE_OPTIONS);
    console.log(' done');
  }
}

// Step 4: Obfuscate client-side JS
console.log('[4/5] Obfuscating client-side code...');
for (const file of CLIENT_JS_FILES) {
  const filePath = path.join(BUILD_DIR, file);
  if (fs.existsSync(filePath)) {
    process.stdout.write(`      ${file}...`);
    obfuscateFile(filePath, CLIENT_OBFUSCATE_OPTIONS);
    console.log(' done');
  }
}

// Step 5: Run electron-builder from .build directory
console.log('[5/5] Building Electron app...\n');
try {
  execSync('npx electron-builder --win --config.directories.app=.build --config.directories.output=dist', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env }
  });
  console.log('\n=== Build complete! Check the dist/ folder. ===\n');
} catch (err) {
  console.error('\nBuild failed:', err.message);
  process.exit(1);
} finally {
  // Clean up .build directory
  console.log('Cleaning up build directory...');
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}
