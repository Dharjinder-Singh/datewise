(() => {
  'use strict';

  const MAX_TRIES = 4;
  const PUZZLE_SIZE = 5;
  // Puzzle #1 is 12 Oct 2026 (local date).
  const EPOCH = Date.UTC(2026, 9, 12);
  const STORE = 'datewise:';

  const CATS = {
    history: { label: 'History', emoji: '🏛️' },
    india: { label: 'India', emoji: '🪔' },
    science: { label: 'Science', emoji: '🔬' },
    space: { label: 'Space', emoji: '🚀' },
    tech: { label: 'Tech', emoji: '💡' },
    film: { label: 'Film & TV', emoji: '🎬' },
    music: { label: 'Music', emoji: '🎵' },
    sport: { label: 'Sport', emoji: '🏆' },
    landmark: { label: 'Landmarks', emoji: '🗼' },
    culture: { label: 'Culture', emoji: '📚' },
    games: { label: 'Games', emoji: '🎮' },
  };

  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function todayNumber() {
    const d = new Date();
    const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.max(1, Math.floor((local - EPOCH) / 86400000) + 1);
  }

  function formatYear(y) {
    return y < 0 ? `${-y} BC` : String(y);
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(STORE + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(STORE + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: game still works for this session */
    }
  }

  function track(event, props) {
    try {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture(event, props);
      }
    } catch {
      /* analytics must never break the game */
    }
  }

  // ---------- Puzzles ----------
  const POOL = window.DATEWISE_EVENTS.map((e, i) => ({ id: i, title: e[0], year: e[1], cat: e[2] }));
  // Fixed permutation so consecutive days don't repeat events until the pool cycles.
  const DAILY_ORDER = shuffle(POOL, mulberry32(20261012));

  function pickDistinctYears(list, start) {
    const out = [];
    const years = new Set();
    for (let k = 0; k < list.length && out.length < PUZZLE_SIZE; k++) {
      const ev = list[(start + k) % list.length];
      if (years.has(ev.year)) continue;
      years.add(ev.year);
      out.push(ev);
    }
    return out;
  }

  function scrambledOrder(events, seed) {
    const correct = sortedIds(events);
    let best = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const ids = shuffle(events.map((e) => e.id), mulberry32(seed + attempt * 977));
      const fixed = ids.filter((id, i) => id === correct[i]).length;
      if (fixed === 0) return ids;
      if (fixed <= 1 && !best) best = ids;
    }
    return best || events.map((e) => e.id).reverse();
  }

  function sortedIds(events) {
    return events.slice().sort((a, b) => a.year - b.year).map((e) => e.id);
  }

  function dailyPuzzle(n) {
    const events = pickDistinctYears(DAILY_ORDER, ((n - 1) * PUZZLE_SIZE) % DAILY_ORDER.length);
    return { events, start: scrambledOrder(events, n * 7919) };
  }

  function randomPuzzle() {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const events = pickDistinctYears(shuffle(POOL, mulberry32(seed)), 0);
    return { events, start: scrambledOrder(events, seed ^ 0x5bd1e995) };
  }

  // ---------- State ----------
  const today = todayNumber();
  let game = null;
  const cardEls = new Map();
  let selectedId = null;

  function newGame(mode, n) {
    const puzzle = mode === 'practice' ? randomPuzzle() : dailyPuzzle(n);
    const byId = new Map(puzzle.events.map((e) => [e.id, e]));
    const saved = mode === 'practice' ? null : load(`game:${n}`, null);
    const base = {
      mode,
      n,
      byId,
      correct: sortedIds(puzzle.events),
      order: puzzle.start.slice(),
      tries: [],
      hints: {},
      done: false,
      won: false,
    };
    if (saved && Array.isArray(saved.order) && saved.order.every((id) => byId.has(id))) {
      base.order = saved.order;
      base.tries = saved.tries || [];
      base.done = !!saved.done;
      base.won = !!saved.won;
      const last = base.tries[base.tries.length - 1];
      if (last) base.order.forEach((id, i) => { base.hints[id] = last[i]; });
    }
    return base;
  }

  function persist() {
    if (game.mode === 'practice') return;
    save(`game:${game.n}`, { order: game.order, tries: game.tries, done: game.done, won: game.won });
  }

  function isLocked(id) {
    return game.done || game.hints[id] === 'ok';
  }

  // ---------- Rendering ----------
  const listEl = $('#cards');

  function buildCards() {
    listEl.innerHTML = '';
    cardEls.clear();
    game.order.forEach((id) => {
      const ev = game.byId.get(id);
      const cat = CATS[ev.cat] || CATS.history;
      const li = document.createElement('li');
      li.className = 'card';
      li.dataset.id = id;
      li.tabIndex = 0;
      li.innerHTML = `
        <span class="card-emoji" aria-hidden="true">${cat.emoji}</span>
        <span class="card-body">
          <span class="card-title"></span>
          <span class="card-cat">${cat.label}</span>
        </span>
        <span class="card-side">
          <span class="card-hint" aria-hidden="true"></span>
          <span class="card-year"></span>
          <span class="card-grip" aria-hidden="true">⋮⋮</span>
        </span>`;
      li.querySelector('.card-title').textContent = ev.title;
      li.querySelector('.card-year').textContent = formatYear(ev.year);
      listEl.appendChild(li);
      cardEls.set(id, li);
    });
    paint();
  }

  function paint() {
    game.order.forEach((id, i) => {
      const el = cardEls.get(id);
      const hint = game.hints[id];
      el.classList.toggle('is-ok', hint === 'ok');
      el.classList.toggle('is-up', hint === 'up');
      el.classList.toggle('is-down', hint === 'down');
      el.classList.toggle('is-selected', selectedId === id);
      el.classList.toggle('is-revealed', game.done);
      el.classList.toggle('is-wrong-final', game.done && !game.won && hint !== 'ok');
      el.querySelector('.card-hint').textContent = hint === 'ok' ? '✓' : hint === 'up' ? '↑' : hint === 'down' ? '↓' : '';
      const ev = game.byId.get(id);
      const state = hint === 'ok' ? ', locked in correct spot' : hint === 'up' ? ', belongs higher' : hint === 'down' ? ', belongs lower' : '';
      el.setAttribute('aria-label', `${i + 1}. ${ev.title}${game.done ? ', ' + formatYear(ev.year) : ''}${state}`);
    });

    const label = game.mode === 'practice' ? 'Practice' : `#${game.n}`;
    $('#meta-puzzle').textContent = label;
    $('#meta-tries').textContent = `${game.tries.length} / ${MAX_TRIES}`;

    renderHistory($('#history'), game.tries);
    $('#btn-submit').disabled = game.done;
    $('#controls').hidden = game.done;
    $('#hint-line').hidden = game.done;
  }

  function renderHistory(container, tries) {
    container.innerHTML = '';
    tries.forEach((marks) => {
      const row = document.createElement('div');
      row.className = 'history-row';
      marks.forEach((m) => {
        const cell = document.createElement('span');
        cell.className = 'history-cell ' + (m === 'ok' ? 'ok' : 'miss');
        row.appendChild(cell);
      });
      container.appendChild(row);
    });
  }

  // FLIP animation: measure, mutate DOM, animate from old positions.
  function flip(mutate) {
    const els = [...listEl.children];
    const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
    mutate();
    els.forEach((el) => {
      const a = first.get(el);
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'transform 280ms cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
          el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
        });
      });
    });
  }

  function syncDomOrder() {
    game.order.forEach((id) => listEl.appendChild(cardEls.get(id)));
  }

  function swap(a, b) {
    if (a === b || isLocked(a) || isLocked(b)) return false;
    const i = game.order.indexOf(a);
    const j = game.order.indexOf(b);
    game.order[i] = b;
    game.order[j] = a;
    delete game.hints[a];
    delete game.hints[b];
    flip(syncDomOrder);
    persist();
    return true;
  }

  // ---------- Input: tap-to-swap, drag-to-swap, keyboard ----------
  let drag = null;

  function clearTargets() {
    listEl.querySelectorAll('.is-target').forEach((el) => el.classList.remove('is-target'));
  }

  listEl.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card');
    if (!card || e.button > 0) return;
    const id = Number(card.dataset.id);
    if (isLocked(id)) {
      if (!game.done) {
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
      }
      return;
    }
    drag = { id, card, x: e.clientX, y: e.clientY, moved: false, target: null, pointerId: e.pointerId };
    card.setPointerCapture(e.pointerId);
  });

  listEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      selectedId = null;
      paint();
      drag.card.classList.add('is-dragging');
    }
    drag.card.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under && under.closest('.card');
    const tid = target ? Number(target.dataset.id) : null;
    const valid = target && tid !== drag.id && !isLocked(tid);
    if ((valid ? tid : null) !== drag.target) {
      clearTargets();
      drag.target = valid ? tid : null;
      if (valid) target.classList.add('is-target');
    }
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    clearTargets();
    if (!d.moved) {
      if (!cancelled) onTap(d.id);
      return;
    }
    if (d.target != null && !cancelled) {
      // Swap and animate from the dragged position.
      const i = game.order.indexOf(d.id);
      const j = game.order.indexOf(d.target);
      game.order[i] = d.target;
      game.order[j] = d.id;
      delete game.hints[d.id];
      delete game.hints[d.target];
      flip(() => {
        d.card.classList.remove('is-dragging');
        d.card.style.transform = '';
        syncDomOrder();
      });
      persist();
      paint();
      track('swap', { method: 'drag' });
    } else {
      flip(() => {
        d.card.classList.remove('is-dragging');
        d.card.style.transform = '';
      });
    }
  }

  listEl.addEventListener('pointerup', (e) => endDrag(e, false));
  listEl.addEventListener('pointercancel', (e) => endDrag(e, true));

  function onTap(id) {
    if (game.done || isLocked(id)) return;
    if (selectedId == null) {
      selectedId = id;
    } else if (selectedId === id) {
      selectedId = null;
    } else {
      const other = selectedId;
      selectedId = null;
      swap(other, id);
      track('swap', { method: 'tap' });
    }
    paint();
  }

  listEl.addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (!card || game.done) return;
    const id = Number(card.dataset.id);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap(id);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const i = game.order.indexOf(id);
      const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= game.order.length) return;
      if (swap(id, game.order[j])) {
        paint();
        cardEls.get(id).focus();
      }
    }
  });

  // ---------- Submitting ----------
  $('#btn-submit').addEventListener('click', submit);

  function submit() {
    if (game.done) return;
    selectedId = null;
    const marks = game.order.map((id, i) => {
      if (id === game.correct[i]) return 'ok';
      return game.correct.indexOf(id) < i ? 'up' : 'down';
    });
    game.tries.push(marks);
    game.order.forEach((id, i) => { game.hints[id] = marks[i]; });
    const solved = marks.every((m) => m === 'ok');
    if (solved || game.tries.length >= MAX_TRIES) {
      game.done = true;
      game.won = solved;
    }
    persist();
    paint();

    game.order.forEach((id, i) => {
      const el = cardEls.get(id);
      setTimeout(() => {
        el.classList.remove('pop', 'shake');
        void el.offsetWidth;
        el.classList.add(marks[i] === 'ok' ? 'pop' : 'shake');
      }, i * 70);
    });

    track('try', { mode: game.mode, puzzle: game.n, attempt: game.tries.length, correct: marks.filter((m) => m === 'ok').length });

    if (game.done) finish(true);
  }

  function finish(fresh) {
    if (fresh && game.mode === 'daily') updateStats();
    if (fresh) track(game.won ? 'solved' : 'failed', { mode: game.mode, puzzle: game.n, tries: game.tries.length });

    const reveal = () => {
      flip(() => {
        // After the reveal, green = you had it right on your last try; red border = you missed it.
        const last = game.tries[game.tries.length - 1] || [];
        const lastOrder = game.order.slice();
        game.hints = {};
        lastOrder.forEach((id, i) => { if (last[i] === 'ok') game.hints[id] = 'ok'; });
        game.order = game.correct.slice();
        syncDomOrder();
      });
      paint();
      showResult();
    };
    if (fresh) setTimeout(reveal, game.won ? 600 : 900);
    else reveal();
  }

  // ---------- Stats ----------
  function getStats() {
    return load('stats', { played: 0, won: 0, streak: 0, maxStreak: 0, lastWon: 0, lastPlayed: 0, dist: [0, 0, 0, 0] });
  }

  function updateStats() {
    if (game.n !== today) return; // Archive games don't affect streaks.
    const s = getStats();
    if (s.lastPlayed === game.n) return;
    s.played += 1;
    s.lastPlayed = game.n;
    if (game.won) {
      s.won += 1;
      s.streak = s.lastWon === game.n - 1 ? s.streak + 1 : 1;
      s.lastWon = game.n;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.dist[game.tries.length - 1] += 1;
    } else {
      s.streak = 0;
    }
    save('stats', s);
  }

  function statsTiles(s) {
    const pct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    const streak = s.lastWon >= today - 1 ? s.streak : 0;
    return [
      [s.played, 'Played'],
      [pct, 'Win %'],
      [streak, 'Streak'],
      [s.maxStreak, 'Best'],
    ].map(([n, l]) => `<div><span class="stat-num">${n}</span><span class="stat-label">${l}</span></div>`).join('');
  }

  function renderStatsModal() {
    const s = getStats();
    const max = Math.max(1, ...s.dist);
    const todayTries = game && game.mode === 'daily' && game.n === today && game.won ? game.tries.length : 0;
    const rows = s.dist.map((count, i) => {
      const w = Math.max(8, Math.round((count / max) * 100));
      return `<div class="dist-row"><span>${i + 1}</span><span class="dist-bar${todayTries === i + 1 ? ' is-today' : ''}" style="width:${w}%">${count}</span></div>`;
    }).join('');
    $('#stats-body').innerHTML = `
      <div class="stats-grid">${statsTiles(s)}</div>
      <p class="dist-title">Solved in N tries</p>
      ${rows}`;
  }

  // ---------- Result & sharing ----------
  const RESULT_LINES = [
    ['Perfect timing!', 'First try. You know your history.'],
    ['Nailed it!', 'Two tries. Sharp work.'],
    ['Got there!', 'Solved in three.'],
    ['Phew, just made it!', 'Solved on your last try.'],
  ];

  function showResult() {
    const [title, sub] = game.won
      ? RESULT_LINES[game.tries.length - 1]
      : ['So close', 'Here is the right order. Tomorrow is a new puzzle.'];
    $('#result-title').textContent = title;
    $('#result-sub').textContent = sub;
    renderHistory($('#result-grid'), game.tries);
    $('#result').hidden = false;

    const isToday = game.mode === 'daily' && game.n === today;
    $('#countdown-wrap').hidden = !isToday;
    $('#result-stats').innerHTML = game.mode === 'practice' ? '' : statsTiles(getStats());
    $('#result-stats').hidden = game.mode === 'practice';
    $('#btn-practice').textContent = game.mode === 'practice' ? 'Play another round' : 'Play a practice round';
    setTimeout(() => $('#result').scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  }

  function shareText() {
    const head = game.mode === 'practice'
      ? `Datewise practice ${game.won ? game.tries.length : 'X'}/${MAX_TRIES}`
      : `Datewise #${game.n} ${game.won ? game.tries.length : 'X'}/${MAX_TRIES}`;
    const grid = game.tries.map((marks) => marks.map((m) => (m === 'ok' ? '🟩' : '🟨')).join('')).join('\n');
    const url = location.origin + location.pathname;
    return `${head}\n${grid}\n${url}`;
  }

  $('#btn-share').addEventListener('click', async () => {
    const text = shareText();
    track('share', { mode: game.mode, puzzle: game.n });
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* user cancelled or share failed: fall back to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Result copied. Paste it anywhere!');
    } catch {
      toast('Could not copy. Long-press to select instead.');
    }
  });

  $('#btn-practice').addEventListener('click', startPractice);

  function startPractice() {
    closeAll();
    game = newGame('practice', 0);
    selectedId = null;
    $('#result').hidden = true;
    buildCards();
    history.replaceState(null, '', '?practice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    track('practice_start');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Countdown ----------
  function tick() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    let s = Math.max(0, Math.floor((next - now) / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    s %= 3600;
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    $('#countdown').textContent = `${h}:${m}:${sec}`;
    if (h === '00' && m === '00' && sec === '00') setTimeout(() => location.reload(), 1500);
  }
  setInterval(tick, 1000);
  tick();

  // ---------- Modals ----------
  function open(id) {
    closeAll();
    const d = document.getElementById(id);
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  function closeAll() {
    document.querySelectorAll('dialog[open]').forEach((d) => (d.close ? d.close() : d.removeAttribute('open')));
  }

  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
  });

  function renderArchive() {
    const grid = $('#archive-grid');
    grid.innerHTML = '';
    for (let n = today; n >= 1; n--) {
      const saved = load(`game:${n}`, null);
      const a = document.createElement('a');
      a.className = 'archive-day' + (saved && saved.done ? (saved.won ? ' won' : ' lost') : '');
      a.href = n === today ? './' : `?day=${n}`;
      const date = new Date(EPOCH + (n - 1) * 86400000);
      const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
      a.innerHTML = `<span>#${n}<small>${label}</small></span>`;
      grid.appendChild(a);
    }
  }

  $('#btn-help').addEventListener('click', () => open('modal-help'));
  $('#btn-help-footer').addEventListener('click', () => open('modal-help'));
  $('#menu-help').addEventListener('click', () => open('modal-help'));
  $('#btn-stats').addEventListener('click', () => { renderStatsModal(); open('modal-stats'); });
  $('#btn-menu').addEventListener('click', () => open('modal-menu'));
  $('#menu-practice').addEventListener('click', startPractice);
  [$('#menu-archive'), $('#btn-archive-inline'), $('#btn-archive-footer')].forEach((b) =>
    b.addEventListener('click', () => { renderArchive(); open('modal-archive'); })
  );

  // ---------- Boot ----------
  function boot() {
    const params = new URLSearchParams(location.search);
    if (params.has('practice')) {
      game = newGame('practice', 0);
    } else {
      const day = parseInt(params.get('day'), 10);
      const n = day >= 1 && day <= today ? day : today;
      game = newGame('daily', n);
    }
    buildCards();
    if (game.done) finish(false);
    track('view', { mode: game.mode, puzzle: game.n });

    if (!load('seenHelp', false)) {
      save('seenHelp', true);
      setTimeout(() => open('modal-help'), 350);
    }
  }

  boot();
})();
