const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');
const logFile = path.join(__dirname, 'tunnel.log');
const urlFile = path.join(__dirname, 'public_url.txt');
const backendConfigFile = path.join(__dirname, 'public', 'backend-config.json');

const GITHUB_OWNER = 'idk037251-maker';
const GITHUB_REPOS = ['idk037251-maker.github.io', 'pinsearch'];

function getGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const out = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = out.match(/password=([^\r\n]+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function githubApiRequest(method, apiPath, token, bodyObj = null) {
  return new Promise((resolve) => {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'PinSearch-AutoSync',
        'Accept': 'application/vnd.github+json',
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function syncTunnelUrlToGithub(publicUrl) {
  const configPayload = {
    apiBase: publicUrl,
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(backendConfigFile, JSON.stringify(configPayload, null, 2));
  } catch (e) {
    console.error('Failed to write local backend-config.json:', e.message);
  }

  const token = getGithubToken();
  if (!token) {
    console.log('No GitHub token found for auto-sync.');
    return;
  }

  const contentBase64 = Buffer.from(JSON.stringify(configPayload, null, 2)).toString('base64');

  for (const repo of GITHUB_REPOS) {
    try {
      const getRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${repo}/contents/backend-config.json`, token);
      const sha = getRes.status === 200 && getRes.data?.sha ? getRes.data.sha : undefined;

      const putRes = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${repo}/contents/backend-config.json`, token, {
        message: `Auto-sync live backend tunnel URL: ${publicUrl}`,
        content: contentBase64,
        ...(sha ? { sha } : {})
      });
      if (putRes.status === 200 || putRes.status === 201) {
        console.log(`✅ [GitHub Auto-Sync] Updated backend-config.json in ${GITHUB_OWNER}/${repo}`);
      }
    } catch (err) {
      console.error(`Failed to sync to ${repo}:`, err.message);
    }
  }
}

let activeTunnel = null;
let isShuttingDown = false;

function startTunnel() {
  if (isShuttingDown) return;
  console.log('Starting Cloudflare Quick Tunnel to http://localhost:3000...');

  let publicUrl = null;
  const tunnel = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:3000'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  activeTunnel = tunnel;

  function handleOutput(data) {
    const text = data.toString();
    try { fs.appendFileSync(logFile, text); } catch {}

    if (!publicUrl) {
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        publicUrl = match[0];
        try { fs.writeFileSync(urlFile, publicUrl); } catch {}
        console.log('================================================================');
        console.log('🎉 [배포 성공] 전 세계 누구나 접속 가능한 공식 공개 URL이 생성되었습니다!');
        console.log('🌐 공개 웹사이트 주소: ' + publicUrl);
        console.log('================================================================');
        syncTunnelUrlToGithub(publicUrl);
      }
    }
  }

  tunnel.stdout.on('data', handleOutput);
  tunnel.stderr.on('data', handleOutput);

  tunnel.on('close', (code) => {
    console.log(`Cloudflare tunnel exited with code ${code}. Restarting in 3 seconds...`);
    if (!isShuttingDown) {
      setTimeout(startTunnel, 3000);
    }
  });
}

startTunnel();

process.on('SIGINT', () => {
  isShuttingDown = true;
  if (activeTunnel) activeTunnel.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  isShuttingDown = true;
  if (activeTunnel) activeTunnel.kill();
  process.exit(0);
});
