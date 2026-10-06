#!/usr/bin/env node
// Gera a versão para distribuir: dist/PokeIdle Desk-win32-x64 e o .zip correspondente.
//   npm run dist
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
// Nada pessoal entra no pacote: sessões de login, ajustes, histórico e estado ficam de fora.
const SKIP = [/^\/dist($|\/)/, /^\/chrome-login($|\/)/, /^\/tools($|\/)/, /^\/\.git($|\/)/, /^\/(settings|history|status|config\.user)\.json$/, /\.(log|zip)$/, /^\/shot-.*\.png$/, /^\/\.patch-edits\.txt$/];

(async () => {
  const { packager } = await import('@electron/packager');
  const [out] = await packager({
    dir: ROOT,
    name: pkg.productName,
    platform: 'win32',
    arch: 'x64',
    out: path.join(ROOT, 'dist'),
    overwrite: true,
    icon: path.join(ROOT, 'icon.ico'),
    prune: true,
    ignore: (p) => SKIP.some((re) => re.test(p)),
  });
  const zip = path.join(ROOT, 'dist', `PokeIdle-Desk-${pkg.version}-win-x64.zip`);
  fs.rmSync(zip, { force: true });
  // O tar do próprio Windows (não o do Git) cria .zip quando a extensão pede (-a).
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', path.dirname(out), path.basename(out)], { stdio: 'inherit' });
  console.log('pasta:', out);
  console.log('zip:', zip, Math.round(fs.statSync(zip).size / 1048576) + ' MB');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
