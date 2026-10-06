'use strict';
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, Notification, Tray, Menu, nativeImage, globalShortcut, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
// Dados do usuário (ajustes, histórico, perfil de login) ficam fora da pasta do programa quando ele está empacotado.
// A pasta de perfil tem nome fixo: as sessões de login (jogo, Twitch, Kick) ficam nela e não podem
// mudar de lugar quando o nome de exibição do app muda.
// PK_PROFILE aponta outro perfil (usado para testar uma cópia sem mexer nas sessões da principal).
app.setPath('userData', process.env.PK_PROFILE || path.join(app.getPath('appData'), 'pokeidle-desk'));
const DATA = app.isPackaged ? app.getPath('userData') : __dirname;
process.env.PK_DATA = DATA;
const browserLogin = require('./lib/browser-login');


const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
// Ajustes feitos pela aba "Ajustes" do painel: guardados à parte e aplicados por cima do config.json.
const USER_CFG = path.join(DATA, 'config.user.json');
const userCfg = (() => {
  try {
    return JSON.parse(fs.readFileSync(USER_CFG, 'utf8'));
  } catch (e) {
    return {};
  }
})();
const setPath = (obj, key, value) => {
  const parts = key.split('.');
  const last = parts.pop();
  let o = obj;
  for (const p of parts) o = o[p] = o[p] || {};
  o[last] = value;
};
for (const [k, v] of Object.entries(userCfg)) setPath(cfg, k, v);
// O que o painel pode ajustar, com os limites aceitos.
const TUNABLE = {
  'restock.hours': [1, 24],
  'restock.potMax': [0, 20000],
  'restock.ballMax': [0, 50000],
  'restock.revMax': [0, 2000],
  'restock.reserve': [0, 1e9],
  'keep.potencia': [1, 6],
  'keep.qualidade': [0.8, 2],
  'keep.nota': [0, 10],
  'keep.reservas': [0, 10],
  'keep.reservaNivel': [1, 100000],
  maxTwitch: [0, 20],
  maxKick: [0, 2],
  'market.keepStones': [0, 99],
  'market.flipBudget': [0, 1e10],
  'market.flipMargin': [0.01, 1],
  'areas.minGain': [0, 2],
  'areas.maxRisk': [0.1, 20],
  'areas.trialMinutes': [3, 30],
  gameFps: [0, 240],
};
const PARTITION = 'persist:pokeidle';
const BAR = 40;
const SIDE = 400;
const SETTINGS = path.join(DATA, 'settings.json');
const HISTORY = path.join(DATA, 'history.json');
// Lives fora de foco ficam pequenas atrás da aba ativa: o player baixa a qualidade sozinho e gasta menos CPU.
const MINI = { width: 640, height: 360 };
const HOSTS = { game: 'pokeidle.io', twitch: 'twitch.tv', kick: 'kick.com' };
const KICK_HOUR = 300; // pontos de canal por 1 h de +15% XP
// A Kick só conta pontos em 2 canais ao mesmo tempo por conta (medido em 06/10/2026: com 6 lives abertas, só 2 subiam).
const KICK_SLOTS = 2;
cfg.maxKick = Math.min(KICK_SLOTS, Math.max(0, Number(cfg.maxKick) || 0));
// Recompensas de pontos de canal da Kick usadas pelo jogo (cada resgate vale 1 h).
const KICK_REWARDS = {
  xp: { label: '+15% XP', match: 'XP PokeIdle', cost: 300 },
  capture: { label: '+15% Capture Boost', match: 'Capture Boost', cost: 500 },
  lure: { label: '+15% Secret Lure (shiny)', match: 'Secret Lure', cost: 1000 },
};

// Porta local de controle (só 127.0.0.1) usada por tools/cdp.js.
if (cfg.debugPort > 0) app.commandLine.appendSwitch('remote-debugging-port', String(cfg.debugPort));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Abas fora de foco continuam rodando timers e vídeo normalmente.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Twitch e Kick recusam o player quando o user agent denuncia o Electron.
app.userAgentFallback = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

let win = null;
let quitting = false;
let activeId = null;
let seq = 0;
let running = null; // título da ação em andamento
let lastPoll = null;
const tabs = new Map();
const offlineStrikes = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const ses = () => session.fromPartition(PARTITION);
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
};

// Preferências que o painel altera (ficam fora do config.json, que é editado à mão).
// closed: lives que você fechou à mão e que o gerenciador não deve reabrir sozinho.
// lastHunt: última área caçada (para a proteção voltar a ela); parked: você mandou ficar no Centro;
// measures: XP/h medido de verdade em cada área testada.
const settings = {
  panel: true,
  // Numa instalação nova só vêm ligadas as automações que não vendem, não compram e não resgatam nada.
  auto: { watchdog: true, guard: true, lives: true, passe: true, restock: false, depot: false, kick: false, stones: false, flip: false, bestArea: false },
  closed: [],
  lastHunt: null,
  parked: false,
  measures: {},
  approved: {},
  unlocked: null,
  gameVersion: null,
  updateSeen: null,
  // Canais da Kick preferidos, na ordem em que foram marcados.
  kickPrefs: [],
};
{
  const saved = readJson(SETTINGS, {});
  if (typeof saved.panel === 'boolean') settings.panel = saved.panel;
  Object.assign(settings.auto, saved.auto || {});
  if (Array.isArray(saved.closed)) settings.closed = saved.closed;
  if (Array.isArray(saved.kickPrefs)) settings.kickPrefs = saved.kickPrefs.filter((s) => cfg.kick.includes(s));
  for (const k of ['lastHunt', 'parked', 'measures', 'approved', 'unlocked', 'gameVersion', 'updateSeen']) if (saved[k] != null) settings[k] = saved[k];

}
const saveSettings = () => fs.writeFile(SETTINGS, JSON.stringify(settings, null, 2), () => {});

// Histórico de tudo o que o app e as automações fizeram; sobrevive a reinícios.
const history = readJson(HISTORY, []);
function record(entry) {
  const e = Object.assign({ t: Date.now(), src: 'app' }, entry);
  if (history.some((h) => h.t === e.t && h.title === e.title)) return;
  history.push(e);
  history.sort((a, b) => a.t - b.t);
  if (history.length > 600) history.splice(0, history.length - 600);
  fs.writeFile(HISTORY, JSON.stringify(history), () => {});
  log(e.ok === false ? 'FALHOU' : 'ok', e.title);
}

// Toda opção que muda alguma coisa pede duas confirmações antes de rodar; não há como pular.
async function confirm2(title, detail) {
  const first = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Confirmação 1 de 2',
    message: title,
    detail,
    buttons: ['Continuar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (first.response !== 0) return false;
  const second = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Confirmação 2 de 2',
    message: 'Tem certeza? ' + title,
    detail: 'Esta é a última confirmação. Ao aceitar, o app executa agora.',
    buttons: ['Sim, executar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return second.response === 0;
}

function onHost(tab) {
  const want = HOSTS[tab.kind];
  if (!want) return false;
  try {
    const h = new URL(tab.view.webContents.getURL()).hostname;
    return h === want || h.endsWith('.' + want);
  } catch (e) {
    return false;
  }
}

const js = (tab, expr) => tab.view.webContents.executeJavaScript(expr, true);
const gameTab = () => [...tabs.values()].find((t) => t.kind === 'game');
const findTab = (kind, slug) => [...tabs.values()].find((t) => t.kind === kind && t.slug === slug);
const streamTabs = () => [...tabs.values()].filter((t) => t.kind === 'twitch' || t.kind === 'kick');
async function gameJs(expr) {
  const g = gameTab();
  if (!g || !onHost(g)) throw new Error('o jogo não está aberto');
  return js(g, expr);
}

// Cliques e teclas de verdade (o mapa do jogo e as recompensas da Kick ignoram cliques simulados na página).
async function input(wc, method, params) {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  return wc.debugger.sendCommand(method, params);
}
async function clickAt(wc, x, y) {
  await input(wc, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (const type of ['mousePressed', 'mouseReleased']) {
    await input(wc, 'Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}
async function pressKey(wc, key) {
  for (const type of ['keyDown', 'keyUp']) await input(wc, 'Input.dispatchKeyEvent', { type, key });
}

function isHost(url, hosts) {
  try {
    const h = new URL(url).hostname;
    return hosts.some((x) => h === x || h.endsWith('.' + x));
  } catch (e) {
    return false;
  }
}
const isGoogleLogin = (url) => isHost(url, ['accounts.google.com']);
// O botão de exportar a Pokédex do jogo tenta abrir o ChatGPT; o app só quer os dados.
const isUnwanted = (url) => isHost(url, ['chatgpt.com', 'openai.com']);

// O Google recusa login dentro de apps embutidos; em vez da tela de erro dele, aponta o caminho que funciona.
let googleNoticeAt = 0;
function explainGoogle() {
  if (!win || Date.now() - googleNoticeAt < 5000) return;
  googleNoticeAt = Date.now();
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'Login com Google não funciona aqui',
    message: 'O Google não permite entrar com a conta dele dentro de aplicativos como este.',
    detail: 'Use o botão "Login das lives" na barra: ele abre o Chrome normal, você entra na Twitch e na Kick por lá e, ao fechar a janela, o app traz a sessão.',
    buttons: ['Entendi'],
  });
}

// Injeta inject/<tipo>.js e depois os complementos inject/<tipo>-N.js, nessa ordem.
async function inject(tab) {
  if (!onHost(tab)) return;
  const dir = path.join(ROOT, 'inject');
  const files = fs.readdirSync(dir).filter((f) => f === tab.kind + '.js' || (f.startsWith(tab.kind + '-') && f.endsWith('.js'))).sort((a, b) => a.length - b.length || a.localeCompare(b));
  const head = `window.__PK_CFG=${JSON.stringify({ restock: cfg.restock, keep: cfg.keep, market: cfg.market, auto: settings.auto, slug: tab.slug })};\n`;
  for (const [i, f] of files.entries()) {
    try {
      await js(tab, (i ? '' : head) + fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      log('inject falhou', tab.title, f, e.message);
    }
  }
}


// "4,6 mil" → 4600 (a Kick arredonda acima de mil, então é um piso aproximado).
function parsePoints(text) {
  if (!text) return 0;
  const mil = / mil$/.test(text);
  const n = parseFloat(text.replace(' mil', '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(mil ? n * 1000 : n);
}

// Lê o estado que cada script injetado expõe em window.__pkState() e roda as automações do app.
let collecting = false;
async function collect() {
  if (collecting) return;
  collecting = true;
  try {
    for (const tab of tabs.values()) {
      if (!onHost(tab)) continue;
      try {
        const st = await js(tab, 'window.__pkState ? window.__pkState() : null');
        if (st) tab.state = Object.assign(st, { at: Date.now() });
      } catch (e) {}
    }
    // O que o script do jogo registrou (compras, vendas, capturas guardadas) entra no histórico geral.
    const g = gameTab();
    for (const l of (g && g.state && g.state.logs) || []) record({ t: l.t, src: 'jogo', title: l.msg, ok: !/falhou|Erro|ilegível|não |NÃO|ATENÇÃO/.test(l.msg), detail: l.detail });
    if (g && g.state && g.state.logged) await watch(g.state);
    updateAlerts();
    if (settings.auto.kick && !running) await autoKick();
  } finally {
    collecting = false;
    writeStatus();
    sendStatus();
  }
}

// --- Vigilância: o que eu conferia olhando, agora a cada leitura do jogo ---
let idleSince = 0;
let xpPeak = { v: 0, at: 0 };
const since = new Map(); // desde quando cada condição de alerta vale
const kickSeen = new Map(); // canal → { pts, at } da última mudança de pontos
let alerts = [];
const announced = new Set();
const held = (id, cond, ms) => {
  if (!cond) {
    since.delete(id);
    return false;
  }
  if (!since.has(id)) since.set(id, Date.now());
  return Date.now() - since.get(id) >= ms;
};

async function watch(g) {
  const now = Date.now();
  // Área atual lembrada para a proteção saber para onde voltar.
  if (g.hunting) {
    idleSince = 0;
    if (g.area && (!settings.lastHunt || settings.lastHunt.slug !== g.area.slug || settings.parked)) {
      settings.lastHunt = g.area;
      settings.parked = false;
      saveSettings();
    }
  } else if (!idleSince) idleSince = now;

  if (g.rates && g.rates.xp) {
    if (g.rates.xp > xpPeak.v || now - xpPeak.at > 2 * 3600000) xpPeak = { v: g.rates.xp, at: now };
  }

  // Versão nova do jogo: registra as novidades que o próprio jogo lista.
  if (g.version && g.version !== settings.gameVersion) {
    const from = settings.gameVersion;
    settings.gameVersion = g.version;
    saveSettings();
    if (from) {
      const news = await gameJs('window.__news ? window.__news() : []').catch(() => []);
      record({ title: `Jogo atualizado: ${from} → ${g.version}`, ok: true, detail: news.length ? news : ['Sem lista de novidades na tela.'] });
      notify('PokéIdle atualizado', `${from} → ${g.version}`);
    }
  }

  if (running) return;

  // Personagem parado no Centro sem ter sido você: cura, repõe (só com a Recompra ligada) e volta para a última área.
  if (settings.auto.watchdog && idleSince && now - idleSince > 5 * 60000 && !settings.parked && settings.lastHunt && !g.modal) {
    idleSince = now;
    // Sem esperar: a leitura do jogo continua enquanto a ação roda.
    execute('recover', settings.lastHunt, `Proteção: parado no Centro há 5 min, voltando para ${settings.lastHunt.name}`);
    return;
  }

  // Áreas novas liberadas (região aberta por nível): recalcula e, se ligado, testa a melhor.
  if (g.unlocked != null && g.unlocked !== settings.unlocked) {
    const before = settings.unlocked;
    settings.unlocked = g.unlocked;
    saveSettings();
    if (before != null && g.unlocked > before && g.hunting) {
      record({ title: `Mapa: ${g.unlocked - before} áreas novas liberadas`, ok: true, detail: [`Antes ${before}, agora ${g.unlocked}`] });
      notify('Áreas novas liberadas', `${g.unlocked - before} áreas novas no mapa`);
      (async () => {
        await execute('areas', {}, 'Áreas recalculadas após a liberação');
        if (settings.auto.bestArea) await tryBestArea();
      })();

    }
  }
}

// Escolhe a melhor área estimada que ainda não foi testada (ou que mediu bem) e faz o teste de 5 minutos.
async function tryBestArea() {
  await collectGame();
  const g = gameTab() && gameTab().state;
  const a = g && g.advice;
  if (!a || !a.list || !g.rates.xp) return;
  const cur = a.list.find((x) => x.current);
  const curXph = cur ? cur.xph : g.rates.xp;
  const cand = a.list.find((x) => {
    if (x.current || x.risk == null || x.risk > cfg.areas.maxRisk || x.xph < curXph * (1 + cfg.areas.minGain)) return false;
    const m = settings.measures[x.slug];
    // Já testada há menos de 12 h e não rendeu: não tenta de novo.
    return !(m && Date.now() - m.at < 12 * 3600000 && m.kept === false);
  });
  if (!cand) {
    record({ title: 'Melhor área automática: nenhuma candidata passa nos critérios', ok: true, detail: [`Critérios: ganho estimado de ${Math.round(cfg.areas.minGain * 100)}% ou mais e dano recebido até ×${cfg.areas.maxRisk}`] });
    return;
  }
  await execute('trial', { slug: cand.slug, name: cand.name, lv: cand.lv }, `Melhor área automática: testando ${cand.name} Nv ${cand.lv}`);
}

// --- Versão nova do próprio app (última release publicada no GitHub) ---
const REPO = 'aKevu/pokeidle-desk';
let update = null;
const newer = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
async function checkUpdate() {
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'pokeidle-desk' } });
    if (!r.ok) return;
    const j = await r.json();
    const latest = String(j.tag_name || '').replace(/^v/, '');
    update = latest && newer(latest, app.getVersion()) ? { version: latest, url: `https://github.com/${REPO}/releases/tag/v${latest}` } : null;
    // Avisa uma vez por versão; o aviso no painel fica até atualizar.
    if (update && settings.updateSeen !== update.version) {
      settings.updateSeen = update.version;
      saveSettings();
      record({ kind: 'versao', title: `Versão nova do PokéIdle Desk: ${latest} (você usa a ${app.getVersion()})`, ok: true, detail: [j.name || '', update.url] });
      notify('PokéIdle Desk', `Versão ${latest} disponível`);
    }
  } catch (e) {}
}
ipcMain.on('open-update', () => update && shell.openExternal(update.url));

function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, icon: path.join(ROOT, 'icon.png') }).show();
  } catch (e) {}
}

function updateAlerts() {
  const g = gameTab() && gameTab().state;
  const out = [];
  const add = (id, level, text) => out.push({ id, level, text });
  // Enquanto o jogo carrega a tela ainda não é legível: o problema só vira alerta se durar.
  const why = g && g.compat && g.compat.problems.length ? g.compat.problems[0] : null;
  const compatOn = held('compat', !!why, 45000);
  const loginOn = held('game-login', !!g && !g.logged && !why, 20000);
  if (!g) add('game', 'warn', 'Jogo carregando ou sem resposta.');
  else if (!g.logged) {
    if (compatOn) add('compat', 'bad', 'Automações travadas: ' + why + '.');
    else if (loginOn) add('game-login', 'bad', 'Jogo sem login: entre na conta na aba PokéIdle.');
  } else {
    // O app não age quando não entende a tela do jogo (outro idioma, painel diferente, jogo atualizado).
    if (compatOn) add('compat', 'bad', 'Automações travadas: ' + why + '.');
    const r = g.rates || {};
    if (!g.hunting && settings.parked) add('parked', 'warn', 'Personagem no Centro a seu pedido: a caça está parada.');
    else if (held('idle', !g.hunting && !running, 2 * 60000)) add('idle', 'bad', 'Personagem parado no Centro há mais de 2 min.');
    const hours = (have, per) => (per > 0 && have >= 0 ? have / per : null);
    const hp = hours(g.pot, r.pot);
    const hb = hours(g.balls, r.balls);
    if (g.pot >= 0 && (g.pot < 30 || (hp != null && hp < 1))) add('pot', 'bad', `Poções para menos de 1 h (${g.pot}).`);
    if (g.rev >= 0 && g.rev < 10) add('rev', 'bad', `Só ${g.rev} revives.`);
    if (g.balls >= 0 && (g.balls < 30 || (hb != null && hb < 1))) add('balls', 'warn', `Ultra Balls para menos de 1 h (${g.balls}).`);
    if (held('xp', r.xp > 0 && xpPeak.v > 0 && r.xp < xpPeak.v * 0.6, 5 * 60000)) add('xp', 'warn', `XP por hora caiu para ${Math.round((r.xp / xpPeak.v) * 100)}% do pico das últimas 2 h.`);
    const tw = channels().filter((c) => c.kind === 'twitch' && c.open && c.playing && c.logged);
    const expected = tw.length ? 15 + 2.5 * (tw.length - 1) : 0;
    const actual = g.twitch ? parseFloat(g.twitch.replace(',', '.')) : 0;
    if (held('twitch', tw.length > 0 && actual + 0.01 < expected, 10 * 60000)) {
      add('twitch', 'warn', `Twitch: ${tw.length} lives tocando, mas o bônus no jogo é ${g.twitch || '0%'} (esperado ${String(expected).replace('.', ',')}%).`);
    }
  }
  for (const kind of ['twitch', 'kick']) {
    const open = channels().filter((c) => c.kind === kind && c.open);
    const name = kind === 'kick' ? 'Kick' : 'Twitch';
    if (held(kind + '-login', open.length > 0 && open.every((c) => c.logged === false), 60000)) add(kind + '-login', 'bad', `${name} sem login no app: use "Login das lives".`);
    for (const c of open) {
      if (held(`stop:${kind}:${c.slug}`, c.playing === false, 90000)) add(`stop:${kind}:${c.slug}`, 'warn', `${name} · ${c.slug}: vídeo parado.`);
      if (kind !== 'kick' || !c.points) continue;
      const seen = kickSeen.get(c.slug);
      if (!seen || seen.pts !== c.points) kickSeen.set(c.slug, { pts: c.points, at: Date.now() });
      else if (c.playing && c.live && Date.now() - seen.at > 45 * 60000) {
        add('kick-stuck:' + c.slug, 'warn', `Kick · ${c.slug}: pontos parados em ${c.points} há ${Math.round((Date.now() - seen.at) / 60000)} min.`);
      }
    }
  }
  // Alerta novo vai para o histórico e, se for grave, vira notificação do Windows; some sozinho quando a condição passa.
  for (const a of out) {
    if (announced.has(a.id)) continue;
    announced.add(a.id);
    record({ kind: 'alerta', title: 'Alerta: ' + a.text, ok: a.level === 'bad' ? false : null });
    if (a.level === 'bad') notify('PokéIdle Desk', a.text);
  }
  for (const id of [...announced]) if (!out.some((a) => a.id === id)) announced.delete(id);
  alerts = out;
}

function channels() {
  const out = [];
  for (const kind of ['twitch', 'kick']) {
    for (const slug of cfg[kind]) {
      const tab = findTab(kind, slug);
      const st = tab && tab.state;
      out.push({
        kind,
        slug,
        live: lastPoll ? lastPoll[kind][slug] : null,
        open: !!tab,
        closedByUser: settings.closed.includes(kind + ':' + slug),
        playing: st ? !!st.playing : null,
        logged: st ? !!st.logged : null,
        points: st && st.points ? st.points : null,
        pts: st && st.points ? parsePoints(st.points) : 0,
        hours: st && st.points ? Math.floor(parsePoints(st.points) / KICK_HOUR) : 0,
        // Posição entre os preferidos da Kick (0 = não é preferido).
        pref: kind === 'kick' ? settings.kickPrefs.indexOf(slug) + 1 : 0,
      });
    }
  }
  return out;
}

function snapshot() {
  const g = gameTab();
  return { updated: new Date().toISOString(), game: g ? g.state : null, channels: channels(), lastPoll, running, alerts, perf, update };
}
function writeStatus() {
  fs.writeFile(path.join(DATA, 'status.json'), JSON.stringify(snapshot(), null, 2), () => {});
}
function sendStatus() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(
    'status',
    Object.assign(snapshot(), { history: history.slice(-150), settings, keep: cfg.keep, hours: cfg.restock.hours, restock: cfg.restock, kickHour: KICK_HOUR, kickSlots: KICK_SLOTS,
 kickRewards: KICK_REWARDS, market: cfg.market, areasCfg: cfg.areas, config: tunables(), version: app.getVersion() })

  );
}

// Só a aba ativa é desenhada. As outras ficam invisíveis (sem custo de composição); as lives seguem tocando
// porque foram criadas sem economia de segundo plano, e o jogo para de desenhar mas mantém os timers.
// force: aba que precisa ser desenhada por um instante mesmo sem estar ativa (clique real no resgate da Kick).
let forceVisible = null;
function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  const full = { x: 0, y: BAR, width: Math.max(0, w - (settings.panel ? SIDE : 0)), height: Math.max(0, h - BAR) };
  for (const t of tabs.values()) {
    const active = t.id === activeId;
    const stream = t.kind === 'twitch' || t.kind === 'kick';
    // Lives inativas ficam num tamanho pequeno: o player da Kick escolhe a qualidade pelo tamanho.
    t.view.setBounds(!active && stream ? { x: 0, y: BAR, width: Math.min(MINI.width, full.width), height: Math.min(MINI.height, full.height) } : full);
    t.view.setVisible(active || t.id === forceVisible);
  }
}

// --- Hub oculto: a janela some da tela e da barra de tarefas; tudo continua rodando ---
let tray = null;
function toggleHub(show) {
  if (!win) return;
  const visible = win.isVisible() && !win.isMinimized();
  if (show === undefined ? !visible : show) {
    win.show();
    win.focus();
  } else win.hide();
}
// O ícone ao lado do relógio mostra o consumo do app ao passar o mouse; o menu do botão direito detalha por aba.
const br1 = (n) => String(n).replace('.', ',');
function updateTray() {
  if (!tray) return;
  const g = gameTab() && gameTab().state;
  const lines = ['PokéIdle Desk'];
  const items = [];
  if (perf) {
    const mem = perf.mem == null ? 'memória medindo…' : perf.mem >= 1024 ? br1((perf.mem / 1024).toFixed(1)) + ' GB' : perf.mem + ' MB';
    lines[0] = `PokéIdle Desk · CPU ${br1(perf.cpu)}% · ${mem} · ${streamTabs().length} lives`;
    items.push({ label: `Consumo: CPU ${br1(perf.cpu)}% · ${mem} · ${perf.procs} processos`, enabled: false });
    for (const r of perf.top.slice(0, 6)) items.push({ label: `    ${r.name}: ${br1(r.cpu)}% de CPU`, enabled: false });
    items.push({ type: 'separator' });
  }
  if (g && g.logged) lines.push(`Nv ${g.lv} · ${g.hunting ? g.hud : 'no Centro (parado)'}${g.rates && g.rates.xp ? ' · ' + br1((g.rates.xp / 1e6).toFixed(1)) + ' mi XP/h' : ''}`);
  if (alerts.length) lines.push(`${alerts.length} alerta(s): ${alerts[0].text}`);
  lines.push('Clique para mostrar ou ocultar');
  // O Windows corta a dica em 127 caracteres.
  tray.setToolTip(lines.join('\n').slice(0, 127));
  tray.setContextMenu(
    Menu.buildFromTemplate(
      items.concat([
        { label: 'Mostrar o hub', click: () => toggleHub(true) },
        { label: 'Ocultar o hub', click: () => toggleHub(false) },
        { type: 'separator' },
        { label: 'Sair…', click: () => quitApp() },
      ])
    )
  );
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'icon.png')).resize({ width: 16, height: 16 }));
  updateTray();
  tray.on('click', () => toggleHub());
  // Atalho global para mostrar ou ocultar de qualquer lugar.
  globalShortcut.register('Control+Alt+P', () => toggleHub());
}

// --- Uso de CPU e memória por aba (o que o Gerenciador de Tarefas mostra, mas com nome) ---
let perf = null;
// Memória como na coluna do Gerenciador de Tarefas (conjunto de trabalho privado), lida do Windows a cada 3 min.
// A soma que o Electron informa por processo conta páginas compartilhadas e dá mais que o dobro.
let privateMem = null;
function measureMemory() {
  const query = "(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter \"Name like 'electron%'\" | Measure-Object WorkingSetPrivate -Sum).Sum";
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', query], { windowsHide: true, timeout: 20000 }, (err, out) => {
    const n = parseInt(String(out).trim(), 10);
    if (err || !(n > 0)) return;
    privateMem = Math.round(n / 1048576);
    if (perf) perf.mem = privateMem;
    updateTray();
  });
}
function measurePerf() {
  const byPid = new Map();
  for (const t of tabs.values()) {
    try {
      byPid.set(t.view.webContents.getOSProcessId(), (t.kind === 'game' ? '' : t.kind === 'kick' ? 'Kick · ' : 'Twitch · ') + t.title);
    } catch (e) {}
  }
  if (win && !win.isDestroyed()) byPid.set(win.webContents.getOSProcessId(), 'Painel');
  const rows = app.getAppMetrics().map((m) => ({
    name: byPid.get(m.pid) || (m.type === 'GPU' ? 'Vídeo e composição (GPU)' : m.type === 'Browser' ? 'Núcleo do app' : m.name || m.serviceName || m.type),
    // No Windows esse número já é a fatia da CPU inteira, como no Gerenciador de Tarefas.
    cpu: +m.cpu.percentCPUUsage.toFixed(1),
    // Memória própria do processo (a soma dos "conjuntos de trabalho" conta a parte compartilhada várias vezes).
    mem: Math.round((m.memory.privateBytes || m.memory.workingSetSize) / 1024),
  }));
  perf = { cpu: +rows.reduce((n, r) => n + r.cpu, 0).toFixed(1), mem: privateMem, procs: rows.length, top: rows.sort((a, b) => b.cpu - a.cpu || b.mem - a.mem).slice(0, 8) };
  updateTray();

}

function sendTabs() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('tabs', {
    active: activeId,
    tabs: [...tabs.values()].map((t) => ({ id: t.id, kind: t.kind, title: t.title })),
  });
}

function select(id) {
  const t = tabs.get(id);
  if (!t) return;
  activeId = id;
  // addChildView numa view já filha só a traz para a frente.
  win.contentView.addChildView(t.view);
  layout();
  sendTabs();
}

// O jogo desenha o mapa na taxa do monitor (100+ quadros por segundo), e isso é quase todo o custo dele quando
// está à vista. Este trecho entra antes dos scripts do jogo e limita os quadros a config.gameFps.
const FRAME_CAP = (fps) => `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const gap = 1000 / ${fps};
  const live = new Map();
  let last = 0;
  let seq = 1e9;
  window.requestAnimationFrame = (cb) => {
    const id = ++seq;
    const tm = setTimeout(() => {
      live.set(id, { r: raf((t) => { live.delete(id); last = performance.now(); cb(t); }) });
    }, Math.max(0, gap - (performance.now() - last)));
    live.set(id, { tm });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const e = live.get(id);
    if (!e) return caf(id);
    if (e.tm) clearTimeout(e.tm);
    if (e.r) caf(e.r);
    live.delete(id);
  };
})();`;
async function capFrames(wc) {
  if (!(cfg.gameFps > 0)) return;
  try {
    await input(wc, 'Page.enable', {});
    await input(wc, 'Page.addScriptToEvaluateOnNewDocument', { source: FRAME_CAP(cfg.gameFps) });
  } catch (e) {
    log('limite de quadros não aplicado', e.message);
  }
}

function createTab(kind, slug, url, title) {

  const id = 't' + ++seq;
  const view = new WebContentsView({
    // O jogo pode parar de desenhar quando não está à vista (os timers seguem pelos switches acima);
    // as lives precisam continuar tocando escondidas, então ficam sem essa economia.
    webPreferences: { partition: PARTITION, backgroundThrottling: kind === 'game', contextIsolation: true, sandbox: true },
  });
  const tab = { id, kind, slug, title: title || slug, view, state: null };
  tabs.set(id, tab);
  const wc = view.webContents;
  if (kind === 'twitch' || kind === 'kick') wc.setAudioMuted(true);
  // Popups de login (Discord, vínculo Twitch/Kick) abrem na mesma sessão.
  wc.setWindowOpenHandler(({ url }) => {
    if (isUnwanted(url)) return { action: 'deny' };
    if (isGoogleLogin(url)) {
      explainGoogle();
      return { action: 'deny' };
    }
    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition: PARTITION } } };
  });
  wc.on('did-create-window', (child) => {
    const guard = (_e, url) => {
      if (!isGoogleLogin(url) && !isUnwanted(url)) return;
      if (!child.isDestroyed()) child.destroy();
      if (isGoogleLogin(url)) explainGoogle();
    };
    child.webContents.on('will-navigate', guard);
    child.webContents.on('will-redirect', guard);
  });
  wc.on('will-navigate', (e, url) => {
    if (!isGoogleLogin(url)) return;
    e.preventDefault();
    explainGoogle();
  });
  wc.on('did-finish-load', () => inject(tab));
  wc.on('render-process-gone', (_e, d) => {
    log('aba caiu', tab.title, d.reason);
    setTimeout(() => !wc.isDestroyed() && wc.reload(), 5000);
  });
  win.contentView.addChildView(view);
  layout();
  (async () => {
    // O limite de quadros precisa de uma página já carregada para ser registrado; nunca segura a abertura do jogo.
    if (kind === 'game' && cfg.gameFps > 0) {
      await wc.loadURL('about:blank').catch(() => {});
      await Promise.race([capFrames(wc), sleep(3000)]);
    }
    wc.loadURL(url).catch((e) => log('load falhou', url, e.message));
  })();

  if (activeId) select(activeId);
  else select(id);
  sendTabs();
  return tab;
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  tabs.delete(id);
  win.contentView.removeChildView(t.view);
  if (!t.view.webContents.isDestroyed()) t.view.webContents.close();
  if (activeId === id) select([...tabs.keys()][0]);
  sendTabs();
}

const liveUrl = (kind, slug) => (kind === 'kick' ? `https://kick.com/${slug}` : `https://www.twitch.tv/${slug}`);

// Consulta pela aba já aberta da plataforma, que carrega os cookies do Cloudflare.
async function viaView(kind, expr) {
  const t = [...tabs.values()].find((x) => x.kind === kind && onHost(x));
  if (!t) return null;
  try {
    return await js(t, expr);
  } catch (e) {
    return null;
  }
}

async function isLive(kind, slug) {
  try {
    if (kind === 'kick') {
      const r = await ses().fetch(`https://kick.com/api/v2/channels/${slug}`, { headers: { accept: 'application/json' } });
      if (r.ok) return !!(await r.json()).livestream;
      return await viaView('kick', `fetch('/api/v2/channels/${slug}').then(r=>r.ok?r.json():null).then(j=>j?!!j.livestream:null).catch(()=>null)`);
    }
    const r = await ses().fetch(`https://www.twitch.tv/${slug}`);
    if (r.ok) return (await r.text()).includes('isLiveBroadcast');
  } catch (e) {
    log('consulta falhou', kind, slug, e.message);
  }
  return null;
}

// Verifica quais canais oficiais estão ao vivo; com o gerenciador ligado, abre os que entraram e fecha os que saíram.
let polling = false;
async function poll() {
  if (polling || !win) return null;
  polling = true;
  const result = { at: new Date().toISOString(), twitch: {}, kick: {} };
  const changes = [];
  try {
    for (const kind of ['twitch', 'kick']) {
      for (const slug of cfg[kind]) {
        const live = await isLive(kind, slug);
        result[kind][slug] = live;
        const key = kind + ':' + slug;
        const tab = findTab(kind, slug);
        if (live === true) {
          offlineStrikes.delete(key);
          // Limite por plataforma: cada live aberta custa CPU e rede.
          const sameKind = streamTabs().filter((t) => t.kind === kind).length;
          const cap = kind === 'kick' ? cfg.maxKick : cfg.maxTwitch;
          // A Kick é arrumada depois do laço: só 2 canais contam pontos, então a escolha é por preferência.
          if (kind !== 'kick' && !tab && settings.auto.lives && !settings.closed.includes(key) && streamTabs().length < cfg.maxStreams && sameKind < cap) {
            createTab(kind, slug, liveUrl(kind, slug));
            changes.push('abriu ' + key);
          }
        } else if (live === false) {
          // Canal que saiu do ar volta a ser aberto sozinho na próxima live.
          if (settings.closed.includes(key)) {
            settings.closed = settings.closed.filter((k) => k !== key);
            saveSettings();
          }
          if (!tab || !settings.auto.lives) continue;
          // Duas leituras offline seguidas antes de fechar, para não piscar.
          const n = (offlineStrikes.get(key) || 0) + 1;
          offlineStrikes.set(key, n);
          if (n >= 2) {
            offlineStrikes.delete(key);
            closeTab(tab.id);
            changes.push('fechou ' + key);
          }
        }
      }
    }
  } finally {
    lastPoll = result;
    polling = false;
  }
  if (settings.auto.lives) {
    // Twitch acima do limite (Ajustes): fecha as excedentes.
    for (const t of streamTabs().filter((t) => t.kind === 'twitch').slice(cfg.maxTwitch)) {
      closeTab(t.id);
      changes.push(`fechou twitch:${t.slug} (limite de ${cfg.maxTwitch})`);
    }
    arrangeKick(result.kick, changes);
  }
  if (changes.length) record({ title: 'Lives: ' + changes.join(', '), ok: true, detail: liveSummary(result) });

  writeStatus();
  sendStatus();
  return result;
}
// --- Kick: só KICK_SLOTS canais contam pontos ao mesmo tempo ---
// Ficam abertas as preferidas que estiverem ao vivo, na ordem em que foram marcadas;
// faltando preferida ao vivo, a vaga vai para outro canal oficial que esteja ao vivo.
function kickWanted(live) {
  // Aba ainda aberta conta como ao vivo: cobre leitura sem resposta e a primeira leitura offline (a segunda fecha).
  const on = (s) => live[s] === true || !!findTab('kick', s);
  const ok = cfg.kick.filter((s) => on(s) && !settings.closed.includes('kick:' + s));
  const prefs = settings.kickPrefs.filter((s) => ok.includes(s));
  // Entre as não preferidas, a que já está aberta continua, para não trocar de canal à toa.
  const rest = ok.filter((s) => !prefs.includes(s)).sort((a, b) => !!findTab('kick', b) - !!findTab('kick', a));
  return prefs.concat(rest).slice(0, cfg.maxKick);
}
function arrangeKick(live, changes) {
  const want = kickWanted(live);
  for (const t of streamTabs().filter((t) => t.kind === 'kick' && !want.includes(t.slug))) {
    closeTab(t.id);
    changes.push(`fechou kick:${t.slug} (as vagas da Kick ficaram com ${want.join(' e ') || 'ninguém'})`);
  }
  for (const slug of want) {
    if (findTab('kick', slug)) continue;
    createTab('kick', slug, liveUrl('kick', slug));
    changes.push(`abriu kick:${slug}${settings.kickPrefs.includes(slug) ? ' (preferida)' : ''}`);
  }
  return want;
}
function liveSummary(r) {
  const on = (kind) => Object.keys(r[kind]).filter((s) => r[kind][s] === true);
  const unknown = ['twitch', 'kick'].flatMap((k) => Object.keys(r[k]).filter((s) => r[k][s] === null).map((s) => k + ':' + s));
  const out = [`Twitch ao vivo: ${on('twitch').join(', ') || 'nenhum'}`, `Kick ao vivo: ${on('kick').join(', ') || 'nenhum'}`];
  if (unknown.length) out.push('Sem resposta: ' + unknown.join(', '));
  return out;
}

// --- Kick: resgate de +15% XP com pontos do canal ---
const KICK_SHEET = `(()=>{const b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/^\\d+([.,]\\d+)?( mil)?$/.test(b.innerText.trim()))[0];
  if(!b) return null; const open=/Pontos do canal/.test(document.body.innerText)&&[...document.querySelectorAll('button')].some(x=>x.offsetParent&&/XP PokeIdle/i.test(x.innerText));
  b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {open, pts:b.innerText.trim(), x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}})()`;
const kickRedeemJs = (match) => `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); const vis=f=>[...document.querySelectorAll('button')].find(b=>b.offsetParent&&!b.disabled&&f(b.innerText.trim()));
  const wait=async(f,ms)=>{const t=Date.now(); while(Date.now()-t<ms){const b=vis(f); if(b) return b; await sl(200);} return null};
  const rw=await wait(x=>/^\\d/.test(x)&&x.includes(${JSON.stringify(match)}),4000); if(!rw) return 'recompensa indisponível (pausada pelo canal ou lista não abriu)';
  rw.click(); const go=await wait(x=>x==='Resgatar',4000); if(!go) return 'botão Resgatar não apareceu (pontos insuficientes?)';
  go.click(); await sl(2200); return 'ok'})()`;
async function kickRedeem(slug, count, reward) {
  const R = KICK_REWARDS[reward || 'xp'];
  const tab = findTab('kick', slug);
  if (!tab || !onHost(tab)) throw new Error('a live desse canal não está aberta no app');
  const wc = tab.view.webContents;
  const detail = [];
  let done = 0;
  let before = null;
  for (let i = 0; i < count; i++) {
    const s = await js(tab, KICK_SHEET);
    if (!s) throw new Error('contador de pontos não encontrado (a Kick está logada?)');
    if (before === null) before = s.pts;
    if (!s.open) {
      // O clique de verdade precisa da aba desenhada; ela volta a ficar invisível no fim.
      forceVisible = tab.id;
      layout();
      await sleep(400);
      await clickAt(wc, s.x, s.y);
      await sleep(1300);
    }
    const r = await js(tab, kickRedeemJs(R.match));
    await pressKey(wc, 'Escape');
    await sleep(700);
    if (r !== 'ok') {
      detail.push(`Resgate ${i + 1}: ${r}`);
      break;
    }
    done++;
  }
  await sleep(1500);
  forceVisible = null;
  layout();
  const after = await js(tab, KICK_SHEET);
  detail.unshift(`Canal ${slug}: ${done} de ${count} resgates de ${R.label} feitos`, `Pontos: ${before} → ${after ? after.pts : '?'}`, 'O jogo credita as horas em até um minuto.');
  return { ok: done === count, done, detail };
}
// Automático: sempre que um canal aberto tiver pontos para 1 h, resgata (as horas acumulam no jogo).
async function autoKick() {
  const ch = channels().find((c) => c.kind === 'kick' && c.open && c.hours >= 1);
  if (!ch) return;
  running = 'Resgate automático na Kick';
  try {
    const r = await kickRedeem(ch.slug, 1);
    record({ title: `Kick: resgate automático de 1 h de +15% XP em ${ch.slug}`, ok: r.ok, detail: r.detail });
    // Recompensa pausada ou outro bloqueio: não insiste a cada ciclo.
    if (!r.ok) {
      settings.auto.kick = false;
      saveSettings();
      record({ title: 'Kick: resgate automático desligado após falha', ok: false, detail: ['Religue no painel quando quiser tentar de novo.'] });
    }
  } catch (e) {
    record({ title: 'Kick: resgate automático falhou', ok: false, detail: [e.message] });
  } finally {
    running = null;
  }
}

// --- Jogo: troca de área ---
async function goHunt(a) {
  const g = gameTab();
  const detail = [];
  await gameJs('window.__pkHold(true)');
  try {
    const before = await gameJs('window.__huntNow()');
    detail.push('Antes: ' + (before.hud || 'sem área'));
    const c = await gameJs('window.__gotoCentro()');
    if (!c.ok) throw new Error('não consegui sair para o Centro: ' + (c.why || 'tempo esgotado'));
    detail.push(c.already ? 'Já estava no Centro' : `Saiu para o Centro em ${Math.round(c.ms / 1000)} s${c.gaveUp ? ' desistindo do combate (custa 10% do XP do nível), porque o dano não dava trégua' : ''}`);
    const m = await gameJs(`window.__mapLocate(${JSON.stringify(a.slug)})`);
    if (!m.ok) throw new Error(m.why);
    await clickAt(g.view.webContents, m.x, m.y);
    const w = await gameJs('window.__waitHunt(9000)');
    detail.push('Depois: ' + (w.hud || '?'));
    if (!w.ok) throw new Error('cliquei na área, mas a caça não começou');
    return { ok: true, detail };
  } catch (e) {
    detail.push('Falha: ' + e.message);
    await gameJs('window.__waitHunt(500)').catch(() => {});
    return { ok: false, detail };
  } finally {
    await gameJs('window.__pkHold(false)').catch(() => {});
  }
}

// --- Login das lives pelo Chrome normal ---
const SAME_SITE = { Lax: 'lax', Strict: 'strict', None: 'no_restriction' };
async function importCookies(cookies) {
  let n = 0;
  for (const k of cookies) {
    const host = k.domain.replace(/^\./, '');
    const c = { url: `http${k.secure ? 's' : ''}://${host}${k.path}`, name: k.name, value: k.value, path: k.path, secure: k.secure, httpOnly: k.httpOnly };
    if (k.domain.startsWith('.')) c.domain = k.domain;
    if (k.expires > 0) c.expirationDate = k.expires;
    if (SAME_SITE[k.sameSite]) c.sameSite = SAME_SITE[k.sameSite];
    try {
      await ses().cookies.set(c);
      n++;
    } catch (e) {}
  }
  return n;
}
async function loginLives() {
  running = 'Login das lives: entre na Twitch e na Kick no Chrome e feche a janela';
  sendStatus();
  await browserLogin.loginWindow();
  running = 'Login das lives: trazendo a sessão para o app';
  sendStatus();
  const cookies = await browserLogin.readCookies();
  const s = browserLogin.summary(cookies);
  const written = await importCookies(cookies);
  for (const t of streamTabs()) t.view.webContents.reload();
  return {
    ok: s.twitchSession || s.kick > 0,
    detail: [
      `Twitch: ${s.twitch} cookies, sessão ${s.twitchSession ? 'encontrada' : 'NÃO encontrada (o login não foi concluído?)'}`,
      `Kick: ${s.kick} cookies`,
      `${written} gravados no app; ${streamTabs().length} lives recarregadas`,
    ],
  };
}

async function collectGame() {
  const g = gameTab();
  if (!g || !onHost(g)) return null;
  const st = await js(g, 'window.__pkState ? window.__pkState() : null').catch(() => null);
  if (st) g.state = Object.assign(st, { at: Date.now() });
  return g.state;
}
const nf = (n) => Math.round(n).toLocaleString('pt-BR');

// Teste de área: caça alguns minutos na candidata, compara o XP por hora medido e fica na melhor.
async function trial(a) {
  const g0 = await collectGame();
  if (!g0 || !g0.hunting || !g0.area) return { ok: false, detail: ['Preciso estar caçando numa área conhecida para comparar.'] };
  if (!g0.rates.xp) return { ok: false, detail: ['O ritmo da área atual ainda está sendo medido (uns 3 minutos).'] };
  const base = { area: g0.area, xph: g0.rates.xp };
  const min = cfg.areas.trialMinutes;
  const detail = [`Área de partida: ${base.area.name} Nv ${base.area.lv}, ${nf(base.xph)} XP/h medidos`];
  const go = await goHunt(a);
  detail.push(...go.detail);
  if (!go.ok) return { ok: false, detail };
  await gameJs('window.__pk.resetRates()');
  running = `Medindo ${a.name} por ${min} min`;
  sendStatus();
  await sleep(min * 60000 + 30000);
  const g1 = await collectGame();
  const got = g1 && g1.hunting && g1.area && g1.area.slug === a.slug && g1.rates.xp ? g1.rates.xp : 0;
  const kept = got >= base.xph * 1.03;
  settings.measures[base.area.slug] = { at: Date.now(), xph: base.xph, kept: true };
  settings.measures[a.slug] = { at: Date.now(), xph: got, kept };
  saveSettings();
  detail.push(got ? `${a.name}: ${nf(got)} XP/h medidos (${Math.round((got / base.xph) * 100)}% da área de partida)` : `${a.name}: não deu para medir (o personagem caiu ou saiu da área)`);
  if (kept) {
    detail.push('Resultado: fica na área nova.');
    return { ok: true, detail };
  }
  const back = await goHunt(base.area);
  detail.push(`Resultado: voltou para ${base.area.name}.`, ...back.detail);
  return { ok: back.ok, detail };
}

const DEPOT_RESULT = {
  bloqueado: 'Automações travadas: o app não reconheceu a tela do jogo (veja o alerta no topo do painel)',
  vendido: 'Depot revisado: o que não batia a regra foi vendido',
  vazio: 'Depot vazio, nada a fazer',
  'só guardados': 'Depot revisado: tudo o que havia foi para a Coleção',
  skip: 'Não rodou: há uma janela aberta no jogo ou outra automação em andamento',
};

// Cada ação: título e explicação mostrados nas duas confirmações, e o que ela faz.
// confirm: false só nas que apenas leem informação.
const ACTIONS = {
  refresh: {
    confirm: false,
    title: () => 'Verificação geral',
    run: async () => {
      const r = await poll();
      await collect();
      const g = gameTab() && gameTab().state;
      const detail = g && g.logged ? [`Treinador Nv ${g.lv} · ${g.hud || 'sem área'}`, `Estoque: ${g.pot} poções, ${g.rev} revives, ${g.balls} Ultra Balls`, `Bônus: Twitch ${g.twitch || 'nenhum'}, Kick ${g.kick || 'não lido'}`] : ['Jogo sem login'];
      return { ok: true, detail: detail.concat(r ? liveSummary(r) : []) };
    },
  },
  restock: {
    title: () => 'Repor o estoque agora',
    detail: () => `Compra poções, revives e Ultra Balls até cobrir ${cfg.restock.hours} horas de uso, gastando Coins e mantendo ${cfg.restock.reserve.toLocaleString('pt-BR')} de reserva.`,
    run: async () => {
      const r = await gameJs('window.__restockCheck(true)');
      return { ok: !/falhou|Erro|sem leitura|skip|bloqueado/.test(r), detail: [r === 'nada' ? 'Estoque já cobre o período; nada comprado' : r === 'skip' ? DEPOT_RESULT.skip : r] };
    },
  },
  depot: {
    title: () => 'Revisar e vender o Depot agora',
    detail: () => `Guarda na Coleção shiny, P${cfg.keep.potencia}+, qualidade ${cfg.keep.qualidade}+ ou nota ${cfg.keep.nota}+ e VENDE o resto ao NPC. A venda não pode ser desfeita.`,
    run: async () => {
      const r = await gameJs('window.__depotReview()');
      return { ok: r in DEPOT_RESULT && r !== 'skip', detail: [DEPOT_RESULT[r] || 'Resultado: ' + r, 'Os pokémon vendidos e guardados aparecem nas entradas do jogo logo acima.'] };
    },
  },
  areas: {
    confirm: false,
    title: () => 'Calcular as melhores áreas de caça',
    run: async () => {
      const r = await gameJs('window.__huntAdvice()');
      if (!r.ok) return { ok: false, detail: [r.why] };
      return { ok: true, detail: [`${r.total} áreas liberadas avaliadas com ${r.me}; a lista está no painel.`] };
    },
  },
  centro: {
    title: () => 'Ir para o Centro Pokémon',
    detail: () => 'Interrompe a caça atual. O personagem fica parado no Centro até você escolher outra área.',
    run: async () => {
      const c = await gameJs('window.__gotoCentro()');
      // Marca que a parada foi pedida, para a proteção não levar o personagem de volta.
      if (c.ok) {
        settings.parked = true;
        saveSettings();
      }
      return { ok: c.ok, detail: [c.ok ? (c.already ? 'Já estava no Centro' : `No Centro em ${Math.round(c.ms / 1000)} s${c.gaveUp ? ' (desistindo do combate: 10% do XP do nível)' : ''}`) : c.why || 'tempo esgotado', 'A proteção contra parada fica suspensa até você escolher uma área.'] };
    },
  },
  recover: {
    title: (a) => `Voltar para ${a.name} (Nv ${a.lv})`,
    detail: () => 'Cura a equipe no Centro e entra de novo na última área. Só repõe o estoque se a Recompra automática estiver ligada.',
    run: async (a) => {
      const g = await collectGame();
      if (g && g.hunting) return { ok: true, detail: ['Já estava caçando de novo.'] };
      const detail = [(await gameJs('window.__heal ? window.__heal() : false')) ? 'Equipe curada no Centro' : 'Botão de curar não encontrado'];
      // Só compra se a recompra automática estiver ligada: a proteção não gasta Coins por conta própria.
      if (g && settings.auto.restock && (g.pot < 100 || g.rev < 10 || g.balls < 100)) detail.push('Estoque: ' + (await gameJs('window.__restockCheck(true)')));
      else if (g && (g.pot < 30 || g.rev < 5)) detail.push('Estoque quase no fim e a recompra automática está desligada.');
      const h = await goHunt(a);
      return { ok: h.ok, detail: detail.concat(h.detail) };
    },
  },
  trial: {
    title: (a) => `Testar ${a.name} (Nv ${a.lv}) por ${cfg.areas.trialMinutes} min`,
    detail: () => `Sai da área atual, caça ${cfg.areas.trialMinutes} minutos na nova, compara o XP por hora medido e fica na melhor das duas. A caça para cerca de um minuto em cada troca.`,
    run: trial,
  },
  passe: {
    title: () => 'Resgatar a recompensa diária do Passe',
    detail: () => 'Resgata a recompensa grátis do dia. Não compra nada.',
    run: async () => {
      const r = await gameJs('window.__passeClaim()');
      return { ok: r.ok, detail: [r.ok ? (r.claimed ? `Resgatado: ${r.label} (dia ${r.day || '?'})` : `Nada para resgatar agora: ${r.why}`) : r.why] };
    },
  },
  stones: {
    title: () => 'Anunciar as pedras que sobram',
    detail: () => `Anuncia no Mercado da Comunidade as pedras da bolsa além de ${cfg.market.keepStones} por tipo, 1 Coin abaixo do menor preço de outro vendedor. A taxa de 15% sai na venda.`,
    run: async () => {
      const r = await gameJs('window.__sellStones()');
      if (!r.ok) return { ok: false, detail: [r.why] };
      const lines = r.listed.map((x) => `${x.qty}× ${x.name} a ${nf(x.price)}`);
      return { ok: true, detail: (lines.length ? lines : [r.why || 'Nada anunciado']).concat(r.skipped || []) };
    },
  },
  flipScan: {
    confirm: false,
    title: () => 'Radar de flip do mercado',
    run: async () => {
      const r = await gameJs('window.__flipScan()');
      if (!r.ok) return { ok: false, detail: [r.why] };
      return { ok: true, detail: [`${r.scanned} itens lidos com orçamento de ${nf(r.budget)}; ${r.opps.length} oportunidade(s). O detalhe está na entrada do jogo logo acima e no painel.`] };
    },
  },
  flipRun: {
    title: (o) => `Flip: comprar ${o.units}× ${o.name} e reanunciar`,
    detail: (o) => `Gasta até ${nf(o.cost)} Coins comprando os anúncios até ${nf(o.buyMax)} e reanuncia perto de ${nf(o.resale)}. Lucro estimado ${nf(o.profit)} se tudo vender; se o preço cair, o lote pode ficar parado.`,
    run: async (o) => {
      const r = await gameJs(`window.__flipRun(${JSON.stringify(o)})`);
      return { ok: r.ok, detail: [r.ok ? `Comprado ${r.bought}× por ${nf(r.spent)}, anunciado a ${nf(r.price)}; lucro se vender tudo: ${nf(r.profit)}` : r.why] };
    },
  },
  team: {
    title: () => 'Montar a equipe com as reservas mais fortes',
    detail: () => 'Vai ao Centro (a caça para por cerca de um minuto), troca as 4 reservas pelos pokémon de maior nível e nota da Coleção, guarda na Coleção quem saiu e volta para a área.',
    run: async () => {
      const g = await collectGame();
      const back = (g && g.area) || settings.lastHunt;
      const detail = [];
      await gameJs('window.__pkHold(true)');
      let c;
      try {
        c = await gameJs('window.__gotoCentro()');
      } finally {
        await gameJs('window.__pkHold(false)').catch(() => {});
      }
      if (!c.ok) return { ok: false, detail: ['Não consegui ir ao Centro: ' + (c.why || 'tempo esgotado')] };
      const r = await gameJs('window.__teamBest()');
      detail.push(...(r.ok ? (r.changed.length ? r.changed : [r.why]) : ['Falha: ' + r.why]));
      if (back) {
        const h = await goHunt(back);
        detail.push(...h.detail);
        return { ok: r.ok && h.ok, detail };
      }
      return { ok: r.ok, detail };
    },
  },
  evolve: {
    title: () => 'Evoluir o pokémon em campo',
    detail: () => 'Evolui o pokémon que está caçando, se o nível e a pedra exigidos estiverem cumpridos. A evolução não pode ser desfeita.',
    run: async () => {
      const r = await gameJs('window.__evolve()');
      return { ok: r.ok, detail: [r.ok ? `${r.before} → ${r.after}` : r.why].concat(r.pre ? [r.pre] : []) };
    },
  },
  oferenda: {
    title: () => 'Oferenda com tudo o que está no Depot',
    detail: () => 'Primeiro guarda na Coleção o que bate a regra; depois oferece TODO o resto do Depot em troca de chance de pedras. Os pokémon oferecidos não voltam.',
    run: async () => {
      const k = await gameJs('window.__depotReview(true)');
      if (k === 'vazio' || k === 'só guardados') return { ok: true, detail: ['Depot sem nada para oferecer' + (k === 'só guardados' ? ' (o que havia foi para a Coleção)' : '')] };
      if (k !== 'guardados') return { ok: false, detail: [DEPOT_RESULT[k] || 'Não consegui preparar o Depot: ' + k] };
      const r = await gameJs('window.__oferenda()');
      return { ok: r.ok, detail: r.ok ? r.results : [r.why] };
    },
  },
  hunt: {
    title: (a) => `Trocar a caça para ${a.name} (Nv ${a.lv})`,
    detail: () => 'O personagem sai para o Centro (a caça para por cerca de um minuto) e entra na nova área. A estimativa de XP é um cálculo, não uma garantia.',
    run: (a) => goHunt(a),
  },
  kickRedeem: {
    title: (a) => `Resgatar ${a.n} h de ${KICK_REWARDS[a.reward || 'xp'].label} com pontos do canal ${a.slug}`,
    detail: (a) => `Gasta ${(a.n * KICK_REWARDS[a.reward || 'xp'].cost).toLocaleString('pt-BR')} pontos do canal na Kick. O resgate não pode ser desfeito.`,
    run: (a) => kickRedeem(a.slug, a.n, a.reward),
  },
  login: {
    title: () => 'Fazer o login das lives pelo Chrome',
    detail: () => 'Abre uma janela do Chrome normal com a Twitch e a Kick. Entre nas duas contas e FECHE a janela; o app traz a sessão e recarrega as lives.',
    run: loginLives,
  },
  openLive: {
    title: (a) => `Abrir a live ${a.slug} (${a.kind})`,
    detail: () => 'A live passa a tocar em segundo plano dentro do app.',
    run: async (a) => {
      const key = a.kind + ':' + a.slug;
      settings.closed = settings.closed.filter((k) => k !== key);
      saveSettings();
      if (a.kind === 'kick' && settings.auto.lives && lastPoll) {
        const changes = [];
        const want = arrangeKick(lastPoll.kick, changes);
        if (!want.includes(a.slug)) return { ok: false, detail: [`A Kick só conta pontos em ${KICK_SLOTS} canais por vez e as vagas estão com ${want.join(' e ')}.`, 'Marque este canal como preferido na aba Lives para ele entrar.'] };
        return { ok: true, detail: ['Aberta.'].concat(changes) };
      }
      if (!findTab(a.kind, a.slug)) createTab(a.kind, a.slug, liveUrl(a.kind, a.slug));
      return { ok: true, detail: ['Aberta. O gerenciador volta a cuidar dela.'] };
    },
  },
  closeLive: {
    title: (a) => `Fechar a live ${a.slug} (${a.kind})`,
    detail: () => 'O canal deixa de contar para o bônus enquanto estiver fechado. O gerenciador só reabre depois que ele sair do ar e voltar.',
    run: async (a) => {
      const key = a.kind + ':' + a.slug;
      if (!settings.closed.includes(key)) settings.closed.push(key);
      saveSettings();
      const tab = findTab(a.kind, a.slug);
      if (tab) closeTab(tab.id);
      const detail = ['Fechada por você.'];
      // A vaga da Kick que ficou livre vai para o próximo canal ao vivo.
      if (a.kind === 'kick' && settings.auto.lives && lastPoll) arrangeKick(lastPoll.kick, detail);
      return { ok: true, detail };
    },
  },
};

// O que cada automação faz, para as duas confirmações ao ligar.
const AUTO_INFO = {
  watchdog: ['Ligar a proteção contra parada', 'Se o personagem ficar 5 minutos parado no Centro sem você ter pedido, o app cura a equipe e volta sozinho para a última área. Ele só repõe o estoque se a Recompra automática estiver ligada.'],
  guard: ['Ligar a proteção das automações do jogo', 'A cada minuto o app confere e religa o lançamento automático de bolas, o uso de poções, o revive e a volta à caça, e troca a bola ou poção selecionada se ela acabar.'],
  bestArea: ['Ligar a melhor área automática', 'Quando uma região nova é liberada, o app calcula as áreas, testa a melhor candidata por alguns minutos e fica nela só se o XP por hora medido for maior. Cada teste para a caça por cerca de dois minutos.'],
  passe: ['Ligar o resgate automático do Passe', 'O app resgata a recompensa grátis do Passe assim que ela libera. Não compra nada.'],
  stones: ['Ligar a venda automática de pedras', 'De hora em hora o app anuncia no Mercado da Comunidade as pedras que sobram na bolsa, 1 Coin abaixo do menor preço.'],
  flip: ['Ligar o flip automático', 'A cada 20 minutos o app procura anúncios baratos no Mercado da Comunidade, COMPRA com seus Coins (até o orçamento configurado) e reanuncia mais caro. Se o preço cair depois da compra, há prejuízo.'],
  restock: ['Ligar a recompra automática', 'O app passa a gastar Coins sozinho em poções, revives e Ultra Balls quando o estoque fica abaixo de 2 horas de uso.'],
  depot: ['Ligar a revisão automática do Depot', 'A cada 15 minutos o app guarda os nascimentos raros na Coleção e VENDE o resto ao NPC, sem perguntar.'],
  lives: ['Ligar o gerenciador de lives', 'O app passa a abrir sozinho os canais oficiais que entram ao vivo e a fechar os que saem. Na Kick ele mantém 2 lives abertas (só 2 contam pontos por vez), começando pelas suas preferidas.'],
  kick: ['Ligar o resgate automático da Kick', `Sempre que um canal aberto juntar ${KICK_HOUR} pontos, o app resgata 1 h de +15% XP sem perguntar.`],
};

// Roda uma ação sem perguntar (automações e encadeamentos) e registra do mesmo jeito que as manuais.
// Ações que não tocam no jogo continuam valendo quando a tela dele não é reconhecida.
const OFF_GAME = ['refresh', 'login', 'openLive', 'closeLive', 'kickRedeem'];
const blockedWhy = () => {
  const g = gameTab() && gameTab().state;
  return g && g.compat && g.compat.problems.length ? g.compat.problems[0] : null;
};
async function execute(name, args, title, src) {
  const A = ACTIONS[name];
  if (!A || running) return null;
  const label = title || A.title(args);
  const why = OFF_GAME.includes(name) ? null : blockedWhy();
  if (why) {
    // Pedido pelo painel fica registrado; as automações só ficam quietas (o alerta já explica).
    if (src === 'app') record({ kind: name, src, title: label, ok: false, detail: ['Automações travadas: ' + why + '.', 'Nada foi feito no jogo.'] });
    sendStatus();
    return { ok: false, detail: ['Automações travadas: ' + why] };
  }
  running = label;
  sendStatus();
  const t0 = Date.now();
  let res;
  try {
    res = await A.run(args);
  } catch (e) {
    res = { ok: false, detail: [e.message] };
  }
  running = null;
  const secs = (Date.now() - t0) / 1000;
  record({ kind: name, src: src || 'auto', title: label, ok: res.ok, detail: (res.detail || []).concat(`Duração: ${secs >= 90 ? (secs / 60).toFixed(1) + ' min' : secs.toFixed(1) + ' s'}`) });
  sendStatus();
  return res;
}

async function runAction(name, args) {
  const A = ACTIONS[name];
  if (!A) return;
  if (running) {
    dialog.showMessageBox(win, { type: 'info', title: 'Aguarde', message: 'Já existe uma ação em andamento:', detail: running, buttons: ['OK'] });
    return;
  }
  if (A.confirm !== false && !(await confirmOnce('acao:' + name, A.title(args), A.detail(args)))) return;
  await execute(name, args, null, 'app');
  collect();
}


// Pixels de anúncio e rastreadores que as páginas das lives disparam o tempo todo: não fazem parte do player.
const TRACKERS = [
  '*://*.doubleclick.net/*',
  '*://*.googlesyndication.com/*',
  '*://*.google-analytics.com/*',
  '*://*.googletagmanager.com/*',
  '*://*.facebook.com/tr/*',
  '*://*.facebook.net/*',
  '*://*.loopme.me/*',
  '*://*.gumgum.com/*',
  '*://*.fwmrm.net/*',
  '*://*.tracookiepixel.xyz/*',
  '*://*.useinsider.com/*',
  '*://*.datazoom.io/*',
  '*://*.scorecardresearch.com/*',
  '*://*.tiktok.com/*',
  '*://analytics.tiktok.com/*',
  '*://*.hotjar.com/*',
  '*://*.clarity.ms/*',
];

function createWindow() {
  ses().webRequest.onBeforeRequest({ urls: TRACKERS }, (_d, cb) => cb({ cancel: true }));

  win = new BrowserWindow({
    width: 1680,
    height: 940,
    title: 'PokéIdle Desk',
    icon: path.join(ROOT, 'icon.png'),
    backgroundColor: '#17151c',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(ROOT, 'ui', 'preload.js'), contextIsolation: true },
  });
  win.loadFile(path.join(ROOT, 'ui', 'index.html'));
  win.on('resize', layout);
  // Fechar a janela no meio de uma caça conta como derrota: o X só oculta o hub (ícone ao lado do relógio).
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  createTray();
  createTab('game', 'game', cfg.gameUrl, 'PokéIdle');
  setTimeout(poll, 8000);
  setInterval(poll, cfg.pollMinutes * 60000);
  setInterval(collect, 20000);
  setInterval(measurePerf, 20000);
  setTimeout(checkUpdate, 15000);
  setInterval(checkUpdate, 6 * 3600000);

  setTimeout(measureMemory, 30000);
  setInterval(measureMemory, 180000);
}

ipcMain.on('ui-ready', () => {
  sendTabs();
  sendStatus();
});
ipcMain.on('select', (_e, id) => select(id));
ipcMain.on('reload-active', () => tabs.get(activeId) && tabs.get(activeId).view.webContents.reload());
ipcMain.on('action', (_e, name, args) => runAction(name, args || {}));
const getPath = (obj, key) => key.split('.').reduce((o, p) => (o == null ? o : o[p]), obj);
const tunables = () => Object.fromEntries(Object.keys(TUNABLE).map((k) => [k, getPath(cfg, k)]));
// Ajuste numérico vindo do painel: valida, grava e aplica na hora no script do jogo.
ipcMain.on('set-config', (_e, key, raw) => {
  const lim = TUNABLE[key];
  const value = Number(raw);
  if (!lim || !isFinite(value) || value < lim[0] || value > lim[1]) return sendStatus();
  const before = getPath(cfg, key);
  if (before === value) return;
  setPath(cfg, key, value);
  userCfg[key] = value;
  fs.writeFile(USER_CFG, JSON.stringify(userCfg, null, 2), () => {});
  const g = gameTab();
  if (g && onHost(g)) {
    js(g, `window.__pk && (Object.assign(window.__pk.CFG, ${JSON.stringify(cfg.restock)}), Object.assign(window.__pk.KEEP, ${JSON.stringify(cfg.keep)}), window.__pk.MK && Object.assign(window.__pk.MK, ${JSON.stringify(cfg.market)}))`).catch(() => {});
  }
  record({ kind: 'ajuste', title: `Ajuste: ${key} de ${before} para ${value}`, ok: true });
  sendStatus();
});
// Cada opção pede as duas confirmações só na primeira vez; depois de aceita, não pergunta mais.
// "Voltar a pedir confirmações" (aba Ajustes) apaga essas permissões.
async function confirmOnce(key, title, detail) {
  if (settings.approved[key]) return true;
  const note = '\n\nDepois de confirmar, esta opção não pergunta mais. Para voltar a perguntar, use "Voltar a pedir confirmações" na aba Ajustes.';
  if (!(await confirm2(title, detail + note))) return false;
  settings.approved[key] = true;
  saveSettings();
  return true;
}
ipcMain.on('reset-approvals', () => {
  settings.approved = {};
  saveSettings();
  record({ kind: 'ajuste', title: 'Confirmações: todas as opções voltam a perguntar', ok: true });
  sendStatus();
});
ipcMain.on('toggle-panel', () => {

  settings.panel = !settings.panel;
  saveSettings();
  layout();
  sendStatus();
});
// Preferidos da Kick: marcar põe no fim da fila, desmarcar tira; as abas se rearrumam na hora.
ipcMain.on('set-kick-pref', (_e, slug, on) => {
  if (!cfg.kick.includes(slug)) return;
  const had = settings.kickPrefs.includes(slug);
  if (!!on === had) return sendStatus();
  settings.kickPrefs = on ? settings.kickPrefs.concat(slug) : settings.kickPrefs.filter((s) => s !== slug);
  saveSettings();
  const detail = [settings.kickPrefs.length ? 'Ordem de preferência: ' + settings.kickPrefs.join(', ') : 'Nenhum preferido: ficam abertas as primeiras lives oficiais que estiverem ao vivo.'];
  if (settings.auto.lives && lastPoll) arrangeKick(lastPoll.kick, detail);
  record({ kind: 'ajuste', title: `Kick: ${slug} ${on ? 'marcado como preferido' : 'deixou de ser preferido'}`, ok: true, detail });
  writeStatus();
  sendStatus();
});
ipcMain.on('set-auto', async (_e, key, on) => {
  if (!(key in settings.auto)) return;
  // Ligar pede as duas confirmações; desligar é imediato.
  if (on && !(await confirmOnce('auto:' + key, AUTO_INFO[key][0], AUTO_INFO[key][1]))) return sendStatus();
  settings.auto[key] = !!on;
  saveSettings();
  const g = gameTab();
  if (g && onHost(g)) js(g, `window.__pkAuto && Object.assign(window.__pkAuto, ${JSON.stringify(settings.auto)})`).catch(() => {});
  record({ kind: 'auto', title: `${AUTO_INFO[key][0].replace(/^Ligar/, 'Automação:')} — ${on ? 'ligada' : 'desligada'}`, ok: true, detail: [AUTO_INFO[key][1]] });
  sendStatus();
});
async function quitApp() {
  toggleHub(true);
  const warn = 'Se o personagem estiver caçando, fechar o app conta como derrota: vá ao Centro antes. As lives também param de contar para o bônus.';
  if (!(await confirm2('Fechar o PokéIdle Desk', warn))) return;
  quitting = true;
  app.quit();
}
ipcMain.on('quit', quitApp);
ipcMain.on('hide-hub', () => toggleHub(false));


if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('before-quit', () => (quitting = true));
  app.whenReady().then(createWindow);
}
