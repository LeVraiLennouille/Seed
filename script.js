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
  { id: 'lemon', name: 'Citronnier', leaf: '#5FA648', fruit: '#F2D624', blossom: '#FFFFFF', need: ['streak', 200] },
  { id: 'plum', name: 'Prunier', leaf: '#5B8F6E', fruit: '#5B3A8C', blossom: '#F3E3F7', need: ['harvest', 1] },
  { id: 'peach', name: 'Pêcher', leaf: '#7DB56A', fruit: '#F4A27E', blossom: '#FBC9D6', need: ['harvest', 2] }
];
const HEAL_EVERY = 5;       // jours validés pour qu'une feuille fanée repousse
const REST_PER_MONTH = 2;   // jours de repos posables par mois
const PUSH_SERVER = '';     // URL du serveur de rappels, ex. 'https://seed-push.example.com' (voir push-server/README.md)
const progress = k => ({
  streak: Math.max(state.timer.bestStreak || 0, state.timer.streakDays || 0),
  sessions: state.timer.totalSessions,
  goal: Object.values(state.history).filter(n => n >= state.timer.goal).length,
  harvest: (state.collection || []).length
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
  state.wilted = state.wilted || 0;
  state.forest = state.forest || [];
  state.dayStart ??= 4;
  state.log = state.log || [];
  state.rest = state.rest || [];
  state.collection = state.collection || [];
  state.distractions = state.distractions || [];
  state.remind = state.remind || { on: false, at: 1200, push: false };
  state.heal = state.heal || 0;
  t.askNote ??= true;
  state.tasks.forEach(k => { k.due ??= null; k.rec ??= null; k.plan ??= null; k.notes = k.notes || []; });
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
  if (state.remind.on) { syncPush(); scheduleLocalReminder(); }
}

const MODE_LABELS = { focus:'Concentration', short:'Pause courte', long:'Pause longue' };
function applyModeUI() {
  const mode = state.timer.mode;
  document.getElementById('app').dataset.mode = mode;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.id === 'tab-' + mode));
  document.getElementById('timer-mode-label').textContent = MODE_LABELS[mode];
  updatePlayIcon(false);
  renderDistract();
}

function showRaw(id) {
  const fxl = document.getElementById('fx'); if (fxl) fxl.replaceChildren();
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

// --- Dates : clé AAAA-MM-JJ du « jour logique » (la journée commence à state.dayStart) ---
const calKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function localDateKey(d = new Date()) {
  return calKey(new Date(d.getTime() - (state.dayStart ?? 4) * 3600000));
}

function shiftDay(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return calKey(new Date(y, m - 1, d + n));
}

// Instant où le jour logique en cours se termine
function dayEndsAt(now = Date.now()) {
  const ds = state.dayStart ?? 4, x = new Date(now - ds * 3600000);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1).getTime() + ds * 3600000;
}

// Nouveau jour : remet à zéro les sessions du jour ; chaque jour entièrement raté fait faner
// une feuille, sauf les jours de repos posés à l'avance
function refreshDaily() {
  const t = state.timer, today = localDateKey();
  if (t.lastDate && t.lastDate !== today) t.sessions = 0;
  state.rest = state.rest.filter(k => k >= shiftDay(today, -90));
  if (!t.lastDate || t.streakDays <= 0) return;
  let k = shiftDay(t.accounted || t.lastDate, 1), n = 0, r = 0, g = 0;
  while (k < today && g++ < 400) { if (state.rest.includes(k)) r++; else n++; k = shiftDay(k, 1); }
  if (!n && !r) return;
  t.accounted = shiftDay(today, -1);
  if (!n) { showToast('Jour de repos : aucune feuille n\'a fané', 4000); return; }
  state.wilted += n;
  if (state.wilted > leafCap()) { witherPlant(); showToast('Votre arbre a fané… une nouvelle graine vous attend', 5000); }
  else { showToast(n > 1 ? `${n} feuilles ont fané` : 'Une feuille a fané', 4000); leafFall(n); }
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
const REC_LABELS = { daily: 'chaque jour', weekly: 'chaque semaine', monthly: 'chaque mois' };
const isToday = t => t.plan === localDateKey() || (!!t.due && t.due <= localDateKey());
const taskCmp = (a, b) => ((b.id === state.activeTask) - (a.id === state.activeTask))
  || (isToday(b) - isToday(a))
  || PRIO[a.priority] - PRIO[b.priority]
  || (a.due || '9999').localeCompare(b.due || '9999');
const activeList = () => state.tasks.filter(t => !t.done).sort(taskCmp);

function dueInfo(t) {
  if (!t.due) return null;
  const today = localDateKey(), diff = Math.round((new Date(t.due + 'T12:00') - new Date(today + 'T12:00')) / 864e5);
  if (diff < 0) return { late: true, txt: diff === -1 ? 'en retard depuis hier' : `en retard de ${-diff} j` };
  if (diff === 0) return { txt: "échéance aujourd'hui" };
  if (diff === 1) return { txt: 'échéance demain' };
  if (diff < 7) return { txt: 'échéance ' + new Date(t.due + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long' }) };
  return { txt: 'échéance le ' + new Date(t.due + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) };
}

function addMonth(key) {
  const [y, m, d] = key.split('-').map(Number), last = new Date(y, m + 1, 0).getDate();
  return calKey(new Date(y, m, Math.min(d, last)));
}

// Prochaine échéance d'une tâche récurrente : à partir de l'échéance si elle est atteinte, sinon d'aujourd'hui
function nextDue(t) {
  const today = localDateKey();
  const step = k => t.rec === 'daily' ? shiftDay(k, 1) : t.rec === 'weekly' ? shiftDay(k, 7) : addMonth(k);
  let k = t.due && t.due <= today ? t.due : today, g = 0;
  do { k = step(k); } while (k <= today && ++g < 400);
  return k;
}

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
  const active = activeList(), today = active.filter(isToday), done = state.tasks.filter(t => t.done);
  document.getElementById('today-count').textContent = today.length;
  document.getElementById('active-count').textContent = active.length;
  document.getElementById('done-count').textContent = done.length;
  const list = taskTab === 'today' ? today : taskTab === 'active' ? active : done;
  const emptyText = { today: "Rien de prévu pour aujourd'hui. Planifiez une tâche ou donnez-lui une échéance.", active: 'Tout est fait. Ajoutez une tâche pour la prochaine session.', done: 'Aucune tâche terminée pour le moment.' }[taskTab];
  document.getElementById('tasks-list').innerHTML = list.length ? list.map(taskHTML).join('') : `<div class="empty"><p>${emptyText}</p></div>`;
}

function taskHTML(t) {
  const n = t.subs.length, d = t.subs.filter(s => s.d).length, pct = n ? Math.round(d / n * 100) : 0;
  const bits = [esc(t.cat)];
  if (n) bits.push(`${d}/${n} sous-tâches`);
  if (t.est || t.spent) bits.push(pomoLabel(t));
  const du = !t.done && dueInfo(t);
  if (du) bits.push(du.late ? `<em>${du.txt}</em>` : du.txt);
  if (t.rec) bits.push('↻ ' + REC_LABELS[t.rec]);
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
  if (t.done) {
    t.subs.forEach(s => s.d = true);
    if (state.activeTask === id) state.activeTask = null;
    if (t.rec && !t.spawned) {   // la tâche récurrente réapparaît à sa prochaine échéance
      const nd = nextDue(t);
      state.tasks.unshift({ ...t, id: Date.now(), done: false, spent: 0, due: nd, plan: null, spawned: false, notes: [], subs: t.subs.map(s => ({ ...s, d: false })) });
      t.spawned = true;
      showToast('Prochaine occurrence : ' + new Date(nd + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }), 3500);
    }
  }
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
  ['today', 'active', 'done'].forEach(k => document.getElementById('ttab-' + k).classList.toggle('active', tab === k));
  renderTasks();
}

// --- Feuille de création / édition ---
function openAddTask() { openSheet({ id: null, title: '', cat: state.cats[0], color: COLORS[0], priority: 'normal', est: 0, subs: [], due: null, rec: null, today: false, notes: [] }); }

function openEditTask(id) {
  const t = state.tasks.find(k => k.id === id); if (!t) return;
  openSheet({ id, title: t.title, cat: t.cat, color: t.color, priority: t.priority, est: t.est, subs: t.subs.map(s => ({ ...s })),
    due: t.due, rec: t.rec, today: t.plan === localDateKey(), notes: t.notes.map(n => ({ ...n })) });
}

function openSheet(d) {
  ed = d;
  document.getElementById('sheet-title').textContent = d.id ? 'Modifier la tâche' : 'Nouvelle tâche';
  document.getElementById('task-input').value = d.title;
  document.getElementById('sub-input').value = '';
  document.getElementById('due-input').value = d.due || '';
  document.getElementById('today-toggle').checked = !!d.today;
  document.getElementById('del-btn').style.display = d.id ? '' : 'none';
  renderSheet();
  document.getElementById('add-task-modal').classList.add('open');
  if (!d.id) setTimeout(() => document.getElementById('task-input').focus(), 300);
}

function clearDue() { ed.due = null; document.getElementById('due-input').value = ''; }

function renderSheet() {
  document.getElementById('color-swatches').innerHTML = COLORS.map(c => `<div class="swatch${c === ed.color ? ' selected' : ''}" style="background:${c}" onclick="ed.color='${c}';renderSheet()"></div>`).join('');
  document.getElementById('cat-select').innerHTML = state.cats.map((c, i) => `<button class="cat-btn${c === ed.cat ? ' active' : ''}" onclick="ed.cat=state.cats[${i}];renderSheet()">${esc(c)}${c === ed.cat && state.cats.length > 1 ? `<span class="x" onclick="event.stopPropagation();delCat(${i})" aria-label="Supprimer la catégorie">×</span>` : ''}</button>`).join('') + '<button class="cat-btn" onclick="addCat()">+ Catégorie</button>';
  document.getElementById('prio-select').innerHTML = PRIO_LABELS.map(([v, l]) => `<button class="preset-chip${v === ed.priority ? ' active' : ''}" onclick="ed.priority='${v}';renderSheet()">${l}</button>`).join('');
  document.getElementById('est-val').textContent = ed.est;
  document.getElementById('rec-select').innerHTML = [['', 'Aucune'], ['daily', 'Chaque jour'], ['weekly', 'Chaque semaine'], ['monthly', 'Chaque mois']]
    .map(([v, l]) => `<button class="preset-chip${(ed.rec || '') === v ? ' active' : ''}" onclick="ed.rec=${v ? `'${v}'` : 'null'};renderSheet()">${l}</button>`).join('');
  document.getElementById('sub-list').innerHTML = ed.subs.map((s, i) => `<div class="sub">
    <button class="check${s.d ? ' done' : ''}" onclick="ed.subs[${i}].d=!ed.subs[${i}].d;renderSheet()" aria-label="Cocher"><svg><use href="#i-check"/></svg></button>
    <span class="${s.d ? 'off' : ''}">${esc(s.t)}</span>
    <button class="m" onclick="moveSub(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Monter">▲</button>
    <button class="m" onclick="moveSub(${i},1)" ${i === ed.subs.length - 1 ? 'disabled' : ''} aria-label="Descendre">▼</button>
    <button class="m" onclick="ed.subs.splice(${i},1);renderSheet()" aria-label="Supprimer">✕</button></div>`).join('');
  document.getElementById('notes-list').innerHTML = ed.notes.length
    ? '<span class="input-label">Notes de session</span>' + ed.notes.map((n, i) => `<div class="nt"><span><small>${new Date(n.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small>${esc(n.n)}</span><button class="m" onclick="ed.notes.splice(${i},1);renderSheet()" aria-label="Supprimer la note">✕</button></div>`).reverse().join('')
    : '';
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
  ed.due = document.getElementById('due-input').value || null;
  if (ed.rec && !ed.due) ed.due = localDateKey();
  const data = { title, cat: ed.cat, color: ed.color, priority: ed.priority, est: ed.est, subs: ed.subs,
    due: ed.due, rec: ed.rec, plan: ed.today ? localDateKey() : null, notes: ed.notes };
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
  [['sound-toggle', 'sound'], ['haptic-toggle', 'haptic'], ['auto-break-toggle', 'autoBreak'], ['auto-focus-toggle', 'autoFocus'], ['note-toggle', 'askNote']]
    .forEach(([id, k]) => document.getElementById(id).checked = !!t[k]);
  renderOpts('chips-theme', [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']], state.theme, 'setTheme');
  renderOpts('chips-sound', [['soft', 'Doux'], ['chime', 'Carillon'], ['beep', 'Bip']], t.soundKind, 'setSoundKind');
  renderOpts('chips-ambient', [['off', 'Aucun'], ['rain', 'Pluie'], ['forest', 'Forêt']], t.ambient, 'setAmbient');
  document.getElementById('profile-name').value = state.name;
  document.getElementById('prof-tasks').textContent = state.tasks.length;
  document.getElementById('prof-sessions').textContent = t.totalSessions;
  document.getElementById('prof-mins').textContent = t.totalMinutes;
  renderRemind();
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
  renderPeriod();
  renderLog();
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

// --- Période : navigation semaine / mois ---
let rep = { mode: 'week', off: 0 };
const fmtMin = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
const dFmt = (k, o) => new Date(k + 'T12:00').toLocaleDateString('fr-FR', o);

function repRange() {
  const today = localDateKey();
  if (rep.mode === 'week') {
    const [y, m, d] = today.split('-').map(Number), dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
    const from = shiftDay(today, -dow + rep.off * 7);
    return { from, to: shiftDay(from, 6), days: 7 };
  }
  const [y, m] = today.split('-').map(Number);
  return { from: calKey(new Date(y, m - 1 + rep.off, 1)), to: calKey(new Date(y, m + rep.off, 0)), days: new Date(y, m + rep.off, 0).getDate() };
}
function repNav(d) { if (rep.off + d > 0) return; rep.off += d; renderPeriod(); }
function setRepMode(m) { rep = { mode: m, off: 0 }; renderPeriod(); }

function renderPeriod() {
  const r = repRange(), h = state.history, inR = k => k >= r.from && k <= r.to;
  renderOpts('chips-rep', [['week', 'Semaine'], ['month', 'Mois']], rep.mode, 'setRepMode');
  const label = rep.mode === 'week' ? `${dFmt(r.from, { day: 'numeric', month: 'short' })} – ${dFmt(r.to, { day: 'numeric', month: 'short' })}` : dFmt(r.from, { month: 'long', year: 'numeric' });
  document.getElementById('rep-label').textContent = label.charAt(0).toUpperCase() + label.slice(1);
  document.getElementById('rep-next').disabled = rep.off >= 0;

  const days = Array.from({ length: r.days }, (_, i) => shiftDay(r.from, i));
  const lg = {};
  state.log.filter(e => inR(e.d)).forEach(e => { const o = lg[e.d] || (lg[e.d] = { n: 0, m: 0 }); o.n++; o.m += e.m; });
  let sessions = 0, minutes = 0, active = 0;
  days.forEach(k => {
    const n = h[k] || 0, l = lg[k] || { n: 0, m: 0 };
    sessions += n; if (n) active++;
    minutes += l.m + Math.max(0, n - l.n) * state.timer.durations.focus;   // sessions sans détail : durée actuelle
  });

  if (rep.mode === 'week') {
    const max = Math.max(...days.map(k => h[k] || 0), 1);
    document.getElementById('rep-chart').innerHTML = '<div class="week">' + days.map(k => {
      const v = h[k] || 0;
      return `<div class="wk"><b>${v}</b><i class="${v ? '' : 'zero'}" style="height:${Math.round(v / max * 100)}px"></i><span>${dFmt(k, { weekday: 'narrow' }).toUpperCase()}</span></div>`;
    }).join('') + '</div>';
  } else {
    const lead = (new Date(r.from + 'T12:00').getDay() + 6) % 7, max = Math.max(...days.map(k => h[k] || 0), 1);
    document.getElementById('rep-chart').innerHTML = '<div class="heat-labels"><i>L</i><i>M</i><i>M</i><i>J</i><i>V</i><i>S</i><i>D</i></div><div class="heatmap-grid">'
      + Array(lead).fill('<div class="heat-cell" style="visibility:hidden"></div>').join('')
      + days.map(k => {
        const n = h[k] || 0, q = n / max, lvl = !n ? '' : q < .25 ? 'h1' : q < .5 ? 'h2' : q < .75 ? 'h3' : 'h4';
        return `<div class="heat-cell ${lvl}" title="${dFmt(k, { day: 'numeric', month: 'short' })} : ${n} session${n > 1 ? 's' : ''}"></div>`;
      }).join('') + '</div>';
  }
  const ratio = active ? sessions / active : 0, s1 = n => n > 1 ? 's' : '';
  const cells = [[sessions, 'session' + s1(sessions)], [fmtMin(minutes), 'de concentration'], [active, 'jour' + s1(active) + ' actif' + s1(active)], [ratio.toFixed(1).replace('.', ','), 'session' + (ratio >= 2 ? 's' : '') + ' par jour actif']];
  document.getElementById('rep-stats').innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');

  // Temps par catégorie et par tâche, d'après le journal détaillé
  const es = state.log.filter(e => inR(e.d)), cats = {}, tasks = {};
  es.forEach(e => {
    const cn = e.cat || 'Sans tâche', c = cats[cn] || (cats[cn] = { m: 0, c: e.c });
    c.m += e.m; if (e.c) c.c = e.c;
    const tk = e.task ?? 'none', o = tasks[tk] || (tasks[tk] = { name: e.tt || 'Sans tâche', m: 0, c: e.c });
    o.m += e.m;
  });
  const bars = (list, empty) => {
    if (!list.length) return `<div class="empty"><p>${empty}</p></div>`;
    const max = Math.max(...list.map(x => x.m));
    return list.map(x => `<div class="brk"><span class="nm">${esc(x.name)}</span><span class="v">${fmtMin(x.m)}</span><div class="bb"><i style="width:${Math.round(x.m / max * 100)}%;background:${x.c || 'var(--moss)'}"></i></div></div>`).join('');
  };
  const none = 'Pas de détail sur cette période. Il est enregistré à chaque session depuis la v2.6.';
  document.getElementById('rep-cats').innerHTML = bars(Object.entries(cats).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.m - a.m), none);
  document.getElementById('rep-tasks').innerHTML = bars(Object.values(tasks).sort((a, b) => b.m - a.m).slice(0, 8), none);
}

function renderLog() {
  const last = state.log.slice(-8).reverse();
  document.getElementById('rep-log').innerHTML = last.length ? last.map(e => {
    const d = new Date(e.t);
    return `<div class="lg"><b>${esc(e.tt || 'Sans tâche')}</b><small>${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${e.m} min${e.cat ? ' · ' + esc(e.cat) : ''}</small>${e.n ? `<p>${esc(e.n)}</p>` : ''}</div>`;
  }).join('') : '<div class="empty"><p>Les sessions terminées apparaîtront ici, avec leur note.</p></div>';
}

// Export du journal : séparateur « ; » et BOM pour Excel, protection contre l'injection de formules
function exportCSV() {
  if (!state.log.length) { showToast('Aucune session dans le journal'); return; }
  const q = v => { let x = String(v ?? ''); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; };
  const rows = [['date', 'heure', 'duree_min', 'tache', 'categorie', 'note']]
    .concat(state.log.map(e => [e.d, new Date(e.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), e.m, e.tt, e.cat, e.n]));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `seed-journal-${localDateKey()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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

function sendNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body, tag,
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      vibrate: [200, 100, 200],
      silent: false
    });
  } catch(e) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body, tag,
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
  renderGarden();
  updateTimerDisplay();
  syncPush();
  scheduleLocalReminder();
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

// Nombre de feuilles fanées tolérées : plus l'arbre est ancien, plus il est résistant
const leafCap = (d = state.timer.streakDays) => 3 + Math.floor(d / 7);

// Trop de feuilles fanées : tout l'arbre fane et la série est perdue
function witherPlant() {
  const t = state.timer;
  if (t.streakDays > 0) {
    state.dead = { days: t.streakDays, sp: state.species };
    state.forest.push({ days: t.streakDays, sp: state.species, d: localDateKey() });
  }
  t.streakDays = 0; t.accounted = null; state.wilted = 0; state.heal = 0;
}

function treeInner(sp, d, w, wl = 0, cap = 1) {
  d = Math.max(0, Math.min(365, d));
  const G = 158, p = Math.min(1, d / 100), ease = x => x * x * (3 - 2 * x);
  let out = '<path d="M24 158h152" style="stroke:var(--line)" stroke-width="2.5" stroke-linecap="round" fill="none"/>';
  if (d < 0.03) return out + '<ellipse cx="100" cy="154" rx="9" ry="6" style="fill:var(--moss)"/>';
  const H = 14 + 84 * Math.pow(p, 0.65), top = G - H, W = 2.5 + 6 * p, ratio = Math.min(1, wl / (cap + 1));
  const leafC = w ? '#A89F7B' : ratio ? `color-mix(in srgb,#B3A261 ${Math.round(ratio * 80)}%,${sp.leaf})` : sp.leaf;
  const bark = w ? '#8A7B55' : `color-mix(in srgb,#7A5230 ${Math.round(Math.min(1, Math.max(0, (d - 15) / 60)) * 100)}%,#3C8A55)`;
  let g = `<path d="M100 156C100 ${G - H * 0.4} 95 ${G - H * 0.7} 100 ${top}" style="stroke:${bark}" stroke-width="${W}" stroke-linecap="round" fill="none"/>`;
  if (d < 60) {
    const n = Math.min(10, 1 + Math.floor(d / 3)), s = 4 + 8 * Math.min(1, d / 40);
    for (let i = 0; i < n; i++) {
      const y = top + (H * 0.9 * (i + 1)) / (n + 1), k = i % 2 ? 1 : -1, x = 100 + k * 2;
      const dry = !w && i >= n - wl;
      g += `<ellipse cx="${x + k * s}" cy="${y}" rx="${s * 1.1}" ry="${s * 0.5}" style="fill:${dry ? '#B3A261' : leafC}" transform="rotate(${dry ? k * 40 : -k * 28} ${x} ${y})"/>`;
    }
    g += `<ellipse cx="100" cy="${top - s * 0.5}" rx="${s * 0.5}" ry="${s}" style="fill:${leafC}"/>`;
  }
  if (d >= 25) {
    const R = 8 + 40 * ease(Math.min(1, (d - 25) / 140)), cy = top - R * 0.25;
    [[0, 0, 1], [-.62, .28, .72], [.62, .28, .72], [-.34, -.5, .7], [.4, -.55, .66]].forEach(([x, y, k], i) => {
      g += `<circle cx="${100 + x * R}" cy="${cy + y * R}" r="${R * k}" style="fill:${leafC}" opacity="${i ? 0.93 : 1}"/>`;
    });
    [[.3, -.6], [-.55, .2], [.6, .25], [0, .45], [-.2, -.3], [.45, -.1], [-.65, -.35], [.15, .1], [.7, .5], [-.4, .5]]
      .slice(0, w ? 0 : Math.min(10, wl)).forEach(([fx, fy], i) => {
        const x = 100 + fx * R, y = cy + fy * R;
        g += `<ellipse cx="${x}" cy="${y}" rx="4.5" ry="2.2" fill="#B3A261" transform="rotate(${i * 37} ${x} ${y})"/>`;
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
  if (!w) [[70, 156], [132, 157], [84, 157], [118, 156], [58, 157], [146, 156], [96, 158], [108, 158]]
    .slice(0, Math.min(8, wl)).forEach(([x, y]) => { out += `<ellipse cx="${x}" cy="${y}" rx="5" ry="2" fill="#B3A261"/>`; });
  return out;
}
const treeSVG = (sp, d, w, wl, cap) => `<svg viewBox="0 0 200 180" aria-hidden="true">${treeInner(sp, d, w, wl, cap)}</svg>`;

// Sur l'écran du timer : la plante du jour grandit pendant la session de concentration
function renderPlant(p) {
  const t = state.timer, grow = t.mode === 'focus' && t.lastDate !== localDateKey() ? p : 0;
  const el = document.getElementById('plant'), sp = speciesOf(state.species);
  el.innerHTML = state.dead && !(grow > 0) ? treeInner(sp, state.dead.days, true) : treeInner(sp, t.streakDays + grow, false, state.wilted, leafCap());
}

function setSpecies(id) { state.species = id; save(); updateTimerDisplay(); renderGarden(); }

const canHarvest = () => !state.dead && state.timer.streakDays >= 365;

function harvestTree() {
  if (!canHarvest() || !confirm('Récolter l\'arbre ? Il rejoint votre collection et une nouvelle graine est plantée.')) return;
  const t = state.timer;
  state.collection.push({ sp: state.species, days: t.streakDays, d: localDateKey() });
  t.streakDays = 0; t.accounted = null; state.wilted = 0; state.heal = 0; state.dead = null;
  const fresh = checkUnlocks();
  save(); syncPush();
  showToast(fresh.length ? 'Récolte ! Nouvelle espèce : ' + fresh.map(s => s.name).join(', ') : 'Arbre récolté. Choisissez l\'espèce de la prochaine graine.', 5000);
  renderGarden(); updateTimerDisplay(); renderReports();
}

// --- Jours de repos : posés à l'avance, ils ne font pas faner de feuille ---
const restIn = mk => state.rest.filter(k => k.slice(0, 7) === mk).length;

function addRest() {
  const el = document.getElementById('rest-input'), v = el.value, today = localDateKey();
  if (!v) return;
  if (v <= today) { showToast('Posez un jour de repos à l\'avance, à partir de demain', 3500); return; }
  if (state.rest.includes(v)) { showToast('Ce jour est déjà posé'); return; }
  if (restIn(v.slice(0, 7)) >= REST_PER_MONTH) { showToast(`Déjà ${REST_PER_MONTH} jours de repos ce mois-là`, 3500); return; }
  state.rest.push(v); state.rest.sort(); el.value = '';
  save(); renderGarden(); syncPush(); showToast('Jour de repos posé');
}
function delRest(k) {
  if (k <= localDateKey()) return;
  state.rest = state.rest.filter(x => x !== k);
  save(); renderGarden(); syncPush();
}

function renderGarden() {
  const d = state.dead ? state.dead.days : state.timer.streakDays, wilt = !!state.dead, sp = speciesOf(state.species);
  const i = STAGES.reduce((a, [n], k) => d >= n ? k : a, 0), nxt = STAGES[i + 1], left = nxt ? nxt[0] - d : 0;
  const wl = state.wilted, cap = leafCap(), pl = n => n > 1 ? 's' : '', toHeal = HEAL_EVERY - state.heal;
  document.getElementById('garden-title').textContent = state.name;
  document.getElementById('garden-plant').innerHTML = treeSVG(sp, d, wilt, wl, cap);
  const health = wl
    ? (cap - wl > 0 ? `${wl} feuille${pl(wl)} fanée${pl(wl)}. L'arbre peut en perdre ${cap - wl} de plus.` : `${wl} feuilles fanées. Une de plus et l'arbre fane.`)
      + ` Une feuille repousse dans ${toHeal} jour${pl(toHeal)} validé${pl(toHeal)}.`
    : 'Toutes les feuilles sont en bonne santé.';
  document.getElementById('garden-stage').innerHTML = wilt
    ? `<b>Plante fanée</b>Elle avait atteint le stade « ${STAGES[i][1]} ». Terminez une session pour planter une nouvelle graine.`
    : `<b>${STAGES[i][1]}</b>${nxt ? `Prochaine étape dans ${left} jour${pl(left)}.` : 'Forme finale atteinte : vous pouvez la récolter.'}<br>${health}`;
  document.getElementById('harvest-box').innerHTML = canHarvest() ? '<button class="btn" onclick="harvestTree()">Récolter l\'arbre</button>' : '';

  document.getElementById('species-list').innerHTML = SPECIES.map(s => {
    const ok = state.unlocked.includes(s.id), cur = s.id === state.species;
    const need = !s.need ? 'Disponible dès le départ' : s.need[0] === 'harvest' ? `${s.need[1]} arbre${pl(s.need[1])} récolté${pl(s.need[1])}` : `Série de ${s.need[1]} jours`;
    const meta = ok ? (cur ? 'Espèce actuelle' : need) : `🔒 ${need} · ${Math.min(progress(s.need[0]), s.need[1])}/${s.need[1]}`;
    return `<div class="row${cur ? ' act' : ''}${ok ? '' : ' lock'}"${ok ? ` onclick="setSpecies('${s.id}')"` : ''}><div class="sp-ico">${treeSVG(s, 365, false)}</div><div class="info"><div class="name">${s.name}</div><div class="meta">${meta}</div></div></div>`;
  }).join('');

  const today = localDateKey(), up = state.rest.filter(k => k > today), mk = today.slice(0, 7);
  document.getElementById('rest-hint').textContent = `${REST_PER_MONTH} jours de repos par mois, à poser au moins un jour à l'avance : aucune feuille ne fane ces jours-là. Ce mois-ci : ${restIn(mk)}/${REST_PER_MONTH}.`;
  document.getElementById('rest-input').min = shiftDay(today, 1);
  document.getElementById('rest-list').innerHTML = up.map(k => `<div class="row"><div class="info"><div class="name">${dFmt(k, { weekday: 'long', day: 'numeric', month: 'long' })}</div><div class="meta">Jour de repos</div></div><button class="more" onclick="delRest('${k}')" aria-label="Retirer ce jour de repos">✕</button></div>`).join('');

  document.getElementById('collection-list').innerHTML = state.collection.length
    ? state.collection.slice().reverse().map(c => `<div class="row"><div class="sp-ico">${treeSVG(speciesOf(c.sp), 365, false)}</div><div class="info"><div class="name">${speciesOf(c.sp).name}</div><div class="meta">${c.days} jours · récolté le ${dFmt(c.d, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div></div>`).join('')
    : '<div class="empty"><p>Aucun arbre récolté. Menez un arbre jusqu\'à 365 jours.</p></div>';

  const dead = state.forest.slice(-8).reverse();
  document.getElementById('forest-list').innerHTML = dead.length
    ? dead.map(f => `<div class="row dead"><div class="sp-ico">${treeSVG(speciesOf(f.sp), f.days, true)}</div><div class="info"><div class="name">${speciesOf(f.sp).name}</div><div class="meta">${f.days} jour${f.days > 1 ? 's' : ''} · fanée le ${dFmt(f.d, { day: 'numeric', month: 'short' })}</div></div></div>`).join('')
    : '<div class="empty"><p>Aucune plante fanée pour l\'instant.</p></div>';
}

// --- Animations : épanouissement en fin de session, feuilles qui tombent ---
function plantTarget() {
  for (const el of [document.getElementById('plant'), document.querySelector('#garden-plant svg')]) {
    if (!el || el.closest('.screen.hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 20 && r.height > 20) return { el, r };
  }
  return null;
}

function fx(kind, n) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const p = plantTarget(), layer = document.getElementById('fx');
  if (!p || !layer) return;
  const { r } = p, cx = r.left + r.width / 2, cy = r.top + r.height * 0.4, rnd = Math.random;
  for (let i = 0; i < n; i++) {
    const e = document.createElement('i');
    if (kind === 'bloom') {
      e.className = 'fx-p';
      e.style.cssText = `left:${cx + (rnd() - .5) * r.width * .5}px;top:${cy + (rnd() - .3) * r.height * .3}px;background:${['#F8C8DC', '#FFE29A', '#FFFFFF', '#BFE3A5'][i % 4]};--dx:${(rnd() - .5) * 110}px;--dy:${-30 - rnd() * 70}px;animation-delay:${rnd() * .4}s`;
    } else {
      e.className = 'fx-l';
      e.style.cssText = `left:${cx + (rnd() - .5) * r.width * .45}px;top:${cy + (rnd() - .5) * r.height * .25}px;--dx:${(rnd() - .5) * 70}px;--dy:${r.height * .55 + rnd() * 20}px;--rot:${(rnd() - .5) * 540}deg;animation-delay:${i * .25}s`;
    }
    layer.appendChild(e);
    setTimeout(() => e.remove(), 3500 + i * 250);
  }
  if (kind === 'bloom') {
    p.el.classList.remove('bloom'); void p.el.getBoundingClientRect(); p.el.classList.add('bloom');
    setTimeout(() => p.el.classList.remove('bloom'), 1500);
  }
}
function bloomAnimation() { setTimeout(() => fx('bloom', 14), 250); }
function leafFall(n) { setTimeout(() => fx('leaf', Math.min(6, n)), 700); }

// --- Note de fin de session, attachée à la session et à la tâche ---
let pendingNote = null;

function openNote(entry) {
  pendingNote = entry;
  const tk = state.tasks.find(k => k.id === entry.task), n = state.distractions.length;
  document.getElementById('note-ctx').textContent = (tk ? `Tâche : ${tk.title} · ` : '') + `${entry.m} min` + (n ? ` · ${n} distraction${n > 1 ? 's' : ''} à trier` : '');
  document.getElementById('note-input').value = '';
  document.getElementById('note-modal').classList.add('open');
  setTimeout(() => document.getElementById('note-input').focus(), 300);
}
function skipNote() { document.getElementById('note-modal').classList.remove('open'); pendingNote = null; }
function saveNote() {
  const v = document.getElementById('note-input').value.trim();
  if (v && pendingNote) {
    pendingNote.n = v.slice(0, 240);
    const tk = state.tasks.find(k => k.id === pendingNote.task);
    if (tk) { tk.notes.push({ t: pendingNote.t, n: pendingNote.n }); if (tk.notes.length > 30) tk.notes.shift(); }
    save(); renderLog(); renderTasks();
  }
  skipNote();
}

// --- Distractions : noter une pensée parasite sans quitter le timer ---
function renderDistract() {
  const n = state.distractions.length;
  document.getElementById('distract').classList.toggle('on', state.timer.mode === 'focus');
  document.getElementById('distract-count').textContent = n ? `Distractions (${n})` : 'Distractions';
}
function addDistraction() {
  const i = document.getElementById('distract-input'), v = i.value.trim();
  if (!v) return;
  state.distractions.unshift({ id: Date.now(), t: v.slice(0, 80), at: Date.now(), task: state.activeTask });
  if (state.distractions.length > 100) state.distractions.length = 100;
  i.value = ''; i.blur(); save(); renderDistract();
  showToast('Noté. Retour à la tâche.', 1500);
}
function renderDistractList() {
  document.getElementById('dist-list').innerHTML = state.distractions.length
    ? state.distractions.map(d => `<div class="di"><span>${esc(d.t)}</span><button class="link" onclick="distToTask(${d.id})">En tâche</button><button class="m" onclick="delDist(${d.id})" aria-label="Supprimer">✕</button></div>`).join('')
    : '<div class="empty"><p>Aucune distraction notée.</p></div>';
}
function openDistractions() { renderDistractList(); document.getElementById('dist-modal').classList.add('open'); }
function closeDistractions() { document.getElementById('dist-modal').classList.remove('open'); }
function delDist(id) { state.distractions = state.distractions.filter(d => d.id !== id); save(); renderDistractList(); renderDistract(); }
function clearDistractions() {
  if (state.distractions.length && !confirm('Effacer toutes les distractions ?')) return;
  state.distractions = []; save(); renderDistractList(); renderDistract();
}
function distToTask(id) {
  const d = state.distractions.find(x => x.id === id); if (!d) return;
  state.tasks.unshift({ id: Date.now(), title: d.t, cat: state.cats[0], color: COLORS[0], priority: 'normal', est: 0, subs: [], done: false, spent: 0, due: null, rec: null, plan: null, notes: [] });
  state.distractions = state.distractions.filter(x => x.id !== id);
  save(); renderDistractList(); renderDistract(); renderTasks(); renderTimerTasks();
  showToast('Tâche créée');
}

// --- Journée et rappel de fin de journée ---
const remindTime = at => `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;

function adjDayStart(d) {
  state.dayStart = Math.max(0, Math.min(8, state.dayStart + d));
  refreshDaily(); renderStreakDots(); renderSessionCount(); renderGarden(); renderRemind();
  save(); syncPush(); scheduleLocalReminder();
}

function renderRemind() {
  const r = state.remind;
  document.getElementById('remind-toggle').checked = r.on;
  document.getElementById('remind-val').textContent = remindTime(r.at);
  document.getElementById('daystart-val').textContent = state.dayStart + ' h';
  document.getElementById('remind-status').textContent = !('Notification' in window) ? 'Notifications non prises en charge par ce navigateur'
    : !r.on ? 'Désactivé'
    : Notification.permission === 'denied' ? 'Notifications bloquées dans le navigateur'
    : r.push ? 'Actif, même appli fermée'
    : PUSH_SERVER ? (r.err ? 'Serveur de rappels injoignable : actif quand l\'appli est ouverte' : 'Connexion au serveur de rappels…')
    : 'Actif quand l\'appli est ouverte (serveur push non configuré)';
}

async function setRemind(on) {
  const r = state.remind;
  if (on) {
    if (!('Notification' in window)) { showToast('Notifications non prises en charge'); renderRemind(); return; }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') { r.on = false; save(); renderRemind(); showToast('Autorisez les notifications pour activer le rappel', 4000); return; }
  }
  r.on = on; save(); renderRemind();
  await syncPush();
  scheduleLocalReminder();
}

function adjRemind(d) {
  const r = state.remind;
  r.at = Math.max(720, Math.min(1410, r.at + d * 30));
  save(); renderRemind(); syncPush(); scheduleLocalReminder();
}

function reminderText() {
  const left = dayEndsAt() - Date.now(), when = left < 3600000 ? 'Il reste moins d\'une heure' : `Il vous reste ${Math.ceil(left / 3600000)} h`;
  return when + (state.timer.streakDays > 0 ? ' pour sauver une feuille de votre arbre.' : ' pour planter votre graine.');
}

// Repli local : ne fonctionne que si l'appli est ouverte (le serveur push prend le relais sinon)
let remindTimer = null;
function scheduleLocalReminder() {
  clearTimeout(remindTimer);
  const r = state.remind;
  if (!r.on || r.push || !('Notification' in window)) return;
  const now = new Date(), tgt = new Date(now);
  tgt.setHours(Math.floor(r.at / 60), r.at % 60, 0, 0);
  if (tgt <= now) tgt.setDate(tgt.getDate() + 1);
  remindTimer = setTimeout(() => {
    const key = localDateKey();
    if (state.timer.lastDate !== key && !state.rest.includes(key)) sendNotification('Seed', reminderText(), 'seed-reminder');
    scheduleLocalReminder();
  }, Math.min(tgt - now, 2147483647));
}

const b64ToU8 = b => Uint8Array.from(atob((b + '='.repeat((4 - b.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// Abonnement Web Push + synchronisation de l'état utile au serveur (heure, fuseau, dernier jour validé, repos)
function syncPush() { return (state.remind.on || state.remind.push) ? doSync() : Promise.resolve(); }
async function doSync() {
  const r = state.remind;
  if (!PUSH_SERVER || !('serviceWorker' in navigator) || !('PushManager' in window)) { r.push = false; save(); renderRemind(); return; }
  const post = body => fetch(PUSH_SERVER + '/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!r.on) {
      if (sub) { await post({ sub: sub.toJSON(), on: false }); await sub.unsubscribe(); }
      r.push = false;
    } else {
      if (!sub) {
        const { key } = await (await fetch(PUSH_SERVER + '/vapid')).json();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
      }
      const t = state.timer, today = localDateKey();
      const res = await post({ sub: sub.toJSON(), on: true, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        at: r.at, dayStart: state.dayStart, last: t.lastDate, streak: t.streakDays, rest: state.rest.filter(k => k >= today) });
      if (!res.ok) throw new Error('sync ' + res.status);
      r.push = true; r.err = false;
    }
  } catch (e) { r.push = false; r.err = true; console.warn('[push]', e); }
  save(); renderRemind();
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
  const modal = document.querySelector('.modal-overlay.open');
  if (e.key === 'Escape') {
    if (!modal) toggleZen(false);
    else if (modal.id === 'note-modal') skipNote();
    else if (modal.id === 'dist-modal') closeDistractions();
    else closeAddTask();
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
  let entry = null;
  const feedback = () => { if (t.sound) playBeep(); if (t.haptic && navigator.vibrate) navigator.vibrate([200, 100, 200]); };
  if (t.mode === 'focus') {
    const day = localDateKey(new Date(at));
    t.totalSessions++;
    t.totalMinutes += t.durations.focus;
    state.history[day] = (state.history[day] || 0) + 1;
    if (day === localDateKey()) t.sessions++;
    refreshDaily();
    const grew = t.lastDate !== day;
    let healed = false;
    if (grew) {
      if (t.streakDays === 0) { state.dead = null; state.wilted = 0; }
      t.streakDays++;
      t.lastDate = day;
      if (t.accounted && day <= t.accounted && !state.rest.includes(day)) state.wilted = Math.max(0, state.wilted - 1);
      else t.accounted = day;
      if (++state.heal >= HEAL_EVERY) { state.heal = 0; if (state.wilted > 0) { state.wilted--; healed = true; } }
    }
    t.bestStreak = Math.max(t.bestStreak || 0, t.streakDays);
    const fresh = checkUnlocks();
    let msg = fresh.length ? 'Nouvelle espèce débloquée : ' + fresh.map(s => s.name).join(', ')
      : grew ? (healed ? 'Votre plante a grandi et une feuille a repoussé' : 'Votre plante a grandi') : null;
    const task = state.tasks.find(k => k.id === state.activeTask);
    entry = { t: at, d: day, m: t.durations.focus, task: task ? task.id : null, tt: task ? task.title : '', cat: task ? task.cat : '', c: task ? task.color : '', n: '' };
    state.log.push(entry);
    if (state.log.length > 3000) state.log.splice(0, state.log.length - 3000);
    if (task) {
      task.spent++;
      if (task.est && task.spent === task.est && !fresh.length) msg = `Estimation atteinte : ${task.title}`;
    }
    if (msg) showToast(msg, 4000);
    renderTimerTasks(); renderTasks(); renderStreakDots(); renderSessionCount(); renderGarden();
    feedback(); bloomAnimation();
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
  if (entry) { syncPush(); if (t.askNote) openNote(entry); }
}

init();
checkNotifPermission();