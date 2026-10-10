'use strict';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const fmt = (n) => (n == null || n < 0 ? '–' : Math.round(n).toLocaleString('pt-BR'));
const mi = (n) => (n == null ? '–' : (n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi');
const dec = (n, d = 1) => (n == null ? '–' : n.toLocaleString('pt-BR', { maximumFractionDigits: d }));
const br = (x) => String(x).replace('.', ',');
const hhmm = (t) => new Date(t).toTimeString().slice(0, 5);
const stamp = (t) => {
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return (today ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + hhmm(t);
};
const fill = (box, nodes) => {
  box.textContent = '';
  box.append(...nodes.filter(Boolean));
};
const row = (label, value, cls) => {
  const r = el('div', 'row');
  r.append(el('span', null, label), el('span', cls, value));
  return r;
};
const btn = (label, cls, onclick, title) => {
  const b = el('button', cls, label);
  b.onclick = onclick;
  if (title) b.title = title;
  return b;
};
const h2 = (title, info) => {
  const h = el('h2', null, title);
  if (info) h.append(el('small', null, info));
  return h;
};
const card = (nodes) => {
  const c = el('div', 'card');
  c.append(...nodes.filter(Boolean));
  return c;
};
const act = (name, args) => () => window.pk.action(name, args);

// --- Abas das páginas (jogo e lives) na barra superior ---
window.pk.onTabs(({ active, tabs }) => {
  fill(
    $('tabs'),
    tabs.map((t) => {
      const b = el('button', 'tab ' + t.kind + (t.id === active ? ' on' : ''));
      b.append(el('span', 'dot'), el('span', null, t.title));
      b.title = t.kind === 'game' ? 'Jogo' : (t.kind === 'kick' ? 'Kick · ' : 'Twitch · ') + t.title;
      b.onclick = () => window.pk.select(t.id);
      return b;
    })
  );
});

// --- Abas do painel ---
const PAGES = [
  ['resumo', 'Resumo'],
  ['caca', 'Caça'],
  ['mercado', 'Mercado'],
  ['lives', 'Lives'],
  ['auto', 'Auto'],
  ['hist', 'Histórico'],
  ['ajustes', 'Ajustes'],
];
let page = 'resumo';
try {
  page = localStorage.getItem('pk_page') || 'resumo';
} catch (e) {}
if (!PAGES.some((p) => p[0] === page)) page = 'resumo';
let last = null;
// Automações que gastam Coins, vendem ou trocam pontos: desligadas numa instalação nova.
const SPENDING = ['restock', 'depot', 'kick', 'stones', 'flip', 'bestArea'];
let autoSeen = false;
try {
  autoSeen = localStorage.getItem('pk_auto_seen') === '1';
} catch (e) {}
function showPage(id) {
  page = id;
  if (id === 'auto') autoSeen = true;
  try {
    localStorage.setItem('pk_page', id);
    if (autoSeen) localStorage.setItem('pk_auto_seen', '1');
  } catch (e) {}
  $('body').scrollTop = 0;
  if (last) render(last);
}
function renderNav(s) {
  const counts = {
    lives: (s.channels || []).filter((c) => c.open).length || '',
    mercado: (s.game && s.game.extra && s.game.extra.flip && s.game.extra.flip.opps.length) || '',
  };
  fill(
    $('nav'),
    PAGES.map(([id, label]) => {
      const b = btn(label, id === page ? 'on' : null, () => showPage(id));
      if (counts[id] !== undefined && counts[id] !== '') b.append(el('span', 'n', String(counts[id])));
      return b;
    })
  );
  for (const [id] of PAGES) $('p-' + id).classList.toggle('on', id === page);
}

// XP acumulado do treinador até o início do nível L.
const xpTotal = (lv) => (50 / 3) * (lv ** 3 - 6 * lv ** 2 + 17 * lv - 12);
const TARGETS = [150, 200, 250, 300, 400, 500];
function eta(hours) {
  if (!isFinite(hours)) return '–';
  const when = new Date(Date.now() + hours * 3600000);
  const days = Math.floor((when.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const dur = hours < 1 ? Math.round(hours * 60) + ' min' : hours < 48 ? dec(hours) + ' h' : dec(hours / 24) + ' dias';
  return `${hhmm(when)}${days === 1 ? ' amanhã' : days > 1 ? ` +${days}d` : ''} · ${dur}`;
}
// Horas de estoque: verde a partir de 2 h, amarelo abaixo, vermelho abaixo de 1 h.
const stockRow = (label, have, perHour) => {
  if (have == null || have < 0) return row(label, '–');
  const h = perHour ? have / perHour : null;
  const cls = h == null ? null : h < 1 ? 'bad' : h < 2 ? 'warn' : 'ok';
  return row(label, fmt(have) + (h == null ? '' : ` · ${dec(h)} h`), cls);
};
// Botão de ação: desabilitado enquanto outra ação roda ou quando não se aplica.
const actionBtn = (s, label, name, enabled, title, args, cls) => {
  const b = btn(label, cls || null, act(name, args), title);
  b.disabled = !enabled || !!s.running;
  return b;
};
const grid = (nodes) => {
  const g = el('div', 'grid');
  g.append(...nodes.filter(Boolean));
  return g;
};

function renderHero(s) {
  const g = s.game;
  const top = el('div', 'top');
  const where = el('div', 'where');
  if (!g || !g.logged) {
    top.append(el('span', 'lv', 'PokéIdle Desk'));
    where.append(el('span', 'dot off'), el('span', null, g ? 'Jogo sem login' : 'Carregando o jogo…'));
  } else {
    top.append(el('span', 'lv', 'Nv ' + g.lv), el('span', 'xp', g.rates && g.rates.xp ? mi(g.rates.xp) + ' XP/h' : g.hunting ? 'medindo o ritmo…' : ''));
    where.append(el('span', 'dot ' + (g.hunting ? 'on' : 'off')), el('span', null, g.hunting ? g.hud : 'No Centro Pokémon (caça parada)'));
  }
  fill($('hero'), [top, where]);
  $('busy').classList.toggle('on', !!s.running);
  $('busy').textContent = s.running ? 'Em andamento: ' + s.running : '';
  const alerts = (s.alerts || []).map((a) => el('div', 'alert ' + a.level, a.text));
  if (s.update) {
    const u = el('div', 'alert info', `Versão ${s.update.version} disponível (você usa a ${s.version}). Clique para abrir a página de download.`);
    u.setAttribute('role', 'button');
    u.tabIndex = 0;
    u.onclick = () => window.pk.openUpdate();
    u.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && window.pk.openUpdate();
    alerts.push(u);
  }
  fill($('alertas'), alerts);
  const p = s.perf;
  $('footPerf').textContent = p ? `CPU ${dec(p.cpu)}% · ${p.mem == null ? 'memória medindo…' : p.mem >= 1024 ? dec(p.mem / 1024) + ' GB' : p.mem + ' MB'} · ${(s.channels || []).filter((c) => c.open).length} lives` : 'medindo o consumo…';
  $('footVer').textContent = 'v' + (s.version || '');
}

function pageResumo(s) {
  const g = s.game;
  const logged = !!(g && g.logged);
  const ch = s.channels || [];
  const tw = ch.some((c) => c.kind === 'twitch' && c.logged);
  const kk = ch.some((c) => c.kind === 'kick' && c.logged);
  const open = ch.some((c) => c.open);
  const nodes = [];
  // Automações que gastam ou vendem vêm desligadas; o passo some depois de abrir a aba Auto ou ligar alguma.
  const autoDone = autoSeen || SPENDING.some((k) => s.settings.auto[k]);
  // Primeiros passos: aparece enquanto falta algum.
  if (!logged || !g.hunting || (open && (!tw || !kk)) || !autoDone) {
    const step = (done, title, sub, button) => {
      const d = el('div', 'step' + (done ? ' done' : ''));
      const t = el('div');
      t.append(el('span', null, title), el('small', null, sub));
      d.append(t);
      if (button && !done) d.append(button);
      return d;
    };
    const steps = el('div', 'steps');
    steps.append(
      step(logged, 'Entrar no jogo', 'Na aba PokéIdle, com a sua conta.'),
      step(tw && kk, 'Entrar nas lives', open ? `Twitch ${tw ? 'ok' : 'sem login'} · Kick ${kk ? 'ok' : 'sem login'}. Abre o Chrome; entre e feche a janela.` : 'Nenhuma live oficial aberta agora para conferir.', actionBtn(s, 'Login das lives', 'login', true, null, null, 'mini primary')),
      step(logged && g.hunting, 'Começar a caçar', 'Escolha uma área no mapa do jogo; o app assume a partir daí.', s.settings.lastHunt && logged && !g.hunting ? actionBtn(s, 'Voltar: ' + s.settings.lastHunt.name, 'recover', true, null, s.settings.lastHunt, 'mini primary') : null),
      step(autoDone, 'Escolher as automações', 'Recompra, venda do Depot, pedras, Kick e flip vêm desligados. Ligue só o que quiser.', btn('Abrir Auto', 'mini primary', () => showPage('auto')))
    );
    nodes.push(h2('Primeiros passos'), card([steps]));
  }
  if (!logged) return nodes;
  const notes = (g.compat && g.compat.notes) || [];
  if (notes.length) nodes.push(h2('Sobre a sua conta'), card(notes.map((n) => el('div', 'note', n))));
  const r = g.rates || {};
  const have = xpTotal(g.lv) + g.xp;
  const targets = TARGETS.filter((t) => t > g.lv).slice(0, 4);
  const x = g.extra || {};
  nodes.push(
    h2('Conta'),
    card([
      row('Pokémon em campo', g.poke),
      row('Coins', fmt(g.gold)),
      row('Coins por hora (abates)', r.gold ? fmt(r.gold) : 'medindo…'),
      row('Vendidos ao NPC nesta sessão', g.stats.sold ? `${g.stats.sold} · ${fmt(g.stats.soldGold)}` : '0'),
      row('Guardados na Coleção nesta sessão', String(g.stats.kept)),
    ]),
    h2('Previsão de nível', r.xp > 0 ? 'no ritmo atual' : ''),
    card(targets.length && r.xp > 0 ? targets.map((t) => row('Nv ' + t, eta((xpTotal(t) - have) / r.xp))) : [el('div', 'empty', 'Medindo o ritmo (uns 3 minutos de caça).')]),
    h2('Estoque', `teto: ${fmt(s.config['restock.potMax'])} poções`),
    card([stockRow('Poções', g.pot, r.pot), row('Revives', fmt(g.rev), g.rev >= 0 && g.rev < 30 ? 'warn' : null), stockRow('Ultra Balls', g.balls, r.balls)]),
    h2('Bônus de XP'),
    card([
      row('Twitch', g.twitch ? '+' + g.twitch : 'sem live contando', g.twitch ? 'ok' : 'warn'),
      row('Kick (+15%)', g.kick ? `${g.kick} restantes` : 'ainda não lido', g.kick ? 'ok' : null),
      row('Passe diário', x.passeNext && x.passeNext > Date.now() ? `próximo às ${hhmm(x.passeNext)}` : 'checando…'),
    ]),
    h2('PvP Ranqueado', g.pvp && g.pvp.queued ? 'na fila' : ''),
    card(
      g.pvp && g.pvp.rank
        ? [
            row('Rank', `${g.pvp.rank}${g.pvp.pr != null ? ' · ' + fmt(g.pvp.pr) + ' PR' : ''}`),
            row('Busca', g.pvp.queued ? 'procurando partida' : 'parada ou em partida', g.pvp.queued ? 'ok' : null),
            x.pvp && x.pvp.wins != null ? row('Placar da semana', `${x.pvp.wins}V / ${x.pvp.losses}D · ${x.pvp.rate}%${x.pvp.pos ? ' · ' + fmt(x.pvp.pos) + 'º' : ''}`) : null,
          ].filter(Boolean)
        : [el('div', 'empty', 'Sem rank lido ainda.')]
    ),
    h2('Ações rápidas', 'cada uma pede confirmação só na primeira vez'),
    grid([
      actionBtn(s, 'Verificar agora', 'refresh', true, 'Atualiza jogo e lives e grava um resumo no histórico (não muda nada)'),
      actionBtn(s, 'Repor estoque', 'restock', true, 'Compra poções, revives e Ultra Balls até o período configurado, respeitando os tetos'),
      actionBtn(s, 'Revisar Depot', 'depot', true, 'Guarda os raros na Coleção e vende o resto ao NPC'),
      actionBtn(s, 'Resgatar Passe', 'passe', true, 'Resgata a recompensa grátis do dia, se já liberou'),
    ])
  );
  const p = s.perf;
  if (p) {
    nodes.push(
      h2('Desempenho', `${p.procs} processos`),
      card(
        [row('App inteiro', `${dec(p.cpu)}% de CPU${p.mem == null ? '' : ' · ' + fmt(p.mem) + ' MB'}`, p.cpu > 40 ? 'bad' : p.cpu > 20 ? 'warn' : 'ok')].concat(
          p.top.filter((t) => t.cpu >= 0.5).slice(0, 5).map((t) => row(t.name, `${dec(t.cpu)}%`)),
          [el('div', 'note', 'Com o hub oculto o jogo para de desenhar; cada live custa perto de 2,5% de CPU.')]
        )
      )
    );
  }
  return nodes;
}

function pageCaca(s) {
  const g = s.game;
  if (!g || !g.logged) return [el('div', 'empty', 'Entre no jogo para ver as áreas de caça.')];
  const hunting = g.hunting;
  const evolve = g.extra && g.extra.evolve;
  const lastHunt = s.settings.lastHunt;
  const nodes = [
    h2('Caça'),
    grid([
      actionBtn(s, 'Calcular áreas', 'areas', hunting, 'Estima o XP por hora de cada área liberada (não muda nada)', null, 'primary'),
      hunting ? actionBtn(s, 'Ir ao Centro', 'centro', true, 'Interrompe a caça atual') : actionBtn(s, lastHunt ? 'Voltar: ' + lastHunt.name : 'Voltar à área', 'recover', !!lastHunt, 'Cura a equipe e entra de novo na última área', lastHunt),
      actionBtn(s, 'Melhor equipe', 'team', true, 'Troca as reservas pelas mais fortes da Coleção (vai ao Centro e volta)'),
      actionBtn(s, evolve || 'Evoluir', 'evolve', !!evolve, 'Evolui o pokémon em campo, se o requisito estiver cumprido'),
      actionBtn(s, 'Oferenda do Depot', 'oferenda', true, 'Oferece o que estiver no Depot em troca de chance de pedras', null, 'wide'),
    ]),
  ];
  const a = g.advice;
  const measures = s.settings.measures || {};
  nodes.push(h2('Áreas', a ? `estimativa das ${hhmm(a.at)}` : ''));
  if (!a) {
    nodes.push(el('div', 'empty', 'Use "Calcular áreas" durante uma caça para comparar as áreas liberadas.'));
    return nodes;
  }
  nodes.push(el('div', 'note', `Calculado com ${a.me} a partir de ${fmt(a.base.xph)} XP/h medidos em ${a.base.name}. "Testar" caça ${s.areasCfg.trialMinutes} min na área, mede e fica na melhor.`));
  for (const x of a.list) {
    const it = el('div', 'item' + (x.current ? ' cur' : ''));
    const name = el('div', 'name');
    name.append(el('span', null, `${x.name} · Nv ${x.lv}${x.current ? ' (atual)' : ''}`));
    const m = measures[x.slug];
    const bits = [`estimado ${mi(x.xph)}/h`];
    if (m && m.xph) bits.push(`medido ${mi(m.xph)}/h`);
    bits.push(`${dec(x.sKill)} s por abate`, `vantagem ×${dec(x.mult, 2)}`);
    if (x.risk != null) bits.push(`dano recebido ×${dec(x.risk, 2)}`);
    bits.push(`capturas ~${fmt(Math.max(0, x.capGold))}/h`);
    const btns = el('div', 'btns');
    const arg = { slug: x.slug, name: x.name, lv: x.lv };
    if (!x.current) {
      btns.append(actionBtn(s, 'Testar', 'trial', hunting, `Caçar ${s.areasCfg.trialMinutes} min em ${x.name}, medir e ficar na melhor`, arg, 'mini'));
      btns.append(actionBtn(s, 'Ir', 'hunt', true, `Sair para o Centro e entrar em ${x.name}`, arg, 'mini primary'));
    }
    it.append(name, btns, el('div', 'meta', bits.join(' · ')));
    nodes.push(it);
  }
  return nodes;
}

function pageMercado(s) {
  const g = s.game;
  if (!g || !g.logged) return [el('div', 'empty', 'Entre no jogo para usar o mercado.')];
  const f = g.extra && g.extra.flip;
  const nodes = [
    h2('Mercado da Comunidade'),
    grid([
      actionBtn(s, 'Vender pedras', 'stones', true, `Anuncia as pedras além de ${s.config['market.keepStones']} por tipo, 1 Coin abaixo do menor preço`),
      actionBtn(s, 'Radar de flip', 'flipScan', true, 'Lê as escadas de preço (leva uns 3 minutos; não compra nada)', null, 'primary'),
    ]),
    el('div', 'note', `Flip: comprar os anúncios mais baratos de um item e reanunciar logo abaixo do degrau seguinte. Orçamento ${fmt(s.config['market.flipBudget'])} Coins, margem mínima ${Math.round(s.config['market.flipMargin'] * 100)}% já descontada a taxa de 15%.`),
    h2('Oportunidades', f ? `radar das ${hhmm(f.at)}` : ''),
  ];
  if (!f) nodes.push(el('div', 'empty', 'Nenhuma leitura ainda.'));
  else if (!f.opps.length) nodes.push(el('div', 'empty', `Nenhuma oportunidade em ${f.scanned} itens.`));
  for (const o of (f && f.opps) || []) {
    const it = el('div', 'item');
    const name = el('div', 'name');
    name.append(el('span', null, `${o.name} · lucro ${fmt(o.profit)} (${Math.round(o.margin * 100)}%)`));
    const btns = el('div', 'btns');
    btns.append(actionBtn(s, 'Executar', 'flipRun', true, 'Comprar e reanunciar agora', o, 'mini primary'));
    it.append(name, btns, el('div', 'meta', `comprar ${o.units} até ${fmt(o.buyMax)} (${fmt(o.cost)}) e revender a ${fmt(o.resale)} · ${fmt(o.sold7)} vendidos em 7 dias`));
    nodes.push(it);
  }
  return nodes;
}

function pageLives(s) {
  const ch = s.channels || [];
  const nodes = [
    h2('Lives oficiais', s.lastPoll ? `checado às ${hhmm(s.lastPoll.at)}` : 'ainda não checado'),
    grid([
      actionBtn(s, 'Login das lives', 'login', true, 'Abre o Chrome normal; entre na Twitch e na Kick e feche a janela', null, 'primary'),
      actionBtn(s, 'Verificar agora', 'refresh', true, 'Confere quais canais oficiais estão ao vivo'),
    ]),
    el('div', 'note', 'Twitch: +15% de XP com 1 live e +2,5% por live extra. Kick: 10 pontos a cada 5 min por canal; 300 pontos = 1 h de +15% de XP.'),
  ];
  const slots = s.kickSlots || 2;
  const kick = ch.filter((c) => c.kind === 'kick');
  if (kick.length) {
    nodes.push(
      el('div', 'tip', `A Kick só conta pontos em ${slots} canais ao mesmo tempo. Por isso o app mantém ${slots} lives da Kick abertas: primeiro as suas preferidas que estiverem ao vivo, na ordem em que você marcou; se faltar, completa com outro canal oficial que esteja ao vivo.`),
      h2('Preferidos da Kick', kick.some((c) => c.pref) ? 'na ordem de prioridade' : 'nenhum marcado')
    );
    const rank = (c) => (c.pref ? c.pref : 100 + (c.open ? 0 : c.live === true ? 1 : 2));
    nodes.push(
      card(
        [...kick]
          .sort((a, b) => rank(a) - rank(b))
          .map((c) => {
            const it = el('div', 'item' + (c.open ? ' cur' : ''));
            const name = el('div', 'name');
            name.append(el('span', 'dot kick'), el('span', null, (c.pref ? c.pref + 'º · ' : '') + c.slug));
            const state = c.open ? 'aberta, ocupando uma vaga' : c.closedByUser ? 'ao vivo, fechada por você' : c.live === true ? 'ao vivo, sem vaga' : c.live === false ? 'offline' : 'sem resposta';
            const btns = el('div', 'btns');
            btns.append(btn(c.pref ? 'Remover' : 'Preferir', 'mini' + (c.pref ? '' : ' primary'), () => window.pk.setKickPref(c.slug, !c.pref), c.pref ? 'Tira este canal dos preferidos' : 'Este canal passa a ter prioridade nas vagas da Kick'));
            it.append(name, btns, el('div', 'meta', state + (c.points ? ` · ${c.points} pontos` : '')));
            return it;
          })
      ),
      h2('Abertas e ao vivo')
    );
  }
  // Ao vivo primeiro; offline no fim, sem botões.
  const order = (c) => (c.open ? 0 : c.live === true ? 1 : c.live === null ? 2 : 3);
  const list = [...ch].filter((c) => c.open || c.live !== false).sort((a, b) => order(a) - order(b));
  if (!list.length) nodes.push(el('div', 'empty', 'Nenhum canal oficial ao vivo agora.'));
  for (const c of list) {
    const it = el('div', 'item');
    const name = el('div', 'name');
    name.append(el('span', 'dot ' + c.kind), el('span', null, `${c.kind === 'kick' ? 'Kick' : 'Twitch'} · ${c.slug}`));
    const state = !c.open ? (c.closedByUser ? 'fechada por você' : c.live === null ? 'sem resposta' : c.kind === 'kick' ? 'ao vivo, sem vaga' : 'ao vivo, não aberta') : c.playing === null ? 'carregando' : c.playing ? 'tocando' : 'parada';
    const login = c.open && c.logged === false ? ' · sem login' : '';
    const meta = el('div', 'meta ' + (c.open && c.playing && !login ? 'ok' : c.open ? 'warn' : ''), state + login + (c.points ? ` · ${c.points} pontos` : ''));
    const btns = el('div', 'btns');
    if (c.kind === 'kick' && c.open) {
      for (const [key, r] of Object.entries(s.kickRewards || {})) {
        const n = Math.floor(c.pts / r.cost);
        if (n < 1) continue;
        const label = key === 'xp' ? `XP ${n} h` : key === 'capture' ? 'Captura' : 'Shiny';
        btns.append(actionBtn(s, label, 'kickRedeem', true, `Trocar pontos deste canal por ${r.label}`, { slug: c.slug, n: key === 'xp' ? n : 1, reward: key }, 'mini' + (key === 'xp' ? ' primary' : '')));
      }
    }
    // Na Kick quem decide as vagas é a preferência; "Abrir" só aparece para desfazer um "Fechar".
    if (c.open) btns.append(actionBtn(s, 'Fechar', 'closeLive', true, 'Para de assistir este canal', c, 'mini'));
    else if (c.kind !== 'kick' || c.closedByUser) btns.append(actionBtn(s, 'Abrir', 'openLive', true, 'Abre este canal em segundo plano', c, 'mini'));
    it.append(name, btns, meta);
    nodes.push(it);
  }
  const off = [...new Set(ch.filter((c) => c.live === false && !c.open).map((c) => c.slug))];
  if (off.length) nodes.push(el('div', 'note', 'Offline: ' + off.join(', ')));
  return nodes;
}

const AUTOS = [
  ['Proteções', [
    ['watchdog', 'Proteção contra parada', () => 'Parado 5 min no Centro sem você pedir: cura e volta para a última área. Só repõe o estoque se a Recompra estiver ligada.'],
    ['guard', 'Proteção das automações do jogo', () => 'Religa bola, poção, revive e volta à caça se desligarem; troca o item selecionado se acabar.'],
  ]],
  ['Rotina', [
    ['restock', 'Recompra automática', (s) => `Repõe para ${s.config['restock.hours']} h de uso quando sobra menos de 2 h, até os tetos dos Ajustes.`],
    ['depot', 'Revisar e vender o Depot', (s) => `A cada 15 min guarda shiny, P${s.config['keep.potencia']}+, qualidade ${br(s.config['keep.qualidade'])}+, nota ${br(s.config['keep.nota'])}+ e ${s.config['keep.reservas']} reservas por espécie; vende o resto ao NPC.`],
    ['passe', 'Resgatar o Passe diário', () => 'Resgata a recompensa grátis assim que libera.'],
    ['bestArea', 'Melhor área automática', (s) => `Região nova liberada: testa ${s.config['areas.trialMinutes']} min a melhor candidata e fica só se medir mais XP.`],
  ]],
  ['Lives', [
    ['lives', 'Gerenciar as lives', () => 'Abre os canais oficiais que entram ao vivo e fecha os que saem. Na Kick mantém 2 abertas, começando pelas preferidas.'],
    ['kick', 'Resgatar XP da Kick', (s) => `Quando um canal junta ${s.kickHour} pontos, resgata 1 h de +15% de XP.`],
  ]],
  ['PvP', [
    ['pvp', 'Manter a fila do PvP', () => 'Confere se a busca do Ranqueado continua e religa a fila automática do jogo (VIP) quando cai. Perder não custa XP.'],
  ]],
  ['Mercado', [
    ['stones', 'Vender pedras que sobram', (s) => `De hora em hora anuncia as pedras além de ${s.config['market.keepStones']} por tipo, 1 Coin abaixo do menor preço.`],
    ['flip', 'Flip automático', (s) => `A cada 20 min compra anúncios baratos e reanuncia. Usa seus Coins (até ${fmt(s.config['market.flipBudget'])}); pode dar prejuízo se o preço cair.`],
  ]],
];
function pageAuto(s) {
  const nodes = [el('div', 'note', 'As automações que gastam Coins, vendem pokémon ou trocam pontos vêm desligadas: ligue só as que quiser. Cada uma pede confirmação só na primeira vez que é ligada; desligar é imediato. Tudo o que elas fazem aparece no Histórico.')];
  for (const [group, items] of AUTOS) {
    nodes.push(h2(group));
    nodes.push(
      card(
        items.map(([key, title, desc]) => {
          const on = !!s.settings.auto[key];
          const d = el('div', 'sw' + (on ? ' on' : ''));
          d.append(el('b', null, title), el('span', 'track'), el('small', null, desc(s)));
          d.setAttribute('role', 'switch');
          d.setAttribute('aria-checked', String(on));
          d.tabIndex = 0;
          const toggle = () => window.pk.setAuto(key, !on);
          d.onclick = toggle;
          d.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && toggle();
          return d;
        })
      )
    );
  }
  return nodes;
}

// Histórico: entradas com detalhe abrem o resumo ao clicar; o filtro fica entre atualizações.
const FILTERS = [
  ['tudo', 'Tudo', () => true],
  ['acoes', 'Ações', (l) => l.src === 'app' && l.kind !== 'alerta' && l.kind !== 'ajuste'],
  ['auto', 'Automático', (l) => l.src === 'auto' || l.src === 'jogo'],
  ['alertas', 'Alertas', (l) => l.kind === 'alerta'],
  ['falhas', 'Falhas', (l) => l.ok === false],
];
let filter = 'tudo';
const openLogs = new Set();
function pageHist(s) {
  const test = FILTERS.find((f) => f[0] === filter)[2];
  const logs = [...(s.history || [])].filter(test).sort((a, b) => b.t - a.t).slice(0, 120);
  const chips = el('div', 'chips');
  chips.append(...FILTERS.map(([id, label]) => btn(label, id === filter ? 'on' : null, () => ((filter = id), render(last)))));
  const nodes = [h2('Histórico', 'clique numa entrada para ver o resumo'), chips];
  if (!logs.length) nodes.push(el('div', 'empty', 'Nada aqui ainda.'));
  for (const l of logs) {
    const key = l.t + '|' + l.title;
    const has = l.detail && l.detail.length;
    const d = el('div', 'log' + (has ? ' has' : '') + (l.ok === false ? ' fail' : ''));
    d.append(el('b', null, stamp(l.t) + ' '), l.title);
    if (has) {
      d.append(el('span', 'caret', openLogs.has(key) ? ' ▾' : ' ▸'));
      d.onclick = () => {
        openLogs.has(key) ? openLogs.delete(key) : openLogs.add(key);
        render(last);
      };
      if (openLogs.has(key)) {
        const box = el('div', 'detail');
        box.append(...l.detail.map((t) => el('div', null, t)));
        box.onclick = (e) => e.stopPropagation();
        d.append(box);
      }
    }
    nodes.push(d);
  }
  return nodes;
}

// Ajustes: [chave, rótulo, explicação, fator de exibição (0,1 → 10%)]
const FIELDS = [
  ['Estoque', [
    ['restock.hours', 'Horas de estoque', 'Quanto a recompra tenta manter, pelo consumo medido.'],
    ['restock.potMax', 'Teto de poções', 'Nunca compra além disso (0 = sem teto).'],
    ['restock.ballMax', 'Teto de Ultra Balls', 'Nunca compra além disso (0 = sem teto).'],
    ['restock.revMax', 'Teto de revives', 'Nunca compra além disso (0 = sem teto).'],
    ['restock.reserve', 'Reserva de Coins', 'A recompra e o flip nunca deixam o saldo abaixo disso.'],
  ]],
  ['Capturas que ficam na Coleção', [
    ['keep.potencia', 'Potência mínima', 'P deste valor para cima é guardado.'],
    ['keep.qualidade', 'Qualidade mínima', 'Qualidade deste valor para cima é guardada.'],
    ['keep.nota', 'Nota mínima', 'Nota deste valor para cima é guardada.'],
    ['keep.reservas', 'Reservas por espécie', 'Os melhores de cada espécie ficam até completar este número.'],
    ['keep.reservaNivel', 'Nível mínimo da reserva', 'A regra das reservas só vale deste nível para cima.'],
  ]],
  ['Lives', [
    ['maxTwitch', 'Máximo de lives da Twitch', 'Cada live custa perto de 2,5% de CPU.'],
    ['maxKick', 'Lives da Kick abertas (0 a 2)', 'A Kick só conta pontos em 2 canais por vez; 0 fecha todas.'],
  ]],
  ['Mercado', [
    ['market.keepStones', 'Pedras guardadas por tipo', 'O que passar disso é anunciado.'],
    ['market.flipBudget', 'Orçamento do flip (Coins)', 'Máximo gasto numa compra de flip.'],
    ['market.flipMargin', 'Margem mínima do flip (%)', 'Lucro mínimo já descontada a taxa de 15%.', 100],
  ]],
  ['Áreas de caça', [
    ['areas.minGain', 'Ganho mínimo para testar (%)', 'A candidata precisa prometer pelo menos isso a mais.', 100],
    ['areas.maxRisk', 'Dano recebido máximo (×)', 'Em relação à área atual.'],
    ['areas.trialMinutes', 'Minutos de teste', 'Tempo caçando na candidata antes de decidir.'],
  ]],
  ['Desempenho', [['gameFps', 'Quadros por segundo do jogo', 'Limite ao desenhar o mapa (0 = sem limite). Vale no próximo início.']]],
];
let ajustesKey = '';
function pageAjustes(s) {
  const nodes = [el('div', 'note', 'Valem na hora e ficam guardados. As listas de canais oficiais ficam no arquivo config.json.')];
  const asked = Object.keys(s.settings.approved || {}).length;
  const reset = btn('Voltar a pedir confirmações', 'wide', () => window.pk.resetApprovals(), 'As ações e automações voltam a pedir as duas confirmações na próxima vez');
  reset.disabled = !asked;
  nodes.push(h2('Confirmações', asked ? `${asked} opções já confirmadas` : 'nenhuma confirmada ainda'), grid([reset]));

  for (const [group, fields] of FIELDS) {
    nodes.push(h2(group));
    nodes.push(
      card(
        fields.map(([key, label, help, factor]) => {
          const f = el('label', 'field');
          const inp = el('input');
          inp.type = 'number';
          inp.step = 'any';
          const k = factor || 1;
          inp.value = +(s.config[key] * k).toFixed(4);
          inp.onchange = () => window.pk.setConfig(key, +inp.value / k);
          f.append(el('span', null, label), inp, el('small', null, help));
          return f;
        })
      )
    );
  }
  return nodes;
}

const RENDER = { resumo: pageResumo, caca: pageCaca, mercado: pageMercado, lives: pageLives, auto: pageAuto, hist: pageHist, ajustes: pageAjustes };
function render(s) {
  last = s;
  $('side').classList.toggle('off', !s.settings.panel);
  renderHero(s);
  renderNav(s);
  const box = $('p-' + page);
  // Não redesenha os Ajustes enquanto você digita, nem sem mudança nos valores.
  if (page === 'ajustes') {
    const key = JSON.stringify([s.config, Object.keys(s.settings.approved || {}).length]);
    if (box.contains(document.activeElement) || (key === ajustesKey && box.childElementCount)) return;
    ajustesKey = key;
  } else ajustesKey = '';
  // Trocar o conteúdo não pode mexer na rolagem de quem está lendo.
  const top = $('body').scrollTop;
  fill(box, RENDER[page](s));
  $('body').scrollTop = top;
}
window.pk.onStatus(render);

$('reload').onclick = () => window.pk.reload();
$('panel').onclick = () => window.pk.togglePanel();
$('hide').onclick = () => window.pk.hideHub();
$('quit').onclick = () => window.pk.quit();
window.pk.ready();
