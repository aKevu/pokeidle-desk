// Segundo script do jogo: proteções, Passe, Mercado da Comunidade (pedras e flip), equipe, evolução e Oferenda.
// Usa as ferramentas e a trava de automações expostas por inject/game.js em window.__pk.
(() => {
  const P = window.__pk;
  if (!P) return 'sem base';
  const { sl, num, fmt, br, note } = P;
  const MK = Object.assign(
    { keepStones: 1, minLadder: 3, flipBudget: 1500000, flipMargin: 0.1, flipMinProfit: 20000, flipMaxItems: 30, fee: 0.15 },
    (window.__PK_CFG && window.__PK_CFG.market) || {}
  );
  P.MK = MK;


  const vis = (sel, root) => [...(root || window.__top() || document).querySelectorAll(sel)].filter((e) => e.offsetParent);
  const anyBtn = (test) => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && test(b.textContent.trim().replace(/\s+/g, ' '))).pop();
  const folha = () => [...document.querySelectorAll('.cm-folha-caixa')].filter((e) => e.offsetParent).pop();
  const setVal = (inp, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, String(v));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // "40.000" → 40000; "70M" → 70000000; "—" → null.
  const money = (el) => {
    const t = el ? el.textContent.trim() : '';
    const m = t.match(/([\d.,]+)\s*([KMB])?/i);
    if (!m) return null;
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
    return Math.round(parseFloat(m[1].replace(/\./g, '').replace(',', '.')) * mult);
  };
  // Fecha as folhas do mercado (que ficam por cima) e depois as janelas.
  const closeEverything = async () => {
    for (let n = 0; n < 10; n++) {
      const f = folha();
      const x = f && [...f.querySelectorAll('button')].find((b) => b.textContent.trim() === '×');
      if (x) {
        x.click();
        await sl(400);
      } else if (window.__top()) {
        window.__clk('×');
        await sl(350);
      } else break;
    }
  };
  const BUSY = { ok: false, why: 'há uma janela aberta no jogo ou outra automação em andamento' };
  const locked = async (fn) => {
    if (P.isBusy() || window.__top()) return BUSY;
    P.setBusy(true);
    try {
      return await fn();
    } catch (e) {
      return { ok: false, why: e.message };
    } finally {
      await closeEverything();
      P.setBusy(false);
    }
  };

  // --- Proteção das automações do próprio jogo (bola, poção, revive, volta à caça) ---
  window.__guard = async () => {
    const fixes = [];
    const tick = async (id, label) => {
      const c = document.getElementById(id);
      if (c && !c.checked) {
        c.click();
        await sl(500);
        if (c.checked) fixes.push(label + ' religado');
      }
    };
    const chips = (re) => [...document.querySelectorAll('.auto-chip')].filter((e) => re.test(e.title || ''));
    const ensure = async (re, prefer, label) => {
      const list = chips(re);
      if (!list.length || list.some((e) => e.classList.contains('on') && !e.classList.contains('vazio'))) return;
      const pick = list.find((e) => new RegExp('^' + prefer).test(e.title) && !e.classList.contains('vazio')) || list.find((e) => !e.classList.contains('vazio') && !/^Beast/.test(e.title));
      if (!pick) return;
      pick.click();
      await sl(500);
      fixes.push(`${label}: selecionada ${pick.title.split(' —')[0].split('\n')[0]}`);
    };
    // Sem uma bola com estoque marcada, o jogo desliga o lançamento sozinho.
    await ensure(/Ball — /, 'Ultra Ball', 'Bola do lançamento automático');
    await ensure(/Potion/, 'Hyper Potion', 'Poção automática');
    await ensure(/Revive/, 'Revive', 'Revive automático');
    await tick('auto-ball-sem-parar', 'Lançamento automático de bolas');
    await tick('auto-potion', 'Uso automático de poções');
    await tick('auto-revive', 'Revive automático');
    await tick('auto-voltar-hunt', 'Volta automática à caça');
    if (fixes.length) note('Proteção: ' + fixes[0] + (fixes.length > 1 ? ` (+${fixes.length - 1})` : ''), fixes);
    return fixes;
  };

  // --- Centro Pokémon ---
  window.__heal = async () => {
    const b = document.getElementById('centro-curar');
    if (!b || !b.offsetParent) return false;
    b.click();
    await sl(1200);
    await P.closeAll();
    return true;
  };

  // --- Passe diário ---
  const passe = { nextAt: 0, last: null };
  window.__passeClaim = () =>
    locked(async () => {
      window.__menu('Passe');
      await sl(1800);
      const m = window.__top();
      if (!m || !/PASSE DE BATALHA/i.test(m.innerText)) return { ok: false, why: 'o Passe não abriu' };
      const txt = m.innerText.replace(/\n+/g, ' | ');
      const day = (txt.match(/DIA (\d+) DE \d+/) || [])[1];
      const wait = txt.match(/DIA \d+ LIBERA EM (\d+):(\d+):(\d+)/i);
      // O botão do dia fica desabilitado com "Dia N libera em…"; habilitado, é o resgate. Nada de compra.
      const btn = vis('button', m).find((b) => !b.disabled && /resgat|colet|receb|pegar|^dia \d+/i.test(b.textContent.trim()) && !/comprar|libera em/i.test(b.textContent));
      if (!btn) {
        if (wait) passe.nextAt = Date.now() + ((+wait[1] * 60 + +wait[2]) * 60 + +wait[3]) * 1000 + 60000;
        else passe.nextAt = Date.now() + 30 * 60000;
        return { ok: true, claimed: false, why: wait ? `próximo resgate em ${wait[1]}h${wait[2]}` : 'nada para resgatar agora', day };
      }
      const label = btn.textContent.trim().replace(/\s+/g, ' ');
      btn.click();
      await sl(2200);
      const after = (window.__top() ? window.__top().innerText : '').replace(/\n+/g, ' | ').slice(0, 300);
      passe.nextAt = Date.now() + 30 * 60000;
      passe.last = Date.now();
      note('Passe: recompensa diária resgatada', [`Botão: ${label}`, `Dia ${day || '?'} do Passe`, after]);
      return { ok: true, claimed: true, label, day };
    });

  // --- Mercado da Comunidade ---
  const openItems = async (search) => {
    window.__menu('RMT');
    await sl(2000);
    const it = vis('button').find((b) => b.textContent.trim() === 'Itens');
    if (!it) throw new Error('o Mercado da Comunidade não abriu');
    it.click();
    await sl(1400);
    const b = window.__top().querySelector('input.cm-busca');
    if (b) {
      setVal(b, search || '');
      await sl(1800);
    }
  };
  const readRows = () =>
    vis('button.cmi-linha').map((r) => {
      const precos = r.querySelectorAll('.cmi-precos .cm-preco');
      const m = ((r.querySelector('.cmi-nome i') || {}).textContent || '').match(/([\d.]+) anúncio\(s\) · ([\d.]+) unidade/);
      return { el: r, name: ((r.querySelector('.cmi-nome b') || {}).textContent || '').trim(), ads: m ? num(m[1]) : 0, units: m ? num(m[2]) : 0, coins: money(precos[0]), gems: money(precos[1]) };
    });
  const readPanel = () => {
    const t = window.__top().innerText.replace(/\n+/g, ' ');
    const a = t.match(/últimos 7 dias:\s*([\d.]+)\s*\/un\. · ([\d.]+) un\. vendidas/);
    const rows = vis('.cmv-linha').map((r) => {
      const buy = [...r.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Comprar');
      const q = ((r.querySelector('.cmv-qtd') || {}).textContent || '').match(/([\d.]+)×/);
      return { seller: ((r.querySelector('.cmv-quem') || {}).textContent || '').trim(), qty: q ? num(q[1]) : 1, price: money(r.querySelector('.cmv-preco .cm-preco')), mine: !r.querySelector('.cmv-dm'), buy };
    });
    return { avg7: a ? num(a[1]) : null, sold7: a ? num(a[2]) : null, rows: rows.filter((r) => r.price > 0) };
  };
  const openPanel = async (name) => {
    await openItems(name);
    const row = readRows().find((r) => r.name === name);
    if (!row) throw new Error('item não encontrado no mercado: ' + name);
    row.el.click();
    await sl(2000);
    // O painel abre na moeda usada por último; as contas são todas em Coins.
    const coins = vis('.cmi-slider button').filter((b) => b.textContent.trim() === 'Coins').pop();
    if (coins) {
      coins.click();
      await sl(900);
    }
    return readPanel();
  };
  const bagStones = async () => {
    window.__menu('Abrir Inventário');
    await sl(1500);
    window.__clk('Pedras');
    await sl(1200);
    const out = vis('.bolsa-card').map((c) => ({ name: ((c.querySelector('.mk-nome') || {}).textContent || '').trim(), qty: num(((c.querySelector('.bolsa-qtd') || {}).textContent || '0').replace(/[^\d.]/g, '') || 0) }));
    await P.closeAll();
    return out.filter((x) => x.name);
  };
  const buy = async (name, maxPrice, qty) => {
    const g0 = window.__rd().gold;
    const p = await openPanel(name);
    const row = p.rows.find((r) => r.buy && !r.mine && r.price <= maxPrice);
    if (!row) return { ok: false, why: `nenhuma oferta comprável de ${name} até ${fmt(maxPrice)}` };
    const n = Math.max(1, Math.min(qty, row.qty));
    row.buy.click();
    await sl(1500);
    const f = folha();
    if (!f) return { ok: false, why: 'a janela de compra não abriu' };
    const qi = vis('input', f).find((i) => i.type === 'number' || i.inputMode === 'numeric');
    if (qi && row.qty > 1) {
      setVal(qi, n);
      await sl(500);
    }
    const c1 = vis('button', f).find((b) => /^Confirmar compra|^Comprar/.test(b.textContent.trim()));
    if (!c1) return { ok: false, why: 'botão de confirmar a compra não encontrado: ' + f.innerText.replace(/\n+/g, ' | ').slice(0, 160) };
    c1.click();
    await sl(1600);
    // Segunda confirmação do jogo, numa folha por cima.
    const c2 = anyBtn((t) => t === 'Comprar' || t === 'Sim, comprar' || t === 'Confirmar');
    if (c2 && !c2.closest('.cmv-linha')) {
      c2.click();
      await sl(2600);
    }
    // O saldo sobe com os abates durante a compra; o débito conferido é aproximado e o custo certo é preço × quantidade.
    const got = qi || row.qty === 1 ? n : row.qty;
    if (g0 - window.__rd().gold < (got * row.price) / 2) return { ok: false, why: 'a compra não foi debitada (oferta retida ou já vendida)' };
    return { ok: true, n: got, unit: row.price, spent: got * row.price, seller: row.seller };

  };
  const list = async (name, price, qty) => {
    window.__menu('RMT');
    await sl(2000);
    const a = vis('button').find((b) => /^\+ Anunciar/.test(b.textContent.trim()));
    if (!a) throw new Error('botão de anunciar não encontrado');
    a.click();
    await sl(1300);
    const um = anyBtn((t) => t === 'Um item');
    if (!um) return { ok: false, why: 'opção "Um item" não apareceu' };
    um.click();
    await sl(1600);
    const it = [...document.querySelectorAll('button')].filter((b) => b.offsetParent && b.textContent.trim().startsWith(name) && b.textContent.trim().length < name.length + 14).pop();
    if (!it) return { ok: false, why: `${name} não está disponível para anunciar` };
    it.click();
    await sl(1600);
    const box = folha();
    if (!box) return { ok: false, why: 'a folha do anúncio não abriu' };
    const inputs = vis('input', box);
    if (!inputs.length) return { ok: false, why: 'campos do anúncio não encontrados' };
    setVal(inputs[0], price);
    await sl(400);
    const qi = inputs.find((i) => i.type === 'number' && i !== inputs[0]);
    if (qi && qty) {
      setVal(qi, qty);
      await sl(400);
    }
    const sum = box.innerText.replace(/\s+/g, ' ');
    const k = sum.indexOf('Total do anúncio');
    const pb = anyBtn((t) => t === 'Publicar anúncio');
    if (!pb) return { ok: false, why: 'botão Publicar não encontrado' };
    pb.click();
    await sl(1900);
    const cb = anyBtn((t) => t === 'Sim, anunciar por Coins');
    if (!cb) return { ok: false, why: 'confirmação do anúncio não apareceu' };
    cb.click();
    await sl(2600);
    return { ok: true, summary: k >= 0 ? sum.slice(k, k + 110) : '' };
  };

  // Lê o piso de todos os itens (uma tela, sem abrir cada um).
  window.__marketScan = () =>
    locked(async () => {
      await openItems('');
      const rows = readRows().map(({ name, ads, units, coins, gems }) => ({ name, ads, units, coins, gems }));
      return { ok: true, at: Date.now(), rows };
    });

  // Anuncia as pedras que sobram na bolsa um Coin abaixo do menor preço de outro vendedor.
  window.__sellStones = () =>
    locked(async () => {
      const stones = (await bagStones()).filter((s) => s.qty > MK.keepStones);
      if (!stones.length) return { ok: true, listed: [], why: `nenhuma pedra além da reserva de ${MK.keepStones} por tipo` };
      const listed = [];
      const skipped = [];
      for (const s of stones) {
        const p = await openPanel(s.name);
        await closeEverything();
        const others = p.rows.filter((r) => !r.mine);
        // O jogo aceita um anúncio por item: com um seu já no ar, um segundo é recusado.
        const mine = p.rows.find((r) => r.mine);
        if (mine) {
          skipped.push(`${s.name}: você já tem um anúncio no ar (${mine.qty}× a ${fmt(mine.price)}); o menor preço de outro vendedor é ${others[0] ? fmt(others[0].price) : '—'}`);
          continue;
        }
        if (others.length < MK.minLadder) {
          skipped.push(`${s.name}: menos de ${MK.minLadder} ofertas de outros vendedores, sem referência de preço`);
          continue;
        }
        const qty = s.qty - MK.keepStones;
        const price = Math.max(1, others[0].price - 1);
        const r = await list(s.name, price, qty);
        await closeEverything();
        // Confere na bolsa se as pedras saíram mesmo; sem isso o anúncio não foi aceito.
        if (r.ok) {
          const now = (await bagStones()).find((x) => x.name === s.name);
          if (now && now.qty >= s.qty) {
            r.ok = false;
            r.why = 'o jogo não aceitou o anúncio (as pedras continuam na bolsa)';
          }
        }
        if (r.ok) {

          listed.push({ name: s.name, qty, price });
          note(`Mercado: anunciadas ${qty}× ${s.name} a ${fmt(price)}`, [
            `Menor preço de outro vendedor: ${fmt(others[0].price)} (${others[0].seller})`,
            `Se vender tudo: ${fmt(Math.round(qty * price * (1 - MK.fee)))} líquidos (taxa de ${Math.round(MK.fee * 100)}%)`,
            p.avg7 ? `Média vendida em 7 dias: ${fmt(p.avg7)} por unidade` : 'Sem média de 7 dias',
            `Ficou ${MK.keepStones} na bolsa de reserva`,
          ]);
        } else skipped.push(`${s.name}: ${r.why}`);
      }
      return { ok: true, listed, skipped };
    });

  // Oportunidade de flip num item: comprar os anúncios mais baratos e reanunciar logo abaixo do degrau seguinte.
  const flipOf = (name, p, budget) => {
    const rows = p.rows.filter((r) => !r.mine);
    let best = null;
    let cost = 0;
    let units = 0;
    for (let k = 0; k < Math.min(rows.length - 1, 6); k++) {
      if (!rows[k].buy) break; // oferta retida: ainda não dá para comprar
      const can = Math.min(rows[k].qty, Math.floor((budget - cost) / rows[k].price));
      if (can <= 0) break;
      cost += can * rows[k].price;
      units += can;
      const resale = rows[k + 1].price - 1;
      const profit = Math.round(units * resale * (1 - MK.fee) - cost);
      if (!best || profit > best.profit) best = { name, units, cost, buyMax: rows[k].price, resale, profit, margin: +(profit / cost).toFixed(3) };
      if (can < rows[k].qty) break;
    }
    if (!best) return null;
    // Só vale se o lote gira: o mercado precisa ter vendido bem mais do que isso na semana.
    best.liquid = p.sold7 != null && p.sold7 >= best.units * 10;
    best.avg7 = p.avg7;
    best.sold7 = p.sold7;
    return best;
  };
  window.__flipScan = (budget) =>
    locked(async () => {
      const cap = Math.min(budget || MK.flipBudget, Math.max(0, window.__rd().gold - P.CFG.reserve));
      await openItems('');
      const names = readRows()
        .filter((r) => r.coins && r.coins <= cap && r.ads >= 4)
        .sort((a, b) => b.units - a.units)
        .slice(0, MK.flipMaxItems)
        .map((r) => r.name);
      await closeEverything();
      const opps = [];
      const seen = [];
      for (const name of names) {
        const p = await openPanel(name);
        await closeEverything();
        const o = flipOf(name, p, cap);
        seen.push({ name, floor: p.rows[0] ? p.rows[0].price : null, next: p.rows[1] ? p.rows[1].price : null, avg7: p.avg7 });
        if (o && o.liquid && o.profit >= MK.flipMinProfit && o.margin >= MK.flipMargin) opps.push(o);
      }
      opps.sort((a, b) => b.profit - a.profit);
      const res = { ok: true, at: Date.now(), budget: cap, scanned: names.length, opps, seen };
      window.__pkFlip = res;
      note(
        opps.length ? `Radar de flip: ${opps.length} oportunidade(s), melhor em ${opps[0].name}` : `Radar de flip: nenhuma oportunidade em ${names.length} itens`,
        [`Orçamento: ${fmt(cap)} · margem mínima ${Math.round(MK.flipMargin * 100)}% já descontada a taxa de ${Math.round(MK.fee * 100)}%`].concat(
          opps.length
            ? opps.map((o) => `${o.name}: comprar ${o.units} até ${fmt(o.buyMax)} (${fmt(o.cost)}), revender a ${fmt(o.resale)} → lucro ${fmt(o.profit)} (${Math.round(o.margin * 100)}%)`)
            : seen.slice(0, 10).map((s) => `${s.name}: piso ${fmt(s.floor)}, degrau seguinte ${fmt(s.next)}`)
        )
      );
      return res;
    });
  // Executa um flip: confere se a oportunidade ainda existe, compra e reanuncia.
  window.__flipRun = (o) =>
    locked(async () => {
      const cap = Math.min(MK.flipBudget, Math.max(0, window.__rd().gold - P.CFG.reserve));
      const now = flipOf(o.name, await openPanel(o.name), cap);
      await closeEverything();
      if (!now || now.margin < MK.flipMargin || now.profit < MK.flipMinProfit) return { ok: false, why: 'a oportunidade não existe mais (os preços mudaram)' };
      let bought = 0;
      let spent = 0;
      const steps = [];
      for (let i = 0; i < 8 && bought < now.units; i++) {
        const r = await buy(o.name, now.buyMax, now.units - bought);
        await closeEverything();
        if (!r.ok) {
          steps.push('Parou: ' + r.why);
          break;
        }
        bought += r.n;
        spent += r.spent;
        steps.push(`Comprado ${r.n}× a ${fmt(r.unit)} de ${r.seller}`);
      }
      if (!bought) return { ok: false, why: steps.join('; ') || 'nada comprado' };
      // Preço de revenda conferido de novo depois das compras; nunca abaixo do custo com a taxa.
      const after = (await openPanel(o.name)).rows.filter((r) => !r.mine);
      await closeEverything();
      const floor = Math.ceil(spent / bought / (1 - MK.fee)) + 1;
      const price = Math.max(floor, after[0] ? after[0].price - 1 : now.resale);
      const l = await list(o.name, price, bought);
      await closeEverything();
      const profit = Math.round(bought * price * (1 - MK.fee) - spent);
      note(`Flip: ${bought}× ${o.name} comprado por ${fmt(spent)} e ${l.ok ? 'anunciado a ' + fmt(price) : 'NÃO anunciado'}`, steps.concat([`Lucro se vender tudo: ${fmt(profit)}`, l.ok ? l.summary : 'Anúncio falhou: ' + l.why]));
      return { ok: l.ok, bought, spent, price, profit, why: l.ok ? null : l.why };
    });
  window.__marketBuy = (name, maxPrice, qty) => locked(() => buy(name, maxPrice, qty));
  window.__marketList = (name, price, qty) => locked(() => list(name, price, qty));

  // --- Evolução do pokémon em campo ---
  window.__evolve = () =>
    locked(async () => {
      const b = [...document.querySelectorAll('button.btn-evoluir')].find((x) => x.offsetParent);
      if (!b) return { ok: false, why: 'o pokémon em campo não tem evolução disponível agora' };
      const label = b.textContent.trim();
      b.click();
      await sl(1800);
      const m = window.__top();
      if (!m) return { ok: false, why: 'a janela de evolução não abriu' };
      const pre = m.innerText.replace(/\n+/g, ' | ').slice(0, 320);
      const need = pre.match(/([\w' ]+(?:Stone|Fragmento)[^|]*?) na bolsa (\d+)\/(\d+)/i);
      if (need && +need[2] < +need[3]) return { ok: false, why: `falta ${need[1].trim()}: ${need[2]} de ${need[3]} na bolsa`, pre };
      const go = vis('button', m).find((x) => !x.disabled && /^(Confirmar|Evoluir|Mega Evoluir)/.test(x.textContent.trim()));
      if (!go) return { ok: false, why: 'sem botão de confirmar (requisito não cumprido)', pre };
      const before = window.__rd().poke;
      go.click();
      await sl(3800);
      await closeEverything();
      const after = window.__rd().poke;
      note(`Evolução: ${before} → ${after}`, [`Botão: ${label}`, pre]);
      return { ok: before !== after, before, after, pre };
    });

  // --- Oferenda com o que estiver no Depot ---
  window.__oferenda = () =>
    locked(async () => {
      window.__menu('Abrir Inventário');
      await sl(1500);
      window.__clk('Oferenda');
      await sl(1300);
      const all = vis('button').find((b) => b.textContent.trim() === 'Oferendar tudo do Depot');
      if (!all || all.disabled) return { ok: false, why: 'opção de oferendar o Depot indisponível (Depot vazio?)' };
      all.click();
      await sl(1600);
      const conf = (window.__top() ? window.__top().innerText : '').replace(/\n+/g, ' | ').slice(0, 200);
      const go = anyBtn((t) => /^(Oferendar|Confirmar|Sim)/.test(t) && t !== 'Oferendar tudo do Depot');
      if (go && !go.disabled) {
        go.click();
        await sl(3400);
      }
      const results = [];
      for (let i = 0; i < 12; i++) {
        const show = anyBtn((t) => t === 'Show!');
        if (!show) break;
        results.push(show.parentElement.innerText.replace(/\n+/g, ' ').slice(0, 90));
        show.click();
        await sl(900);
      }
      note(`Oferenda: ${results.length} resultado(s)`, [conf].concat(results));
      return { ok: results.length > 0, results, conf };
    });

  // --- Equipe: reservas mais fortes no banco (no Centro, pelo Depot) ---
  // O primeiro da equipe (em campo) não é mexido; as outras 4 vagas ficam com os de maior nível e, no empate, maior nota.
  const depotRows = (title) =>
    vis('button')
      .filter((b) => b.title === title)
      .map((b) => {
        let row = b;
        for (let i = 0; i < 5 && row; i++) {
          row = row.parentElement;
          if (row && /IV \d+/.test(row.innerText) && /Q \d/.test(row.innerText)) break;
        }
        const t = row ? row.innerText.replace(/\n+/g, ' ') : '';
        const x = t.match(/([A-Za-zÀ-ÿ.'’ -]+?) Nv ?(\d+).*?P(\d) IV (\d+) Q ([\d,]+) N ([\d,]+)/);
        const line = b.closest('.poke-linha');
        // active: é quem está em campo; star: veio da Coleção e volta para ela sozinho ao sair da equipe.
        return x
          ? { b, name: x[1].trim(), lv: +x[2], p: +x[3], iv: +x[4], q: +x[5].replace(',', '.'), n: +x[6].replace(',', '.'), key: `${x[1].trim()}|${x[4]}|${x[5]}`, active: !!(line && line.classList.contains('ativo')), star: !!(line && line.querySelector('.pl-colecao-marca')) }
          : null;
      })
      .filter(Boolean);
  const score = (d) => d.lv * 100 + d.n;
  window.__teamBest = () =>
    locked(async () => {
      if (P.hunting()) return { ok: false, why: 'só dá para trocar a equipe no Centro' };
      const open = document.getElementById('centro-depot');
      if (!open) return { ok: false, why: 'botão do Depot não encontrado no Centro' };
      open.click();
      await sl(1600);
      const tab = async (re) => {
        const t = vis('button').find((b) => re.test(b.textContent.trim().replace(/\s+/g, ' ')));
        if (t) {
          t.click();
          await sl(1200);
        }
        return !!t;
      };
      const team = depotRows('Mandar para o Depot');
      if (!(await tab(/^Coleção\s*\d+/))) return { ok: false, why: 'aba da Coleção não encontrada no Depot' };
      const pool = depotRows('Trazer para a Equipe');
      if (!pool.length) return { ok: true, changed: [], why: 'nenhum candidato na Coleção' };
      // Quem está no banco hoje (tudo menos o mais forte, que é quem caça).
      const active = team.find((t) => t.active) || [...team].sort((a, b) => score(b) - score(a))[0];
      const bench = team.filter((t) => t !== active);
      const wanted = [...bench, ...pool].sort((a, b) => score(b) - score(a)).slice(0, 4);
      const out = bench.filter((t) => !wanted.some((w) => w.key === t.key));
      const inn = wanted.filter((w) => pool.some((p) => p.key === w.key));
      if (!inn.length) return { ok: true, changed: [], why: 'a equipe já tem as reservas mais fortes' };
      const steps = [];
      const text = (d) => `${d.name} Nv ${d.lv} · P${d.p} · IV ${d.iv} · Q ${br(d.q)} · N ${br(d.n)}`;
      // Primeiro abre vaga, depois traz; quem sai vai direto para a Coleção, fora do alcance da venda automática.
      for (const o of out) {
        await tab(/^Equipe|^Depot\s*\d*/);
        const cur = depotRows('Mandar para o Depot').find((x) => x.key === o.key);
        if (!cur) {
          steps.push('Não achei para tirar: ' + text(o));
          continue;
        }
        cur.b.click();
        await sl(1100);
        steps.push('Saiu da equipe: ' + text(o));
      }
      await tab(/^Coleção\s*\d+/);
      for (const i of inn) {
        const cur = depotRows('Trazer para a Equipe').find((x) => x.key === i.key);
        if (!cur) {
          steps.push('Não achei para trazer: ' + text(i));
          continue;
        }
        cur.b.click();
        await sl(1100);
        steps.push('Entrou na equipe: ' + text(i));
      }
      await closeEverything();
      // Quem saiu sem ser da Coleção ficou no Depot: manda para a Coleção antes que a revisão automática venda.
      const loose = out.filter((o) => !o.star);
      if (loose.length) {
        window.__menu('Market');
        await sl(1300);
        window.__clk('Venda Pokémons');
        await sl(1800);
        for (const o of loose) {
          const card = vis('.mk-card').find((c) => {

            const t = c.innerText.replace(/\n+/g, ' ');
            return t.includes(o.name) && t.includes('IV ' + o.iv) && t.includes('Q ' + br(o.q));
          });
          const b = card && [...card.querySelectorAll('button')].find((x) => /Coleção/.test(x.title || ''));
          if (b) {
            b.click();
            await sl(1100);
            steps.push('Guardado na Coleção: ' + text(o));
          } else steps.push('ATENÇÃO: não consegui guardar na Coleção: ' + text(o));
        }
      }
      note(`Equipe atualizada: ${inn.length} troca(s)`, steps);
      return { ok: true, changed: steps };
    });

  // --- Rotinas periódicas (chamadas a cada minuto pelo agendador do script principal) ---
  let lastStones = 0;
  let lastFlip = 0;
  let lastScanLv = window.__pkMap ? window.__pkMap.lv : 0;
  window.__pkTick = async (ticks) => {
    const A = window.__pkAuto || {};
    if (A.guard !== false) await window.__guard();
    if (A.passe && Date.now() >= passe.nextAt) await window.__passeClaim();
    if (A.stones && Date.now() - lastStones > 60 * 60000 && ticks % 5 === 3) {
      lastStones = Date.now();
      await window.__sellStones();
    }
    if (A.flip && Date.now() - lastFlip > 20 * 60000 && ticks % 5 === 4) {
      lastFlip = Date.now();
      const r = await window.__flipScan();
      if (r.ok && r.opps.length) await window.__flipRun(r.opps[0]);
    }
    // Mapa relido quando nunca foi, a cada 2 h, ou quando o nível chega a um múltiplo de 50 (onde as regiões abrem).
    const lv = window.__rd().lv;
    const stale = !window.__pkMap || Date.now() - window.__pkMap.at > 2 * 3600000 || (lv % 50 === 0 && lv !== lastScanLv);
    if (stale && !window.__top()) {
      const m = await window.__mapScan();
      if (m) lastScanLv = lv;
    }
  };

  // Novidades que o próprio jogo lista na tela de avisos.
  window.__news = () => [...document.querySelectorAll('li[data-i18n-html^="aviso."]')].map((li) => li.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 8);

  window.__pkExtra = () => ({

    passeNext: passe.nextAt || null,
    passeLast: passe.last,
    flip: window.__pkFlip ? { at: window.__pkFlip.at, scanned: window.__pkFlip.scanned, budget: window.__pkFlip.budget, opps: window.__pkFlip.opps } : null,
    evolve: (() => {
      const b = [...document.querySelectorAll('button.btn-evoluir')].find((x) => x.offsetParent);
      return b ? b.textContent.trim() : null;
    })(),
  });
  return 'ok';
})();
