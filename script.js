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

function save() { localStorage.setItem('pomodo_state', JSON.stringify(state)); }

function init() {
  const today = new Date().toISOString().split('T')[0];
  if (state.timer.lastDate && state.timer.lastDate !== today) state.timer.sessions = 0;
  state.timer.running = false;
  if (state.darkMode) { document.documentElement.setAttribute('data-dark','true'); document.getElementById('dark-toggle').checked = true; }
  if (!state.onboarded) { showRaw('onboarding'); }
  else { showRaw(state.currentScreen==='onboarding'?'timer':state.currentScreen); }
  applyModeUI();
  renderStreakDots();
  renderSessionCount();
  renderTimerTasks();
  renderTasks();
  renderSettings();
  renderReports();
  updateTimerDisplay();
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

function switchMode(mode, btn) {
  if (state.timer.running) { clearInterval(timerInterval); timerInterval = null; state.timer.running = false; }
  state.timer.mode = mode;
  state.timer.timeLeft = state.timer.durations[mode] * 60;
  applyModeUI();
  updateTimerDisplay();
  save();
}

function toggleTimer() {
  if (state.timer.running) {
    clearInterval(timerInterval); timerInterval = null;
    state.timer.running = false;
    updatePlayIcon(false);
  } else {
    state.timer.running = true;
    updatePlayIcon(true);
    timerInterval = setInterval(tick, 1000);
  }
  save();
}

function tick() {
  if (state.timer.timeLeft <= 0) {
    clearInterval(timerInterval); timerInterval = null;
    state.timer.running = false;
    updatePlayIcon(false);
    handleSessionEnd();
    return;
  }
  state.timer.timeLeft--;
  updateTimerDisplay();
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
  document.getElementById('stem').style.strokeDashoffset = 1 - p;
  [['leaf1',.3],['leaf2',.55],['leaf3',.8],['bud',.97]].forEach(([id,at]) => document.getElementById(id).classList.toggle('on', p >= at));
  document.title = state.timer.running ? `${mm}:${ss} Seed` : 'Seed';
}

function updatePlayIcon(playing) {
  document.querySelector('#play-icon use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  document.getElementById('play-label').textContent = playing ? 'Pause' : (state.timer.timeLeft < state.timer.durations[state.timer.mode]*60 ? 'Reprendre' : 'Démarrer');
}

function skipTimer() {
  clearInterval(timerInterval); timerInterval = null;
  state.timer.running = false;
  updatePlayIcon(false);
  const modes = ['focus','short','long'];
  const next = modes[(modes.indexOf(state.timer.mode)+1)%3];
  const btn = document.getElementById('tab-'+next);
  switchMode(next, btn);
}

function resetTimer() {
  clearInterval(timerInterval); timerInterval = null;
  state.timer.running = false;
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

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.6);
    osc.start(); osc.stop(ctx.currentTime+0.6);
  } catch(e) {}
}

function renderTimerTasks() {
  const active = state.tasks.filter(t => !t.done).slice(0,3);
  const wrap = document.getElementById('timer-tasks');
  const empty = document.getElementById('empty-tasks');
  if (active.length === 0) { wrap.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  wrap.innerHTML = active.map(taskHTML).join('');
}

function renderTasks() {
  const active = state.tasks.filter(t => !t.done);
  const done = state.tasks.filter(t => t.done);
  document.getElementById('active-count').textContent = active.length;
  document.getElementById('done-count').textContent = done.length;
  const list = taskTab === 'active' ? active : done;
  const emptyText = taskTab === 'active' ? 'Tout est fait. Ajoutez une tâche pour la prochaine session.' : 'Aucune tâche terminée pour le moment.';
  document.getElementById('tasks-list').innerHTML = list.length ? list.map(taskHTML).join('') : `<div class="empty"><p>${emptyText}</p></div>`;
}

function taskHTML(t) {
  const pct = t.subs > 0 ? Math.round(t.subsDone/t.subs*100) : 0;
  const sub = t.subs > 0 ? ` : ${t.subsDone} sur ${t.subs} sous-tâches` : '';
  const urgent = t.priority === 'high' ? ' <em>Urgent</em>' : '';
  return `<div class="row" onclick="showScreen('tasks')">
    <span class="dot" style="background:${t.color}"></span>
    <div class="info">
      <div class="name${t.done?' off':''}">${esc(t.title)}</div>
      <div class="meta">${esc(t.cat)}${sub}${urgent}</div>
      ${t.subs > 0 ? `<div class="bar"><i style="width:${pct}%;background:${t.color}"></i></div>` : ''}
    </div>
    <button class="check${t.done?' done':''}" onclick="event.stopPropagation();toggleTask(${t.id})" aria-label="${t.done?'Rouvrir':'Terminer'} la tâche"><svg><use href="#i-check"/></svg></button>
  </div>`;
}

function toggleTask(id) {
  const t = state.tasks.find(t=>t.id===id);
  if (!t) return;
  t.done = !t.done;
  if (t.done && t.subs > 0) t.subsDone = t.subs;
  save();
  renderTasks();
  renderTimerTasks();
}

function switchTaskTab(tab) {
  taskTab = tab;
  document.getElementById('ttab-active').classList.toggle('active', tab==='active');
  document.getElementById('ttab-done').classList.toggle('active', tab==='done');
  renderTasks();
}

function openAddTask() {
  newTaskColor = '#E5534B'; newTaskCat = 'Travail';
  document.getElementById('task-input').value = '';
  const swatches = document.getElementById('color-swatches');
  swatches.innerHTML = COLORS.map(c=>`<div class="swatch${c===newTaskColor?' selected':''}" style="background:${c}" onclick="selectColor('${c}')"></div>`).join('');
  const cats = document.getElementById('cat-select');
  cats.innerHTML = CATS.map(c=>`<button class="cat-btn${c===newTaskCat?' active':''}" onclick="selectCat('${c}')">${c}</button>`).join('');
  document.getElementById('add-task-modal').classList.add('open');
  setTimeout(()=>document.getElementById('task-input').focus(),300);
}

function closeAddTask() { document.getElementById('add-task-modal').classList.remove('open'); }
function closeModal(e) { if (e.target.id==='add-task-modal') closeAddTask(); }

function selectColor(c) {
  newTaskColor = c;
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('selected',s.style.background===c||s.style.backgroundColor===c));
}

function selectCat(c) {
  newTaskCat = c;
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.toggle('active',b.textContent===c));
}

function saveTask() {
  const title = document.getElementById('task-input').value.trim();
  if (!title) { document.getElementById('task-input').focus(); return; }
  const id = Date.now();
  state.tasks.unshift({ id, title, cat: newTaskCat, color: newTaskColor, done: false, subs: 0, subsDone: 0, priority: 'normal' });
  save();
  closeAddTask();
  renderTasks();
  renderTimerTasks();
}

function renderSettings() {
  const d = state.timer.durations;
  renderChips('focus', [15,25,50], d.focus);
  renderChips('short', [5,10,15], d.short);
  renderChips('long', [10,15,30], d.long);

  document.getElementById('goal-val').textContent = state.timer.goal;
  document.getElementById('dark-toggle').checked = state.darkMode;
  document.getElementById('sound-toggle').checked = state.timer.sound;

  document.getElementById('prof-tasks').textContent = state.tasks.length;
  document.getElementById('prof-sessions').textContent = state.timer.totalSessions;
  document.getElementById('prof-mins').textContent = state.timer.totalMinutes;
}

function renderChips(key, opts, val) {
  document.getElementById('chips-'+key).innerHTML = opts.map(v=>`
    <button class="preset-chip${v===val?' active':''}" onclick="setDuration('${key}',${v})">${v}</button>
  `).join('');
}

function setDuration(key, val) {
  state.timer.durations[key] = val;
  renderChips(key, key==='focus'?[15,25,50]:key==='short'?[5,10,15]:[10,15,30], val);
  if (state.timer.mode===key && !state.timer.running) {
    state.timer.timeLeft = val*60;
    updateTimerDisplay();
  }
  save();
}

function toggleDarkMode(cb) {
  state.darkMode = cb.checked;
  document.documentElement.setAttribute('data-dark', state.darkMode?'true':'false');
  save();
}

function adjGoal(d) {
  state.timer.goal = Math.max(1, Math.min(20, (state.timer.goal||8)+d));
  document.getElementById('goal-val').textContent = state.timer.goal;
  renderStreakDots();
  save();
}

function saveSetting(key, val) {
  state.timer[key] = val; save();
}

function toggleWakeLock(cb) {
  if (cb.checked && 'wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then(l=>{ wakeLock=l; }).catch(()=>{});
  } else if (wakeLock) { wakeLock.release(); wakeLock=null; }
}

function renderReports() {
  document.getElementById('total-sessions').textContent = state.timer.totalSessions;
  document.getElementById('total-minutes').textContent = state.timer.totalMinutes;
  document.getElementById('streak-days').textContent = state.timer.streakDays;
  document.getElementById('tasks-done').textContent = state.tasks.filter(t=>t.done).length;
  renderWeekChart();
  renderHeatmap();
}

function renderWeekChart() {
  const now = new Date();
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
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

let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = state.timer.running ? Date.now() : null;
  } else if (hiddenAt && state.timer.running) {
    const elapsed = Math.floor((Date.now() - hiddenAt) / 1000);
    hiddenAt = null;
    if (elapsed > 0) {
      state.timer.timeLeft = Math.max(0, state.timer.timeLeft - elapsed);
      updateTimerDisplay();
      if (state.timer.timeLeft === 0) {
        clearInterval(timerInterval); timerInterval = null;
        state.timer.running = false;
        updatePlayIcon(false);
        handleSessionEnd();
      }
    }
  }
});

function handleSessionEnd() {
  if (state.timer.mode === 'focus') {
    state.timer.sessions++;
    state.timer.totalSessions++;
    state.timer.totalMinutes += state.timer.durations.focus;
    const today = new Date().toISOString().split('T')[0];
    state.history[today] = (state.history[today] || 0) + 1;
    const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
    if (state.timer.lastDate === today) {}
    else if (state.timer.lastDate === yesterday) { state.timer.streakDays++; }
    else { state.timer.streakDays = 1; }
    state.timer.lastDate = today;
    renderStreakDots();
    renderSessionCount();
    if (state.timer.sound) playBeep();
    sendNotification('Session terminée', `Prenez une vraie pause. ${state.timer.sessions} session(s) aujourd'hui.`);
    checkNotifPermission();
    const mode = state.timer.sessions % 4 === 0 ? 'long' : 'short';
    switchMode(mode, document.getElementById('tab-'+mode));
  } else {
    if (state.timer.sound) playBeep();
    sendNotification('Pause terminée', 'Prêt pour une nouvelle session ?');
    switchMode('focus', document.getElementById('tab-focus'));
  }
  save();
}

init();
checkNotifPermission();