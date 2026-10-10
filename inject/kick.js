// Injetado nas lives da Kick: mantém o vídeo tocando, fecha o aviso de boas-vindas e expõe o estado para o app.
(() => {
  // Reinjetar troca a versão em uso: os timers da anterior são encerrados.
  (window.__pkTimers || []).forEach(clearInterval);
  const timers = (window.__pkTimers = []);
  window.__pkKick = true;

  // Qualidade do vídeo: o player da Kick lê a preferência desta chave ao carregar. Sem isso ele toca em 720p
  // mesmo com a aba pequena e em segundo plano, que é quase todo o custo de CPU de uma live.
  const Q = String((window.__PK_CFG && window.__PK_CFG.kickQuality) || 0);
  try {
    if (Q !== '0' && sessionStorage.getItem('stream_quality') !== Q) {
      sessionStorage.setItem('stream_quality', Q);
      // Uma recarga só, para o player já nascer na qualidade pedida.
      if (sessionStorage.getItem('pk_quality_reload') !== Q) {
        sessionStorage.setItem('pk_quality_reload', Q);
        location.reload();
        return 'recarregando';
      }
    }
  } catch (e) {}

  // Dieta da página: nada anima (letreiros e transições redesenham a página o tempo todo).
  if (!document.getElementById('pk-diet')) {
    const st = document.createElement('style');
    st.id = 'pk-diet';
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.documentElement.appendChild(st);
  }

  // A página pode ter outros vídeos (a animação de uma recompensa resgatada, um anúncio): o da live é o maior que está carregado.
  const liveVideo = () => {
    const all = [...document.querySelectorAll('video')].filter((v) => !/\/(rewards|ads)\//.test(v.currentSrc || v.src || ''));
    const area = (v) => v.videoWidth * v.videoHeight || v.clientWidth * v.clientHeight;
    return all.sort((a, b) => (b.readyState > 1) - (a.readyState > 1) || a.paused - b.paused || area(b) - area(a))[0] || null;
  };
  const visible = (re) => [...document.querySelectorAll('button')].some((b) => b.offsetParent && re.test(b.innerText));

  const welcome = () => visible(/Comece agora|Get started/i);
  const tick = () => {
    try {
      // Enquanto esse aviso fica na tela a Kick não conta o tempo assistido; Esc fecha sem responder.
      if (welcome()) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      }
      const v = liveVideo();
      if (v) {
        // O som fica cortado pela própria aba; o player precisa estar com som para não ser pausado.
        if (v.muted) v.muted = false;
        if (v.volume > 0.05) v.volume = 0.02;
        if (v.paused) v.play().catch(() => {});
      }
    } catch (e) {}
  };
  window.__pkState = () => {
    const v = liveVideo();
    // O contador de pontos é o botão com o ícone de bolhas. Apelidos do chat também são botões,
    // e um apelido só de números já foi lido como se fossem os pontos.
    const pb = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.querySelector('svg[data-ds-icon="Bubbles"]'));
    const raw = pb ? pb.innerText.trim() : '';
    const pts = /^\d+([.,]\d+)?( mil)?$/.test(raw) ? raw : null;
    // O contador de pontos do canal só aparece para quem está logado.
    return { points: pts || null, logged: !!pts, playing: !!(v && !v.paused), height: v ? v.videoHeight : 0, dialog: welcome() };
  };
  timers.push(setInterval(tick, 10000));
  setTimeout(tick, 4000);
  return 'ok';
})();
