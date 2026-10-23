'use strict';
(() => {
  const $ = id => document.getElementById(id), W = 1170, H = 2532;
  const art = $('art'), fx = $('fx'), a = art.getContext('2d'), g = fx.getContext('2d');
  const clips = {}, loaded = new Map(), inflight = new Map(), motes = [], flights = [];
  const phrases = ['Слизерин одобряет. Лиса особенно.', 'За такое полагается пять баллов и печенье.', 'Торжественно клянусь: замышляю только приятное.', 'Хитрость — это когда удача думает, что сама тебя нашла.', 'Твоя магия работает. Проверено пушистым экспертом.', 'Лиса уже записала тебя в список любимых волшебниц.', 'Доставка завершена. Вознаграждение принято печеньем.'];
  const state = { ready: false, screen: 'intro', busy: false, stars: 0, clip: 'idle', frame: 0, flights: 0, landings: 0, actionCount: 0, version: 0, loading: false };
  let frame = null, lastDraw = '', bitmapScale = 1, clock = performance.now(), now = clock, last = now, active = null, idleDue = now + 2200, idleRun = 0, wandPoints = [], lastSpellEmission = 0;
  function resize() {
    const height = window.visualViewport ? window.visualViewport.height : innerHeight;
    const width = Math.min(innerWidth, height * W / H), scale = width / W;
    $('viewport').style.width = width + 'px'; $('viewport').style.height = height + 'px'; $('stage').style.transform = `scale(${scale})`;
    const dpr = Math.min(devicePixelRatio || 1, 1.5); bitmapScale = width * dpr / W;
    for (const c of [art, fx]) { c.width = Math.round(W * bitmapScale); c.height = Math.round(H * bitmapScale); }
    a.setTransform(bitmapScale, 0, 0, bitmapScale, 0, 0); g.setTransform(bitmapScale, 0, 0, bitmapScale, 0, 0); lastDraw = '';
  }
  addEventListener('resize', resize); if (window.visualViewport) visualViewport.addEventListener('resize', resize); resize();
  function image(url) {
    if (loaded.has(url)) return Promise.resolve(loaded.get(url));
    if (inflight.has(url)) return inflight.get(url);
    const pending = new Promise((resolve, reject) => { const im = new Image(); im.onload = () => { loaded.set(url, im); inflight.delete(url); resolve(im); }; im.onerror = () => { inflight.delete(url); reject(Error('Не удалось загрузить ' + url)); }; im.src = url; });
    inflight.set(url, pending); return pending;
  }
  async function loadClip(name) {
    const urls = [...new Set(clips[name].map(f => f.assetURL))];
    for (const url of urls) await image(url);
    const keep = new Set([...urls, ...clips.idle.map(f => f.assetURL), 'assets/icons_sheet.png']);
    for (const [url] of loaded) if (!keep.has(url)) loaded.delete(url);
  }
  function showFrame(value) { frame = value; state.clip = value.clip; state.frame = value.frameIndex; }
  function drawArt() {
    if (!frame) return;
    const key = frame.clip + ':' + frame.frameIndex;
    if (key === lastDraw) return;
    const im = loaded.get(frame.assetURL); if (!im) return;
    a.clearRect(0, 0, W, H);
    const r = frame.sourceRect, d = frame.canvasDestination;
    a.drawImage(im, r.x, frame.sourceTextureHeight - r.y - r.height, r.width, r.height, d.x, d.y, d.width, d.height); lastDraw = key;
  }
  function play(name) {
    const list = clips[name], duration = list.reduce((sum, f) => sum + f.holdSeconds * 1000, 0);
    return new Promise(resolve => { active = { name, started: performance.now(), duration, list, resolve, version: state.version }; showFrame(list[0]); });
  }
  function burst(x, y, count = 18) {
    for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2, speed = 90 + Math.random() * 170; motes.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: .6 + Math.random() * .55, size: 5 + Math.random() * 8, color: Math.random() < .25 ? '#94e2b5' : '#ffe59a' }); }
    if (motes.length > 120) motes.splice(0, motes.length - 120);
  }
  function starPath(x, y, size, alpha = 1, color = '#ffe59a') {
    g.beginPath(); for (let i = 0; i < 10; i++) { const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? size * .43 : size; const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); g.globalAlpha = alpha; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 18; g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
  }
  function flyStar(version) {
    state.flights++;
    return new Promise(resolve => flights.push({ started: performance.now(), x: 585, y: 1050, targetX: 315 + state.stars * 90, targetY: 360, version, resolve }));
  }
  function updateStars() {
    const all = $('stars').children;
    for (let i = 0; i < 7; i++) { all[i].src = 'assets/' + (i < state.stars ? 'star.png' : 'star_empty.png'); all[i].classList.toggle('landed', i === state.stars - 1); }
    $('stars').setAttribute('aria-label', `Собрано искр: ${state.stars} из 7`); $('counter').textContent = `Магия собрана: ${state.stars} / 7`;
    $('actions').hidden = state.stars >= 7; $('open').hidden = state.stars < 7;
  }
  function controls() { document.querySelectorAll('[data-action],#open,#start').forEach(button => button.disabled = !state.ready || state.busy); }
  async function action(name) {
    if (!state.ready || state.busy || state.screen !== 'room' || state.stars >= 7 || !['pet', 'feed', 'magic'].includes(name)) return false;
    state.busy = true; controls(); const version = state.version;
    try {
      state.loading = true; $('status').textContent = 'Лиса готовит маленькое чудо…'; await loadClip(name);
      if (version !== state.version) return false;
      state.loading = false; $('status').textContent = ''; state.actionCount++;
      await play(name); if (version !== state.version) return false;
      $('phrase').textContent = phrases[state.stars]; burst(585, 1020, 26);
      showFrame(clips.idle[0]); await flyStar(version); if (version !== state.version) return false;
      state.stars++; state.landings++; updateStars();
      if (state.stars === 7) { $('phrase').textContent = 'Семь искр собрано.\nСекретное письмо для Лизы готово!'; for (let i = 0; i < 7; i++) setTimeout(() => { if (state.version === version) burst(180 + i * 135, 340, 18); }, i * 80); }
      idleDue = performance.now() + 1600; return true;
    } catch (error) { $('status').textContent = error.message + '. Попробуй ещё раз.'; return false; }
    finally { if (version === state.version) { state.busy = false; state.loading = false; controls(); } }
  }
  function start() { if (!state.ready || state.busy) return false; state.screen = 'room'; $('intro').hidden = true; $('room').hidden = false; $('letter').hidden = true; showFrame(clips.idle[0]); idleDue = performance.now() + 1800; return true; }
  async function openLetter() {
    if (!state.ready || state.busy || state.stars < 7 || state.screen !== 'room') return false;
    state.busy = true; controls(); const version = state.version;
    try { await loadClip('letter'); if (version !== state.version) return false; await play('letter'); if (version !== state.version) return false; state.screen = 'letter'; $('room').hidden = true; $('letter').hidden = false; motes.length = 0; return true; }
    catch (error) { $('status').textContent = error.message; return false; }
    finally { if (version === state.version) { state.busy = false; controls(); } }
  }
  function closeLetter() { if (state.busy) return false; $('letter').hidden = true; $('room').hidden = false; state.screen = 'room'; showFrame(clips.idle[0]); idleDue = performance.now() + 1800; return true; }
  function reset() {
    state.version++; if (active) { active.resolve(false); active = null; } for (const f of flights) f.resolve(false); flights.length = motes.length = 0;
    state.stars = 0; state.busy = false; state.loading = false; state.screen = 'room'; $('letter').hidden = $('intro').hidden = true; $('room').hidden = false;
    $('phrase').textContent = 'Я не хитрая. Я стратег.\nСоберём семь искр — и письмо твоё!'; updateStars(); controls(); showFrame(clips.idle[0]); idleDue = performance.now() + 1800; return true;
  }
  function tick(time) {
    now = time; const dt = Math.min((now - last) / 1000, .05); last = now;
    if (active) {
      const elapsed = now - active.started; let cursor = 0, selected = active.list.length - 1;
      for (let i = 0; i < active.list.length; i++) { cursor += active.list[i].holdSeconds * 1000; if (elapsed < cursor) { selected = i; break; } }
      showFrame(active.list[selected]); if (elapsed >= active.duration) { const complete = active.resolve; active = null; complete(true); }
    } else if (state.ready && !state.busy && state.screen !== 'letter') {
      if (!idleRun && now >= idleDue) { idleRun = now; }
      if (idleRun) { let elapsed = now - idleRun, sum = 0, index = 0; for (let i = 0; i < clips.idle.length; i++) { sum += clips.idle[i].holdSeconds * 1000; if (elapsed < sum) { index = i; break; } } showFrame(clips.idle[index]); if (elapsed >= sum) { idleRun = 0; idleDue = now + 2300; showFrame(clips.idle[0]); } }
    }
    drawArt(); g.clearRect(0, 0, W, H);
    if (active && active.name === 'magic' && frame) {
      const point = wandPoints[frame.frameIndex];
      if (point && point.visible && frame.sourcePath.endsWith('/' + point.fileName)) {
        const r = frame.sourceRect, d = frame.canvasDestination, tip = point.fullSourceUnityTip;
        const x = d.x + (tip.x - r.x) / r.width * d.width, y = d.y + (r.y + r.height - tip.y) / r.height * d.height;
        starPath(x, y, 14 + Math.sin(now / 90) * 3, .8);
        if (now - lastSpellEmission > 80) { lastSpellEmission = now; burst(x, y, 3); }
      }
    }
    for (let i = flights.length - 1; i >= 0; i--) { const f = flights[i], p = Math.min((now - f.started) / 750, 1), t = p * p * (3 - 2 * p); starPath(f.x + (f.targetX - f.x) * t + Math.sin(p * Math.PI) * 90, f.y + (f.targetY - f.y) * t, 35 - p * 7); if (p >= 1) { flights.splice(i, 1); burst(f.targetX, f.targetY, 16); f.resolve(true); } }
    for (let i = motes.length - 1; i >= 0; i--) { const p = motes[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt; if (p.age >= p.life) { motes.splice(i, 1); continue; } starPath(p.x, p.y, p.size, Math.sin(Math.PI * p.age / p.life), p.color); }
    if (state.screen === 'room' && !state.loading) for (let i = 0; i < 7; i++) { const t = now / 1000, x = 130 + i * 151 + Math.sin(t * .4 + i) * 18, y = 520 + (i * 173 + t * 20) % 1000; starPath(x, y, 3 + Math.sin(t * 2 + i) * 1.5, .15 + .18 * (1 + Math.sin(t + i))); }
    requestAnimationFrame(tick);
  }
  async function boot() {
    try {
      const [report, iconData, letter, wand] = await Promise.all([fetch('nativecaptures.json').then(r => r.json()), fetch('icons.json').then(r => r.json()), fetch('letter.txt').then(r => r.text()), fetch('wand.json').then(r => r.json())]);
      wandPoints = wand.frames;
      for (const f of report.captures) (clips[f.clip] ||= []).push(f); for (const list of Object.values(clips)) list.sort((x, y) => x.frameIndex - y.frameIndex);
      const icons = await image('assets/icons_sheet.png');
      for (const c of document.querySelectorAll('[data-icon]')) { c.width = c.height = 200; const r = iconData.icons.find(i => i.name === c.dataset.icon).spriteRect, ctx = c.getContext('2d'), fit = Math.min(200 / r.width, 200 / r.height); ctx.drawImage(icons, r.x, icons.height - r.y - r.height, r.width, r.height, (200 - r.width * fit) / 2, (200 - r.height * fit) / 2, r.width * fit, r.height * fit); }
      $('letterText').textContent = letter; $('phrase').textContent = 'Я не хитрая. Я стратег.\nСоберём семь искр — и письмо твоё!'; for (let i = 0; i < 7; i++) { const im = document.createElement('img'); im.className = 'star'; im.alt = ''; $('stars').append(im); } updateStars();
      await loadClip('idle'); showFrame(clips.idle[0]); state.ready = true; controls(); $('status').textContent = '';
      const urls = [...new Set(report.captures.map(f => f.assetURL))].filter(u => !loaded.has(u)); let count = 0;
      for (const url of urls) { try { const response = await fetch(url, { cache: 'force-cache' }); await response.arrayBuffer(); } catch (_) {} count++; if (!state.busy) $('status').textContent = count === urls.length ? '' : `Остальная магия загружается: ${count} / ${urls.length}`; }
    } catch (error) { $('status').textContent = error.message + '. Обнови страницу.'; console.error(error); }
  }
  $('start').onclick = start; $('open').onclick = openLetter; $('close').onclick = closeLetter; $('replay').onclick = reset;
  document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => action(button.dataset.action));
  $('touch').onclick = () => { if (!state.busy && state.screen === 'room') burst(585, 1120, 20); };
  window.foxPreview = { getState: () => ({ ...state, decodedAtlasCount: loaded.size }), start, play: action, openLetter, closeLetter, reset, clips };
  requestAnimationFrame(tick); boot();
})();
