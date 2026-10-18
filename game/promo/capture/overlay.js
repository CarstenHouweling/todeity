// Trailer captions and cards, injected into the game page so they land in the captured frames.
(() => {
  if (window.__cap) return;
  const style = document.createElement('style');
  style.textContent = `
  #promo-cap { position: fixed; left: 44px; bottom: 96px; z-index: 9999; pointer-events: none; font-family: system-ui, -apple-system, sans-serif; }
  #promo-cap .t { font-size: 46px; font-weight: 900; color: #fff; letter-spacing: 0.5px; line-height: 1.05;
    text-shadow: 0 3px 0 rgba(0,0,0,.35), 0 0 24px rgba(0,0,0,.55), 0 0 4px rgba(0,0,0,.6); }
  #promo-cap .s { margin-top: 8px; font-size: 19px; font-weight: 800; color: #ffe27a; letter-spacing: 2.5px; text-transform: uppercase;
    text-shadow: 0 2px 0 rgba(0,0,0,.45), 0 0 14px rgba(0,0,0,.7); }
  #promo-cap .bar { width: 64px; height: 5px; border-radius: 3px; background: linear-gradient(90deg,#ffd34d,#ff9a3c); margin-bottom: 12px; box-shadow: 0 0 12px rgba(255,190,60,.7); }
  #promo-cap.center { left: 0; right: 0; bottom: auto; top: 50%; transform: translateY(-50%); text-align: center; }
  #promo-cap.tl { left: 40px; top: 120px; bottom: auto; max-width: 300px; }
  #promo-cap.tl .t { font-size: 40px; }
  #promo-cap.center .bar { margin: 0 auto 14px; }
  #promo-cap.center .t { font-size: 58px; }
  #promo-cap.in .bar { animation: pc-bar .5s cubic-bezier(.2,.8,.2,1) both; }
  #promo-cap.in .t { animation: pc-in .45s cubic-bezier(.2,.8,.2,1) both; }
  #promo-cap.in .s { animation: pc-in .45s .12s cubic-bezier(.2,.8,.2,1) both; }
  #promo-cap.out { animation: pc-out .3s ease-in both; }
  @keyframes pc-in { from { opacity: 0; transform: translateX(-40px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
  #promo-cap.center.in .t, #promo-cap.center.in .s { animation-name: pc-up; }
  @keyframes pc-up { from { opacity: 0; transform: translateY(24px) scale(.96); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
  @keyframes pc-bar { from { width: 0; opacity: 0; } to { width: 64px; opacity: 1; } }
  @keyframes pc-out { to { opacity: 0; transform: translateY(10px); } }
  #promo-card { position: fixed; inset: 0; z-index: 9998; display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, sans-serif; color: #fff; text-align: center; pointer-events: none;
    background: radial-gradient(ellipse at center, rgba(8,30,12,.55), rgba(4,14,6,.9)); }
  #promo-card.in { animation: pc-fade .6s ease-out both; }
  #promo-card.in > * { animation: pc-up .7s cubic-bezier(.2,.8,.2,1) both; }
  #promo-card.in > *:nth-child(2) { animation-delay: .15s } #promo-card.in > *:nth-child(3) { animation-delay: .35s }
  #promo-card.in > *:nth-child(4) { animation-delay: .5s } #promo-card.in > *:nth-child(5) { animation-delay: .65s } #promo-card.in > *:nth-child(6) { animation-delay: .8s }
  @keyframes pc-fade { from { opacity: 0 } to { opacity: 1 } }
  #promo-card h1 { margin: 0; font-size: 112px; font-weight: 900; color: #e9ffd9; letter-spacing: 1px; line-height: 1;
    text-shadow: 0 6px 0 rgba(0,0,0,.35), 0 0 40px rgba(120,255,140,.25); }
  #promo-card .sub { margin-top: 6px; font-size: 30px; font-weight: 800; letter-spacing: 6px; color: #ffe680; text-transform: uppercase;
    text-shadow: 0 0 16px rgba(255,180,40,.8), 0 2px 0 rgba(0,0,0,.4); }
  #promo-card .play { margin-top: 44px; padding: 14px 34px; border-radius: 999px; background: linear-gradient(180deg,#ffd76a,#f4a523);
    color: #3a2300; font-size: 26px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; box-shadow: 0 8px 30px rgba(255,170,40,.45); }
  #promo-card .url { margin-top: 18px; font-size: 32px; font-weight: 800; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
  #promo-card .meta { margin-top: 22px; font-size: 17px; font-weight: 700; color: rgba(233,255,217,.85); letter-spacing: 1px; }
  #promo-card .tag { margin-top: 12px; font-size: 16px; font-weight: 800; color: #ffe680; letter-spacing: 1px; }
  /* The Journey: chapter cards (a numeral between rules, the arena's name) and story lines in a serif. */
  #promo-chap { position: fixed; left: 0; right: 0; bottom: 110px; z-index: 9999; pointer-events: none; text-align: center; color: #fff;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; }
  #promo-chap .n { display: inline-flex; align-items: center; gap: 22px; font-size: 40px; letter-spacing: 10px; color: #ffe27a; font-weight: 700;
    text-shadow: 0 0 14px rgba(255,190,60,.7), 0 2px 0 rgba(0,0,0,.5); }
  #promo-chap .n::before, #promo-chap .n::after { content: ''; width: 90px; height: 2px; background: linear-gradient(90deg, transparent, #ffe27a, transparent); }
  #promo-chap .t { margin-top: 6px; font-size: 64px; font-weight: 700; letter-spacing: 1px; text-shadow: 0 4px 0 rgba(0,0,0,.35), 0 0 30px rgba(0,0,0,.6); }
  #promo-chap.story .t { font-size: 46px; font-style: italic; font-weight: 600; }
  #promo-chap.in .n { animation: pc-fade 1s ease-out both; } #promo-chap.in .t { animation: pc-rise 1.1s .15s cubic-bezier(.2,.8,.2,1) both; }
  #promo-chap.out { animation: pc-out .5s ease-in both; }
  @keyframes pc-rise { from { opacity: 0; transform: translateY(16px); letter-spacing: 6px; filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
  body.promo-bars::before, body.promo-bars::after { content: ''; position: fixed; left: 0; right: 0; height: 9vh; background: #000; z-index: 9997; pointer-events: none; }
  body.promo-bars::before { top: 0; } body.promo-bars::after { bottom: 0; }
  /* The vertical short: big stacked hook text near the top, one highlighted word. */
  #promo-big { position: fixed; left: 24px; right: 24px; top: 13vh; z-index: 9999; pointer-events: none; text-align: center;
    font-family: system-ui, -apple-system, sans-serif; font-weight: 950; text-transform: uppercase; color: #fff; line-height: .98; font-size: 54px; letter-spacing: -.5px;
    -webkit-text-stroke: 2px rgba(0,0,0,.55); paint-order: stroke fill; text-shadow: 0 5px 0 rgba(0,0,0,.45), 0 0 26px rgba(0,0,0,.55); }
  #promo-big em { font-style: normal; color: #ffd84a; }
  #promo-big.in { animation: pc-pop .32s cubic-bezier(.2,1.6,.4,1) both; }
  @keyframes pc-pop { from { opacity: 0; transform: scale(.6) rotate(-3deg); } to { opacity: 1; transform: none; } }
  #promo-card.tall h1 { font-size: 92px; } #promo-card.tall .sub { font-size: 24px; letter-spacing: 4px; }
  #promo-card.tall .play { font-size: 22px; margin-top: 60px; } #promo-card.tall .url { font-size: 26px; } #promo-card.tall .meta { font-size: 16px; padding: 0 30px; line-height: 1.5; }
  .toasts { display: none !important; }
  body.promo-noui .menu, body.promo-noui .hud, body.promo-noui .corner-buttons, body.promo-noui .toasts { visibility: hidden !important; }
  body.promo-nopills .title-pills, body.promo-nopills .save-pill { display: none !important; }
  `;
  document.head.append(style);
  const cap = document.createElement('div');
  cap.id = 'promo-cap';
  document.body.append(cap);
  window.__cap = (title, sub = '', mode = '') => {
    if (!title) {
      if (cap.innerHTML) cap.className = `out ${cap.dataset.mode || ''}`;
      return;
    }
    cap.dataset.mode = mode;
    cap.className = '';
    cap.innerHTML = `<div class="bar"></div><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
    void cap.offsetWidth;
    cap.className = `in ${mode}`;
  };
  window.__capClear = () => ((cap.innerHTML = ''), (cap.className = ''));
  window.__card = (html) => {
    document.getElementById('promo-card')?.remove();
    if (!html) return;
    const card = document.createElement('div');
    card.id = 'promo-card';
    card.innerHTML = html;
    document.body.append(card);
    void card.offsetWidth;
    card.className = 'in';
  };
  window.__endCard = () =>
    __card(`<h1>Todeity</h1><div class="sub">Rise of the Tea God</div><div class="play">▶ Play free in your browser</div>
      <div class="url">todeity.azurewebsites.net</div>
      <div class="meta">Solo or co-op for up to 4 · keyboard, mouse or touch · a new Daily Brew every day</div>
      <div class="tag">#JetBrainsGameChallenge</div>`);
  const chap = document.createElement('div');
  chap.id = 'promo-chap';
  document.body.append(chap);
  // __chapter('II', 'Sage Mountain'), __chapter(null, 'It began with a cup of tea.') for a story line, __chapter() to fade out.
  window.__chapter = (num, title) => {
    if (!title) return chap.innerHTML && (chap.className = 'out ' + (chap.dataset.mode || ''));
    chap.dataset.mode = num ? '' : 'story';
    chap.className = '';
    chap.innerHTML = `${num ? `<div class="n">${num}</div>` : ''}<div class="t">${title}</div>`;
    void chap.offsetWidth;
    chap.className = 'in ' + chap.dataset.mode;
  };
  window.__bars = (on) => document.body.classList.toggle('promo-bars', on);
  const big = document.createElement('div');
  big.id = 'promo-big';
  document.body.append(big);
  // __big('Then 1,000 <em>bees</em> showed up'), __big() to clear (cuts are hard in the short).
  window.__big = (html) => {
    big.className = '';
    big.innerHTML = html || '';
    if (!html) return;
    void big.offsetWidth;
    big.className = 'in';
  };
  window.__endCardTall = () => {
    __card(`<h1>Todeity</h1><div class="sub">Rise of the Tea God</div><div class="play">▶ Play free in your browser</div>
      <div class="url">todeity.azurewebsites.net</div>
      <div class="meta">Phone, tablet or desktop · solo or co-op for up to 4</div>
      <div class="tag">#JetBrainsGameChallenge</div>`);
    document.getElementById('promo-card').classList.add('tall');
  };
  window.__noUI = (on) => document.body.classList.toggle('promo-noui', on);
})();
// Footage: no "LEVEL UP!" callouts (level picks are held for the wave's end).
(() => {
  const el = document.querySelector('.callout');
  if (!el) return;
  const check = () => (el.style.visibility = /LEVEL UP/.test(el.textContent) ? 'hidden' : '');
  new MutationObserver(check).observe(el, { childList: true, characterData: true, subtree: true });
})();
