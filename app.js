/* Champ — interval timer
   Plain ES2020, no build step. Capacitor plugins are reached through the
   global bridge (window.Capacitor) so the same file runs in a browser. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const cap = () => (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? window.Capacitor : null;
  const plugin = name => { const c = cap(); return c && c.Plugins ? c.Plugins[name] : null; };

  /* ------------------------------------------------------------------ i18n */
  const I18N = {
    en: {
      code: 'en-US',
      ready: 'Ready', paused: 'Paused', done: 'Done',
      prep: 'Get ready', work: 'Work', rest: 'Rest',
      start: 'Start', pause: 'Pause', resume: 'Resume', again: 'Start again', reset: 'Reset',
      save: 'Save', del: 'Delete', neu: 'New',
      quick: 'Quick start', mine: 'My workouts', segments: 'Segments',
      lWork: 'Work', lRest: 'Rest', lRounds: 'Rounds',
      skip: 'Skip final rest', prepT: '5s countdown', voice: 'Voice cues',
      repeat: 'Repeat whole set',
      roundNone: 'Round –/–', soon: 'Starting soon', nice: 'Nice work',
      round: (r, n) => `Round ${r}/${n}`,
      left: s => `  ·  ${s} left`,
      next: n => `Next: ${n}`,
      last: 'Last one',
      totalLine: (t, r, p) => `Work time ${t}  ·  ${r} rounds${p ? '  (+5s countdown)' : ''}`,
      segTotal: (t, n) => `${t} total  ·  ${n} segments`,
      empty: 'No saved workouts yet. Tap New to build one with different times for each segment — warm-up, sprints, cool-down.',
      foot: 'Cues play three seconds before every switch. Keep the app open and the screen can sleep — the audio keeps running.',
      newName: 'My workout',
      notifTitle: 'Workout complete',
      notifBody: name => `${name} finished. Nice work.`,
      confirmDel: 'Delete this workout?',
      presets: { tabata: 'Tabata', hiit: 'HIIT', emom: 'EMOM', boxing: 'Boxing', core: 'Core' }
    },
    ko: {
      code: 'ko-KR',
      ready: '시작 준비', paused: '일시정지', done: '완료',
      prep: '준비', work: '운동', rest: '휴식',
      start: '시작', pause: '일시정지', resume: '이어서', again: '다시 시작', reset: '처음으로',
      save: '저장', del: '삭제', neu: '새로 만들기',
      quick: '빠른 시작', mine: '내 운동', segments: '구간',
      lWork: '운동', lRest: '휴식', lRounds: '라운드',
      skip: '마지막 휴식 빼기', prepT: '5초 준비시간', voice: '음성 안내',
      repeat: '전체 반복',
      roundNone: '라운드 –/–', soon: '곧 시작합니다', nice: '수고하셨습니다',
      round: (r, n) => `라운드 ${r}/${n}`,
      left: s => `  ·  남은 시간 ${s}`,
      next: n => `다음: ${n}`,
      last: '마지막',
      totalLine: (t, r, p) => `운동 시간 ${t}  ·  ${r}라운드${p ? '  (준비 5초 별도)' : ''}`,
      segTotal: (t, n) => `총 ${t}  ·  구간 ${n}개`,
      empty: '저장된 운동이 없습니다. 새로 만들기를 눌러 구간마다 시간이 다른 운동을 짜보세요 — 웜업, 스프린트, 쿨다운처럼요.',
      foot: '전환 3초 전에 예고음이 납니다. 앱을 켜둔 상태라면 화면이 꺼져도 소리는 계속 나옵니다.',
      newName: '내 운동',
      notifTitle: '운동 완료',
      notifBody: name => `${name} 끝났습니다. 수고하셨어요.`,
      confirmDel: '이 운동을 삭제할까요?',
      presets: { tabata: '타바타', hiit: 'HIIT', emom: 'EMOM', boxing: '복싱', core: '코어' }
    }
  };

  const PRESETS = [
    { id: 'tabata', work: 20, rest: 10, rounds: 8 },
    { id: 'hiit', work: 40, rest: 20, rounds: 10 },
    { id: 'emom', work: 60, rest: 0, rounds: 10 },
    { id: 'boxing', work: 180, rest: 60, rounds: 5 },
    { id: 'core', work: 45, rest: 15, rounds: 6 }
  ];

  /* --------------------------------------------------------------- storage */
  const Store = {
    mem: {},
    async load() {
      const P = plugin('Preferences');
      if (P) {
        try {
          const { keys } = await P.keys();
          for (const k of keys) this.mem[k] = (await P.get({ key: k })).value;
          return;
        } catch (e) { /* fall through to localStorage */ }
      }
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          this.mem[k] = localStorage.getItem(k);
        }
      } catch (e) { /* private mode */ }
    },
    get(k, d) { const v = this.mem[k]; return (v === undefined || v === null) ? d : v; },
    set(k, v) {
      v = String(v);
      this.mem[k] = v;
      const P = plugin('Preferences');
      if (P) { P.set({ key: k, value: v }).catch(() => {}); return; }
      try { localStorage.setItem(k, v); } catch (e) {}
    },
    remove(k) {
      delete this.mem[k];
      const P = plugin('Preferences');
      if (P) { P.remove({ key: k }).catch(() => {}); return; }
      try { localStorage.removeItem(k); } catch (e) {}
    }
  };

  /* ----------------------------------------------------------------- audio */
  let ac = null;
  function audio() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, when, gain) {
    let c; try { c = audio(); } catch (e) { return; }
    const at = c.currentTime + (when || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain || 0.35, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(c.destination);
    osc.start(at); osc.stop(at + dur + 0.05);
  }
  const sound = {
    tick() { tone(880, 0.09, 0, 0.22); },
    work() { tone(1320, 0.16); tone(1320, 0.16, 0.2); },
    rest() { tone(520, 0.34); },
    done() { tone(660, 0.2); tone(880, 0.2, 0.22); tone(1180, 0.5, 0.44); }
  };

  const keepalive = $('keepalive');
  function audioSessionOn() {
    audio();
    if (keepalive) { keepalive.volume = 0.001; keepalive.play().catch(() => {}); }
  }
  function audioSessionOff() {
    if (keepalive) { try { keepalive.pause(); keepalive.currentTime = 0; } catch (e) {} }
  }

  /* --------------------------------------------------------------- haptics */
  function buzz(style) {
    const H = plugin('Haptics');
    if (H) {
      if (style === 'heavy') H.impact({ style: 'HEAVY' }).catch(() => {});
      else if (style === 'light') H.impact({ style: 'LIGHT' }).catch(() => {});
      else H.notification({ type: 'SUCCESS' }).catch(() => {});
      return;
    }
    if (navigator.vibrate) navigator.vibrate(style === 'light' ? 20 : style === 'heavy' ? 90 : [60, 50, 120]);
  }

  /* --------------------------------------------------- local notifications */
  const NOTIF_ID = 8801;
  async function armEndNotification(secondsFromNow, name) {
    const N = plugin('LocalNotifications');
    if (!N || secondsFromNow < 2) return;
    try {
      const perm = await N.checkPermissions();
      if (perm.display !== 'granted') {
        const req = await N.requestPermissions();
        if (req.display !== 'granted') return;
      }
      await N.cancel({ notifications: [{ id: NOTIF_ID }] });
      await N.schedule({
        notifications: [{
          id: NOTIF_ID,
          title: t().notifTitle,
          body: t().notifBody(name),
          schedule: { at: new Date(Date.now() + secondsFromNow * 1000) }
        }]
      });
    } catch (e) {}
  }
  function clearEndNotification() {
    const N = plugin('LocalNotifications');
    if (N) N.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
  }

  /* --------------------------------------------------------- live activity */
  /* Lock-screen countdown on iOS 16.2+. The native side is handed "seconds
     from now" rather than a timestamp, so the two clocks cannot drift. */
  let liveOn = false;
  function liveArgs(seg, remain, totalRemain) {
    return {
      workoutName: planName || 'Champ',
      phase: seg.label,
      kind: seg.type,
      segmentSeconds: Math.max(0, remain),
      workoutSeconds: Math.max(0, totalRemain),
      round: seg.round,
      totalRounds: planRounds
    };
  }
  async function liveStart(seg, remain, totalRemain) {
    const L = plugin('LiveActivity');
    if (!L) return;
    try {
      const { supported } = await L.isSupported();
      if (!supported) return;
      const r = await L.start(liveArgs(seg, remain, totalRemain));
      liveOn = !!(r && r.started);
    } catch (e) {}
  }
  function liveUpdate(seg, remain, totalRemain) {
    const L = plugin('LiveActivity');
    if (L && liveOn) L.update(liveArgs(seg, remain, totalRemain)).catch(() => {});
  }
  function liveEnd() {
    const L = plugin('LiveActivity');
    if (L && liveOn) { L.end().catch(() => {}); liveOn = false; }
  }

  /* ------------------------------------------------------------- wake lock */
  let wakeLock = null;
  async function lockScreen() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function unlockScreen() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

  /* ------------------------------------------------------------------ util */
  const mmss = s => {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const clamp = (v, lo, hi, def) => {
    const n = parseInt(v, 10);
    return isNaN(n) ? def : Math.min(hi, Math.max(lo, n));
  };
  const uid = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ----------------------------------------------------------------- state */
  let lang = 'en';
  const t = () => I18N[lang];

  let workouts = [];
  let editing = null;          // workout object being edited
  let plan = [];               // [{type,dur,label,round,start,end}]
  let planName = '';
  let planRounds = 0;
  let running = false, paused = true;
  let elapsed = 0, anchor = 0, raf = null;
  let segIndex = -1, lastTick = null;

  const el = {};
  ['phase','clock','meta','upnext','bar','start','reset','wname','backToHome',
   'work','rest','rounds','skipLast','prep','voice','total','go','presets',
   'langEn','langKo','lblWork','lblRest','lblRounds','lblSkip','lblPrep','lblVoice',
   'ttlQuick','ttlCustom','ttlSegs','lblNew','lblAddWork','lblAddRest','lblRepeat',
   'wlist','wempty','foot','newWorkout','editor','editorBack','ename','saveWorkout',
   'segs','addWork','addRest','erepeat','etotal','deleteWorkout'
  ].forEach(k => el[k] = $(k));

  const view = v => { document.body.dataset.view = v; window.scrollTo(0, 0); };

  /* --------------------------------------------------------- quick config */
  function cfg() {
    return {
      work: clamp(el.work.value, 1, 3600, 40),
      rest: clamp(el.rest.value, 0, 3600, 20),
      rounds: clamp(el.rounds.value, 1, 99, 10),
      skipLast: el.skipLast.checked,
      prep: el.prep.checked ? 5 : 0
    };
  }
  function saveCfg() {
    const c = cfg();
    Store.set('work', c.work); Store.set('rest', c.rest); Store.set('rounds', c.rounds);
    Store.set('skipLast', el.skipLast.checked ? 1 : 0);
    Store.set('prep', el.prep.checked ? 1 : 0);
    Store.set('voice', el.voice.checked ? 1 : 0);
  }
  function loadCfg() {
    el.work.value = Store.get('work', 40);
    el.rest.value = Store.get('rest', 20);
    el.rounds.value = Store.get('rounds', 10);
    el.skipLast.checked = Store.get('skipLast', '1') === '1';
    el.prep.checked = Store.get('prep', '1') === '1';
    el.voice.checked = Store.get('voice', '0') === '1';
  }

  function buildQuick() {
    const c = cfg(), out = [];
    if (c.prep) out.push({ type: 'prep', dur: c.prep, label: t().prep, round: 0 });
    for (let r = 1; r <= c.rounds; r++) {
      out.push({ type: 'work', dur: c.work, label: t().work, round: r });
      const last = r === c.rounds;
      if (c.rest > 0 && !(last && c.skipLast)) out.push({ type: 'rest', dur: c.rest, label: t().rest, round: r });
    }
    return { segments: stamp(out), rounds: c.rounds, name: '' };
  }

  function buildCustom(w) {
    const out = [];
    if (el.prep.checked) out.push({ type: 'prep', dur: 5, label: t().prep, round: 0 });
    const reps = clamp(w.repeat, 1, 50, 1);
    for (let r = 1; r <= reps; r++) {
      w.segments.forEach(s => out.push({
        type: s.type,
        dur: clamp(s.dur, 1, 3600, 30),
        label: s.label || (s.type === 'work' ? t().work : t().rest),
        round: r
      }));
    }
    return { segments: stamp(out), rounds: reps, name: w.name };
  }

  function stamp(list) {
    let acc = 0;
    list.forEach(s => { s.start = acc; acc += s.dur; s.end = acc; });
    return list;
  }

  /* -------------------------------------------------------------- presets */
  function renderPresets() {
    el.presets.innerHTML = '';
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t().presets[p.id];
      b.dataset.id = p.id;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        el.work.value = p.work; el.rest.value = p.rest; el.rounds.value = p.rounds;
        el.skipLast.checked = true;
        buzz('light'); markPreset(); saveCfg(); previewQuick();
      });
      el.presets.appendChild(b);
    });
    markPreset();
  }
  function markPreset() {
    const c = cfg();
    [...el.presets.children].forEach(b => {
      const p = PRESETS.find(x => x.id === b.dataset.id);
      const on = p && p.work === c.work && p.rest === c.rest && p.rounds === c.rounds;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function previewQuick() {
    const built = buildQuick(), c = cfg();
    const body = built.segments.filter(s => s.type !== 'prep').reduce((a, s) => a + s.dur, 0);
    el.total.textContent = t().totalLine(mmss(body), c.rounds, !!c.prep);
  }

  /* ------------------------------------------------------------- workouts */
  function loadWorkouts() {
    try { workouts = JSON.parse(Store.get('workouts', '[]')) || []; }
    catch (e) { workouts = []; }
  }
  function saveWorkouts() { Store.set('workouts', JSON.stringify(workouts)); }

  function workoutTotal(w) {
    const reps = clamp(w.repeat, 1, 50, 1);
    return w.segments.reduce((a, s) => a + clamp(s.dur, 1, 3600, 30), 0) * reps;
  }

  function renderWorkouts() {
    el.wlist.innerHTML = '';
    el.wempty.textContent = workouts.length ? '' : t().empty;
    el.wempty.style.display = workouts.length ? 'none' : 'block';

    workouts.forEach(w => {
      const li = document.createElement('li');

      const main = document.createElement('div');
      main.className = 'wmain';
      const ti = document.createElement('span');
      ti.className = 'wtitle';
      ti.textContent = w.name || t().newName;
      const sub = document.createElement('span');
      sub.className = 'wsub';
      sub.textContent = t().segTotal(mmss(workoutTotal(w)), w.segments.length * clamp(w.repeat, 1, 50, 1));
      main.append(ti, sub);
      main.addEventListener('click', () => openEditor(w));

      const play = document.createElement('button');
      play.className = 'play';
      play.type = 'button';
      play.setAttribute('aria-label', 'Start ' + (w.name || ''));
      play.textContent = '▶';
      play.addEventListener('click', e => { e.stopPropagation(); startWorkout(buildCustom(w)); });

      li.append(main, play);
      el.wlist.appendChild(li);
    });
  }

  /* --------------------------------------------------------------- editor */
  function openEditor(w) {
    editing = w || { id: uid(), name: '', repeat: 1, segments: [
      { type: 'work', label: '', dur: 40 },
      { type: 'rest', label: '', dur: 20 }
    ]};
    el.ename.value = editing.name;
    el.ename.placeholder = t().newName;
    el.erepeat.value = editing.repeat;
    el.deleteWorkout.style.display = workouts.some(x => x.id === editing.id) ? 'block' : 'none';
    renderSegs();
    view('editor');
  }

  function renderSegs() {
    el.segs.innerHTML = '';
    editing.segments.forEach((s, i) => {
      const li = document.createElement('li');
      li.dataset.t = s.type;

      const tag = document.createElement('span'); tag.className = 'tag';

      const label = document.createElement('input');
      label.className = 'slabel';
      label.type = 'text';
      label.maxLength = 24;
      label.value = s.label;
      label.placeholder = s.type === 'work' ? t().work : t().rest;
      label.addEventListener('input', () => { s.label = label.value; });

      const dur = document.createElement('div');
      dur.className = 'sdur';
      const di = document.createElement('input');
      di.type = 'number'; di.inputMode = 'numeric'; di.min = 1; di.max = 3600; di.value = s.dur;
      di.addEventListener('input', () => { s.dur = clamp(di.value, 1, 3600, 30); previewEditor(); });
      const du = document.createElement('span'); du.textContent = 's';
      dur.append(di, du);

      const del = document.createElement('button');
      del.className = 'del'; del.type = 'button';
      del.setAttribute('aria-label', 'Remove segment');
      del.textContent = '✕';
      del.addEventListener('click', () => {
        if (editing.segments.length <= 1) return;
        editing.segments.splice(i, 1); renderSegs(); previewEditor();
      });

      li.append(tag, label, dur, del);
      el.segs.appendChild(li);
    });
    previewEditor();
  }

  function previewEditor() {
    editing.repeat = clamp(el.erepeat.value, 1, 50, 1);
    el.etotal.textContent = t().segTotal(
      mmss(workoutTotal(editing)),
      editing.segments.length * editing.repeat
    );
  }

  function commitWorkout() {
    editing.name = el.ename.value.trim() || t().newName;
    editing.repeat = clamp(el.erepeat.value, 1, 50, 1);
    const i = workouts.findIndex(x => x.id === editing.id);
    if (i >= 0) workouts[i] = editing; else workouts.push(editing);
    saveWorkouts(); renderWorkouts(); buzz('light'); view('home');
  }

  function removeWorkout() {
    if (!confirm(t().confirmDel)) return;
    workouts = workouts.filter(x => x.id !== editing.id);
    saveWorkouts(); renderWorkouts(); view('home');
  }

  /* ---------------------------------------------------------------- timer */
  function startWorkout(built) {
    plan = built.segments;
    planRounds = built.rounds;
    planName = built.name;
    el.wname.textContent = planName;
    elapsed = 0; segIndex = -1; lastTick = null;
    running = true;
    view('timer');
    play();
  }

  function paint() {
    const total = plan.length ? plan[plan.length - 1].end : 0;
    if (elapsed >= total) { finish(); return; }

    const i = plan.findIndex(s => elapsed < s.end);
    const seg = plan[i];
    const remain = seg.end - elapsed;

    if (i !== segIndex) {
      segIndex = i;
      lastTick = null;
      document.body.dataset.phase = seg.type;
      el.phase.textContent = seg.label;
      if (seg.type === 'work') { sound.work(); buzz('heavy'); say(t().work); }
      else if (seg.type === 'rest') { sound.rest(); buzz(); say(t().rest); }
      const nxt = plan[i + 1];
      el.upnext.textContent = nxt ? t().next(nxt.label) : t().last;
      liveUpdate(seg, remain, total - elapsed);
    }

    const whole = Math.ceil(remain);
    if (whole !== lastTick) {
      if (lastTick !== null && whole <= 3 && whole >= 1) { sound.tick(); buzz('light'); }
      lastTick = whole;
    }

    el.clock.textContent = mmss(remain);
    el.meta.textContent = seg.type === 'prep'
      ? t().soon
      : t().round(seg.round, planRounds) + t().left(mmss(total - elapsed));
    el.bar.style.width = (elapsed / total * 100).toFixed(2) + '%';
  }

  function say(text) {
    if (!el.voice.checked || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = t().code; u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function loop() {
    if (!running || paused) return;
    elapsed = (Date.now() - anchor) / 1000;
    paint();
    if (running && !paused) raf = requestAnimationFrame(loop);
  }

  function play() {
    paused = false;
    anchor = Date.now() - elapsed * 1000;
    audioSessionOn();
    lockScreen();
    el.start.textContent = t().pause;
    const total = plan.length ? plan[plan.length - 1].end : 0;
    armEndNotification(total - elapsed, planName || 'Champ');
    if (!liveOn && plan.length) {
      const i = Math.max(0, plan.findIndex(s => elapsed < s.end));
      liveStart(plan[i], plan[i].end - elapsed, total - elapsed);
    }
    loop();
  }

  function pause() {
    paused = true;
    cancelAnimationFrame(raf);
    unlockScreen();
    clearEndNotification();
    liveEnd();
    el.start.textContent = t().resume;
    el.phase.textContent = t().paused;
  }

  function finish() {
    running = false; paused = true;
    cancelAnimationFrame(raf);
    unlockScreen();
    audioSessionOff();
    clearEndNotification();
    liveEnd();
    document.body.dataset.phase = 'done';
    el.phase.textContent = t().done;
    el.clock.textContent = '0:00';
    el.meta.textContent = t().nice;
    el.upnext.textContent = '';
    el.bar.style.width = '100%';
    el.start.textContent = t().again;
    sound.done(); buzz(); say(t().done);
    segIndex = -1;
  }

  function resetTimer() {
    running = false; paused = true;
    cancelAnimationFrame(raf);
    unlockScreen();
    audioSessionOff();
    clearEndNotification();
    liveEnd();
    elapsed = 0; segIndex = -1; lastTick = null;
    document.body.dataset.phase = 'idle';
    el.phase.textContent = t().ready;
    el.clock.textContent = '0:00';
    el.meta.textContent = t().roundNone;
    el.upnext.textContent = '';
    el.bar.style.width = '0%';
    el.start.textContent = t().start;
  }

  /* ------------------------------------------------------------- language */
  function applyLang() {
    const d = t();
    document.documentElement.lang = lang;
    el.langEn.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
    el.langKo.setAttribute('aria-pressed', lang === 'ko' ? 'true' : 'false');
    el.ttlQuick.textContent = d.quick;
    el.ttlCustom.textContent = d.mine;
    el.ttlSegs.textContent = d.segments;
    el.lblWork.textContent = d.lWork;
    el.lblRest.textContent = d.lRest;
    el.lblRounds.textContent = d.lRounds;
    el.lblSkip.textContent = d.skip;
    el.lblPrep.textContent = d.prepT;
    el.lblVoice.textContent = d.voice;
    el.lblNew.textContent = d.neu;
    el.lblAddWork.textContent = d.lWork;
    el.lblAddRest.textContent = d.lRest;
    el.lblRepeat.textContent = d.repeat;
    el.go.textContent = d.start;
    el.reset.textContent = d.reset;
    el.saveWorkout.textContent = d.save;
    el.deleteWorkout.textContent = d.del;
    el.ename.placeholder = d.newName;
    el.foot.textContent = d.foot;
    renderPresets();
    previewQuick();
    renderWorkouts();
    if (!running) resetTimer();
  }
  function setLang(l) { lang = l; Store.set('lang', l); applyLang(); }

  /* ---------------------------------------------------------------- wires */
  el.langEn.addEventListener('click', () => setLang('en'));
  el.langKo.addEventListener('click', () => setLang('ko'));

  el.go.addEventListener('click', () => startWorkout(buildQuick()));
  el.newWorkout.addEventListener('click', () => openEditor(null));
  el.editorBack.addEventListener('click', () => view('home'));
  el.saveWorkout.addEventListener('click', commitWorkout);
  el.deleteWorkout.addEventListener('click', removeWorkout);
  el.erepeat.addEventListener('input', previewEditor);
  el.addWork.addEventListener('click', () => {
    editing.segments.push({ type: 'work', label: '', dur: 40 }); renderSegs();
  });
  el.addRest.addEventListener('click', () => {
    editing.segments.push({ type: 'rest', label: '', dur: 20 }); renderSegs();
  });

  el.start.addEventListener('click', () => {
    if (document.body.dataset.phase === 'done') { resetTimer(); running = true; play(); return; }
    (running && !paused) ? pause() : (running ? play() : startWorkout(buildQuick()));
  });
  el.reset.addEventListener('click', resetTimer);
  el.backToHome.addEventListener('click', () => { resetTimer(); view('home'); });

  [el.work, el.rest, el.rounds, el.skipLast, el.prep, el.voice].forEach(n =>
    n.addEventListener('input', () => { markPreset(); saveCfg(); previewQuick(); }));

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); el.start.click(); }
    if (e.key.toLowerCase() === 'r') resetTimer();
  });

  /* Wall-clock anchored, so coming back from the background is always correct. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running && !paused) { lockScreen(); loop(); }
  });
  const AppPlugin = plugin('App');
  if (AppPlugin) {
    AppPlugin.addListener('appStateChange', ({ isActive }) => {
      if (isActive && running && !paused) { lockScreen(); loop(); }
    });
    AppPlugin.addListener('backButton', () => {
      const v = document.body.dataset.view;
      if (v === 'timer') { resetTimer(); view('home'); }
      else if (v === 'editor') view('home');
      else AppPlugin.exitApp();
    });
  }

  /* ------------------------------------------------------------------ boot */
  (async function boot() {
    await Store.load();
    lang = Store.get('lang', (navigator.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en');
    loadCfg();
    loadWorkouts();
    applyLang();
    view('home');

    const SB = plugin('StatusBar');
    if (SB) SB.setStyle({ style: 'DARK' }).catch(() => {});
    const SS = plugin('SplashScreen');
    if (SS) SS.hide().catch(() => {});
  })();
})();
