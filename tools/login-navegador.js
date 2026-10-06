#!/usr/bin/env node
// Mesma rotina do botão "Login das lives" do app, pela linha de comando.
//   node tools/login-navegador.js              abre o Chrome, espera o login e importa a sessão
//   node tools/login-navegador.js --so-importar   só importa o que já está no perfil de login
'use strict';
const { targets, connect } = require('./cdp');
const { loginWindow, readCookies, summary, SITES } = require('../lib/browser-login');

async function writeToApp(cookies) {
  const pages = await targets();
  const anchor = pages.find((t) => t.url.includes('pokeidle.io')) || pages[0];
  if (!anchor) throw new Error('o PokéIdle Desk não está aberto');
  const c = await connect(anchor);
  await c.send('Network.setCookies', {
    cookies: cookies.map((k) => {
      const o = { name: k.name, value: k.value, domain: k.domain, path: k.path, secure: k.secure, httpOnly: k.httpOnly };
      if (k.sameSite) o.sameSite = k.sameSite;
      if (k.expires > 0) o.expires = k.expires;
      return o;
    }),
  });
  c.close();
  let reloaded = 0;
  for (const t of pages.filter((t) => SITES.some((s) => t.url.includes(s)))) {
    const p = await connect(t);
    await p.send('Page.reload');
    p.close();
    reloaded++;
  }
  return reloaded;
}

async function main() {
  if (!process.argv.includes('--so-importar')) {
    console.log('Abrindo o Chrome. Entre na Twitch e na Kick e depois FECHE a janela.');
    await loginWindow();
  }
  const cookies = await readCookies();
  const s = summary(cookies);
  console.log(`Cookies lidos: twitch.tv ${s.twitch} (sessão ${s.twitchSession ? 'encontrada' : 'NÃO encontrada'}), kick.com ${s.kick}`);
  if (!cookies.length) throw new Error('nenhum cookie para importar: o login não foi feito nessa janela');
  const reloaded = await writeToApp(cookies);
  console.log(`Sessão gravada no PokéIdle Desk; ${reloaded} abas recarregadas.`);
}

main().catch((e) => {
  console.error('Falhou:', e.message);
  process.exit(1);
});
