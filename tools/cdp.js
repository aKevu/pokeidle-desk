#!/usr/bin/env node
// Controle local do app pela porta de depuração (127.0.0.1).
//   node tools/cdp.js list
//   node tools/cdp.js eval <trecho-da-url> "<expressão>"   (ou @arquivo.js)
//   node tools/cdp.js shot <trecho-da-url> <saida.png>
//   node tools/cdp.js click <trecho-da-url> <x> <y>
//   node tools/cdp.js key <trecho-da-url> <tecla>
'use strict';
const fs = require('fs');
const path = require('path');

// A porta vem do config.json ou, se houver, do config.user.json (onde ela é ligada: "debugPort": 9333).
const read = (f) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  } catch (e) {
    return {};
  }
};
const PORT = read('config.user.json').debugPort || read('config.json').debugPort;
if (!PORT) {
  console.error('Porta de controle desligada. Crie config.user.json com {"debugPort": 9333} e reinicie o app.');
  process.exit(1);
}
const BASE = `http://127.0.0.1:${PORT}`;

async function targets() {
  const r = await fetch(BASE + '/json/list');
  return (await r.json()).filter((t) => t.type === 'page');
}

async function pick(match) {
  const list = await targets();
  const t = list.find((t) => t.url.includes(match)) || list.find((t) => t.id === match);
  if (!t) throw new Error(`nenhuma aba com "${match}". Abertas: ${list.map((t) => t.url).join(', ')}`);
  return t;
}

function connect(t) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            pending.set(++id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        close: () => ws.close(),
      });
    ws.onerror = (e) => reject(new Error('falha ao conectar: ' + (e.message || 'ws')));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    };
  });
}

async function main() {
  const [cmd, match, ...rest] = process.argv.slice(2);
  if (cmd === 'list') {
    for (const t of await targets()) console.log(t.id, '|', t.title, '|', t.url);
    return;
  }
  if (!cmd || !match) throw new Error('uso: list | eval | shot | click | key (veja o topo do arquivo)');
  const c = await connect(await pick(match));
  try {
    if (cmd === 'eval') {
      let expr = rest.join(' ');
      if (expr.startsWith('@')) expr = fs.readFileSync(expr.slice(1), 'utf8');
      const r = await c.send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      const v = r.result.value;
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    } else if (cmd === 'shot') {
      const r = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(rest[0], Buffer.from(r.data, 'base64'));
      console.log('salvo em', rest[0]);
    } else if (cmd === 'click') {
      const [x, y] = rest.map(Number);
      for (const type of ['mousePressed', 'mouseReleased'])
        await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      console.log('clique em', x, y);
    } else if (cmd === 'key') {
      for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: rest[0] });
      console.log('tecla', rest[0]);
    } else {
      throw new Error('comando desconhecido: ' + cmd);
    }
  } finally {
    c.close();
  }
}

module.exports = { targets, connect, BASE };

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
