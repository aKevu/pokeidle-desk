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
// Metas da previsão: só as próximas cinco da sequência (o passo cresce com o nível). A lista anda junto com o progresso.
const REGIONS = [[150, 'Outland'], [500, 'Hoenn'], [1000, 'Sinnoh'], [5000, 'Unova'], [10000, 'Kalos'], [25000, 'Alola']];
// Passo da sequência: de 50 em 50 até o Nv 1.000, de 100 em 100 até 5.000, de 500 em 500 até 10.000 e de 1.000 em 1.000
// daí em diante, sem teto (Alola abre no 25.000 e tem áreas que pedem bem mais).
const stepAt = (lv) => (lv < 1000 ? 50 : lv < 5000 ? 100 : lv < 10000 ? 500 : 1000);
const levelTargets = (lv) => {
  const out = [];
  let cur = lv;
  for (let i = 0; i < 5; i++) {
    const st = stepAt(cur);
    cur = (Math.floor(cur / st) + 1) * st;
    out.push(cur);
  }
  return out;
};
// XP de um abate pelo nível da área: a fórmula do próprio jogo (shared/sell-value.mjs).
const xpKill = (n) => (n <= 150 ? Math.floor((6 * n * n) / 10) + 8 : Math.round(13500 * (n / 150) ** 1.25));
// Níveis das áreas de caça, para quando o jogo ainda não informou a escada dele.
const HUNT_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 100, 150, 500, 550, 600, 650, 700, 750, 800, 850, 1000, 1250, 1500, 2000, 2500, 3000, 5000, 6000, 6500, 8000, 10000, 12500, 15000, 20000, 25000, 30000, 50000];
// Horas até cada meta. O ritmo de hoje vale só para a área de hoje: a cada área nova que o nível libera, o XP por abate
// sobe pela fórmula do jogo. Supõe o mesmo número de abates por hora e os mesmos bônus de agora, e que você continua
// caçando na mesma altura em relação ao seu nível (hoje, área ÷ nível).
function project(g, rate, targets) {
  const out = new Map();
  const max = Math.max(...targets);
  const levels = (g.ladder && g.ladder.length ? g.ladder : HUNT_LEVELS).slice().sort((a, b) => a - b);
  const areaNow = g.area && g.area.lv > 0 ? g.area.lv : 0;
  const ratio = areaNow ? Math.min(1, Math.max(0.5, areaNow / g.lv)) : 0;
  const base = areaNow ? xpKill(areaNow) : 1;
  let i = 0;
  let hours = 0;
  for (let lv = g.lv; lv < max; lv++) {
    let area = areaNow;
    if (areaNow) {
      while (i + 1 < levels.length && levels[i + 1] <= lv * ratio) i++;
      if (levels[i] <= lv * ratio && levels[i] > area) area = levels[i];
    }
    const need = xpTotal(lv + 1) - xpTotal(lv) - (lv === g.lv ? g.xp : 0);
    hours += need / (areaNow ? (rate * xpKill(area)) / base : rate);
    if (targets.includes(lv + 1)) out.set(lv + 1, { hours, area });
  }
  return out;
}
const regionAt = (lv) => (REGIONS.find(([l]) => l === lv) || [])[1];
function eta(hours) {
  if (!isFinite(hours)) return '–';
  // Metas distantes: a hora do relógio deixa de fazer sentido, fica só a duração.
  const years = hours / (24 * 365);
  if (years >= 1) return `${years < 10 ? dec(years) : fmt(years)} anos`;
  if (hours >= 24 * 30) return `${fmt(Math.round(hours / 24))} dias`;
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

// --- Revisão da conta: o que merece atenção, com o botão que resolve quando existe um ---
let reviewAll = false;
let reviewOpen = true;
try {
  reviewOpen = localStorage.getItem('pk_review_open') !== '0';
} catch (e) {}
const RV_LABEL = { bad: 'Problema', warn: 'Atenção', info: 'Para saber', ok: 'Em ordem' };
function reviewCard(s) {
  const rv = s.settings.review;
  const nodes = [];
  const today = rv && new Date(rv.at).toDateString() === new Date().toDateString();
  const when = rv ? (today ? `feita às ${hhmm(rv.at)}` : `feita em ${new Date(rv.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`) : 'ainda não feita';
  // O título recolhe e mostra a revisão; recolhida, fica só uma linha com a contagem por nível.
  const head = h2('Revisão da conta', when);
  head.className = 'fold';
  const flip = () => {
    reviewOpen = !reviewOpen;
    try {
      localStorage.setItem('pk_review_open', reviewOpen ? '1' : '0');
    } catch (e) {}
    if (last) render(last);
  };
  const fold = btn(reviewOpen ? 'Recolher' : 'Mostrar', 'mini', flip, reviewOpen ? 'Recolher a revisão: fica só uma linha com a contagem' : 'Mostrar a revisão inteira');
  head.append(fold);
  nodes.push(head);
  const items = rv ? rv.items : [];
  if (!reviewOpen) {
    const count = (lv) => items.filter((i) => i.level === lv).length;
    const line = el('div', 'rv-sum');
    for (const [lv, label] of [['bad', 'problema(s)'], ['warn', 'atenção'], ['info', 'para saber'], ['ok', 'em ordem']]) {
      if (!count(lv)) continue;
      const part = el('span', 'rv ' + lv);
      part.append(el('i'), el('span', null, `${count(lv)} ${label}`));
      line.append(part);
    }
    if (!rv) line.append(el('span', null, 'Ainda não feita.'));
    line.onclick = flip;
    line.title = 'Mostrar a revisão';
    nodes.push(card([line]));
    return nodes;
  }
  const rows = [];
  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  const shown = items.filter((i) => reviewAll || i.level !== 'ok').sort((a, b) => order[a.level] - order[b.level]);
  for (const i of shown) {
    const d = el('div', 'rv ' + i.level);
    const dot = el('i');
    dot.title = RV_LABEL[i.level];
    const t = el('div');
    t.append(el('small', null, i.group), el('span', null, i.text));
    d.append(dot, t);
    if (i.action) d.append(actionBtn(s, i.action.label, i.action.name, true, null, i.action.args, 'mini primary'));
    rows.push(d);
  }
  const oks = items.filter((i) => i.level === 'ok').length;
  const bad = items.filter((i) => i.level === 'bad' || i.level === 'warn').length;
  if (!rv) rows.push(el('div', 'empty', 'Confere caça, bônus, estoque, lives, bolsa, PvP e o próprio app, e aponta o que merece atenção. Não muda nada na conta.'));
  else if (!shown.length) rows.push(el('div', 'empty', 'Tudo em ordem.'));
  if (rv && rv.partial) rows.push(el('div', 'note', 'Revisão parcial: havia uma janela aberta no jogo e a bolsa não foi lida.'));
  const go = actionBtn(s, rv ? 'Revisar de novo' : 'Revisar a conta agora', 'review', true, 'Abre a bolsa, o PvP e a janela da Kick no jogo por alguns segundos para ler; não compra, não vende e não troca nada', null, bad || !rv ? 'primary' : null);
  rows.push(go);
  if (oks) {
    rows.push(
      btn(reviewAll ? 'Esconder o que está em ordem' : `Mostrar os ${oks} pontos em ordem`, 'mini', () => {
        reviewAll = !reviewAll;
        if (last) render(last);
      })
    );
  }
  nodes.push(card(rows));
  return nodes;
}

// O jogo mostra o tempo que falta ("53m 47s") só enquanto há horas de bônus; sem horas o texto é outro.
const kickOn = (t) => /\d+\s*[hms]/i.test(t) && !/POR RESGATE/i.test(t);
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
  if (!logged || !g.hunting || (open && !tw && !kk) || !autoDone) {
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
      step(tw || kk, 'Entrar nas lives', open ? `Twitch ${tw ? 'ok' : 'sem login'} · Kick ${kk ? 'ok' : 'sem login'}. Abre o Chrome (ou o Edge); entre e feche a janela. Basta uma das duas.` : 'Nenhuma live oficial aberta agora para conferir.', actionBtn(s, 'Login das lives', 'login', true, null, null, 'mini primary')),
      step(logged && g.hunting, 'Começar a caçar', 'Escolha uma área no mapa do jogo. Daí em diante, se o personagem ficar 5 min parado no Centro, o app o leva de volta para essa área (dá para desligar na aba Auto, ou usar "Ir ao Centro" do painel para ele ficar parado).', s.settings.lastHunt && logged && !g.hunting ? actionBtn(s, 'Voltar: ' + s.settings.lastHunt.name, 'recover', true, null, s.settings.lastHunt, 'mini primary') : null),
      step(autoDone, 'Escolher as automações', 'Recompra, venda do Depot, pedras, Kick e flip vêm desligados. Ligue só o que quiser.', btn('Abrir Auto', 'mini primary', () => showPage('auto')))
    );
    nodes.push(h2('Primeiros passos'), card([steps]));
  }
  if (!logged) return nodes;
  nodes.push(...reviewCard(s));
  const notes = (g.compat && g.compat.notes) || [];
  if (notes.length) nodes.push(h2('Sobre a sua conta'), card(notes.map((n) => el('div', 'note', n))));
  const r = g.rates || {};
  const have = xpTotal(g.lv) + g.xp;
  const targets = levelTargets(g.lv);
  const proj = r.xp > 0 ? project(g, r.xp, targets) : new Map();
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
    h2('Previsão de nível', r.xp > 0 ? 'próximas 5 metas' : ''),
    card(
      targets.length && r.xp > 0
        ? targets.map((t) => {
            const p = proj.get(t);
            // Meta a mais de um ano não é previsão que valha mostrar.
            return row('Nv ' + fmt(t) + (regionAt(t) ? ' · abre ' + regionAt(t) : ''), p && p.hours < 24 * 365 ? eta(p.hours) : 'longe demais para estimar');
          })
        : [el('div', 'empty', 'Medindo o ritmo (uns 3 minutos de caça).')]
    ),
    h2('Estoque', `teto: ${fmt(s.config['restock.potMax'])} poções`),
    card([stockRow('Poções', g.pot, r.pot), row('Revives', fmt(g.rev), g.rev >= 0 && g.rev < 30 ? 'warn' : null), stockRow('Ultra Balls', g.balls, r.balls)]),
    h2('Bônus de XP'),
    card([
      row('Twitch', g.twitch ? '+' + g.twitch : 'sem live contando', g.twitch ? 'ok' : 'warn'),
      row('Kick (+15%)', !g.kick ? 'ainda não lido' : kickOn(g.kick) ? `${g.kick} restantes` : 'sem horas ativas agora', !g.kick ? null : kickOn(g.kick) ? 'ok' : 'warn'),
      row('Passe diário', x.passeNext && x.passeNext > Date.now() ? `próximo às ${hhmm(x.passeNext)}` : s.settings.auto.passe ? 'checando…' : 'automação desligada'),
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
      actionBtn(s, evolve || 'Evoluir', 'evolve', !!evolve, /mega/i.test(evolve || '') ? 'Mega evolução do pokémon em campo: precisa da Mega Stone da espécie na bolsa e não tem volta. Sem a pedra, nada acontece.' : 'Evolui o pokémon em campo, se o requisito estiver cumprido. Evolução não tem volta.'),
      actionBtn(s, 'Oferenda do Depot', 'oferenda', true, 'Oferece o que estiver no Depot em troca de chance de pedras', null, 'wide'),
    ]),
  ];
  const a = g.advice;
  const measures = s.settings.measures || {};
  const old = a && (Date.now() - a.at > 6 * 3600000 || (g.area && a.base && a.base.name !== g.area.name));
  const when = a ? (new Date(a.at).toDateString() === new Date().toDateString() ? `das ${hhmm(a.at)}` : `de ${new Date(a.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`) : '';
  nodes.push(h2('Áreas', a ? `estimativa ${when}` : ''));
  if (old) nodes.push(el('div', 'tip', `Estimativa desatualizada: foi calculada com ${a.me} caçando em ${a.base.name}. Ela se refaz sozinha depois de uns minutos de caça; "Calcular áreas" refaz agora.`));
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
    if (x.capGold > 0) bits.push(`capturas rendem ~${fmt(x.capGold)} Coins/h`);
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
      actionBtn(s, 'Conferir pontos da Kick', 'kickPoints', true, 'Lê na Kick quantos pontos você tem em cada canal oficial, aberto ou não, e guarda. Não gasta nada.', null, 'wide'),
    ]),
    el('div', 'note', 'Twitch: +15% de XP com 1 live e +2,5% por live extra. Kick: 10 pontos a cada 5 min por canal; 300 pontos = 1 h de +15% de XP.'),
  ];
  const slots = s.kickSlots || 2;
  const maxK = s.config.maxKick;
  // Quantas lives da Kick ficam abertas: − e + mudam na hora (o mesmo ajuste da aba Ajustes).
  const kickStepper = (n) => {
    const d = el('div', 'stepper');
    const less = btn('−', 'mini', () => window.pk.setConfig('maxKick', Math.max(0, n - 1)), 'Uma live da Kick a menos');
    const more = btn('+', 'mini', () => window.pk.setConfig('maxKick', Math.min(20, n + 1)), 'Uma live da Kick a mais (acima de 2 elas ficam abertas sem pontuar)');
    less.disabled = n <= 0;
    more.disabled = n >= 20;
    d.append(el('span', null, `Lives da Kick abertas: ${n}`), less, more);
    return d;
  };
  const kick = ch.filter((c) => c.kind === 'kick');
  if (kick.length) {
    nodes.push(
      el(
        'div',
        'tip',
        maxK > slots
          ? `Você escolheu manter ${maxK} lives da Kick abertas. Pelo que foi medido, a Kick só conta pontos em ${slots} canais ao mesmo tempo: as demais ficam abertas sem pontuar, gastando perto de 2% de CPU cada. As preferidas entram primeiro, na ordem em que você marcou.`
          : `A Kick só conta pontos em ${slots} canais ao mesmo tempo. Por isso o app mantém ${maxK} live(s) da Kick aberta(s): primeiro as suas preferidas que estiverem ao vivo, na ordem em que você marcou; se faltar, completa com outro canal oficial que esteja ao vivo.`
      ),
      kickStepper(maxK),
      el('div', 'note', 'Os canais oficiais da Kick são seguidos automaticamente pela sua conta quando abertos. Pontos guardados podem ser resgatados com a live fechada.'),
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
            if (!c.open && c.savedHours >= 1) btns.append(actionBtn(s, `XP ${c.savedHours} h`, 'kickRedeem', true, 'Resgatar os pontos guardados deste canal com a live fechada: o app abre a página do canal por alguns segundos, resgata e fecha', { slug: c.slug, n: c.savedHours, reward: 'xp' }, 'mini primary'));
            btns.append(btn(c.pref ? 'Remover' : 'Preferir', 'mini' + (c.pref ? '' : ' primary'), () => window.pk.setKickPref(c.slug, !c.pref), c.pref ? 'Tira este canal dos preferidos' : 'Este canal passa a ter prioridade nas vagas da Kick'));
            const seen = c.saved ? ` · ${fmt(c.saved.pts)} pontos${c.saved.approx ? ' (aprox.)' : ''}, vistos ${ago(c.saved.at)}` : ' · pontos ainda não conferidos';
            it.append(name, btns, el('div', 'meta', state + (c.open && c.points ? ` · ${c.points} pontos` : seen)));
            return it;
          })
      ),
      h2('Abertas e ao vivo')
    );
  }
  // Ao vivo primeiro; offline no fim, sem botões.
  const order = (c) => (c.open ? 0 : c.live === true ? 1 : c.live === null ? 2 : 3);
  const list = [...ch].filter((c) => c.open || (c.live !== false && (c.kind !== 'kick' || c.closedByUser))).sort((a, b) => order(a) - order(b));
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
    ['review', 'Revisão automática da conta', () => 'A cada 6 h confere caça, bônus, estoque, lives, bolsa, PvP e o próprio app, e aponta no Resumo o que merece atenção. Só lê.'],
    ['guard', 'Proteção das automações do jogo', () => 'Religa as automações do jogo (bola, poção, revive, volta à caça) que já estavam ligadas e se desligaram; troca o item selecionado se acabar.'],
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

// "há 3 h", "há 4 dias"
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 2 ? 'agora' : m < 60 ? `há ${m} min` : m < 36 * 60 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`;
};
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
    ['maxKick', 'Lives da Kick abertas', 'A Kick só conta pontos em 2 canais por vez; acima de 2 as outras ficam abertas sem pontuar. 0 fecha todas.'],
    ['kickQuality', 'Qualidade do vídeo da Kick', '160, 360, 480, 720 ou 1080; 0 deixa a Kick escolher. Menor gasta menos CPU. Vale nas lives abertas a partir de agora.'],
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
  const nodes = [el('div', 'note', 'Valem na hora e ficam guardados. A lista de canais oficiais é lida do próprio jogo.')];
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
          const cur = +(s.config[key] * k).toFixed(4);
          const lim = (s.limits || {})[key];
          inp.value = cur;
          if (lim) {
            inp.min = lim[0] * k;
            inp.max = lim[1] * k;
          }
          const small = el('small', null, help);
          inp.onchange = () => {
            const v = inp.value === '' ? NaN : +inp.value / k;
            if (!isFinite(v) || (lim && (v < lim[0] || v > lim[1]))) {
              inp.value = cur;
              small.textContent = lim ? `Valor recusado: use de ${dec(lim[0] * k, 2)} a ${dec(lim[1] * k, 2)}. Continua valendo ${dec(cur, 2)}.` : 'Valor recusado.';
              small.className = 'bad';
              return;
            }
            window.pk.setConfig(key, v);
          };
          f.append(el('span', null, label), inp, small);
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
