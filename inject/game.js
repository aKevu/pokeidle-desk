// Injetado no jogo a cada carregamento: atalhos de controle, automações de rotina e estado para o painel.
(() => {
  // Reinjetar troca a versão em uso: os timers da anterior são encerrados e o registro é mantido.
  (window.__pkTimers || []).forEach(clearInterval);
  const timers = (window.__pkTimers = []);
  const every = (fn, ms) => timers.push(setInterval(fn, ms));
  window.__pkGame = true;

  const P = window.__PK_CFG || {};
  const CFG = Object.assign(
    { potMin: 250, potBuy: 500, potMax: 1200, revMin: 30, revBuy: 60, revMax: 150, ballMin: 400, ballBuy: 1000, ballMax: 3000, reserve: 100000, hours: 4 },

    P.restock || {}
  );
  const KEEP = Object.assign({ potencia: 3, qualidade: 1.5, nota: 2.5, reservas: 2, reservaNivel: 80 }, P.keep || {});
  window.__pkAuto = Object.assign({ restock: false, depot: false, guard: true, passe: true, stones: false, flip: false, pvp: false }, P.auto || {});

  // As animações de enfeite do jogo (brilho de botões, faixa de evento) redesenham a tela na taxa do monitor
  // e eram quase todo o custo de CPU e de vídeo dele; sem elas o jogo funciona igual.
  if (!document.getElementById('pk-noanim')) {
    const st = document.createElement('style');
    st.id = 'pk-noanim';
    st.textContent = '*,*::before,*::after{animation:none!important}';
    document.documentElement.appendChild(st);
  }

  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (x) => +String(x).replace(/\./g, '');

  const dec = (a, b) => +(a + '.' + b);
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  // O registro sobrevive a recargas da página (localStorage) e a reinjeções (window.__pkLogs).
  const LOG_KEY = 'pk_logs_v1';
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  } catch (e) {}
  const logs = (window.__pkLogs = window.__pkLogs || saved);
  // detail: linhas mostradas no painel ao clicar na entrada.
  const note = (msg, detail) => {
    logs.push(detail && detail.length ? { t: Date.now(), msg, detail } : { t: Date.now(), msg });
    if (logs.length > 100) logs.splice(0, logs.length - 100);
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch (e) {}
  };

  window.__top = () => [...document.querySelectorAll('.modal-caixa')].filter((m) => m.offsetParent).pop();
  window.__clk = (t) => {
    const m = window.__top() || document;
    const b = [...m.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    if (!b) return 'nf';
    b.click();
    return 'ok';
  };
  window.__menu = (t) => {
    const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t && b.offsetParent);
    if (!b) return 'nf';
    b.click();
    return 'ok';
  };
  window.__any = (t) => {
    const b = [...document.querySelectorAll('button')].filter((b) => b.offsetParent && b.textContent.trim() === t).pop();
    if (!b) return 'nf';
    b.click();
    return 'ok';
  };
  window.__mtxt = (a, b) => {
    const m = window.__top();
    return m ? m.innerText.replace(/\n+/g, ' ').slice(a || 0, b || 900) : 'no modal';
  };
  const closeAll = async () => {
    for (let n = 0; n < 6 && window.__top(); n++) {
      window.__clk('×');
      await sl(350);
    }
  };

  const sheet = () => document.body.innerText.replace(/\n+/g, ' | ');
  window.__rd = () => {
    const t = sheet();
    const m = t.match(/Nv (\d+) \| ([\d.]+) \/ ([\d.]+) xp \| ([\d.]+)/);
    // O nome aceita qualquer caractere (Mr. Mime, Farfetch'd, Ho-Oh…).
    const c = t.match(/EM CAMPO \| ([^|]+?) Nv (\d+).*?\| (\d+) \/ (\d+) \| ([\d.]+) \/ ([\d.]+) xp/);
    return {
      lv: +m[1],
      xp: num(m[2]),
      gold: num(m[4]),
      poke: c ? `${c[1].trim()} Nv ${c[2]} · HP ${fmt(+c[3])}/${fmt(+c[4])}` : '?',
      pokeName: c ? c[1].trim() : null,
      pokeLv: c ? +c[2] : 0,
      pxp: c ? num(c[5]) : 0,
      maxHp: c ? +c[4] : 0,
      balls: window.__ballsN(),
    };
  };
  // Estoque lido das fichas do painel de automações: cada ficha traz o nome do item no título e a quantidade no texto.
  // Quantidade ilegível vale -1 ("não sei"), nunca 0: com 0 a recompra compraria sem parar.
  const chips = (re) => {
    const list = [...document.querySelectorAll('.auto-chip')].filter((c) => re.test(c.title || ''));
    if (!list.length) return -1;
    let sum = 0;
    for (const c of list) {
      const t = c.innerText.trim();
      if (!/^[\d.]+$/.test(t)) return -1;
      sum += num(t);
    }
    return sum;
  };
  window.__stock = () => {
    const rev = chips(/Revive/);
    const pot = chips(/Potion/);
    if (rev >= 0 && pot >= 0) return { rev, pot };
    // Sem as fichas (tela diferente): leitura antiga, pelo texto do painel.
    const s = sheet();
    const seg = s.slice(s.indexOf('AUTOMAÇÕES')).slice(0, 320);
    const rv = seg.match(/desmaiar \| ([\d.]+) \| ([\d.]+)/);
    const pt = seg.match(/\d+% \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+)/);
    return {
      rev: rev >= 0 ? rev : rv ? num(rv[1]) + num(rv[2]) : -1,
      pot: pot >= 0 ? pot : pt ? pt.slice(1).reduce((a, b) => a + num(b), 0) : -1,
    };
  };
  window.__ballsN = () => {
    const n = chips(/^Ultra Ball/);
    if (n >= 0) return n;
    const b = [...document.querySelectorAll('#caidos-bolas .caidos-bola')].find((x) => /^Ultra Ball/.test(x.title || ''));
    const d = b ? b.title.replace(/\D/g, '') : '';
    return d ? +d : -1;
  };

  window.__buy = async (cat, name, qty) => {
    window.__menu('Market');
    await sl(1300);
    window.__clk('Compra');
    await sl(800);
    window.__clk(cat);
    await sl(1000);
    const m = window.__top();
    const card = m && [...m.querySelectorAll('.mk-card')].find((c) => c.innerText.trim().startsWith(name));
    if (!card) {
      window.__clk('×');
      return 'nf';
    }
    const inp = card.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, String(qty));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await sl(500);
    [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Comprar').click();
    await sl(1500);
    window.__clk('×');
    await sl(400);
    return 'ok';
  };

  // --- Consumo e ritmo medidos em janela de 30 minutos ---
  // XP acumulado do treinador: xpTotal(L) = 50/3 × (L³ − 6L² + 17L − 12) + xp do nível atual.
  const total = (lv, xp) => (50 / 3) * (lv ** 3 - 6 * lv ** 2 + 17 * lv - 12) + xp;
  const hist = [];
  let wasHunting = null;
  const sample = () => {

    let rd, st;
    try {
      rd = window.__rd();
      st = window.__stock();
    } catch (e) {
      return;
    }
    const now = Date.now();
    // Ao sair ou voltar da caça a medição recomeça, para o tempo parado não entrar na média por hora.
    if (hunting() !== wasHunting) {
      wasHunting = hunting();
      hist.length = 0;
    }
    if (!wasHunting) return;
    const last = hist[hist.length - 1];
    const s = { t: now, x: total(rd.lv, rd.xp), pot: st.pot, balls: rd.balls, gold: rd.gold, dPot: 0, dBall: 0, dGold: 0 };
    if (last) {
      // Compras e vendas aparecem como saltos; só as quedas (uso) e os ganhos pequenos (abates) contam.
      if (st.pot >= 0 && st.pot < last.pot) s.dPot = last.pot - st.pot;
      if (rd.balls >= 0 && rd.balls < last.balls) s.dBall = last.balls - rd.balls;
      const dg = rd.gold - last.gold;
      if (dg > 0 && dg < 10000) s.dGold = dg;
    }
    hist.push(s);
    while (hist.length > 1 && now - hist[0].t > 30 * 60000) hist.shift();
  };
  const rates = () => {
    if (hist.length < 2) return { xp: null, pot: null, balls: null, gold: null };
    const a = hist[0];
    const b = hist[hist.length - 1];
    const span = (b.t - a.t) / 3600000;
    if (span < 0.05) return { xp: null, pot: null, balls: null, gold: null };
    const sum = (k) => hist.slice(1).reduce((n, s) => n + s[k], 0);
    return {
      xp: Math.round((b.x - a.x) / span),
      pot: Math.round(sum('dPot') / span),
      balls: Math.round(sum('dBall') / span),
      gold: Math.round(sum('dGold') / span),
    };
  };
  every(sample, 20000);
  setTimeout(sample, 6000);

  // --- Recompra: mantém o estoque acima de 2 horas de uso e repõe até CFG.hours horas ---
  let busy = false;
  const stats = (window.__pkStats = window.__pkStats || { sold: 0, soldGold: 0, kept: 0 });
  // Teto: nunca compra além do máximo configurado para o item (0 = sem teto).
  const room = (max, have) => (max > 0 ? Math.max(0, max - have) : Infinity);
  const want = (have, min, buy, perHour, max) => {
    if (have < 0 || have >= Math.max(min, (perHour || 0) * 2)) return 0;
    return Math.min(Math.max(buy, Math.ceil((perHour || 0) * CFG.hours) - have), room(max, have));
  };
  // Pedido manual (force): completa até CFG.hours horas mesmo sem ter chegado ao mínimo.
  const top = (have, buy, perHour, max) => (have < 0 ? 0 : Math.min(Math.max(0, perHour ? Math.ceil(perHour * CFG.hours) - have : have < buy ? buy - have : 0), room(max, have)));
  // --- Compatibilidade: o app lê a tela do jogo em português e depende de alguns painéis ---
  // Quando não entende a tela, trava as automações em vez de agir às cegas.
  window.__pkBlocked = null;
  const compat = { vip: null, problems: [], notes: [] };
  const checkCompat = () => {
    let rd = null;
    try {
      rd = window.__rd();
    } catch (e) {}
    const t = document.body.innerText;
    const problems = [];
    const notes = [];
    if (!rd) {
      // Sem ficha de treinador legível: ou é a tela de login (nada a travar), ou o jogo não está em português.
      const login = document.getElementById('login') || document.getElementById('form-entrar');
      const atLogin = !!(login && login.offsetParent !== null);
      if (!atLogin && document.getElementById('palco') && !/EM CAMPO/.test(t)) problems.push('não consegui ler a ficha do treinador (o jogo precisa estar em português)');
    } else {
      if (!/EM CAMPO/.test(t) || !/AUTOMAÇÕES/.test(t)) problems.push('o jogo não está em português, e o app lê os textos da tela nesse idioma');
      else {
        const st = window.__stock();
        if (st.pot < 0 || st.rev < 0) problems.push('não consegui ler poções e revives no painel de automações do jogo');
      }
      if (!document.getElementById('ir-centro') && !document.getElementById('centro-curar')) problems.push('os controles de caça do jogo não foram encontrados (o jogo pode ter mudado; procure uma versão nova do app)');
      compat.vip = !!document.querySelector('.tr-ativo.vip') || /VIP\s*\+50% XP/.test(t);
      if (!compat.vip) notes.push('Conta sem VIP: o app foi feito e testado numa conta VIP. Se alguma automação do próprio jogo (bola, poção, revive, voltar à caça) não existir na sua conta, o app não tem como ligá-la.');
      if (rd.lv < 30) notes.push('Conta de nível baixo: a recompra compra Ultra Ball e Hyper Potion. Confira os tetos e a reserva de Coins em Ajustes antes de ligar.');
    }
    compat.problems = problems;
    compat.notes = notes;
    window.__pkBlocked = problems.length ? problems[0] : null;
    return compat;
  };
  setTimeout(checkCompat, 5000);

  // Depois de uma compra que o jogo não confirmou, a recompra automática espera antes de tentar de novo.
  let restockHold = 0;
  window.__restockCheck = async (force) => {
    if (window.__pkBlocked) return 'bloqueado: ' + window.__pkBlocked;
    if (busy || window.__top()) return 'skip';
    if (!force && Date.now() < restockHold) return 'nada';
    let st, rd;
    try {
      st = window.__stock();
      rd = window.__rd();
    } catch (e) {
      return 'sem leitura';
    }
    const r = rates();
    // Ultimate quando 70% do HP máximo passa de 3.000; Golden (cura 50% do HP por 2.500) quando o HP passa de 10.000,
    // ponto em que ela cura mais por Coin e com menos usos.
    const pot = rd.maxHp >= 10000 ? ['Golden Potion', 2500] : rd.maxHp * 0.7 >= 3000 ? ['Ultimate Potion', 1500] : ['Hyper Potion', 800];
    let gold = rd.gold;
    const floor = Number(CFG.reserve) || 0;
    const can = (unit, q) => Math.max(0, Math.min(q, Math.floor((gold - floor) / unit)));
    const have = (n) => (n === 'Ultra Ball' ? window.__ballsN() : n === 'Revive' ? window.__stock().rev : window.__stock().pot);
    const plans = [
      // Sem ler o pokémon em campo não dá para escolher a poção: fica para a próxima rodada.
      ['Poções', pot[0], pot[1], !rd.maxHp ? 0 : force ? top(st.pot, CFG.potBuy, r.pot, CFG.potMax) : want(st.pot, CFG.potMin, CFG.potBuy, r.pot, CFG.potMax)],
      ['Revives', 'Revive', 600, force ? top(st.rev, CFG.revBuy, 0, CFG.revMax) : want(st.rev, CFG.revMin, CFG.revBuy, 0, CFG.revMax)],
      ['Pokébolas', 'Ultra Ball', 130, force ? top(rd.balls, CFG.ballBuy, r.balls, CFG.ballMax) : want(rd.balls, CFG.ballMin, CFG.ballBuy, r.balls, CFG.ballMax)],
    ];
    const done = [];
    busy = true;
    try {
      for (const [cat, name, unit, q0] of plans) {
        const q = can(unit, q0);
        if (!(q > 0)) continue;
        const before = have(name);
        const clicked = (await window.__buy(cat, name, q)) === 'ok';
        await sl(700);
        const after = have(name);
        // A compra só vale se o estoque subiu. Sem isso o jogo recusou (ou a tela mudou) e insistir só gastaria Coins às cegas.
        const ok = clicked && before >= 0 && after >= before + Math.floor(q * 0.9);
        if (!ok) restockHold = Date.now() + 30 * 60000;
        const did = ok ? `Comprado: ${fmt(q)} ${name}` : `Compra não confirmada: ${name} (estoque ${before} → ${after}); a recompra automática espera 30 min`;
        if (ok) gold -= q * unit;
        note(did, [
          `${fmt(q)} × ${fmt(unit)} = ${fmt(q * unit)} Coins`,
          `Estoque antes: ${st.pot} poções, ${st.rev} revives, ${rd.balls} Ultra Balls`,
          `Consumo medido: ${r.pot ?? '–'} poções/h, ${r.balls ?? '–'} Ultra Balls/h`,
        ]);
        done.push(did);
        // No automático basta uma compra por rodada; a próxima checagem cuida do resto. Compra não confirmada encerra a rodada.
        if (!force || !ok) break;
      }
    } catch (e) {
      done.push('Erro na recompra: ' + e.message);
    } finally {
      await closeAll();
      busy = false;
    }
    if (done.length) return done.join('; ');
    return force && r.pot == null ? 'Consumo ainda sendo medido (leva uns 3 minutos de caça); estoque acima do mínimo, nada comprado' : 'nada';
  };

  // --- Depot: guarda nascimentos raros na Coleção e vende o resto ao NPC ---
  const parseCard = (c) => {
    const t = c.innerText.replace(/\n+/g, ' ');
    const p = t.match(/\bP(\d)\b/);
    const q = t.match(/\bQ (\d+),(\d+)/);
    const n = t.match(/\bN (\d+),(\d+)/);
    if (!p || !q || !n) return null;
    const name = (t.match(/([A-Za-zÀ-ÿ.'’ -]+?) Nv \d+/) || [])[1] || '?';
    const lv = t.match(/Nv (\d+)/);
    const iv = t.match(/\bIV (\d+)/);
    const price = t.match(/([\d.]+)\s*Vender/);
    return {
      name: name.replace(/^i\s+/, '').trim(),
      lv: lv ? +lv[1] : 0,
      iv: iv ? +iv[1] : 0,
      p: +p[1],
      q: dec(q[1], q[2]),
      n: dec(n[1], n[2]),
      price: price ? num(price[1]) : 0,
      shiny: /shiny|✨/i.test(t + ' ' + c.className),
    };
  };
  const br = (x) => String(x).replace('.', ',');
  const line = (d) => `${d.name} Nv ${d.lv} · P${d.p} · IV ${d.iv} · Q ${br(d.q)} · N ${br(d.n)}${d.shiny ? ' · shiny' : ''}`;
  const keeper = (d) => d.shiny || d.p >= KEEP.potencia || d.q >= KEEP.qualidade || d.n >= KEEP.nota;
  const depotCards = () => {
    const m = window.__top();
    return m ? [...m.querySelectorAll('.mk-card')] : [];
  };
  // Quantos de cada espécie já estão na Coleção (lido uma vez por sessão e atualizado a cada captura guardada).
  const collectionCount = async () => {
    window.__menu('Abrir Inventário');
    await sl(1500);
    window.__clk('Coleção');
    await sl(1300);
    const m = window.__top();
    const count = {};
    if (m) {
      for (const card of m.querySelectorAll('.colb-card')) {
        const n = ((card.querySelector('.mk-nome') || {}).textContent || '').trim();
        if (n) count[n] = (count[n] || 0) + 1;
      }
    }
    await closeAll();
    return count;
  };
  // onlyKeep: só guarda na Coleção o que bate a regra e para antes de vender (usado antes da Oferenda).
  window.__depotReview = async (onlyKeep) => {
    if (window.__pkBlocked) return 'bloqueado';
    if (busy || window.__top()) return 'skip';
    busy = true;
    try {
      window.__menu('Market');
      await sl(1300);
      window.__clk('Venda Pokémons');
      await sl(1800);
      let cards = depotCards();
      if (!cards.length) return 'vazio';
      // Reservas: mesmo sem bater a regra, os melhores de cada espécie de nível alto ficam até completar KEEP.reservas na Coleção.
      if (KEEP.reservas > 0 && !window.__pkColCount && cards.map(parseCard).some((d) => d && !keeper(d) && d.lv >= KEEP.reservaNivel)) {
        await closeAll();
        window.__pkColCount = await collectionCount();
        window.__menu('Market');
        await sl(1300);
        window.__clk('Venda Pokémons');
        await sl(1800);
        cards = depotCards();
        if (!cards.length) return 'vazio';
      }
      const col = window.__pkColCount || {};
      const reserve = (d) => KEEP.reservas > 0 && d.lv >= KEEP.reservaNivel && (col[d.name] || 0) < KEEP.reservas;
      const keep2 = (d) => keeper(d) || reserve(d);
      // Qualquer carta que eu não consiga ler cancela a rodada: nada é vendido às cegas.
      if (cards.some((c) => !parseCard(c))) {
        note('Depot: carta ilegível, nada vendido');
        return 'ilegível';
      }
      const cardKey = (c) => c.dataset.chave || '';
      const byKey = (k) => depotCards().find((c) => cardKey(c) === k);
      // Vender e enviar à Coleção tiram a carta do Depot: espera até 3 s para ver se ela saiu mesmo.
      const gone = async (k) => {
        for (let t = 0; t < 15; t++) {
          if (!byKey(k)) return true;
          await sl(200);
        }
        return false;
      };
      for (let i = 0; i < 80; i++) {
        // Primeiro os que batem a regra; depois, entre os candidatos a reserva, o de maior nota.
        const pool = depotCards().filter((c) => parseCard(c));
        const c = pool.find((c) => keeper(parseCard(c))) || pool.filter((c) => reserve(parseCard(c))).sort((a, b) => parseCard(b).n - parseCard(a).n)[0];
        if (!c) break;
        const d = parseCard(c);
        const b = c.querySelector('button.mk-colecao') || [...c.querySelectorAll('button')].find((b) => /Coleção/.test(b.title || ''));
        if (!b) {
          note('Depot: botão da Coleção não encontrado, nada vendido');
          return 'sem botão';
        }
        const k = cardKey(c);
        b.click();
        // Só conta como guardado se a carta saiu do Depot (Coleção cheia ou clique perdido deixam a carta lá).
        if (!k || !(await gone(k))) {
          note('Depot: a carta não foi para a Coleção, nada vendido', [line(d)]);
          return 'pendente';
        }
        col[d.name] = (col[d.name] || 0) + 1;
        stats.kept++;
        const why = [d.shiny && 'shiny', d.p >= KEEP.potencia && 'potência', d.q >= KEEP.qualidade && 'qualidade', d.n >= KEEP.nota && 'nota', !keeper(d) && `reserva da espécie (${col[d.name]} de ${KEEP.reservas})`];
        note(`Guardado na Coleção: ${d.name} Nv ${d.lv}`, [line(d), 'Motivo: ' + why.filter(Boolean).join(', '), `Valeria ${fmt(d.price)} no NPC`]);
        await sl(300);
      }
      cards = depotCards();
      if (!cards.length) return 'só guardados';
      // Vale também antes da Oferenda: com carta de guardar ainda no Depot, nada segue adiante.
      if (cards.some((c) => !parseCard(c) || keep2(parseCard(c)))) {
        note('Depot: sobrou carta para guardar, nada vendido');
        return 'pendente';
      }
      if (onlyKeep) return 'guardados';

      // Venda carta a carta, só das que foram lidas e conferidas agora. O botão "Vender todo o Depot" venderia também
      // uma captura que caísse no Depot durante a revisão, sem ela ter passado pela regra.
      const plan = cards.map((c) => ({ k: cardKey(c), d: parseCard(c) }));
      if (plan.some((x) => !x.k)) {
        note('Depot: carta sem identificação, nada vendido');
        return 'ilegível';
      }
      const sold = [];
      for (const { k, d } of plan) {
        const c = byKey(k);
        if (!c) continue;
        // Relida no instante da venda: se mudou ou passou a bater a regra, fica.
        const now = parseCard(c);
        if (!now || now.name !== d.name || now.price !== d.price || keep2(now)) continue;
        const sell = c.querySelector('button.mk-acao');
        if (!sell || sell.textContent.trim() !== 'Vender') break;
        sell.click();
        if (!(await gone(k))) {
          note('Depot: o jogo não confirmou a venda de uma carta, parei', [line(d)]);
          break;
        }
        sold.push(d);
      }
      if (!sold.length) return 'pendente';
      sold.sort((a, b) => b.price - a.price);
      const gain = sold.reduce((n, d) => n + d.price, 0);
      stats.sold += sold.length;
      stats.soldGold += gain;
      note(`Vendidos ${sold.length} do Depot por ${fmt(gain)}`, [
        `Nenhum era shiny, P${KEEP.potencia}+, qualidade ${br(KEEP.qualidade)}+ ou nota ${br(KEEP.nota)}+`,
        ...sold.map((d) => `${line(d)} — ${fmt(d.price)}`),
      ]);
      return 'vendido';
    } catch (e) {
      note('Erro na revisão do Depot: ' + e.message);
      return 'erro';
    } finally {
      await closeAll();
      busy = false;
    }
  };

  // --- Bônus ativos ---
  const buffs = { kick: null, kickAt: 0 };
  window.__readKick = async () => {
    if (busy || window.__top()) return 'skip';
    const b = document.querySelector('button.kick');
    if (!b) return 'nf';
    busy = true;
    try {
      b.click();
      await sl(1500);
      const t = window.__mtxt(0, 600);
      if (/BÔNUS NA KICK/.test(t)) {
        const m = t.match(/\+15% XP 300 PONTOS (.*?) \+15% Capture/);
        buffs.kick = m ? m[1].trim() : '?';
        buffs.kickAt = Date.now();
      }
      return buffs.kick;
    } finally {
      await closeAll();
      busy = false;
    }
  };

  // --- Caça: Centro, mapa e troca de área ---
  const palco = () => document.getElementById('palco');
  const hunting = () => !!(palco() && palco().classList.contains('hunt-ativa'));
  const hud = () => ((document.getElementById('hud-hunt') || {}).textContent || '').trim();
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  window.__huntNow = () => ({ hunting: hunting(), hud: hud() });
  // O app segura as automações enquanto conduz uma ação em várias etapas (troca de área).
  // Ao segurar, espera a rotina em andamento terminar (até 60 s) para não disputar as janelas do jogo com ela.
  window.__pkHold = async (on) => {
    if (!on) {
      busy = false;
      return true;
    }
    for (let i = 0; i < 200 && busy; i++) await sl(300);
    busy = true;
    await closeAll();
    return true;
  };
  // O jogo só libera a saída depois de 3 s sem levar dano; clica assim que o botão habilita.
  window.__gotoCentro = async () => {
    if (!hunting()) return { ok: true, already: true, hud: hud() };
    const b = document.getElementById('ir-centro');
    if (!b) return { ok: false, why: 'botão do Centro não encontrado' };
    const t0 = Date.now();
    while (hunting() && Date.now() - t0 < 45000) {
      if (!b.disabled) {
        b.click();
        await sl(600);
      } else await sl(100);
    }
    // Em áreas onde o dano não dá trégua o botão nunca libera: sai pelo "Desistir do Combate",
    // que custa 10% do XP do nível atual (menos de um minuto de caça).
    let gaveUp = false;
    const quit = document.getElementById('desistir-combate');
    if (hunting() && quit) {
      quit.click();
      await sl(900);
      const m = window.__top();
      const yes = m && [...m.querySelectorAll('button')].find((x) => /^(Desistir|Confirmar|Sim)/.test(x.textContent.trim()));
      if (yes) yes.click();
      for (let i = 0; i < 20 && hunting(); i++) await sl(300);
      gaveUp = !hunting();
      await closeAll();
    }
    await sl(800);
    return { ok: !hunting(), hud: hud(), ms: Date.now() - t0, gaveUp };
  };
  const regionButtons = () => [...document.querySelectorAll('button.mapa-area')].filter((b) => b.offsetParent);
  const openMap = async () => {
    await closeAll();
    window.__menu('Mapa');
    await sl(1600);
    return regionButtons().length > 0;
  };
  const markerInfo = (b, region) => {
    const m = (b.title || '').split('\n')[0].match(/^(.*?) — nível ([\d.]+)/);
    return { slug: b.dataset.slug, name: m ? m[1] : b.dataset.slug, lv: m ? num(m[2]) : 0, locked: b.dataset.travado === '1', region };
  };
  // O mapa lido fica guardado para o app saber em que área a caça está, mesmo depois de recarregar.
  const MAP_KEY = 'pk_map_v1';
  if (!window.__pkMap) {
    try {
      window.__pkMap = JSON.parse(localStorage.getItem(MAP_KEY) || 'null');
    } catch (e) {}
  }
  const huntSlug = () => {
    const c = hud().match(/^(.*?) · nível ([\d.]+)/);
    if (!c || !window.__pkMap) return null;
    const m = window.__pkMap.marks.find((x) => norm(x.name) === norm(c[1]) && x.lv === num(c[2]));
    return m ? { slug: m.slug, name: m.name, lv: m.lv } : null;
  };
  // Lê os marcadores de todas as regiões: quais áreas existem e quais estão liberadas.
  window.__mapScan = async () => {
    if (busy) return null;
    busy = true;
    try {
      if (!(await openMap())) return null;
      const marks = [];
      for (const rb of regionButtons()) {
        const region = rb.textContent.trim().replace(/ · Nv.*$/, '');
        rb.click();
        await sl(600);
        for (const b of window.__top().querySelectorAll('button.marcador')) marks.push(markerInfo(b, region));
      }
      window.__pkMap = { at: Date.now(), lv: window.__rd().lv, marks };
      try {
        localStorage.setItem(MAP_KEY, JSON.stringify(window.__pkMap));
      } catch (e) {}
      return window.__pkMap;
    } finally {
      await closeAll();
      busy = false;
    }
  };
  // Abre o mapa na região certa e devolve onde clicar; o clique de verdade é dado pelo app.
  const locate = async (slug) => {
    if (!(await openMap())) return { ok: false, why: 'o mapa não abriu' };
    // Duas passadas: na primeira a região pode ainda estar desenhando os marcadores.
    for (const rb of [...regionButtons(), ...regionButtons()]) {
      rb.click();
      await sl(900);
      // Outland tem 8 degraus com o mesmo mapa e o mesmo XP; o mais alto liberado dá mais drops raros.
      const os = document.querySelector('select.mapa-outland-sel');
      if (os && os.offsetParent) {
        const best = [...os.options].filter((o) => !o.disabled).pop();
        if (best && os.value !== best.value) {
          os.value = best.value;
          os.dispatchEvent(new Event('change', { bubbles: true }));
          await sl(900);
        }
      }
      // Procura na página inteira: logo depois de abrir o jogo, um aviso pode surgir por cima do mapa.
      const b = [...document.querySelectorAll('button.marcador')].find((x) => x.offsetParent && x.dataset.slug === slug);
      if (!b) continue;
      const info = markerInfo(b, rb.textContent.trim().replace(/ · Nv.*$/, ''));
      if (info.locked) {
        await closeAll();
        return { ok: false, why: 'área ainda travada', ...info };
      }
      // O mapa ainda pode estar se acomodando (rolagem, abertura da janela): confere o ponto por até 4 s.
      for (let i = 0; i < 8; i++) {
        b.scrollIntoView({ block: 'center', inline: 'center' });
        await sl(500);
        const r = b.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2);
        const y = Math.round(r.top + r.height / 2);
        const hit = document.elementFromPoint(x, y);
        if (hit && hit.closest('button.marcador') === b) return { ok: true, x, y, ...info };
        // Outra janela por cima do mapa (aviso de novidades, por exemplo): fecha só ela.
        const over = window.__top();
        if (over && !over.contains(b)) window.__clk('×');
      }
      await closeAll();
      return { ok: false, why: 'marcador coberto por outro elemento', ...info };
    }
    const over = window.__top();
    const seen = over ? over.innerText.trim().split('\n')[0].slice(0, 40) : 'nenhuma';
    const n = document.querySelectorAll('button.marcador').length;
    await closeAll();
    return { ok: false, why: `área não encontrada no mapa (janela na frente: ${seen}; ${n} marcadores visíveis)` };
  };
  // Logo depois de abrir o jogo a primeira tentativa pode falhar (a tela ainda está se montando): tenta de novo uma vez.
  window.__mapLocate = async (slug) => {
    let r = await locate(slug);
    if (!r.ok && /coberto|não encontrada|não abriu/.test(r.why)) {
      await sl(3000);
      r = await locate(slug);
    }
    return r;
  };
  window.__waitHunt = async (ms) => {
    const t0 = Date.now();
    while (!hunting() && Date.now() - t0 < (ms || 8000)) await sl(250);
    await closeAll();
    return { ok: hunting(), hud: hud() };
  };

  // --- Pokédex do servidor (exportação do próprio jogo), guardada por 24 h ---
  const DEX_KEY = 'pk_dex_v1';
  const parseDex = (raw) => {
    const sec = (a, b) => {
      const i = raw.indexOf(a);
      if (i < 0) return '';
      const j = b ? raw.indexOf(b, i) : -1;
      return raw.slice(i, j < 0 ? raw.length : j);
    };
    const n = (x) => +String(x).replace(/,/g, '');
    const isNum = (x) => /^[\d,]+$/.test(x);
    const byId = {};
    for (const line of sec('## Espécies', '## Golpes por espécie').split('\n')) {
      const c = line.split('|').map((x) => x.trim());
      if (c.length < 18 || !/^\d+$/.test(c[1])) continue;
      byId[+c[1]] = {
        id: +c[1],
        name: c[2].replace(/ \((BOSS|MEGA)[^)]*\)$/, ''),
        types: c[3].split('/'),
        hp: +c[4],
        atk: +c[5],
        def: +c[6],
        sa: +c[7],
        sd: +c[8],
        spd: +c[9],
        hunt: isNum(c[11]) ? n(c[11]) : null,
        capLv: isNum(c[12]) ? n(c[12]) : null,
        npc: isNum(c[13]) ? n(c[13]) : 0,
        beast: parseFloat(c[16]) || 0,
        moves: [],
        where: [],
      };
    }
    for (const line of sec('## Golpes por espécie', '## Onde encontrar').split('\n')) {
      const m = line.match(/^- \*\*#(\d+) [^*]+\*\* — (.*)$/);
      if (!m || !byId[+m[1]]) continue;
      byId[+m[1]].moves = m[2]
        .split('; ')
        .map((s) => s.split('|'))
        .map((p) => ({ name: p[0], lv: +p[1], power: +p[2], cd: +p[3], cat: p[4], type: p[5] }))
        .filter((v) => v.power > 0 && v.cd > 0);
    }
    for (const line of sec('## Onde encontrar').split('\n')) {
      const m = line.match(/^- \*\*#(\d+) [^*]+\*\* — (.*)$/);
      if (!m || !byId[+m[1]]) continue;
      byId[+m[1]].where = [...m[2].matchAll(/([^,(]+?) \(lv ([\d,]+)\)/g)].map((w) => ({ name: w[1].trim(), lv: n(w[2]) }));
    }
    return { at: Date.now(), species: Object.values(byId) };
  };
  window.__dexLoad = async (force) => {
    if (!force && window.__pkDex) return window.__pkDex;
    if (!force) {
      try {
        const d = JSON.parse(localStorage.getItem(DEX_KEY) || 'null');
        if (d && Date.now() - d.at < 24 * 3600000) return (window.__pkDex = d);
      } catch (e) {}
    }
    if (busy || window.__top()) return null;
    busy = true;
    const clip = navigator.clipboard;
    const origWrite = clip.writeText;
    const origOpen = window.open;
    let raw = null;
    try {
      // O botão do jogo copia o texto e abre o ChatGPT numa janela: a cópia é interceptada e a janela, bloqueada.
      clip.writeText = (t) => {
        raw = t;
        return Promise.resolve();
      };
      window.open = () => null;
      window.__menu('Pokédex');
      await sl(2000);
      const m = window.__top();
      const b = m && [...m.querySelectorAll('button')].find((b) => /Copiar toda a Pok/i.test(b.textContent));
      if (!b) return null;
      b.click();
      for (let i = 0; i < 24 && !raw; i++) await sl(250);
      await sl(300);
    } finally {
      clip.writeText = origWrite;
      window.open = origOpen;
      await closeAll();
      busy = false;
    }
    if (!raw) return null;
    const d = parseDex(raw);
    try {
      localStorage.setItem(DEX_KEY, JSON.stringify(d));
    } catch (e) {}
    return (window.__pkDex = d);
  };

  // --- Recomendador de áreas (estimativa calibrada pelo ritmo da caça atual) ---
  // s: super efetivo, h: pouco efetivo, z: sem efeito.
  const TYPE = {
    NORMAL: { h: ['ROCK', 'STEEL'], z: ['GHOST'] },
    FIRE: { s: ['GRASS', 'ICE', 'BUG', 'STEEL'], h: ['FIRE', 'WATER', 'ROCK', 'DRAGON'] },
    WATER: { s: ['FIRE', 'GROUND', 'ROCK'], h: ['WATER', 'GRASS', 'DRAGON'] },
    ELECTRIC: { s: ['WATER', 'FLYING'], h: ['ELECTRIC', 'GRASS', 'DRAGON'], z: ['GROUND'] },
    GRASS: { s: ['WATER', 'GROUND', 'ROCK'], h: ['FIRE', 'GRASS', 'POISON', 'FLYING', 'BUG', 'DRAGON', 'STEEL'] },
    ICE: { s: ['GRASS', 'GROUND', 'FLYING', 'DRAGON'], h: ['FIRE', 'WATER', 'ICE', 'STEEL'] },
    FIGHTING: { s: ['NORMAL', 'ICE', 'ROCK', 'DARK', 'STEEL'], h: ['POISON', 'FLYING', 'PSYCHIC', 'BUG', 'FAIRY'], z: ['GHOST'] },
    POISON: { s: ['GRASS', 'FAIRY'], h: ['POISON', 'GROUND', 'ROCK', 'GHOST'], z: ['STEEL'] },
    GROUND: { s: ['FIRE', 'ELECTRIC', 'POISON', 'ROCK', 'STEEL'], h: ['GRASS', 'BUG'], z: ['FLYING'] },
    FLYING: { s: ['GRASS', 'FIGHTING', 'BUG'], h: ['ELECTRIC', 'ROCK', 'STEEL'] },
    PSYCHIC: { s: ['FIGHTING', 'POISON'], h: ['PSYCHIC', 'STEEL'], z: ['DARK'] },
    BUG: { s: ['GRASS', 'PSYCHIC', 'DARK'], h: ['FIRE', 'FIGHTING', 'POISON', 'FLYING', 'GHOST', 'STEEL', 'FAIRY'] },
    ROCK: { s: ['FIRE', 'ICE', 'FLYING', 'BUG'], h: ['FIGHTING', 'GROUND', 'STEEL'] },
    GHOST: { s: ['PSYCHIC', 'GHOST'], h: ['DARK'], z: ['NORMAL'] },
    DRAGON: { s: ['DRAGON'], h: ['STEEL'], z: ['FAIRY'] },
    DARK: { s: ['PSYCHIC', 'GHOST'], h: ['FIGHTING', 'DARK', 'FAIRY'] },
    STEEL: { s: ['ICE', 'ROCK', 'FAIRY'], h: ['FIRE', 'WATER', 'ELECTRIC', 'STEEL'] },
    FAIRY: { s: ['FIGHTING', 'DRAGON', 'DARK'], h: ['FIRE', 'POISON', 'STEEL'] },
  };
  // Nas hunts a vantagem de tipo é ampliada: ×2 vira ×2,5, ×4 vira ×5,5 e ×0,5 vira ×0,333 (Wiki do jogo).
  const eff = (att, defs) => {
    const t = TYPE[att] || {};
    let m = 1;
    for (const d of defs) m *= (t.s || []).includes(d) ? 2 : (t.h || []).includes(d) ? 0.5 : (t.z || []).includes(d) ? 0 : 1;
    return m >= 4 ? 5.5 : m >= 2 ? 2.5 : m === 1 ? 1 : m === 0 ? 0 : m >= 0.5 ? 1 / 3 : 0.2;
  };
  const statAt = (base, lv) => (2 * base * lv) / 100 + 5;
  const hpAt = (base, lv) => (2 * base * lv) / 100 + lv + 10;
  // Dano por segundo relativo: soma dos golpes já aprendidos (poder ÷ recarga), com bônus de tipo próprio e vantagem.
  const dps = (a, aLv, d, dLv) =>
    a.moves
      .filter((m) => m.lv <= aLv)
      .reduce((s, m) => {
        const ratio = m.cat === 'F' ? statAt(a.atk, aLv) / statAt(d.def, dLv) : statAt(a.sa, aLv) / statAt(d.sd, dLv);
        return s + (m.power / m.cd) * (a.types.includes(m.type) ? 1.5 : 1) * eff(m.type, d.types) * ratio;
      }, 0);
  // Segundos entre um abate e o próximo alvo; bate com o medido em Forretress Nv 80 (7 s) e Scizor Nv 100 (11,4 s).
  const OVERHEAD = 2.5;
  // A última lista calculada continua no painel depois de recarregar a página.
  const ADVICE_KEY = 'pk_advice_v1';
  if (!window.__pkAdvice) {
    try {
      window.__pkAdvice = JSON.parse(localStorage.getItem(ADVICE_KEY) || 'null');
    } catch (e) {}
  }
  // quiet: recálculo automático, sem entrada no registro.
  window.__huntAdvice = async (quiet) => {
    let rd;
    try {
      rd = window.__rd();
    } catch (e) {
      return { ok: false, why: 'não consegui ler a ficha do jogo' };
    }
    const r = rates();
    if (!hunting()) return { ok: false, why: 'fora de uma caça: preciso do ritmo atual para calibrar a estimativa' };
    if (!r.xp) return { ok: false, why: 'ainda medindo o ritmo da caça (leva uns 3 minutos)' };
    // Só o registro da caça: o chat também é texto da página, e é escrito por outros jogadores.
    const kill = [...((document.getElementById('hud-log') || {}).innerText || '').matchAll(/derrotado! \+([\d.]+) xp treinador/g)].pop();
    if (!kill) return { ok: false, why: 'não achei o XP por abate no registro do jogo' };
    const xpKill = num(kill[1]);
    const dex = await window.__dexLoad();
    if (!dex) return { ok: false, why: 'não consegui ler a Pokédex (feche as janelas abertas no jogo e tente de novo)' };
    const map = window.__pkMap && Date.now() - window.__pkMap.at < 6 * 3600000 ? window.__pkMap : await window.__mapScan();
    if (!map) return { ok: false, why: 'não consegui ler o mapa' };
    const byName = new Map(dex.species.map((s) => [norm(s.name), s]));
    const byWhere = new Map();
    for (const s of dex.species) for (const w of s.where) byWhere.set(norm(w.name), s);
    const spOf = (m) => byWhere.get(norm(m.name)) || byName.get(norm(m.name)) || byName.get(norm(m.slug));
    const me = byName.get(norm(rd.pokeName));
    if (!me) return { ok: false, why: 'pokémon ativo não encontrado na Pokédex: ' + rd.pokeName };
    const cur = hud().match(/^(.*?) · nível ([\d.]+)/);
    const curMark = cur && map.marks.find((m) => norm(m.name) === norm(cur[1]) && m.lv === num(cur[2]));
    const curSp = curMark && spOf(curMark);
    if (!curSp) return { ok: false, why: 'área atual não reconhecida: ' + hud() };
    const model = (sp, lv) => {
      const out = dps(me, rd.pokeLv, sp, lv);
      return out > 0 ? (hpAt(sp.hp, lv) * 5) / out : Infinity;
    };
    const tCur = 3600 / (r.xp / xpKill);
    const k = Math.max(0.3, tCur - OVERHEAD) / model(curSp, curMark.lv);
    const inCur = dps(curSp, curMark.lv, me, rd.pokeLv);
    const xpAt = (lv) => 0.6 * lv * lv + 8;
    const list = [];
    for (const m of map.marks) {
      const sp = spOf(m);
      if (m.locked || !sp) continue;
      const M = model(sp, m.lv);
      if (!isFinite(M)) continue;
      const t = OVERHEAD + k * M;
      const kills = 3600 / t;
      // Ultra Ball tem metade da eficiência da Beast Ball; qualidade média de nascimento perto de 1,15.
      const capture = kills * Math.min(1, sp.beast / 200) * sp.npc * (1 + (sp.capLv || m.lv) / 50) * 1.15 - kills * 130;
      list.push({
        slug: m.slug,
        name: m.name,
        lv: m.lv,
        region: m.region,
        types: sp.types.join('/'),
        mult: +Math.max(...me.types.map((ty) => eff(ty, sp.types))).toFixed(2),
        sKill: +t.toFixed(1),
        xph: Math.round((kills * xpKill * xpAt(m.lv)) / xpAt(curMark.lv)),
        risk: inCur > 0 ? +(dps(sp, m.lv, me, rd.pokeLv) / inCur).toFixed(2) : null,
        capGold: Math.round(capture),
        current: m === curMark,
      });
    }
    list.sort((a, b) => b.xph - a.xph);
    const top = list.slice(0, 12);
    const mine = list.find((x) => x.current);
    if (mine && !top.includes(mine)) top.push(mine);
    const res = {
      ok: true,
      at: Date.now(),
      me: `${rd.pokeName} Nv ${rd.pokeLv}`,
      base: { name: curMark.name, lv: curMark.lv, xph: r.xp, sKill: +tCur.toFixed(1) },
      list: top,
      total: list.length,
    };
    window.__pkAdvice = res;
    try {
      localStorage.setItem(ADVICE_KEY, JSON.stringify(res));
    } catch (e) {}
    if (quiet) return res;
    note(
      `Áreas calculadas: melhor estimativa é ${top[0].name} Nv ${top[0].lv}`,
      [`Base: ${res.base.name} Nv ${res.base.lv}, ${fmt(r.xp)} XP/h medidos com ${res.me}`].concat(
        top.slice(0, 8).map((x) => `${x.name} Nv ${x.lv} · ×${br(x.mult)} · ${fmt(x.xph)} XP/h · dano recebido ×${br(x.risk)}${x.current ? ' · atual' : ''}`)
      )
    );
    return res;
  };

  let ticks = 0;
  every(async () => {
    ticks++;
    checkCompat();
    try {
      window.__rd();
    } catch (e) {
      return; // fora do jogo (tela de login)
    }
    if (window.__pkBlocked) return; // tela não reconhecida: nenhuma automação roda
    if (window.__pkAuto.restock && ticks % 2 === 0) await window.__restockCheck();
    if (window.__pkAuto.depot && ticks % 15 === 5) await window.__depotReview();
    if (ticks % 10 === 1) await window.__readKick();
    // Rotinas do segundo script (proteções, Passe, pedras, flip, releitura do mapa).
    if (window.__pkTick) await window.__pkTick(ticks);

  }, 60000);

  // Usado pelo segundo script do jogo (inject/game-2.js): mesmas ferramentas e a mesma trava das automações.
  window.__pk = {
    sl,
    num,
    fmt,
    br,
    note,
    closeAll,
    every,
    rates,
    hunting,
    hud,
    norm,
    CFG,
    KEEP,
    stats,
    isBusy: () => busy,
    setBusy: (v) => {
      busy = !!v;
    },
    resetRates: () => {
      hist.length = 0;
    },
  };

  // PvP Ranqueado: rank e PR ficam no painel do treinador; a pílula no alto do jogo existe enquanto a busca corre.
  const pvpNow = () => {
    const box = document.getElementById('tr-rank-box');
    const nome = document.getElementById('tr-rank-nome');
    const pr = box && box.innerText.match(/([\d.]+)\s*PR/);
    const pill = document.getElementById('pvp-fila-pill');
    return { rank: nome ? nome.innerText.trim() : null, pr: pr ? num(pr[1]) : null, queued: !!(pill && pill.offsetParent) };
  };
  window.__pkState = () => {

    let rd, st;
    try {
      rd = window.__rd();
      st = window.__stock();
    } catch (e) {
      return { logged: false, compat: { vip: null, problems: compat.problems, notes: [] } };
    }
    const tw = sheet().match(/Bônus Twitch \| \+([\d,]+)% XP/);
    return {
      logged: true,
      lv: rd.lv,
      xp: rd.xp,
      gold: rd.gold,
      poke: rd.poke,
      balls: rd.balls,
      pot: st.pot,
      rev: st.rev,
      rates: rates(),
      hunting: hunting(),
      modal: !!window.__top(),
      hud: hud(),
      advice: window.__pkAdvice || null,
      compat: { vip: compat.vip, problems: compat.problems, notes: compat.notes },

      area: huntSlug(),
      unlocked: window.__pkMap ? window.__pkMap.marks.filter((m) => !m.locked).length : null,
      // Lida do rodapé do jogo, não da página inteira: o chat é texto de outros jogadores.
      version: ((document.getElementById('versao') || {}).innerText || '').trim().match(/^v\d+\.\d+\.\d+$/) ? document.getElementById('versao').innerText.trim() : null,
      extra: window.__pkExtra ? window.__pkExtra() : null,
      pvp: pvpNow(),
      twitch: tw ? tw[1] + '%' : null,
      twMore: !!document.querySelector('.tr-ativo.twitch.tw-tem-mais'),
      kick: buffs.kick,
      kickAt: buffs.kickAt,
      stats,
      auto: window.__pkAuto,
      logs: logs.slice(-30),
    };
  };
  return 'ok';
})();
