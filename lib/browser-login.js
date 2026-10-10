// Login da Twitch e da Kick pelo Chrome de verdade (o Google recusa login dentro de apps embutidos).
// loginWindow() abre o Chrome num perfil só deste projeto e espera você fechar a janela;
// readCookies() lê desse perfil os cookies de twitch.tv e kick.com. Os valores nunca são impressos.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROFILE = path.join(process.env.PK_DATA || ROOT, 'chrome-login');

const PORT = 9335;
const SITES = ['twitch.tv', 'kick.com'];
// Cookies do Cloudflare valem para um navegador específico; o app obtém os dele.
const SKIP = /^(cf_clearance|__cf_bm|_cfuvid)$/;
const CHROME = [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  // Sem Chrome, o Edge serve: é o mesmo motor e aceita as mesmas opções.
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
].find((p) => p && fs.existsSync(p));
const COMMON = ['--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-background-mode'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const siteOf = (domain) => {
  const d = domain.replace(/^\./, '');
  return SITES.find((s) => d === s || d.endsWith('.' + s));
};

function loginWindow() {
  return new Promise((resolve, reject) => {
    if (!CHROME) return reject(new Error('Nem o Chrome nem o Edge foram encontrados nesta máquina'));
    const child = spawn(CHROME, [...COMMON, '--new-window', 'https://www.twitch.tv/login', 'https://kick.com/'], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', resolve);
  });
}

function browserCommand(wsUrl, method) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method }));
    ws.onerror = () => reject(new Error('falha ao conversar com o Chrome'));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== 1) return;
      ws.close();
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    };
  });
}

async function readCookies() {
  if (!CHROME) throw new Error('Nem o Chrome nem o Edge foram encontrados nesta máquina');
  const child = spawn(CHROME, [...COMMON, '--headless=new', '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  try {
    let info = null;
    for (let i = 0; i < 40 && !info; i++) {
      await sleep(500);
      info = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
    }
    if (!info) throw new Error('o Chrome não respondeu para a leitura dos cookies');
    const { cookies } = await browserCommand(info.webSocketDebuggerUrl, 'Storage.getCookies');
    return cookies.filter((k) => siteOf(k.domain) && !SKIP.test(k.name));
  } finally {
    if (child.exitCode === null) child.kill();
    await sleep(800);
  }
}

// Resumo sem valores: quantos cookies por site e se a sessão da Twitch veio junto.
function summary(cookies) {
  const count = (s) => cookies.filter((k) => siteOf(k.domain) === s).length;
  return {
    twitch: count('twitch.tv'),
    kick: count('kick.com'),
    twitchSession: cookies.some((k) => k.name === 'auth-token'),
  };
}

module.exports = { loginWindow, readCookies, summary, SITES };
