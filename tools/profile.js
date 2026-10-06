#!/usr/bin/env node
// Perfil de CPU de uma aba por alguns segundos: mostra as funções que mais gastam.
//   node tools/profile.js <trecho-da-url> [segundos]
'use strict';
const { targets, connect } = require('./cdp');
(async () => {
  const [match, secs] = process.argv.slice(2);
  const t = (await targets()).find((x) => x.url.includes(match));
  if (!t) throw new Error('aba não encontrada: ' + match);
  const c = await connect(t);
  await c.send('Profiler.enable');
  await c.send('Profiler.start');
  await new Promise((r) => setTimeout(r, (+secs || 4) * 1000));
  const { profile } = await c.send('Profiler.stop');
  c.close();
  const self = new Map();
  const dt = profile.timeDeltas || [];
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const f = n.callFrame;
    const key = `${f.functionName || '(anônima)'} ${(f.url || '').split('/').pop().split('?')[0]}:${f.lineNumber}`;
    self.set(key, (self.get(key) || 0) + (dt[i] || 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log((v / total * 100).toFixed(1).padStart(5) + '%', k);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
