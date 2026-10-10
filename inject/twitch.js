// Injetado nas lives da Twitch: mantém o vídeo tocando em qualidade baixa e passa pelos avisos de conteúdo.
(() => {
  // Reinjetar troca a versão em uso: os timers da anterior são encerrados.
  (window.__pkTimers || []).forEach(clearInterval);
  const timers = (window.__pkTimers = []);
  window.__pkTwitch = true;
  try {
    localStorage.setItem('video-quality', '{"default":"160p30"}');
    localStorage.setItem('video-muted', '{"default":false}');
    localStorage.setItem('volume', '0.02');
  } catch (e) {}

  // Dieta da página: o chat continua conectado (é ele que conta a presença), mas não é desenhado, e nada anima.
  if (!document.getElementById('pk-diet')) {
    const st = document.createElement('style');
    st.id = 'pk-diet';
    st.textContent =
      '.chat-scrollable-area__message-container,.side-nav,#side-nav,.channel-root__info,.community-highlight-stack__scroll-area--disable{content-visibility:hidden!important}' +
      '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.documentElement.appendChild(st);
  }

  // A página pode ter outros vídeos (a animação de uma recompensa resgatada, um anúncio): o da live é o maior que está carregado.
  const liveVideo = () => {
    const all = [...document.querySelectorAll('video')].filter((v) => !/\/(rewards|ads)\//.test(v.currentSrc || v.src || ''));
    const area = (v) => v.videoWidth * v.videoHeight || v.clientWidth * v.clientHeight;
    return all.sort((a, b) => (b.readyState > 1) - (a.readyState > 1) || a.paused - b.paused || area(b) - area(a))[0] || null;
  };
  const GATES = [
    '[data-a-target="content-classification-gate-overlay-start-watching-button"]',
    '[data-a-target="player-overlay-mature-accept"]',
  ];
  const tick = () => {
    try {
      for (const sel of GATES) {
        const b = document.querySelector(sel);
        if (b && b.offsetParent) b.click();
      }
      const v = liveVideo();
      if (v) {
        // O som fica cortado pela própria aba; o player precisa estar com som para contar presença.
        if (v.muted) v.muted = false;
        if (v.volume > 0.05) v.volume = 0.02;
        if (v.paused) v.play().catch(() => {});
      }
    } catch (e) {}
  };
  window.__pkState = () => {
    const v = liveVideo();
    return {
      playing: !!(v && !v.paused && v.readyState > 2),
      height: v ? v.videoHeight : 0,
      logged: /(^|; )login=/.test(document.cookie),
    };
  };
  timers.push(setInterval(tick, 20000));
  setTimeout(tick, 6000);
  return 'ok';
})();
