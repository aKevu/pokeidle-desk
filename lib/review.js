// Revisão da conta: transforma o que o app já sabe ler (jogo, lives, bolsa, PvP, histórico) numa lista de pontos,
// cada um com nível (bad, warn, info, ok), texto e, quando há algo a fazer, a ação do painel que resolve.
// Não muda nada na conta: só lê e aponta.
'use strict';

const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const mi = (n) => (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
const pct = (n) => Math.round(n * 100) + '%';

module.exports = function buildReview(ctx) {
  const { g, scan, pv, channels, settings, cfg, update, history, perf, kickHour } = ctx;
  const items = [];
  const add = (level, group, text, action) => items.push(action ? { level, group, text, action } : { level, group, text });
  if (!g || !g.logged) {
    add('bad', 'Jogo', 'O jogo não está logado: entre na conta na aba PokéIdle.');
    return items;
  }
  const auto = settings.auto;

  // --- Caça ---
  const r = g.rates || {};
  if (!g.hunting) add('bad', 'Caça', settings.parked ? 'Personagem parado no Centro a seu pedido: a caça está parada.' : 'Personagem parado no Centro: a caça está parada.', settings.lastHunt ? { label: 'Voltar: ' + settings.lastHunt.name, name: 'recover', args: settings.lastHunt } : null);
  const adv = g.advice;
  if (g.hunting && adv && adv.list && adv.list.length) {
    const cur = adv.list.find((x) => x.current);
    const best = adv.list.find((x) => !x.current && (x.risk == null || x.risk <= cfg.areas.maxRisk));
    if (cur && best && best.xph > cur.xph * (1 + cfg.areas.minGain)) {
      add('warn', 'Caça', `Há área com estimativa melhor que a atual: ${best.name} Nv ${best.lv}, ${mi(best.xph)} XP/h contra ${mi(cur.xph)} em ${cur.name} (+${pct(best.xph / cur.xph - 1)}). É estimativa: "Testar" mede de verdade e só fica se render mais.`, {
        label: 'Testar',
        name: 'trial',
        args: { slug: best.slug, name: best.name, lv: best.lv },
      });
    } else if (cur) add('ok', 'Caça', `${cur.name} Nv ${cur.lv} é a melhor área pela estimativa (${fmt(adv.total)} áreas liberadas avaliadas)${r.xp ? ', rendendo ' + mi(r.xp) + ' XP/h' : ''}.`);
  } else if (g.hunting) add('info', 'Caça', 'Ainda sem estimativa das áreas: ela se faz sozinha depois de uns minutos de caça, ou em Caça → "Calcular áreas".');
  const nextArea = (g.ladder || []).find((x) => x > g.lv);
  if (nextArea) add('ok', 'Caça', `Próximo degrau de áreas libera no Nv ${fmt(nextArea)} (você está no ${fmt(g.lv)}).`);

  // --- Bônus de XP ---
  if (scan) {
    if (!scan.vip) add('warn', 'Bônus', 'Sem VIP ativo: faltam o +50% de XP e o lançamento automático de bolas.');
    else {
      const d = scan.vip.match(/(\d+)\s*dia/);
      const days = d ? +d[1] : 0;
      if (days <= 5) add('warn', 'Bônus', `VIP vence em ${d ? days + ' dia(s)' : 'menos de um dia'}: sem ele somem o +50% de XP e o lançamento automático de bolas. 30 dias custam 10 diamantes na Loja.`);
      else add('ok', 'Bônus', `VIP ativo por mais ${days} dias.`);
    }
    add(scan.guild ? 'ok' : 'info', 'Bônus', scan.guild ? `Boost da Guild ativo (${scan.guild.replace(/^Boost Guild\s*/, '')}).` : 'Sem Boost da Guild ativo (ele liga quando o banco da guild enche).');
    if (scan.event) add('ok', 'Bônus', 'Evento em andamento: ' + scan.event.replace(/^EVENTO!\s*/, '') + '.');
  }
  const open = channels.filter((c) => c.open);
  const tw = open.filter((c) => c.kind === 'twitch');
  const kk = open.filter((c) => c.kind === 'kick');
  if (!tw.length) add(channels.some((c) => c.kind === 'twitch' && c.live) ? 'warn' : 'info', 'Bônus', 'Nenhuma live da Twitch aberta: sem o bônus de +15% de XP.');
  else if (tw.every((c) => c.logged === false)) add('bad', 'Bônus', 'Twitch sem login no app: as lives abertas não contam.', { label: 'Login das lives', name: 'login', args: {} });
  else if (g.twMore) add('warn', 'Bônus', `Twitch em ${g.twitch || '0%'}, mas o jogo avisa que há live oficial no ar que não está aberta.`, { label: 'Verificar lives', name: 'refresh', args: {} });
  else add('ok', 'Bônus', `Twitch: +${g.twitch || '0%'} de XP com ${tw.length} live(s) aberta(s).`);
  const stuck = open.filter((c) => c.playing === false && c.live === true);
  if (stuck.length) add('warn', 'Lives', `Vídeo parado em: ${stuck.map((c) => c.kind + ' ' + c.slug).join(', ')}. O app recarrega a aba sozinho; se continuar, feche e abra a live.`);
  const kickOn = g.kick && /\d+\s*[hms]/i.test(g.kick) && !/POR RESGATE/i.test(g.kick);
  const ready = kk.filter((c) => c.pts >= kickHour);
  if (kk.length && kk.every((c) => c.logged === false)) add('bad', 'Bônus', 'Kick sem login no app: os pontos não estão sendo contados.', { label: 'Login das lives', name: 'login', args: {} });
  else if (ready.length && !auto.kick) {
    const c = ready[0];
    add('warn', 'Bônus', `${ready.reduce((n, x) => n + Math.floor(x.pts / kickHour), 0)} h de +15% de XP paradas em pontos da Kick (${ready.map((x) => `${x.slug}: ${x.points}`).join(', ')}) e o resgate automático está desligado.`, {
      label: `Resgatar ${c.slug}`,
      name: 'kickRedeem',
      args: { slug: c.slug, n: Math.floor(c.pts / kickHour), reward: 'xp' },
    });
  } else if (kickOn) add('ok', 'Bônus', `Kick: +15% de XP ativo por mais ${g.kick}${auto.kick ? ' (resgate automático ligado)' : ''}.`);
  else add('info', 'Bônus', `Kick: sem horas de +15% ativas agora${kk.length ? ` (pontos: ${kk.map((c) => `${c.slug} ${c.points || '?'}`).join(', ')}; cada 300 valem 1 h)` : ' e nenhuma live da Kick aberta'}. Com 2 lives contando, os pontos pagam cerca de 48 min de bônus por hora assistida.`);

  // --- Estoque ---
  const R = cfg.restock;
  const hours = (have, per) => (per > 0 && have >= 0 ? have / per : null);
  const hp = hours(g.pot, r.pot);
  const hb = hours(g.balls, r.balls);
  if (g.pot >= 0 && (g.pot < 30 || (hp != null && hp < 1))) add('bad', 'Estoque', `Poções para menos de 1 h (${fmt(g.pot)}).`, { label: 'Repor', name: 'restock', args: {} });
  else if (g.pot >= 0 && R.potMax > 0 && g.pot > R.potMax * 3) add('info', 'Estoque', `${fmt(g.pot)} poções na bolsa, bem acima do teto de ${fmt(R.potMax)} que a recompra respeita${hp ? ` (dá para ${fmt(hp)} h no consumo atual)` : ''}. A recompra não compra poção enquanto estiver assim.`);
  else if (g.pot >= 0) add('ok', 'Estoque', `Poções: ${fmt(g.pot)}${hp ? ` (${fmt(hp)} h)` : ''}.`);
  if (g.rev >= 0 && g.rev < 10) add('bad', 'Estoque', `Só ${g.rev} revives.`, { label: 'Repor', name: 'restock', args: {} });
  else if (g.rev >= 0) add('ok', 'Estoque', `Revives: ${fmt(g.rev)}.`);
  if (g.balls >= 0 && (g.balls < 30 || (hb != null && hb < 1))) add('warn', 'Estoque', `Ultra Balls para menos de 1 h (${fmt(g.balls)}).`, { label: 'Repor', name: 'restock', args: {} });
  else if (g.balls >= 0) add('ok', 'Estoque', `Ultra Balls: ${fmt(g.balls)}${hb ? ` (${fmt(hb)} h)` : ''}.`);
  if (!auto.restock) add('info', 'Estoque', 'A recompra automática está desligada: o estoque depende de você.');

  // --- Bolsa e Coleção ---
  if (scan) {
    const tokens = (scan.rare.find((x) => /Boss Token/i.test(x.name)) || {}).qty || 0;
    if (tokens > 0) add('info', 'Bolsa', `${fmt(tokens)} Bronze Boss Token parados na bolsa. Servem para entrar em boss ou vender no Mercado da Comunidade (o app não vende tokens).`);
    const frags = scan.rare.filter((x) => /Fragmento/i.test(x.name) && x.qty > 0);
    if (frags.length) add('info', 'Bolsa', 'Fragmentos na bolsa: ' + frags.map((x) => `${x.qty}× ${x.name}`).join(', ') + '. São os itens mais valiosos do Mercado.');
    const keep = cfg.market.keepStones;
    const extra = scan.stones.filter((x) => x.qty > keep);
    const n = extra.reduce((t, x) => t + x.qty - keep, 0);
    if (n >= 10) add(auto.stones ? 'ok' : 'info', 'Bolsa', `${fmt(n)} pedras além da reserva de ${keep} por tipo (${extra.map((x) => `${x.qty} ${x.name.replace(/ Stone$/, '')}`).join(', ')})${auto.stones ? '; a venda automática cuida delas.' : '. "Vender pedras" anuncia no Mercado.'}`, auto.stones ? null : { label: 'Vender pedras', name: 'stones', args: {} });
    if (scan.collection != null) add(scan.collection > 300 ? 'info' : 'ok', 'Bolsa', `${fmt(scan.collection)} pokémon na Coleção${scan.collection > 300 ? ': dá para subir a regra do que é guardado em Ajustes, ou vender os repetidos no Mercado' : ''}.`);
  }
  if (!auto.depot) add('info', 'Bolsa', 'A revisão automática do Depot está desligada: as capturas ficam acumulando lá.');

  // --- PvP ---
  const p = g.pvp || {};
  const info = pv && pv.info;
  if (p.rank) {
    const base = `${p.rank}${p.pr != null ? ', ' + fmt(p.pr) + ' PR' : ''}${info && info.wins != null ? `, ${info.wins}V/${info.losses}D (${info.rate}%)` : ''}${info && info.pos ? `, ${fmt(info.pos)}º de ${fmt(info.of)}` : ''}.`;
    if (!p.queued && !(info && info.searching) && !auto.pvp) add('info', 'PvP', base + ' A busca está parada e a automação "Manter a fila do PvP" está desligada. Perder no PvP não custa XP.');
    else add('ok', 'PvP', base + (auto.pvp ? ' A fila é mantida pelo app.' : ''));
    const team = (info && info.team) || [];
    const low = team.filter((l) => l <= 150).length;
    if (team.length && low >= 3 && Math.max(...team) >= 300) add('info', 'PvP', `${low} dos ${team.length} pokémon da equipe de PvP estão no Nv ${Math.min(...team)}. No PvP o nível conta inteiro até 150 e comprimido daí para cima, então a reserva baixa é o que segura a taxa de vitória. Só o top 100 da semana ganha prêmio.`);
  }

  // --- Automações desligadas que costumam valer a pena ---
  const off = [
    ['watchdog', 'proteção contra parada'],
    ['guard', 'proteção das automações do jogo'],
    ['lives', 'gerenciador de lives'],
    ['passe', 'Passe diário'],
    ['kick', 'resgate da Kick'],
  ].filter(([k]) => !auto[k]);
  if (off.length) add('info', 'App', 'Automações desligadas: ' + off.map((x) => x[1]).join(', ') + '.');

  // --- O próprio app ---
  if (update) add('warn', 'App', `Há versão nova do PokéIdle Desk: ${update.version}.`);
  const day = Date.now() - 24 * 3600000;
  // "Ainda medindo o ritmo" não é falha: é o cálculo de áreas pedido cedo demais, que se refaz sozinho.
  const fails = history.filter((h) => h.t > day && h.ok === false && h.kind !== 'alerta' && h.kind !== 'review' && !(h.detail || []).some((d) => /ainda medindo/.test(d)));
  if (fails.length) {
    const kinds = {};
    for (const f of fails) {
      const k = f.title.replace(/[\d.,]+/g, '#').slice(0, 60);
      kinds[k] = (kinds[k] || 0) + 1;
    }
    const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 3);
    add('warn', 'App', `${fails.length} falha(s) nas últimas 24 h: ${top.map(([k, n]) => `${n}× ${k}`).join('; ')}. Os detalhes estão no Histórico, filtro "Falhas".`);
  } else add('ok', 'App', 'Nenhuma falha de ação ou automação nas últimas 24 h.');
  if (g.compat && g.compat.problems && g.compat.problems.length) add('bad', 'App', 'Automações travadas: ' + g.compat.problems[0] + '.');
  if (perf && perf.cpu > 45) add('info', 'App', `O app está usando ${fmt(perf.cpu)}% de CPU. Cada live aberta custa perto de 2%; ocultar o hub alivia o jogo.`);
  return items;
};
