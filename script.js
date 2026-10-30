let state = JSON.parse(localStorage.getItem('pomodo_state') || 'null') || {
  onboarded: false,
  currentScreen: 'onboarding',
  prevScreen: 'timer',
  darkMode: false,
  timer: {
    mode: 'focus',
    running: false,
    timeLeft: 25 * 60,
    sessions: 0,
    totalSessions: 0,
    totalMinutes: 0,
    streakDays: 0,
    lastDate: null,
    goal: 8,
    sound: true,
    durations: { focus: 25, short: 5, long: 15 }
  },
  tasks: [
    { id: 1, title: 'Compléter la proposition de projet', cat: 'Travail', color: '#E5534B', done: false, subs: 6, subsDone: 2, priority: 'high' },
    { id: 2, title: 'Revoir les pull requests', cat: 'Dev', color: '#3B82F6', done: false, subs: 4, subsDone: 1, priority: 'normal' },
    { id: 3, title: 'Mise à jour documentation', cat: 'Dev', color: '#3B82F6', done: false, subs: 3, subsDone: 3, priority: 'low' },
    { id: 4, title: 'Préparer le stand-up équipe', cat: 'Réunion', color: '#8B5CF6', done: true, subs: 2, subsDone: 2, priority: 'normal' },
    { id: 5, title: 'Apprendre React Native', cat: 'Perso', color: '#F59E0B', done: false, subs: 2, subsDone: 0, priority: 'normal' }
  ],
  history: {}
};

let timerInterval = null;
let obSlide = 0;
let taskTab = 'active';
let wakeLock = null;
let newTaskColor = '#E5534B';
let newTaskCat = 'Travail';

const COLORS = ['#E5534B','#3B82F6','#22C55E','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];
const CATS = ['Travail','Dev','Perso','Réunion','Santé','Autre'];
const CIRC = 2 * Math.PI * 104;

const SPECIES = [
  { id: 'apple', name: 'Pommier', leaf: '#4E9A63', fruit: '#D9363E', blossom: '#F8E1EA', need: null },
  { id: 'cherry', name: 'Cerisier', leaf: '#6BAA75', fruit: '#A5122D', blossom: '#F6B8CC', need: ['streak', 30] },
  { id: 'orange', name: 'Oranger', leaf: '#3F8A55', fruit: '#F29A24', blossom: '#FFFFFF', need: ['streak', 100] },
  { id: 'lemon', name: 'Citronnier', leaf: '#5FA648', fruit: '#F2D624', blossom: '#FFFFFF', need: ['streak', 200] }
];
const progress = k => ({
  streak: Math.max(state.timer.bestStreak || 0, state.timer.streakDays || 0),
  sessions: state.timer.totalSessions,
  goal: Object.values(state.history).filter(n => n >= state.timer.goal).length
})[k];
const meets = sp => !sp.need || progress(sp.need[0]) >= sp.need[1];

function migrate() {
  const t = state.timer;
  state.cats = state.cats || [...CATS];
  state.theme = state.theme || (state.darkMode ? 'dark' : 'auto');
  state.name = state.name || 'Votre jardin';
  state.activeTask = state.activeTask || null;
  t.sound ??= true; t.soundKind ||= 'soft'; t.ambient ||= 'off'; t.haptic ??= true;
  t.autoBreak ??= false; t.autoFocus ??= false; t.wither ??= false;
  t.bestStreak = Math.max(t.bestStreak || 0, t.streakDays || 0);
  state.tasks.forEach(k => {
    if (!Array.isArray(k.subs)) {
      const n = k.subs || 0, d = k.subsDone || 0;
      k.subs = Array.from({ length: n }, (_, i) => ({ id: i + 1, t: 'Étape ' + (i + 1), d: i < d }));
    }
    delete k.subsDone; k.est ??= 0; k.spent ??= 0; k.priority ||= 'normal';
  });
  if (!state.tasks.some(k => k.id === state.activeTask && !k.done)) state.activeTask = null;
  if (!SPECIES.some(s => s.id === state.species)) state.species = 'apple';
  delete state.garden; delete t.wither;
  state.dead = state.dead || null;
  state.forest = state.forest || [];
  const had = state.unlocked || [];
  state.unlocked = SPECIES.filter(sp => meets(sp) || had.includes(sp.id)).map(s => s.id);
}
migrate();

function save() { localStorage.setItem('pomodo_state', JSON.stringify(state)); }

function init() {
  refreshDaily();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  bindRows(document.getElementById('tasks-list'));
  bindRows(document.getElementById('timer-tasks'));
  if (!state.onboarded) { showRaw('onboarding'); }
  else { showRaw(state.currentScreen==='onboarding'?'timer':state.currentScreen); }
  applyModeUI();
  renderStreakDots();
  renderSessionCount();
  renderTimerTasks();
  renderTasks();
  renderSettings();
  renderReports();
  renderGarden();
  updateTimerDisplay();
  resumeTimer();
}

const MODE_LABELS = { focus:'Concentration', short:'Pause courte', long:'Pause longue' };
function applyModeUI() {
  const mode = state.timer.mode;
  document.getElementById('app').dataset.mode = mode;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.id === 'tab-' + mode));
  document.getElementById('timer-mode-label').textContent = MODE_LABELS[mode];
  updatePlayIcon(false);
}

function showRaw(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('slide-left');
  });
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.getElementById('nav-'+id);
  if (nav) nav.classList.add('active');
  const onboard = id === 'onboarding' || id === 'settings';
  document.getElementById('bottom-nav').style.display = onboard ? 'none' : 'flex';
}

function showScreen(id) {
  if (id === state.currentScreen) return;
  state.prevScreen = state.currentScreen;
  state.currentScreen = id;
  save();
  showRaw(id);
  if (id === 'tasks') { renderTasks(); }
  if (id === 'reports') { renderReports(); }
  if (id === 'garden') { renderGarden(); }
  if (id === 'settings') { renderSettings(); }
  if (id === 'timer') { renderTimerTasks(); renderStreakDots(); }
}

function goBack() {
  showScreen(state.prevScreen || 'timer');
}

function nextSlide() {
  const slides = document.querySelectorAll('.ob-slide');
  if (obSlide < slides.length - 1) {
    slides[obSlide].style.transform = 'translateX(-100%)';
    obSlide++;
    slides[obSlide].style.transform = 'translateX(0)';
    document.querySelectorAll('#ob-dots i').forEach((d,i) => {
      d.classList.toggle('active', i === obSlide);
    });
    if (obSlide === slides.length - 1) {
      document.getElementById('ob-btn').textContent = 'Commencer';
    }
  } else {finishOnboarding();}
}

function finishOnboarding() {
  state.onboarded = true;
  state.currentScreen = 'timer';
  save();
  showRaw('timer');
  renderTimerTasks();
  renderStreakDots();
}

function switchMode(mode, btn, force) {
  if (!force && !okToAbandon()) return;
  stopTicking();
  state.timer.mode = mode;
  state.timer.timeLeft = state.timer.durations[mode] * 60;
  applyModeUI();
  updateTimerDisplay();
  save();
}

// --- Dates locales (clé AAAA-MM-JJ) ---
function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function shiftDay(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d + n));
}

// Nouveau jour : remet à zéro les sessions du jour, et la série si un jour a été manqué
function refreshDaily() {
  const t = state.timer, today = localDateKey();
  if (t.lastDate && t.lastDate !== today) {
    t.sessions = 0;
    if (t.lastDate !== shiftDay(today, -1) && t.streakDays > 0) { witherPlant(); showToast('Votre plante a fané… une nouvelle graine vous attend', 5000); }
  }
}

// --- Timer basé sur une heure de fin absolue (endTime) ---
function startTicking() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 250);
  syncAmbient();
}

function stopTicking() {
  clearInterval(timerInterval);
  timerInterval = null;
  state.timer.running = false;
  state.timer.endTime = null;
  stopAmbient();
}

function okToAbandon() {
  const t = state.timer;
  const started = t.mode === 'focus' && (t.running || t.timeLeft < t.durations.focus * 60);
  return !started || confirm('Abandonner la session en cours ? Elle ne sera pas comptée.');
}

function toggleTimer() {
  const t = state.timer;
  if (t.running) {
    const remaining = Math.ceil((t.endTime - Date.now()) / 1000);
    if (remaining <= 0) { tick(); return; }
    stopTicking();
    t.timeLeft = remaining;
    updatePlayIcon(false);
    updateTimerDisplay();
  } else {
    t.running = true;
    t.endTime = Date.now() + t.timeLeft * 1000;
    updatePlayIcon(true);
    startTicking();
  }
  save();
}

function tick() {
  const t = state.timer;
  if (!t.running || !t.endTime) return;
  const remaining = Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000));
  if (remaining === 0) {
    const endedAt = t.endTime;
    stopTicking();
    t.timeLeft = 0;
    updateTimerDisplay();
    updatePlayIcon(false);
    handleSessionEnd(endedAt);
    return;
  }
  if (remaining !== t.timeLeft) {
    t.timeLeft = remaining;
    updateTimerDisplay();
  }
}

// Au chargement : reprend un timer en cours, ou clôture une session terminée pendant l'absence
function resumeTimer() {
  const t = state.timer;
  if (!t.running || !t.endTime) { t.running = false; t.endTime = null; return; }
  const remaining = Math.ceil((t.endTime - Date.now()) / 1000);
  if (remaining > 0) {
    t.timeLeft = remaining;
    updatePlayIcon(true);
    updateTimerDisplay();
    startTicking();
  } else {
    const endedAt = t.endTime;
    t.running = false; t.endTime = null; t.timeLeft = 0;
    handleSessionEnd(endedAt);
  }
}

function updateTimerDisplay() {
  const t = state.timer.timeLeft;
  const mm = String(Math.floor(t/60)).padStart(2,'0');
  const ss = String(t % 60).padStart(2,'0');
  const el = document.getElementById('timer-display');
  el.innerHTML = `<span class="dg">${mm[0]}</span><span class="dg">${mm[1]}</span><span class="co">:</span><span class="dg">${ss[0]}</span><span class="dg">${ss[1]}</span>`;
  el.setAttribute('aria-label', `${+mm} minutes ${ss} secondes`);
  const total = state.timer.durations[state.timer.mode] * 60;
  const p = Math.min(1, Math.max(0, 1 - t / total));
  renderPlant(p);
  document.title = state.timer.running ? `${mm}:${ss} Seed` : 'Seed';
}

function updatePlayIcon(playing) {
  document.querySelector('#play-icon use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  document.getElementById('play-label').textContent = playing ? 'Pause' : (state.timer.timeLeft < state.timer.durations[state.timer.mode]*60 ? 'Reprendre' : 'Démarrer');
}

function skipTimer() {
  if (!okToAbandon()) return;
  stopTicking();
  updatePlayIcon(false);
  const modes = ['focus','short','long'];
  const next = modes[(modes.indexOf(state.timer.mode)+1)%3];
  const btn = document.getElementById('tab-'+next);
  switchMode(next, btn, true);
}

function resetTimer() {
  if (!okToAbandon()) return;
  stopTicking();
  updatePlayIcon(false);
  const d = state.timer.durations;
  const mins = { focus: d.focus, short: d.short, long: d.long }[state.timer.mode];
  state.timer.timeLeft = mins * 60;
  updateTimerDisplay();
  save();
}

function renderStreakDots() {
  const goal = state.timer.goal || 8;
  const done = state.timer.sessions;
  let html = '';
  for (let i = 0; i < goal; i++) html += `<i class="pod${i<done?' done':''}"></i>`;
  const box = document.getElementById('streak-dots');
  box.innerHTML = html;
  box.setAttribute('aria-label', `${done} sessions sur ${goal} aujourd'hui`);
}

function renderSessionCount() {
  const n = state.timer.sessions;
  document.getElementById('session-count').textContent = `${n} session${n>1?'s':''} aujourd'hui`;
}

function updateSessionIndicator() {}

let actx = null, amb = null;
function getCtx() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}
  return actx;
}
function tone(freq, start, dur, vol) {
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + start;
  o.frequency.value = freq; o.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function playBeep() {
  const k = state.timer.soundKind;
  if (k === 'beep') tone(880, 0, 0.6, 0.3);
  else if (k === 'chime') [523, 659, 784].forEach((f, i) => tone(f, i * 0.22, 1.2, 0.2));
  else { tone(440, 0, 1.6, 0.18); tone(659, 0.25, 1.8, 0.14); }
}
function noiseBuf(c, brown) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); let l = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
  return b;
}
function stopAmbient() {
  if (!amb) return;
  try { amb.src.stop(); amb.out.disconnect(); } catch (e) {}
  clearInterval(amb.bird); amb = null;
}
function syncAmbient() {
  stopAmbient();
  const t = state.timer, kind = t.ambient;
  if (kind === 'off' || t.mode !== 'focus' || !t.running) return;
  const c = getCtx(); if (!c) return;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), out = c.createGain();
  src.buffer = noiseBuf(c, kind === 'forest'); src.loop = true;
  if (kind === 'rain') { f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.4; out.gain.value = 0.3; }
  else { f.type = 'lowpass'; f.frequency.value = 600; out.gain.value = 0.3; }
  src.connect(f); f.connect(out); out.connect(c.destination); src.start();
  amb = { src, out };
  if (kind === 'forest') amb.bird = setInterval(() => { if (Math.random() < 0.5) tone(2200 + Math.random() * 1200, 0, 0.12, 0.04); }, 2500);
}

const PRIO = { high: 0, normal: 1, low: 2 };
const PRIO_LABELS = [['high', 'Urgente'], ['normal', 'Normale'], ['low', 'Faible']];
let ed = null, gestureAt = 0;
const pomoLabel = t => t.est ? `${t.spent}/${t.est} 🌱` : `${t.spent} 🌱`;
const activeList = () => state.tasks.filter(t => !t.done)
  .sort((a, b) => (b.id === state.activeTask) - (a.id === state.activeTask) || PRIO[a.priority] - PRIO[b.priority]);

function renderTimerTasks() {
  const list = activeList().slice(0, 3);
  const wrap = document.getElementById('timer-tasks'), empty = document.getElementById('empty-tasks');
  empty.style.display = list.length ? 'none' : 'block';
  wrap.innerHTML = list.map(taskHTML).join('');
  renderActiveChip();
}

function renderActiveChip() {
  const t = state.tasks.find(k => k.id === state.activeTask), el = document.getElementById('active-chip');
  el.classList.toggle('on', !!t);
  if (t) el.innerHTML = `Sur : <b>${esc(t.title)}</b> · ${pomoLabel(t)}`;
}

function renderTasks() {
  const active = activeList(), done = state.tasks.filter(t => t.done);
  document.getElementById('active-count').textContent = active.length;
  document.getElementById('done-count').textContent = done.length;
  const list = taskTab === 'active' ? active : done;
  const emptyText = taskTab === 'active' ? 'Tout est fait. Ajoutez une tâche pour la prochaine session.' : 'Aucune tâche terminée pour le moment.';
  document.getElementById('tasks-list').innerHTML = list.length ? list.map(taskHTML).join('') : `<div class="empty"><p>${emptyText}</p></div>`;
}

function taskHTML(t) {
  const n = t.subs.length, d = t.subs.filter(s => s.d).length, pct = n ? Math.round(d / n * 100) : 0;
  const bits = [esc(t.cat)];
  if (n) bits.push(`${d}/${n} sous-tâches`);
  if (t.est || t.spent) bits.push(pomoLabel(t));
  const flag = t.priority === 'high' ? ' · <em>Urgent</em>' : t.priority === 'low' && !t.done ? ' · faible' : '';
  return `<div class="row${t.id === state.activeTask ? ' act' : ''}" data-id="${t.id}" onclick="rowTap(${t.id})">
    <span class="dot" style="background:${t.color}"></span>
    <div class="info">
      <div class="name${t.done ? ' off' : ''}">${esc(t.title)}</div>
      <div class="meta">${bits.join(' · ')}${flag}</div>
      ${n ? `<div class="bar"><i style="width:${pct}%;background:${t.color}"></i></div>` : ''}
    </div>
    <button class="more" onclick="event.stopPropagation();openEditTask(${t.id})" aria-label="Modifier la tâche">⋯</button>
    <button class="check${t.done ? ' done' : ''}" onclick="event.stopPropagation();toggleTask(${t.id})" aria-label="${t.done ? 'Rouvrir' : 'Terminer'} la tâche"><svg><use href="#i-check"/></svg></button>
  </div>`;
}

// Toucher = tâche active · appui long = modifier · glisser à gauche = supprimer
function rowTap(id) {
  if (Date.now() - gestureAt < 400) return;
  const t = state.tasks.find(k => k.id === id); if (!t || t.done) return;
  state.activeTask = state.activeTask === id ? null : id;
  save(); renderTasks(); renderTimerTasks();
  showToast(state.activeTask ? 'Tâche active : ' + t.title : 'Aucune tâche active');
}

function bindRows(root) {
  let st = null;
  const end = () => {
    if (!st) return;
    clearTimeout(st.lp);
    const { row, dx } = st; st = null; row.style.transform = '';
    if (dx < -90) { gestureAt = Date.now(); deleteTask(+row.dataset.id); }
  };
  root.addEventListener('pointerdown', e => {
    const row = e.target.closest('.row'); if (!row || e.target.closest('button')) return;
    st = { row, x: e.clientX, y: e.clientY, dx: 0, lp: setTimeout(() => {
      st = null; gestureAt = Date.now(); row.style.transform = '';
      if (navigator.vibrate) navigator.vibrate(15);
      openEditTask(+row.dataset.id);
    }, 550) };
  });
  root.addEventListener('pointermove', e => {
    if (!st) return;
    st.dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.abs(st.dx) > 10 || Math.abs(dy) > 10) clearTimeout(st.lp);
    if (st.dx < 0 && Math.abs(st.dx) > Math.abs(dy)) st.row.style.transform = `translateX(${st.dx}px)`;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => root.addEventListener(ev, end));
  root.addEventListener('contextmenu', e => e.preventDefault());
}

function toggleTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) { t.subs.forEach(s => s.d = true); if (state.activeTask === id) state.activeTask = null; }
  save(); renderTasks(); renderTimerTasks();
}

function deleteTask(id) {
  const t = state.tasks.find(k => k.id === id);
  if (!t || !confirm(`Supprimer « ${t.title} » ?`)) return;
  state.tasks = state.tasks.filter(k => k.id !== id);
  if (state.activeTask === id) state.activeTask = null;
  save(); closeAddTask(); renderTasks(); renderTimerTasks();
}

function switchTaskTab(tab) {
  taskTab = tab;
  document.getElementById('ttab-active').classList.toggle('active', tab === 'active');
  document.getElementById('ttab-done').classList.toggle('active', tab === 'done');
  renderTasks();
}

// --- Feuille de création / édition ---
function openAddTask() { openSheet({ id: null, title: '', cat: state.cats[0], color: COLORS[0], priority: 'normal', est: 0, subs: [] }); }

function openEditTask(id) {
  const t = state.tasks.find(k => k.id === id); if (!t) return;
  openSheet({ id, title: t.title, cat: t.cat, color: t.color, priority: t.priority, est: t.est, subs: t.subs.map(s => ({ ...s })) });
}

function openSheet(d) {
  ed = d;
  document.getElementById('sheet-title').textContent = d.id ? 'Modifier la tâche' : 'Nouvelle tâche';
  document.getElementById('task-input').value = d.title;
  document.getElementById('sub-input').value = '';
  document.getElementById('del-btn').style.display = d.id ? '' : 'none';
  renderSheet();
  document.getElementById('add-task-modal').classList.add('open');
  if (!d.id) setTimeout(() => document.getElementById('task-input').focus(), 300);
}

function renderSheet() {
  document.getElementById('color-swatches').innerHTML = COLORS.map(c => `<div class="swatch${c === ed.color ? ' selected' : ''}" style="background:${c}" onclick="ed.color='${c}';renderSheet()"></div>`).join('');
  document.getElementById('cat-select').innerHTML = state.cats.map((c, i) => `<button class="cat-btn${c === ed.cat ? ' active' : ''}" onclick="ed.cat=state.cats[${i}];renderSheet()">${esc(c)}${c === ed.cat && state.cats.length > 1 ? `<span class="x" onclick="event.stopPropagation();delCat(${i})" aria-label="Supprimer la catégorie">×</span>` : ''}</button>`).join('') + '<button class="cat-btn" onclick="addCat()">+ Catégorie</button>';
  document.getElementById('prio-select').innerHTML = PRIO_LABELS.map(([v, l]) => `<button class="preset-chip${v === ed.priority ? ' active' : ''}" onclick="ed.priority='${v}';renderSheet()">${l}</button>`).join('');
  document.getElementById('est-val').textContent = ed.est;
  document.getElementById('sub-list').innerHTML = ed.subs.map((s, i) => `<div class="sub">
    <button class="check${s.d ? ' done' : ''}" onclick="ed.subs[${i}].d=!ed.subs[${i}].d;renderSheet()" aria-label="Cocher"><svg><use href="#i-check"/></svg></button>
    <span class="${s.d ? 'off' : ''}">${esc(s.t)}</span>
    <button class="m" onclick="moveSub(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Monter">▲</button>
    <button class="m" onclick="moveSub(${i},1)" ${i === ed.subs.length - 1 ? 'disabled' : ''} aria-label="Descendre">▼</button>
    <button class="m" onclick="ed.subs.splice(${i},1);renderSheet()" aria-label="Supprimer">✕</button></div>`).join('');
}

function addSub() {
  const i = document.getElementById('sub-input'), v = i.value.trim();
  if (!v) return;
  ed.subs.push({ id: Date.now() + ed.subs.length, t: v, d: false });
  i.value = ''; renderSheet(); i.focus();
}
function moveSub(i, d) { const j = i + d; [ed.subs[i], ed.subs[j]] = [ed.subs[j], ed.subs[i]]; renderSheet(); }
function adjEst(d) { ed.est = Math.max(0, Math.min(20, ed.est + d)); document.getElementById('est-val').textContent = ed.est; }
function addCat() {
  const n = (prompt('Nom de la catégorie') || '').trim().slice(0, 20);
  if (!n) return;
  if (!state.cats.includes(n)) state.cats.push(n);
  ed.cat = n; save(); renderSheet();
}
function delCat(i) {
  if (!confirm(`Supprimer la catégorie « ${state.cats[i]} » ? Les tâches existantes la conservent.`)) return;
  state.cats.splice(i, 1); ed.cat = state.cats[0]; save(); renderSheet();
}

function saveTask() {
  const title = document.getElementById('task-input').value.trim();
  if (!title) { document.getElementById('task-input').focus(); return; }
  if (document.getElementById('sub-input').value.trim()) addSub();
  const data = { title, cat: ed.cat, color: ed.color, priority: ed.priority, est: ed.est, subs: ed.subs };
  const cur = ed.id && state.tasks.find(k => k.id === ed.id);
  if (cur) Object.assign(cur, data);
  else state.tasks.unshift({ id: Date.now(), done: false, spent: 0, ...data });
  save(); closeAddTask(); renderTasks(); renderTimerTasks();
}
function deleteEditing() { if (ed && ed.id) deleteTask(ed.id); }
function closeAddTask() { document.getElementById('add-task-modal').classList.remove('open'); ed = null; }
function closeModal(e) { if (e.target.id === 'add-task-modal') closeAddTask(); }

const DUR = { focus: { step: 5, min: 5, max: 120 }, short: { step: 1, min: 1, max: 30 }, long: { step: 5, min: 5, max: 60 } };

function renderSettings() {
  const t = state.timer;
  ['focus', 'short', 'long'].forEach(renderStepper);
  document.getElementById('goal-val').textContent = t.goal;
  [['sound-toggle', 'sound'], ['haptic-toggle', 'haptic'], ['auto-break-toggle', 'autoBreak'], ['auto-focus-toggle', 'autoFocus']]
    .forEach(([id, k]) => document.getElementById(id).checked = !!t[k]);
  renderOpts('chips-theme', [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']], state.theme, 'setTheme');
  renderOpts('chips-sound', [['soft', 'Doux'], ['chime', 'Carillon'], ['beep', 'Bip']], t.soundKind, 'setSoundKind');
  renderOpts('chips-ambient', [['off', 'Aucun'], ['rain', 'Pluie'], ['forest', 'Forêt']], t.ambient, 'setAmbient');
  document.getElementById('profile-name').value = state.name;
  document.getElementById('prof-tasks').textContent = state.tasks.length;
  document.getElementById('prof-sessions').textContent = t.totalSessions;
  document.getElementById('prof-mins').textContent = t.totalMinutes;
}

function renderOpts(id, opts, cur, fn) {
  document.getElementById(id).innerHTML = opts.map(([v, l]) => `<button class="preset-chip${v === cur ? ' active' : ''}" onclick="${fn}('${v}')">${l}</button>`).join('');
}

function renderStepper(key) {
  document.getElementById('chips-' + key).innerHTML = `<div class="stepper"><button onclick="adjDur('${key}',-1)" aria-label="Moins">&minus;</button><span>${state.timer.durations[key]}</span><button onclick="adjDur('${key}',1)" aria-label="Plus">+</button></div>`;
}

function adjDur(key, dir) {
  const c = DUR[key];
  setDuration(key, Math.max(c.min, Math.min(c.max, state.timer.durations[key] + dir * c.step)));
}

function setDuration(key, val) {
  const t = state.timer, untouched = t.timeLeft === t.durations[key] * 60;
  t.durations[key] = val;
  renderStepper(key);
  if (t.mode === key && !t.running && untouched) { t.timeLeft = val * 60; updateTimerDisplay(); updatePlayIcon(false); }
  save();
}

function setTheme(v) { state.theme = v; applyTheme(); renderSettings(); save(); }
function applyTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-dark', dark ? 'true' : 'false');
}
function setSoundKind(v) { state.timer.soundKind = v; renderSettings(); save(); playBeep(); }
function setAmbient(v) { state.timer.ambient = v; renderSettings(); save(); syncAmbient(); }
function setGardenName(v) { state.name = v.trim().slice(0, 24) || 'Votre jardin'; save(); renderSettings(); }

function adjGoal(d) {
  state.timer.goal = Math.max(1, Math.min(20, (state.timer.goal || 8) + d));
  document.getElementById('goal-val').textContent = state.timer.goal;
  renderStreakDots();
  save();
}

function saveSetting(key, val) { state.timer[key] = val; save(); }

function toggleWakeLock(cb) {
  if (cb.checked && 'wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then(l=>{ wakeLock=l; }).catch(()=>{});
  } else if (wakeLock) { wakeLock.release(); wakeLock=null; }
}

function renderReports() {
  document.getElementById('total-sessions').textContent = state.timer.totalSessions;
  document.getElementById('total-minutes').textContent = state.timer.totalMinutes;
  document.getElementById('streak-days').textContent = state.timer.streakDays;
  document.getElementById('tasks-done').textContent = state.tasks.filter(t => t.done).length;
  renderRecords();
  renderWeekChart();
  renderHeatmap();
}

function renderRecords() {
  const h = state.history, keys = Object.keys(h), wk = {};
  keys.forEach(k => {
    const [y, m, d] = k.split('-').map(Number), dow = new Date(y, m - 1, d).getDay();
    const mon = shiftDay(k, -((dow + 6) % 7));
    wk[mon] = (wk[mon] || 0) + h[k];
  });
  const top = keys.sort((a, b) => h[b] - h[a])[0];
  let last28 = 0;
  for (let i = 0; i < 28; i++) last28 += h[shiftDay(localDateKey(), -i)] || 0;
  const topDate = top ? new Date(top + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  const cells = [
    [Math.max(state.timer.bestStreak || 0, state.timer.streakDays || 0), 'meilleure série, en jours'],
    [top ? h[top] : 0, 'sessions le jour le plus actif' + (top ? ` (${topDate})` : '')],
    [(last28 / 4).toFixed(1).replace('.', ','), 'sessions par semaine (4 dernières)'],
    [Math.max(0, ...Object.values(wk)), 'sessions la meilleure semaine']
  ];
  document.getElementById('records').innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
}

function renderWeekChart() {
  const now = new Date();
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    data.push({ label: d.toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase(), val: state.history[key] || 0 });
  }
  const max = Math.max(...data.map(d => d.val), 1);
  document.getElementById('week-chart').innerHTML = data.map(d => `
    <div class="wk"><b>${d.val}</b><i class="${d.val?'':'zero'}" style="height:${Math.round(d.val/max*100)}px"></i><span>${d.label}</span></div>`).join('');
}

function renderHeatmap() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const offset = (firstDay + 6) % 7;
  let cells = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ d, n: state.history[key]||0 });
  }
  const maxN = Math.max(...cells.filter(Boolean).map(c=>c.n), 1);
  document.getElementById('heatmap').innerHTML = cells.map(c=>{
    if (!c) return '<div class="heat-cell" style="visibility:hidden"></div>';
    const lvl = c.n===0?'':c.n/maxN<0.25?'h1':c.n/maxN<0.5?'h2':c.n/maxN<0.75?'h3':'h4';
    return `<div class="heat-cell ${lvl}" title="${c.d}: ${c.n} sessions"></div>`;
  }).join('');
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }


let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[SW] Registered, scope:', reg.scope);

        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;

  const dismissed = localStorage.getItem('pomodo_install_dismissed');
  if (!dismissed) {
    setTimeout(() => document.getElementById('install-banner').classList.add('visible'), 3000);
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('install-banner').classList.remove('visible');
  showToast('Seed est installé', 3000);
});

function installApp() {
  if (!deferredInstallPrompt) {
    showToast('Pour installer : menu du navigateur, puis Ajouter à l\'écran d\'accueil', 4000);
    dismissInstall(); return;
  }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      document.getElementById('install-banner').classList.remove('visible');
    }
    deferredInstallPrompt = null;
  });
}

function dismissInstall() {
  document.getElementById('install-banner').classList.remove('visible');
  localStorage.setItem('pomodo_install_dismissed', '1');
}

function updateOnlineStatus() {
  const online = navigator.onLine;
  const toast = document.getElementById('offline-toast');
  const dot = document.getElementById('toast-dot');
  const msg = document.getElementById('toast-msg');
  if (!online) {
    dot.classList.remove('online');
    msg.textContent = 'Hors ligne, données sauvegardées';
    toast.classList.add('visible');
  } else {
    dot.classList.add('online');
    msg.textContent = 'Connexion rétablie';
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  }
}
window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function showToast(text, duration = 2500) {
  const toast = document.getElementById('offline-toast');
  const dot = document.getElementById('toast-dot');
  const msg = document.getElementById('toast-msg');
  dot.classList.add('online');
  msg.textContent = text;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), duration);
}

function showUpdateToast() {
  showToast('Mise à jour disponible. Rechargez la page.', 6000);
}

function checkNotifPermission() {
  if (!('Notification' in window)) return;
  const prompt = document.getElementById('notif-prompt');
  if (Notification.permission === 'default') {
    if (state.timer.totalSessions >= 1) {
      prompt.classList.remove('hidden');
    }
  }
}

function requestNotifPermission() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(perm => {
    document.getElementById('notif-prompt').classList.add('hidden');
    if (perm === 'granted') {
      showToast('Notifications activées');
    }
  });
}

function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      vibrate: [200, 100, 200],
      silent: false
    });
  } catch(e) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body,
          icon: './assets/icon-192.png',
          badge: './assets/icon-192.png',
          vibrate: [200, 100, 200]
        });
      });
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  refreshDaily();
  renderStreakDots();
  renderSessionCount();
  renderReports();
  updateTimerDisplay();
  if (state.timer.running) tick();
});

// --- Plante unique : 1 jour validé = 1 cran de croissance ---
const STAGES = [[0, 'Graine'], [1, 'Pousse'], [7, 'Jeune plant'], [30, 'Arbuste'], [100, 'Arbre'], [200, 'Arbre en fleurs'], [300, 'Arbre fruitier'], [365, 'Arbre épanoui']];
const speciesOf = id => SPECIES.find(s => s.id === id) || SPECIES[0];

function checkUnlocks() {
  const fresh = SPECIES.filter(sp => !state.unlocked.includes(sp.id) && meets(sp));
  fresh.forEach(sp => state.unlocked.push(sp.id));
  return fresh;
}

// Un jour raté : la plante fane, la série repart de zéro
function witherPlant() {
  const t = state.timer;
  if (t.streakDays > 0) {
    state.dead = { days: t.streakDays, sp: state.species };
    state.forest.push({ days: t.streakDays, sp: state.species, d: localDateKey() });
  }
  t.streakDays = 0;
}

function treeInner(sp, d, w) {
  d = Math.max(0, Math.min(365, d));
  const G = 158, p = Math.min(1, d / 100), ease = x => x * x * (3 - 2 * x);
  let out = '<path d="M24 158h152" style="stroke:var(--line)" stroke-width="2.5" stroke-linecap="round" fill="none"/>';
  if (d < 0.03) return out + '<ellipse cx="100" cy="154" rx="9" ry="6" style="fill:var(--moss)"/>';
  const H = 14 + 84 * Math.pow(p, 0.65), top = G - H, W = 2.5 + 6 * p, leafC = w ? '#A89F7B' : sp.leaf;
  const bark = w ? '#8A7B55' : `color-mix(in srgb,#7A5230 ${Math.round(Math.min(1, Math.max(0, (d - 15) / 60)) * 100)}%,#3C8A55)`;
  let g = `<path d="M100 156C100 ${G - H * 0.4} 95 ${G - H * 0.7} 100 ${top}" style="stroke:${bark}" stroke-width="${W}" stroke-linecap="round" fill="none"/>`;
  if (d < 60) {
    const n = Math.min(10, 1 + Math.floor(d / 3)), s = 4 + 8 * Math.min(1, d / 40);
    for (let i = 0; i < n; i++) {
      const y = top + (H * 0.9 * (i + 1)) / (n + 1), k = i % 2 ? 1 : -1, x = 100 + k * 2;
      g += `<ellipse cx="${x + k * s}" cy="${y}" rx="${s * 1.1}" ry="${s * 0.5}" fill="${leafC}" transform="rotate(${-k * 28} ${x} ${y})"/>`;
    }
    g += `<ellipse cx="100" cy="${top - s * 0.5}" rx="${s * 0.5}" ry="${s}" fill="${leafC}"/>`;
  }
  if (d >= 25) {
    const R = 8 + 40 * ease(Math.min(1, (d - 25) / 140)), cy = top - R * 0.25;
    [[0, 0, 1], [-.62, .28, .72], [.62, .28, .72], [-.34, -.5, .7], [.4, -.55, .66]].forEach(([x, y, k], i) => {
      g += `<circle cx="${100 + x * R}" cy="${cy + y * R}" r="${R * k}" fill="${leafC}" opacity="${i ? 0.93 : 1}"/>`;
    });
    if (!w) {
      const POS = [[-.5, -.1], [.1, -.45], [.55, 0], [-.15, .3], [.35, .4], [-.6, .4], [0, -.1], [.7, -.35], [-.35, -.55], [.25, .1]];
      const nb = d >= 200 ? Math.min(10, Math.ceil((d - 200) / 10)) : 0, nf = d > 300 ? Math.min(10, Math.ceil((d - 300) / 6.5)) : 0;
      POS.forEach(([fx, fy], i) => {
        const x = 100 + fx * R * 0.95, y = cy + fy * R * 0.95;
        if (i < nf) g += `<circle cx="${x}" cy="${y}" r="${4 + R / 30}" fill="${sp.fruit}"/><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.4" fill="rgba(255,255,255,.45)"/>`;
        else if (i < nb) g += `<circle cx="${x}" cy="${y}" r="2.6" fill="${sp.blossom}"/>`;
      });
    }
  }
  out += w ? `<g transform="rotate(9 100 158)">${g}</g><ellipse cx="68" cy="156" rx="6" ry="2.5" fill="#A89F7B"/><ellipse cx="134" cy="156" rx="5" ry="2" fill="#A89F7B"/>` : g;
  return out;
}
const treeSVG = (sp, d, w) => `<svg viewBox="0 0 200 180" aria-hidden="true">${treeInner(sp, d, w)}</svg>`;

// Sur l'écran du timer : la plante du jour grandit pendant la session de concentration
function renderPlant(p) {
  const t = state.timer, grow = t.mode === 'focus' && t.lastDate !== localDateKey() ? p : 0;
  const el = document.getElementById('plant'), sp = speciesOf(state.species);
  el.innerHTML = state.dead && !(grow > 0) ? treeInner(sp, state.dead.days, true) : treeInner(sp, t.streakDays + grow, false);
}

function setSpecies(id) { state.species = id; save(); updateTimerDisplay(); renderGarden(); }

function renderGarden() {
  const d = state.dead ? state.dead.days : state.timer.streakDays, wilt = !!state.dead, sp = speciesOf(state.species);
  const i = STAGES.reduce((a, [n], k) => d >= n ? k : a, 0), nxt = STAGES[i + 1], left = nxt ? nxt[0] - d : 0;
  document.getElementById('garden-title').textContent = state.name;
  document.getElementById('garden-plant').innerHTML = treeSVG(sp, d, wilt);
  document.getElementById('garden-stage').innerHTML = wilt
    ? `<b>Plante fanée</b>Elle avait atteint le stade « ${STAGES[i][1]} ». Terminez une session pour planter une nouvelle graine.`
    : `<b>${STAGES[i][1]}</b>${nxt ? `Prochaine étape dans ${left} jour${left > 1 ? 's' : ''}, sans manquer un seul jour.` : 'Forme finale atteinte. Continuez pour la garder en vie.'}`;
  document.getElementById('species-list').innerHTML = SPECIES.map(s => {
    const ok = state.unlocked.includes(s.id), cur = s.id === state.species;
    const need = s.need ? `Série de ${s.need[1]} jours` : 'Disponible dès le départ';
    const meta = ok ? (cur ? 'Espèce actuelle' : need) : `🔒 ${need} · ${Math.min(progress('streak'), s.need[1])}/${s.need[1]}`;
    return `<div class="row${cur ? ' act' : ''}${ok ? '' : ' lock'}"${ok ? ` onclick="setSpecies('${s.id}')"` : ''}><div class="sp-ico">${treeSVG(s, 365, false)}</div><div class="info"><div class="name">${s.name}</div><div class="meta">${meta}</div></div></div>`;
  }).join('');
  const dead = state.forest.slice(-8).reverse();
  document.getElementById('forest-list').innerHTML = dead.length
    ? dead.map(f => `<div class="row dead"><div class="sp-ico">${treeSVG(speciesOf(f.sp), f.days, true)}</div><div class="info"><div class="name">${speciesOf(f.sp).name}</div><div class="meta">${f.days} jour${f.days > 1 ? 's' : ''} · fanée le ${new Date(f.d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div></div></div>`).join('')
    : '<div class="empty"><p>Aucune plante fanée pour l\'instant.</p></div>';
}

function toggleZen(on) {
  const app = document.getElementById('app'), z = on === undefined ? !app.classList.contains('zen') : on;
  app.classList.toggle('zen', z);
  if (z && state.currentScreen !== 'timer') showScreen('timer');
  try {
    if (z && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    else if (!z && document.fullscreenElement) document.exitFullscreen();
  } catch (e) {}
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.getElementById('app').classList.remove('zen');
});

// Raccourcis : espace = démarrer/pause, F = mode ciblé, Échap = fermer
document.addEventListener('keydown', e => {
  const modal = document.getElementById('add-task-modal').classList.contains('open');
  if (e.key === 'Escape') {
    if (modal) closeAddTask(); else toggleZen(false);
    return;
  }
  if (e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (modal || state.currentScreen !== 'timer') return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggleTimer(); }
  else if (e.key === 'f' || e.key === 'F') toggleZen();
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space' && !e.target.closest('input,textarea,select')) e.preventDefault();
});

function handleSessionEnd(at = Date.now()) {
  const t = state.timer, late = Date.now() - at > 5000;
  const feedback = () => { if (t.sound) playBeep(); if (t.haptic && navigator.vibrate) navigator.vibrate([200, 100, 200]); };
  if (t.mode === 'focus') {
    const day = localDateKey(new Date(at));
    t.totalSessions++;
    t.totalMinutes += t.durations.focus;
    state.history[day] = (state.history[day] || 0) + 1;
    if (day === localDateKey()) t.sessions++;
    const grew = t.lastDate !== day;
    if (grew) {
      if (t.lastDate === shiftDay(day, -1)) t.streakDays++;
      else { witherPlant(); t.streakDays = 1; state.dead = null; }
      t.lastDate = day;
    }
    t.bestStreak = Math.max(t.bestStreak || 0, t.streakDays);
    const fresh = checkUnlocks();
    let msg = fresh.length ? 'Nouvelle espèce débloquée : ' + fresh.map(s => s.name).join(', ') : grew ? 'Votre plante a grandi' : null;
    const task = state.tasks.find(k => k.id === state.activeTask);
    if (task) {
      task.spent++;
      if (task.est && task.spent === task.est && !fresh.length) msg = `Estimation atteinte : ${task.title}`;
    }
    if (msg) showToast(msg, 4000);
    renderTimerTasks(); renderTasks(); renderStreakDots(); renderSessionCount();
    feedback();
    sendNotification('Session terminée', `Prenez une vraie pause. ${t.sessions} session(s) aujourd'hui.`);
    checkNotifPermission();
    switchMode((t.sessions > 0 && t.sessions % 4 === 0) ? 'long' : 'short', null, true);
    if (t.autoBreak && !late) toggleTimer();
  } else {
    feedback();
    sendNotification('Pause terminée', 'Prêt pour une nouvelle session ?');
    switchMode('focus', null, true);
    if (t.autoFocus && !late) toggleTimer();
  }
  save();
}

init();
checkNotifPermission();