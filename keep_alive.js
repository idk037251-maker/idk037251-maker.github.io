const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const rootDir = __dirname;

let serverProc = null;
let tunnelProc = null;

function checkPort3000() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  const isUp = await checkPort3000();
  if (!isUp && !serverProc) {
    serverProc = spawn(process.execPath, [path.join(rootDir, 'server.js')], {
      cwd: rootDir,
      stdio: 'ignore',
      windowsHide: true
    });
    serverProc.on('exit', () => {
      serverProc = null;
    });
  }
}

function ensureTunnel() {
  if (!tunnelProc) {
    tunnelProc = spawn(process.execPath, [path.join(rootDir, 'run_tunnel.js')], {
      cwd: rootDir,
      stdio: 'ignore',
      windowsHide: true
    });
    tunnelProc.on('exit', () => {
      tunnelProc = null;
    });
  }
}

async function tick() {
  await ensureServer();
  ensureTunnel();
}

tick();
setInterval(tick, 4000);
