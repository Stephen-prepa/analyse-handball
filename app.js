'use strict';
/* Analyse vidéo handball — étape 1 : saisie, repères, feuille de match, export */

/* ---------- utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0, 10);
const pad = n => String(n).padStart(2, '0');
const fmt = t => { if (t == null || isNaN(t)) return '--:--'; const s = Math.max(0, Math.floor(t)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
const fmtL = t => { if (t == null || isNaN(t)) return '--:--:--'; const s = Math.max(0, Math.floor(t)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
const fmtD = d => { const [y, m, j] = String(d).split('-'); return j && m ? `${j}/${m}/${y}` : d; };

const S = {
  view: 'home', settings: null, roster: [], matches: [], m: null, prefsUpdated: 0, rq: { cur: null, undoId: null, undoUntil: 0, lastSecs: null }, seqSel: null, seqOpen: true, playWin: null, fs: false, sf: { match: 'all', side: '', kind: '', jeu: '', issue: '', real: '', player: '' },
  player: null, lastTag: null, videoReady: false, url: null, speedIdx: 2
};
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
const V = () => $('#video');
const playV = () => { const r = V().play(); if (r && r.catch) r.catch(() => { }); };

const MARK_LABELS = {
  p1s: 'Début 1re période', p1e: 'Fin 1re période',
  p2s: 'Début 2e période', p2e: 'Fin 2e période',
  to: 'Temps mort', rs: 'Reprise'
};

/* ---------- sauvegarde ---------- */
const warnStore = () => toast('Sauvegarde impossible sur cet appareil');
const touchPrefs = () => { S.prefsUpdated = Date.now(); DB.put('kv', { key: 'prefsUpdated', value: S.prefsUpdated }).catch(() => { }); Cloud.queuePrefs(); };
const saveSettings = () => { touchPrefs(); return DB.put('kv', { key: 'settings', value: S.settings }).catch(warnStore); };
const saveRoster = () => { touchPrefs(); return DB.put('kv', { key: 'roster', value: S.roster }).catch(warnStore); };
const saveMatch = () => { if (!S.m) return; S.m.updated = Date.now(); Cloud.queue(S.m); return DB.put('matches', S.m).catch(warnStore); };

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ---------- recherche dans les listes ---------- */
const byId = (list, id) => list.find(x => x.id === id);
const lab = (list, id, snap) => (byId(list, id) || {}).label || snap || '—';

function sheetPlayers(m) {
  return m.sheet.map(s => {
    const p = S.roster.find(r => r.id === s.playerId);
    return p ? { id: p.id, num: s.num, name: p.name, poste: p.poste } : null;
  }).filter(Boolean).sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));
}
function playerLabel(tag) {
  const p = S.roster.find(r => r.id === tag.playerId);
  return (tag.pnum ? tag.pnum + ' ' : '') + ((p && p.name) || tag.pname || '?');
}

/* ---------- temps de jeu ---------- */
const marksOf = (m, type) => m.marks.filter(x => x.type === type).sort((a, b) => a.t - b.t);

function rawGame(m, period, start, t) {
  const base = period === 2 ? S.settings.periodMinutes * 60 : 0;
  const tos = marksOf(m, 'to'), rs = marksOf(m, 'rs');
  let stopped = 0;
  for (const to of tos) {
    if (to.t < start || to.t >= t) continue;
    const r = rs.find(x => x.t > to.t);
    const end = r ? Math.min(r.t, t) : t;
    stopped += Math.max(0, end - to.t);
  }
  return base + (t - start) - stopped;
}
function gameInfo(m, t) {
  const s1 = marksOf(m, 'p1s')[0], s2 = marksOf(m, 'p2s')[0];
  let period, start;
  if (s2 && t >= s2.t) { period = 2; start = s2.t; }
  else if (s1 && t >= s1.t) { period = 1; start = s1.t; }
  else return null;
  const pe = marksOf(m, period === 1 ? 'p1e' : 'p2e')[0];
  const tt = pe && t > pe.t ? pe.t : t;
  return { period, t: Math.max(0, rawGame(m, period, start, tt)) };
}
const gameLabel = (m, t) => { const g = gameInfo(m, t); return g ? fmt(g.t) : '—'; };

/* ---------- vues ---------- */
function setView(v) {
  S.view = v;
  $$('.view').forEach(el => el.hidden = el.id !== v);
  renderBar();
  if (v === 'home') renderHome();
  if (v === 'roster') renderRoster();
  if (v === 'settings') renderSettings();
  if (v === 'stats') renderStats();
  if (v === 'match') { renderMatch(); } else if (S.fs) setFs(false);
  renderBanner();
}

function renderBar() {
  const bar = $('#bar');
  const back = '<button class="btn" type="button" data-act="home">‹ Matchs</button>';
  if (S.view === 'home') {
    bar.innerHTML = `<h1>Analyse vidéo · HBCCS</h1><span class="grow"></span>
      <button class="btn" type="button" data-act="roster">Effectif</button>
      <button class="btn" type="button" data-act="stats">Statistiques</button>
      <button class="btn" type="button" data-act="settings">Réglages</button>
      <button class="btn" type="button" data-act="backup">Sauvegarder</button>
      <button class="btn" type="button" data-act="import">Restaurer</button>`;
  } else if (S.view === 'match') {
    bar.innerHTML = `${back}
      <div><h1>HBCCS vs ${esc(S.m.adversaire)}</h1><div class="sub">${fmtD(S.m.date)}</div></div>
      <div id="gclock" class="off">Temps de jeu : poser les repères</div>
      <span class="grow"></span>
      <button class="btn" type="button" data-act="sheet">Feuille de match</button>
      <button class="btn" type="button" data-act="stats">Statistiques</button>
      <button class="btn" type="button" data-act="csv">Export CSV</button>`;
  } else {
    const t = ({ roster: 'Effectif', stats: 'Statistiques' })[S.view] || 'Réglages';
    bar.innerHTML = `${back}<h1>${t}</h1>`;
  }
}

/* ----- accueil ----- */
function renderHome() {
  const ms = [...S.matches].sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created));
  $('#home').innerHTML = `<div class="page">
    <div class="btnrow" style="margin-bottom:14px">
      <button class="btn primary" type="button" data-act="pickmatch">Choisir un match</button>
      <button class="btn" type="button" data-act="newmatch">Nouveau match (saisie libre)</button>
    </div>
    ${ms.length ? ms.map(m => `
      <div class="matchcard">
        <div class="i"><b>HBCCS vs ${esc(m.adversaire)}</b>
          <div class="muted">${fmtD(m.date)}${m.score && m.score[0] != null ? ' · ' + m.score[0] + '-' + m.score[1] : ''} · ${m.tags.length} actions · ${m.possessions.length} possessions</div></div>
        <button class="btn primary" type="button" data-act="openmatch" data-id="${m.id}">Ouvrir</button>
        <button class="btn danger small" type="button" data-act="delmatch" data-id="${m.id}">Supprimer</button>
      </div>`).join('') :
      `<p class="muted">Aucun match pour l’instant. Crée-en un pour commencer.</p>`}
    ${Cloud.session ? '' : `<p class="hint">Connecte-toi (Réglages) pour récupérer les matchs et effectifs de ton application et sauvegarder en ligne.</p>`}
    ${S.roster.length || Cloud.session ? '' : `<p class="hint">Ou saisis ton effectif à la main (bouton « Effectif » en haut).</p>`}
    <p class="hint">Les vidéos restent sur l’appareil. Les données sont enregistrées dans cette application : utilise « Sauvegarder » régulièrement.</p>
  </div>`;
}

/* ----- match ----- */
function renderMatch() {
  renderMarks(); renderTimeline(); renderJournal(); renderPanel();
  $('#novideo').hidden = S.videoReady;
  $('#novideo-name').textContent = S.m.videoName && !S.videoReady ? 'Dernière vidéo utilisée : ' + S.m.videoName : '';
  updateTime(V().currentTime || 0);
}

function renderMarks() {
  const m = S.m;
  const single = t => marksOf(m, t)[0];
  const btn = t => {
    const c = marksOf(m, t);
    const set = c.length > 0;
    const sub = (t === 'to' || t === 'rs') ? (set ? '× ' + c.length : 'à poser') : (set ? fmtL(c[0].t) : 'à poser');
    return `<button class="mbtn ${set ? 'set' : ''}" type="button" data-act="mark" data-type="${t}"><b>${MARK_LABELS[t]}</b><span>${sub}</span></button>`;
  };
  const all = [...m.marks].sort((a, b) => a.t - b.t);
  $('#marks').innerHTML = `
    <div class="sect-h">Repères de synchro · coups de sifflet</div>
    <div class="mgrid">${btn('p1s')}${btn('to')}${btn('p2s')}${btn('p1e')}${btn('rs')}${btn('p2e')}</div>
    ${all.length ? `<details class="mdet"${S.marksOpen ? ' open' : ''}><summary>Voir ou supprimer les repères (${all.length})</summary><div class="mlist">${all.map(x => `
      <span class="mchip"><button type="button" data-act="goto" data-t="${x.t}">${MARK_LABELS[x.type]} · ${fmtL(x.t)}</button>
      <button class="x" type="button" data-act="delmark" data-id="${x.id}" aria-label="Supprimer le repère">✕</button></span>`).join('')}</div></details>` : ''}`;
}

function renderTimeline() {
  const m = S.m, d = V().duration;
  if (!d || !isFinite(d)) {
    $('#timeline').innerHTML = `<div class="sect-h">Chronologie</div><p class="hint" style="margin:0">S’affiche quand la vidéo est chargée.</p>`;
    return;
  }
  const pct = t => (Math.min(Math.max(t / d, 0), 1) * 100).toFixed(3);
  const marks = m.marks.map(x => `<div class="flag" style="left:${pct(x.t)}%"><i>${({ p1s: 'D1', p1e: 'F1', p2s: 'D2', p2e: 'F2', to: 'TM', rs: 'R' })[x.type]}</i></div>`).join('');
  const segs = m.possessions.map(p => {
    const j = byId(S.settings.jeux, p.jeu);
    const kind = (j && j.kind) || p.jeuKind || 'libre';
    return `<div class="seg ${kind}" style="left:${pct(p.start)}%;width:${(pct(p.end) - pct(p.start)).toFixed(3)}%" title="${esc(lab(S.settings.jeux, p.jeu, p.jeuLabel))}">${esc(lab(S.settings.jeux, p.jeu, p.jeuLabel))}</div>`;
  }).join('');
  const openSeg = m.open ? `<div class="seg open" style="left:${pct(m.open.start)}%;width:${Math.max(0.4, pct(m.open.end ?? m.open.start) - pct(m.open.start))}%"></div>` : '';
  const ticks = m.tags.map(t => `<div class="tick ${t.actionId}" style="left:${pct(t.vt)}%" title="${esc(playerLabel(t))} · ${esc(lab(S.settings.actions, t.actionId, t.actionLabel))}"></div>`).join('');
  $('#timeline').innerHTML = `<div class="sect-h">Chronologie</div>
    <div class="tl-wrap" id="tlwrap">
      <div class="tl">
        <div class="labs"><div class="lab">Repères</div><div class="lab tall">Possessions</div><div class="lab">Actions</div></div>
        <div class="tracks" id="tracks">
          <div class="row">${marks}</div>
          <div class="row tall">${segs}${openSeg}</div>
          <div class="row">${ticks}</div>
          <div id="playhead"></div>
        </div>
      </div>
    </div>`;
  updateTime(V().currentTime || 0);
}

function renderJournal() {
  const m = S.m, st = S.settings;
  const items = [
    ...m.tags.map(t => ({ k: 'a', t: t.vt, o: t })),
    ...m.possessions.map(p => ({ k: 'p', t: p.start, o: p }))
  ].sort((a, b) => b.t - a.t);
  const rows = items.map(it => {
    if (it.k === 'a') {
      const t = it.o;
      return `<div class="jr" data-act="goto" data-t="${Math.max(0, t.vt - 2)}">
        <span class="g">${gameLabel(m, t.vt)}</span><span class="v mono">${fmtL(t.vt)}</span>
        <span class="t">${esc(playerLabel(t))} · <b>${esc(lab(st.actions, t.actionId, t.actionLabel))}</b></span>
        <span class="bt"><button class="btn small" type="button" data-act="nudge" data-id="${t.id}" data-d="-1" aria-label="Reculer d’une seconde">−1 s</button>
        <button class="btn small" type="button" data-act="nudge" data-id="${t.id}" data-d="1" aria-label="Avancer d’une seconde">+1 s</button>
        <button class="btn small danger" type="button" data-act="deltag" data-id="${t.id}" aria-label="Supprimer">✕</button></span></div>`;
    }
    const p = it.o;
    const ph = byId(st.phases, p.phase);
    const def = (ph && ph.side === 'defense') || p.side === 'defense';
    const parts = [p.phase ? lab(st.phases, p.phase, p.phaseLabel) : 'Situation', p.jeu ? lab(st.jeux, p.jeu, p.jeuLabel) : '', p.issue ? lab(st.issues, p.issue, p.issueLabel) : ''].filter(Boolean);
    const sub = [p.inc ? 'à compléter' : '', p.playerId || p.pname ? (p.pnum ? '#' + p.pnum + ' ' : '') + (p.pname || '') : '', p.real ? lab(st.realisations, p.real, p.realLabel) : '', p.cause ? lab(st.causes, p.cause, p.causeLabel) : ''].filter(Boolean).join(' · ');
    return `<div class="jr poss ${def ? 'def' : ''}" data-act="goto" data-t="${Math.max(0, p.start - 2)}">
      <span class="g">${gameLabel(m, p.start)}</span><span class="v mono">${fmtL(p.start)}</span>
      <span class="t"><i class="dot" style="background:${catColor(p.phase)}"></i>Possession · ${parts.map(esc).join(' · ')}<small>${esc(sub)}${sub ? ' · ' : ''}${Math.round(p.end - p.start)} s de vidéo</small></span>
      <span class="bt">${p.inc ? `<button class="btn small" type="button" data-act="rqresume" data-id="${p.id}">Compléter</button>` : ''}<button class="btn small" type="button" data-act="editposs" data-id="${p.id}">Modifier</button>
      <button class="btn small danger" type="button" data-act="delposs" data-id="${p.id}" aria-label="Supprimer">✕</button></span></div>`;
  }).join('');
  $('#journal').innerHTML = `<div class="jh"><div class="sect-h" style="margin:0">Journal · ${m.tags.length} actions · ${m.possessions.length} possessions</div>
    ${S.lastTag ? '<button class="btn small" type="button" data-act="undo">Annuler la dernière action</button>' : ''}</div>
    ${rows || '<p class="hint" style="margin:6px 0 0">Rien de saisi pour l’instant.</p>'}`;
  renderBanner();
}

function chips(list, sel, f) {
  return list.map(i => `<button type="button" class="chip" aria-pressed="${sel === i.id}" data-act="pset" data-f="${f}" data-id="${esc(i.id)}">${esc(i.label)}</button>`).join('');
}

function renderPanel() {
  const m = S.m, st = S.settings, o = m.open;
  const ph = o && byId(st.phases, o.phase);
  const side = ph ? ph.side : null;
  const fil = l => l.filter(x => x.side === 'both' || x.side === side);
  const players = sheetPlayers(m);
  S.compact = window.innerHeight < 860 && window.innerWidth > 900;
  const secPoss = `
  <section class="card">
    <div class="card-h"><h2>Possession</h2>
      <span class="muted mono">${o ? 'ouverte à ' + fmtL(o.start) : 'aucune'}</span></div>
    <div class="btnrow">
      <button class="btn" type="button" data-act="pstart">${o ? 'Recaler le début ici' : 'Début de possession ici'}</button>
      ${o ? '<button class="btn danger" type="button" data-act="pcancel">Annuler</button>' : ''}
    </div>
    <h3>Phase</h3>
    <div class="chips c3">${chips(st.phases, o && o.phase, 'phase')}</div>
    <h3>Jeu</h3>
    ${side ? `<div class="chips c3">${chips(fil(st.jeux), o.jeu, 'jeu')}</div>` : '<p class="hint">Choisis d’abord la phase.</p>'}
    <h3>Issue</h3>
    ${side ? `<div class="chips c3">${chips(fil(st.issues), o.issue, 'issue')}</div>` : '<p class="hint">Choisis d’abord la phase.</p>'}
    <h3>Jeu réalisé ?</h3>
    <div class="chips c3">${chips(st.realisations, o && o.real, 'real')}</div>
    <h3>Cause d’échec · optionnel</h3>
    <div class="chips c3">${chips(st.causes, o && o.cause, 'cause')}</div>
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="pvalid">Valider la possession</button></div>
  </section>`;
  const secAct = `
  <section class="card">
    <div class="card-h"><h2>Joueur</h2><span class="muted">${players.length} sur la feuille</span></div>
    ${players.length ? `<div class="chips c4">${players.map(p => `
      <button type="button" class="chip pl" aria-pressed="${S.player === p.id}" data-act="player" data-id="${p.id}"><b>${esc(p.num)}</b><span>${esc(p.name)}</span></button>`).join('')}</div>` :
      `<p class="hint">Aucun joueur sur la feuille de match.</p><button class="btn" type="button" data-act="sheet">Composer la feuille</button>`}
    <h3>Action · enregistrée au temps vidéo affiché</h3>
    <div class="chips c4">${st.actions.map(a => `<button type="button" class="chip" data-act="tag" data-id="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>
  </section>`;
  const tab = S.tab || 'rapide';
  const tb = (id, label) => `<button type="button" role="tab" aria-selected="${tab === id}" data-act="tab" data-id="${id}">${label}</button>`;
  $('#panel').innerHTML = `<div class="tabs" role="tablist">${tb('rapide', 'Marquage rapide')}${tb('act', 'Actions')}${tb('poss', 'Possession' + (m.open ? ' · ouverte' : ''))}</div>` +
    (tab === 'rapide' ? rqHtml() : tab === 'act' ? secAct : secPoss);
}

/* ----- temps réel (lecteur) ----- */
let lastT = -1;
function updateTime(t) {
  const v = V(), d = v.duration;
  $('#vt').textContent = fmtL(t) + ' / ' + fmtL(isFinite(d) ? d : 0);
  if (d && isFinite(d)) {
    $('#scrub').value = Math.round(t / d * 1000);
    const p = $('#playhead'); if (p) p.style.left = (t / d * 100) + '%';
  }
  const g = $('#gclock');
  if (g && S.m) {
    const gi = gameInfo(S.m, t);
    g.className = gi ? '' : 'off';
    g.textContent = gi ? 'P' + gi.period + ' · ' + fmt(gi.t) : 'Temps de jeu : poser les repères';
  }
}
function tick() {
  if (S.view === 'match') {
    rqTick(); seqTick();
    const t = V().currentTime || 0;
    if (t !== lastT) { lastT = t; updateTime(t); }
  }
  requestAnimationFrame(tick);
}

/* ----- effectif ----- */
function renderRoster() {
  $('#roster').innerHTML = `<div class="page">
    <p class="hint">Ton effectif complet. La feuille de match, match par match, se compose ensuite à partir de cette liste.</p>
    ${S.roster.map((p, i) => `<div class="list-row">
      <input class="w-num" type="text" inputmode="numeric" placeholder="N°" value="${esc(p.num)}" data-r="${i}.num" aria-label="Numéro">
      <input type="text" placeholder="Nom" value="${esc(p.name)}" data-r="${i}.name" aria-label="Nom">
      <input type="text" placeholder="Poste" value="${esc(p.poste)}" data-r="${i}.poste" aria-label="Poste">
      <button class="btn danger small" type="button" data-act="delplayer" data-i="${i}" aria-label="Supprimer">✕</button></div>`).join('')}
    <div class="btnrow" style="margin-top:12px">
      <button class="btn primary" type="button" data-act="addplayer">Ajouter un joueur</button>
      <button class="btn" type="button" data-act="pastelist">Coller une liste</button>
    </div></div>`;
}

/* ----- réglages ----- */
const LISTS = [
  { key: 'actions', title: 'Actions', cols: ['label'] },
  { key: 'phases', title: 'Catégories du marquage rapide (phases)', cols: ['label', 'side', 'ask'] },
  { key: 'jeux', title: 'Jeux : combinaisons, enclenchements, systèmes défensifs', cols: ['label', 'kind', 'side'] },
  { key: 'issues', title: 'Issues de possession', cols: ['label', 'side'] },
  { key: 'realisations', title: 'Jeu réalisé ?', cols: ['label'] },
  { key: 'causes', title: 'Causes d’échec', cols: ['label'] }
];
const SIDES = { attaque: 'Attaque', defense: 'Défense', both: 'Les deux' };
const KINDS = { combinaison: 'Combinaison', enclenchement: 'Enclenchement', libre: 'Libre', systeme: 'Système défensif' };

function renderSettings() {
  const st = S.settings;
  const opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
  $('#settings').innerHTML = `<div class="page">
    <div class="card"><div class="card-h"><h2>Match</h2></div>
      <div class="list-row"><label for="pm" style="flex:1">Durée d’une période (minutes)</label><input id="pm" class="w-num" type="number" min="1" max="60" value="${st.periodMinutes}" data-set="periodMinutes"></div>
      <div class="list-row"><label for="fps" style="flex:1">Images par seconde de la vidéo</label><input id="fps" class="w-num" type="number" min="10" max="60" value="${st.fps}" data-set="fps"></div>
    </div>
    ${compteCard()}${saisieCard()}${rapideCard()}${shortcutsCard()}
    ${LISTS.map(L => `<div class="card"><div class="card-h"><h2>${L.title}</h2></div>
      ${st[L.key].map((it, i) => `<div class="list-row ${L.key === 'phases' ? 'phase-row' : ''}">
        <input type="text" value="${esc(it.label)}" data-set="${L.key}.${i}.label" aria-label="Nom">
        ${L.cols.includes('kind') ? `<select data-set="${L.key}.${i}.kind" aria-label="Type">${opts(KINDS, it.kind)}</select>` : ''}
        ${L.cols.includes('ask') ? `<button class="swatch" type="button" data-act="colorpick" data-i="${i}" style="background:${esc(it.color || '#9AA8B6')}" aria-label="Couleur de ${esc(it.label)}"></button>` : ''}
        ${L.cols.includes('side') ? `<select data-set="${L.key}.${i}.side" aria-label="Côté">${opts(SIDES, it.side)}</select>` : ''}
        ${L.cols.includes('ask') ? `<input class="w-num key-in" type="text" readonly value="${esc(it.key || '')}" placeholder="touche" data-pkey="${i}" aria-label="Touche du clavier pour ${esc(it.label)}">` : ''}
        ${L.cols.includes('ask') ? `<label class="chk-i"><input type="checkbox" data-set="${L.key}.${i}.jeu" ${it.jeu !== false ? 'checked' : ''}> demande un jeu</label>` : ''}
        <button class="btn small" type="button" data-act="rowmove" data-list="${L.key}" data-i="${i}" data-d="-1" aria-label="Monter">▲</button>
        <button class="btn small" type="button" data-act="rowmove" data-list="${L.key}" data-i="${i}" data-d="1" aria-label="Descendre">▼</button>
        <button class="btn danger small" type="button" data-act="delrow" data-list="${L.key}" data-i="${i}" aria-label="Supprimer">✕</button></div>`).join('')}
      <button class="btn" type="button" data-act="addrow" data-list="${L.key}">Ajouter</button></div>`).join('')}
    <div class="card"><div class="card-h"><h2>Réinitialiser</h2></div>
      <p class="hint">Remet toutes les listes ci-dessus aux valeurs de départ. Les matchs déjà saisis ne changent pas.</p>
      <button class="btn danger" type="button" data-act="resetlists">Remettre les listes par défaut</button></div>
  </div>`;
}

/* ---------- boîtes de dialogue ---------- */
function openDlg(html) { const d = $('#dlg'); d.innerHTML = html; if (!d.open) d.showModal(); }
function closeDlg() { const d = $('#dlg'); if (d.open) d.close(); }

function dlgNewMatch() {
  openDlg(`<h2>Nouveau match</h2>
    <div class="list-row"><label for="nm-adv" style="width:90px">Adversaire</label><input id="nm-adv" type="text" placeholder="Nom de l’équipe"></div>
    <div class="list-row"><label for="nm-date" style="width:90px">Date</label><input id="nm-date" type="date" value="${today()}"></div>
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="creatematch">Créer</button>
    <button class="btn" type="button" data-act="closedlg">Annuler</button></div>`);
}

function dlgSheet() {
  const m = S.m;
  if (!S.roster.length) {
    openDlg(`<h2>Feuille de match</h2><p>Ton effectif est vide. Colle la feuille du match ou ajoute tes joueurs.</p>
      <div class="btnrow"><button class="btn primary" type="button" data-act="sheetpaste">Coller une feuille</button>
      <button class="btn" type="button" data-act="newplayer">Nouveau joueur</button>
      <button class="btn" type="button" data-act="roster-from-dlg">Saisir l’effectif</button>
      <button class="btn" type="button" data-act="closedlg">Fermer</button></div>`);
    return;
  }
  const sorted = [...S.roster].sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));
  openDlg(`<h2>Feuille de match</h2>
    <p class="hint">Coche les joueurs présents. Tu peux changer un numéro pour ce match seulement. Modifiable à tout moment : les actions déjà saisies sont conservées.</p>
    ${sorted.map(p => {
      const s = m.sheet.find(x => x.playerId === p.id);
      return `<div class="list-row"><label class="chk" style="flex:1"><input type="checkbox" data-sh="${p.id}" ${s ? 'checked' : ''}> ${esc(p.name)} <span class="muted">${esc(p.poste)}</span></label>
        <input class="w-num" type="text" inputmode="numeric" value="${esc(s ? s.num : p.num)}" data-shn="${p.id}" aria-label="Numéro de ${esc(p.name)}"></div>`;
    }).join('')}
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="savesheet">Enregistrer la feuille</button>
    <button class="btn" type="button" data-act="sheetpaste">Coller une feuille</button>
    <button class="btn" type="button" data-act="newplayer">Nouveau joueur</button>
    <button class="btn" type="button" data-act="closedlg">Annuler</button></div>`);
}

function dlgPaste() {
  openDlg(`<h2>Coller une liste</h2>
    <p class="hint">Un joueur par ligne : numéro, nom, poste (le poste est facultatif). Exemple : <b>9 Manel Ailier</b></p>
    <textarea id="paste" aria-label="Liste de joueurs"></textarea>
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="dopaste">Ajouter ces joueurs</button>
    <button class="btn" type="button" data-act="closedlg">Annuler</button></div>`);
}

/* ---------- actions ---------- */
function needVideo() {
  if (!S.videoReady) { toast('Choisis d’abord la vidéo du match.'); return false; }
  return true;
}

function loadVideo(file) {
  const v = V();
  if (S.url) URL.revokeObjectURL(S.url);
  S.url = URL.createObjectURL(file);
  S.videoReady = false;
  v.src = S.url; v.load();
  const m = S.m;
  if (m.videoName && m.videoName !== file.name) toast('Attention : ce n’est pas le fichier utilisé avant (' + m.videoName + ').');
  m.videoName = file.name; m.videoSize = file.size; saveMatch();
}
function unloadVideo() {
  const v = V(); v.pause();
  if (S.url) URL.revokeObjectURL(S.url);
  S.url = null; S.videoReady = false; v.removeAttribute('src'); v.load();
}

function openMatch(id) {
  S.m = S.matches.find(x => x.id === id);
  S.player = null; S.lastTag = null; lastT = -1;
  S.rq.cur = null; S.rq.undoId = null; S.rq.lastSecs = null; S.seqSel = null; S.playWin = null; setFs(false);
  unloadVideo();
  setView('match');
  if (!S.m.sheet.length && S.roster.length) dlgSheet();
}

function addMark(type) {
  if (!needVideo()) return;
  const t = V().currentTime;
  if (type !== 'to' && type !== 'rs') S.m.marks = S.m.marks.filter(x => x.type !== type);
  S.m.marks.push({ id: uid(), type, t });
  saveMatch(); renderMarks(); renderTimeline(); renderJournal(); updateTime(t);
  toast(MARK_LABELS[type] + ' posé à ' + fmtL(t));
}

function tagAction(id) {
  if (!needVideo()) return;
  if (!S.player) { toast('Choisis d’abord un joueur.'); return; }
  const a = byId(S.settings.actions, id), p = S.roster.find(r => r.id === S.player);
  const sh = S.m.sheet.find(x => x.playerId === S.player);
  const tag = {
    id: uid(), vt: V().currentTime, wall: Date.now(), playerId: S.player,
    pnum: sh ? sh.num : p.num, pname: p.name, actionId: id, actionLabel: a.label,
    poss: S.m.open ? S.m.open.id : null, note: ''
  };
  S.m.tags.push(tag); S.m.tags.sort((x, y) => x.vt - y.vt);
  S.lastTag = tag.id; saveMatch();
  renderJournal(); renderTimeline();
  toast(`${p.name} · ${a.label} · ${fmtL(tag.vt)}`);
}

function ensureOpen() {
  if (!S.m.open) {
    S.m.open = { id: uid(), start: V().currentTime, end: null, phase: null, jeu: null, issue: null, real: null, cause: null };
  }
  return S.m.open;
}
function setPoss(f, id) {
  if (!needVideo()) return;
  autoPause();
  const o = ensureOpen();
  if (o[f] === id) o[f] = null; else o[f] = id;
  if (f === 'phase') {
    const side = (byId(S.settings.phases, o.phase) || {}).side;
    const j = byId(S.settings.jeux, o.jeu), i = byId(S.settings.issues, o.issue);
    if (j && j.side !== 'both' && j.side !== side) o.jeu = null;
    if (i && i.side !== 'both' && i.side !== side) o.issue = null;
  }
  saveMatch(); renderPanel(); renderTimeline();
}
function startPoss() {
  if (!needVideo()) return;
  autoPause();
  const o = ensureOpen(); o.start = V().currentTime;
  saveMatch(); renderPanel(); renderTimeline();
}
function validPoss() {
  const o = S.m.open;
  if (!o) { toast('Aucune possession ouverte.'); return; }
  const miss = [];
  if (!o.phase) miss.push('la phase');
  if (!o.jeu) miss.push('le jeu');
  if (!o.issue) miss.push('l’issue');
  if (miss.length) { toast('Il manque : ' + miss.join(', ')); return; }
  autoPause();
  S.recapEnd = null;
  if (S.settings.saisie.recap) dlgRecap(); else commitPoss();
}
function commitPoss() {
  const o = S.m.open; if (!o) return;
  const st = S.settings;
  let end = S.recapEnd ?? o.end ?? V().currentTime; S.recapEnd = null;
  if (end <= o.start) end = o.start + 1;
  const j = byId(st.jeux, o.jeu), ph = byId(st.phases, o.phase);
  const p = {
    id: o.id, start: o.start, end, phase: o.phase, jeu: o.jeu, issue: o.issue, real: o.real, cause: o.cause,
    side: ph ? ph.side : null, jeuKind: j ? j.kind : null,
    phaseLabel: lab(st.phases, o.phase), jeuLabel: lab(st.jeux, o.jeu), issueLabel: lab(st.issues, o.issue),
    realLabel: o.real ? lab(st.realisations, o.real) : '', causeLabel: o.cause ? lab(st.causes, o.cause) : '',
    wall: Date.now()
  };
  S.m.tags.forEach(t => { if (!t.poss && t.vt >= p.start && t.vt <= p.end) t.poss = p.id; });
  S.m.possessions.push(p); S.m.possessions.sort((a, b) => a.start - b.start);
  S.m.open = null; saveMatch();
  closeDlg(); renderPanel(); renderTimeline(); renderJournal();
  toast('Possession enregistrée : ' + p.jeuLabel + ' · ' + p.issueLabel);
}

/* ---------- exports ---------- */
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const csvCell = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

const CSV_HEAD = ['match', 'adversaire', 'date', 'type', 'periode', 'temps_jeu', 'temps_video', 'video_s', 'debut_s', 'fin_s', 'horodatage',
    'numero', 'joueur', 'action', 'phase', 'jeu', 'type_jeu', 'issue', 'realisee', 'cause', 'id_possession', 'commentaire'];
function csvRows(m) {
  const st = S.settings;
  const rows = [];
  const gi = t => gameInfo(m, t);
  const base = t => { const g = gi(t); return [g ? g.period : '', g ? fmt(g.t) : '', fmtL(t)]; };
  const r2 = n => (Math.round(n * 100) / 100).toFixed(2);
  m.tags.forEach(t => {
    const p = m.possessions.find(x => x.id === t.poss);
    rows.push([m.id, m.adversaire, m.date, 'action', ...base(t.vt), r2(t.vt), '', '', new Date(t.wall).toISOString(),
      t.pnum, (S.roster.find(r => r.id === t.playerId) || {}).name || t.pname, lab(st.actions, t.actionId, t.actionLabel),
      p ? lab(st.phases, p.phase, p.phaseLabel) : '', p ? lab(st.jeux, p.jeu, p.jeuLabel) : '', p ? (byId(st.jeux, p.jeu) || {}).kind || p.jeuKind || '' : '',
      p ? lab(st.issues, p.issue, p.issueLabel) : '', p ? lab(st.realisations, p.real, p.realLabel) : '', p && p.cause ? lab(st.causes, p.cause, p.causeLabel) : '',
      t.poss || '', t.note || '']);
  });
  m.possessions.forEach(p => {
    const j = byId(st.jeux, p.jeu);
    rows.push([m.id, m.adversaire, m.date, 'possession', ...base(p.start), '', r2(p.start), r2(p.end), new Date(p.wall || m.created).toISOString(),
      '', '', '', lab(st.phases, p.phase, p.phaseLabel), lab(st.jeux, p.jeu, p.jeuLabel), (j && j.kind) || p.jeuKind || '',
      lab(st.issues, p.issue, p.issueLabel), p.real ? lab(st.realisations, p.real, p.realLabel) : '', p.cause ? lab(st.causes, p.cause, p.causeLabel) : '',
      p.id, '']);
  });
  m.marks.forEach(x => {
    rows.push([m.id, m.adversaire, m.date, 'repere', '', '', fmtL(x.t), r2(x.t), '', '', '', '', '', MARK_LABELS[x.type], '', '', '', '', '', '', '', '']);
  });
  rows.sort((a, b) => parseFloat(a[7] || a[8] || 0) - parseFloat(b[7] || b[8] || 0));
  return rows;
}
function buildCSV(arg) {
  const list = Array.isArray(arg) ? arg : [arg];
  const all = []; list.forEach(m => all.push(...csvRows(m)));
  return '\ufeff' + [CSV_HEAD, ...all].map(r => r.map(csvCell).join(';')).join('\r\n');
}

function backupJSON() {
  return JSON.stringify({ app: 'hb-analyse', version: 1, exported: new Date().toISOString(), settings: S.settings, roster: S.roster, matches: S.matches }, null, 1);
}

async function importJSON(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('Fichier illisible.'); return; }
  if (data.app !== 'hb-analyse') { toast('Ce fichier n’est pas une sauvegarde de l’application.'); return; }
  if (!confirm('Restaurer cette sauvegarde ? Les matchs de la sauvegarde sont ajoutés (ou remplacés s’ils existent déjà), l’effectif et les réglages sont remplacés.')) return;
  if (data.settings) { S.settings = Object.assign(clone(DEFAULTS), data.settings); migrateSettings(); await saveSettings(); }
  if (data.roster) { S.roster = data.roster; await saveRoster(); }
  for (const m of data.matches || []) {
    await DB.put('matches', m);
    const i = S.matches.findIndex(x => x.id === m.id);
    if (i >= 0) S.matches[i] = m; else S.matches.push(m);
  }
  renderHome(); toast('Sauvegarde restaurée.');
}

/* ---------- clics ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const d = el.dataset, v = V();
  switch (d.act) {
    case 'home': unloadVideo(); S.m = null; setView('home'); break;
    case 'roster': setView('roster'); break;
    case 'roster-from-dlg': closeDlg(); setView('roster'); break;
    case 'settings': setView('settings'); break;
    case 'newmatch': dlgNewMatch(); break;
    case 'creatematch': {
      const m = { id: uid(), adversaire: $('#nm-adv').value.trim() || 'Adversaire', date: $('#nm-date').value || today(), created: Date.now(),
        videoName: null, videoSize: null, sheet: [], marks: [], tags: [], possessions: [], open: null };
      S.matches.push(m); DB.put('matches', m).catch(warnStore); closeDlg(); openMatch(m.id); break;
    }
    case 'openmatch': openMatch(d.id); break;
    case 'delmatch': {
      const m = S.matches.find(x => x.id === d.id);
      if (confirm(`Supprimer le match contre ${m.adversaire} et toutes ses données ?`)) {
        S.matches = S.matches.filter(x => x.id !== d.id); DB.del('matches', d.id).catch(warnStore); Cloud.remove(d.id); renderHome();
      }
      break;
    }
    case 'closedlg': closeDlg(); break;
    case 'stats': setView('stats'); break;
    case 'fs': setFs(!S.fs); break;
    case 'fscard': seqPlay(d.id); if (S.settings.saisie.fsShrink) setFs(false); break;
    case 'fsall': setFs(false); break;
    case 'colorpick': dlgColor(Number(d.i)); break;
    case 'setcolor': setPhaseColor(Number(d.i), d.c); break;
    case 'seqshift': seqShift(d.id, d.w, Number(d.d)); break;
    case 'seqhere': seqHere(d.id, d.w); break;
    case 'rq': rqPick(d.s, d.id); break;
    case 'rqclear': rqClear(d.s); break;
    case 'rqundo': rqUndo(); break;
    case 'rqresume': rqResume(d.id); break;
    case 'seqplay': seqPlay(d.id); break;
    case 'seqreset': seqReset(d.id); break;
    case 'seqtoggle': S.seqOpen = S.seqOpen === false; renderBanner(); break;
    case 'scdefault': S.settings.shortcuts = clone(DEFAULTS.shortcuts); saveSettings(); renderSettings(); break;
    case 'rowmove': if (moveInArray(S.settings[d.list], Number(d.i), Number(d.d))) { saveSettings(); renderSettings(); } break;
    case 'stepmove': {
      const o = rqOrder(), i = o.indexOf(d.s), nd = Number(d.d), j = i + nd;
      if (j < 0 || j >= o.length) break;
      [o[i], o[j]] = [o[j], o[i]];
      const pi = o.indexOf('phase');
      if (pi > o.indexOf('jeu') || pi > o.indexOf('res')) { toast('La catégorie doit rester avant le jeu et le résultat.'); break; }
      S.settings.rapide.order = o; saveSettings(); renderSettings(); break;
    }
    case 'rqresadd': { const l = S.settings.rapide.res[d.side] || (S.settings.rapide.res[d.side] = []); const cand = S.settings.issues.find(x => !l.includes(x.id)); if (cand) { l.push(cand.id); saveSettings(); renderSettings(); } break; }
    case 'rqresdel': S.settings.rapide.res[d.side].splice(Number(d.i), 1); saveSettings(); renderSettings(); break;
    case 'rqresmove': if (moveInArray(S.settings.rapide.res[d.side], Number(d.i), Number(d.d))) { saveSettings(); renderSettings(); } break;
    case 'sfreset': S.sf = { match: 'all', side: '', kind: '', jeu: '', issue: '', real: '', player: '' }; renderStats(); break;
    case 'csvsel': download(`analyse-${today()}.csv`, buildCSV(statsMatches()), 'text/csv;charset=utf-8'); break;
    case 'pickmatch': dlgPick(); break;
    case 'cloudrefresh': dlgPick(); break;
    case 'cloudmatch': importCloudMatch(d.id); break;
    case 'dologin': doLogin(); break;
    case 'logout': Cloud.logout(); toast('Déconnecté.'); if (S.view === 'settings') renderSettings(); break;
    case 'sync': Cloud.sync().then(r => { if (r && r.error) toast(Cloud.state.msg); else if (r) { toast('Synchronisé (' + r.down + ' reçus, ' + r.up + ' envoyés).'); } if (S.view === 'home') renderHome(); }); break;
    case 'pconfirm': commitPoss(); break;
    case 'replay': if (needVideo()) { v.currentTime = Math.max(0, v.currentTime - S.settings.saisie.replaySec); playV(); } break;
    case 'sheetpaste': collectSheet(); dlgSheetPaste(); break;
    case 'dosheetpaste': doSheetPaste(); break;
    case 'newplayer': collectSheet(); dlgNewPlayer(); break;
    case 'donewplayer': doNewPlayer(); break;
    case 'backup': download(`sauvegarde-analyse-${today()}.json`, backupJSON(), 'application/json'); break;
    case 'import': $('#fileimport').click(); break;
    case 'csv': if (S.m) download(`${slug(S.m.date + '-hbccs-' + S.m.adversaire)}.csv`, buildCSV(S.m), 'text/csv;charset=utf-8'); break;
    case 'pickvideo': $('#filevideo').click(); break;

    case 'play': if (needVideo()) { v.paused ? playV() : v.pause(); } break;
    case 'seek': if (needVideo()) v.currentTime = Math.min(Math.max(v.currentTime + Number(d.d), 0), v.duration || 1e9); break;
    case 'frame': if (needVideo()) { v.pause(); v.currentTime = Math.max(0, v.currentTime + Number(d.d) / S.settings.fps); } break;
    case 'speed': S.speedIdx = (S.speedIdx + 1) % SPEEDS.length; v.playbackRate = SPEEDS[S.speedIdx]; $('#speedbtn').textContent = SPEEDS[S.speedIdx].toString().replace('.', ',') + '×'; break;
    case 'goto': if (S.videoReady) { v.currentTime = Number(d.t); } else toast('Choisis d’abord la vidéo du match.'); break;

    case 'mark': addMark(d.type); break;
    case 'delmark': S.m.marks = S.m.marks.filter(x => x.id !== d.id); saveMatch(); renderMarks(); renderTimeline(); renderJournal(); updateTime(v.currentTime || 0); break;

    case 'tab': S.tab = d.id; renderPanel(); break;
    case 'player': autoPause(); S.player = S.player === d.id ? null : d.id; renderPanel(); break;
    case 'tag': tagAction(d.id); break;
    case 'undo': {
      const t = S.m.tags.find(x => x.id === S.lastTag);
      if (t) { S.m.tags = S.m.tags.filter(x => x.id !== S.lastTag); S.lastTag = null; saveMatch(); renderJournal(); renderTimeline(); toast('Dernière action annulée.'); }
      break;
    }
    case 'nudge': {
      const t = S.m.tags.find(x => x.id === d.id);
      if (t) { t.vt = Math.max(0, t.vt + Number(d.d)); S.m.tags.sort((a, b) => a.vt - b.vt); saveMatch(); renderJournal(); renderTimeline(); }
      break;
    }
    case 'deltag': S.m.tags = S.m.tags.filter(x => x.id !== d.id); if (S.lastTag === d.id) S.lastTag = null; saveMatch(); renderJournal(); renderTimeline(); break;

    case 'pstart': startPoss(); break;
    case 'pcancel': S.m.open = null; saveMatch(); renderPanel(); renderTimeline(); break;
    case 'pset': setPoss(d.f, d.id); break;
    case 'pvalid': validPoss(); break;
    case 'editposs': {
      const p = S.m.possessions.find(x => x.id === d.id);
      if (S.m.open && !confirm('Une possession est déjà ouverte. La remplacer par celle-ci ?')) break;
      S.m.possessions = S.m.possessions.filter(x => x.id !== d.id);
      S.m.open = { id: p.id, start: p.start, end: p.end, phase: p.phase, jeu: p.jeu, issue: p.issue, real: p.real, cause: p.cause };
      saveMatch(); renderPanel(); renderTimeline(); renderJournal(); toast('Possession rouverte : modifie puis valide.');
      break;
    }
    case 'delposs': S.m.possessions = S.m.possessions.filter(x => x.id !== d.id); saveMatch(); renderTimeline(); renderJournal(); break;

    case 'sheet': dlgSheet(); break;
    case 'savesheet': {
      const sheet = [];
      $$('#dlg [data-sh]').forEach(cb => { if (cb.checked) { const pid = cb.dataset.sh; sheet.push({ playerId: pid, num: $(`#dlg [data-shn="${pid}"]`).value.trim() }); } });
      S.m.sheet = sheet;
      if (S.player && !sheet.some(s => s.playerId === S.player)) S.player = null;
      saveMatch(); closeDlg(); renderPanel(); toast(sheet.length + ' joueurs sur la feuille.');
      break;
    }

    case 'addplayer': S.roster.push({ id: uid(), num: '', name: '', poste: '' }); saveRoster(); renderRoster(); break;
    case 'delplayer': {
      const p = S.roster[Number(d.i)];
      if (confirm(`Retirer ${p.name || 'ce joueur'} de l’effectif ?`)) { S.roster.splice(Number(d.i), 1); saveRoster(); renderRoster(); }
      break;
    }
    case 'pastelist': dlgPaste(); break;
    case 'dopaste': {
      const items = parsePaste($('#paste').value);
      items.forEach(x => S.roster.push({ id: uid(), num: x.num, name: x.name, poste: x.poste }));
      saveRoster(); closeDlg(); renderRoster(); toast(items.length + ' joueurs ajoutés.');
      break;
    }

    case 'addrow': {
      const L = d.list, row = { id: uid(), label: 'Nouveau' };
      if (['phases', 'jeux', 'issues'].includes(L)) row.side = 'attaque';
      if (L === 'phases') { row.key = ''; row.jeu = true; row.color = PALETTE.find(c => !S.settings.phases.some(p => p.color === c)) || PALETTE[S.settings.phases.length % PALETTE.length]; }
      if (L === 'jeux') row.kind = 'combinaison';
      S.settings[L].push(row); saveSettings(); renderSettings(); break;
    }
    case 'delrow': S.settings[d.list].splice(Number(d.i), 1); saveSettings(); renderSettings(); break;
    case 'resetlists':
      if (confirm('Remettre toutes les listes aux valeurs par défaut ?')) {
        const keep = { periodMinutes: S.settings.periodMinutes, fps: S.settings.fps, saisie: S.settings.saisie, shortcuts: S.settings.shortcuts };
        S.settings = Object.assign(clone(DEFAULTS), keep); saveSettings(); renderSettings();
      }
      break;
  }
});

/* saisie dans les champs (effectif, réglages) */
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.sk) {
    const k = t.dataset.sk;
    S.settings.saisie[k] = t.type === 'checkbox' ? t.checked : Math.min(30, Math.max(1, Number(t.value) || 5));
    saveSettings(); applyReplayBtn();
  } else if (t.dataset.rq) {
    S.settings.rapide[t.dataset.rq] = Math.min(60, Math.max(0, Number(t.value) || 0)); saveSettings();
  } else if (t.dataset.rqres) {
    const [side, i] = t.dataset.rqres.split('.'); S.settings.rapide.res[side][Number(i)] = t.value; saveSettings();
  } else if (t.dataset.sf) {
    S.sf[t.dataset.sf] = t.value; renderStats();
  } else if (t.dataset.pick) {
    S.pickEq = t.value; renderPick();
  } else if (t.dataset.r) {
    const [i, f] = t.dataset.r.split('.'); S.roster[Number(i)][f] = t.value.trim(); saveRoster();
  } else if (t.dataset.set) {
    const parts = t.dataset.set.split('.');
    if (parts.length === 1) { S.settings[parts[0]] = Math.max(1, Number(t.value) || DEFAULTS[parts[0]]); }
    else S.settings[parts[0]][Number(parts[1])][parts[2]] = t.type === 'checkbox' ? t.checked : t.value;
    saveSettings();
  }
});

/* ---------- raccourcis clavier (Mac) ---------- */
document.addEventListener('keydown', e => {
  if (S.view !== 'match' || !S.videoReady) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || $('#dlg').open) return;
  const v = V();
  if (e.code === 'Space') { e.preventDefault(); v.paused ? playV() : v.pause(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 5 : 1)); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); v.currentTime += (e.shiftKey ? 5 : 1); }
  else if (e.key === ',') { v.pause(); v.currentTime = Math.max(0, v.currentTime - 1 / S.settings.fps); }
  else if (e.key === '.') { v.pause(); v.currentTime += 1 / S.settings.fps; }
});

/* ---------- initialisation ---------- */
function bindStatic() {
  const v = V();
  $('#filevideo').addEventListener('change', e => { const f = e.target.files[0]; if (f && S.m) loadVideo(f); e.target.value = ''; });
  $('#fileimport').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJSON(f); e.target.value = ''; });
  $('#scrub').addEventListener('input', e => { if (S.videoReady) v.currentTime = Number(e.target.value) / 1000 * v.duration; });
  v.addEventListener('loadedmetadata', () => {
    S.videoReady = true; $('#novideo').hidden = true;
    v.playbackRate = SPEEDS[S.speedIdx];
    renderTimeline(); updateTime(v.currentTime || 0);
  });
  v.addEventListener('error', () => {
    if (!v.getAttribute('src')) return;
    S.videoReady = false; $('#novideo').hidden = false;
    toast('Cette vidéo ne se lit pas ici. Essaie un fichier MP4 (H.264).');
  });
  v.addEventListener('play', () => $('#playicon').setAttribute('d', 'M6 4h4v16H6zM14 4h4v16h-4z'));
  v.addEventListener('pause', () => $('#playicon').setAttribute('d', 'M7 4.5v15l13-7.5z'));
  window.addEventListener('resize', () => {
    if (S.view !== 'match') return;
    const c = window.innerHeight < 860 && window.innerWidth > 900;
    if (c !== S.compact) renderPanel();
  });
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details.mdet')) S.marksOpen = e.target.open; }, true);
  // clic sur la chronologie = aller à ce moment
  document.addEventListener('click', e => {
    const w = e.target.closest('#tracks'); if (!w || !S.videoReady) return;
    const r = w.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    if (f >= 0 && f <= 1) v.currentTime = f * v.duration;
  });
}

/* met à niveau les réglages enregistrés : ajoute ce qui manque sans toucher à ce que tu as modifié */
function migrateSettings() {
  const st = S.settings, D = DEFAULTS;
  st.saisie = Object.assign({}, D.saisie, st.saisie || {});
  st.shortcuts = Object.assign({}, D.shortcuts, st.shortcuts || {});
  st.rapide = Object.assign(clone(D.rapide), st.rapide || {});
  st.rapide.res = Object.assign(clone(D.rapide.res), st.rapide.res || {});
  if (!st.phases.some(p => p.id === 'montee')) st.phases.splice(1, 0, clone(D.phases.find(p => p.id === 'montee')));
  st.phases.forEach(p => { if (p.key === undefined) p.key = PHASE_KEYS[p.id] || ''; });
  st.phases.forEach((p, i) => { if (!p.color) p.color = PHASE_COLORS[p.id] || PALETTE[i % PALETTE.length]; });
  st.phases.forEach(p => { if (p.jeu === undefined) { const d = D.phases.find(x => x.id === p.id); p.jeu = d ? d.jeu : true; } });
  if (!st.issues.some(i => i.id === 'pas-but')) st.issues.splice(st.issues.length - 1, 0, clone(D.issues.find(i => i.id === 'pas-but')));
}

async function init() {
  try {
    const st = await DB.get('kv', 'settings');
    S.settings = Object.assign(clone(DEFAULTS), (st && st.value) || {});
    const ro = await DB.get('kv', 'roster');
    S.roster = (ro && ro.value) || [];
    const pu = await DB.get('kv', 'prefsUpdated');
    S.prefsUpdated = (pu && pu.value) || 0;
    S.matches = await DB.all('matches');
  } catch (err) {
    S.settings = clone(DEFAULTS);
    toast('Stockage du navigateur indisponible : les données ne seront pas conservées.');
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  migrateSettings();
  bindStatic();
  applyReplayBtn();
  setView('home');
  if (Cloud.session && navigator.onLine) Cloud.sync(true).then(() => { if (S.view === 'home') renderHome(); });
  requestAnimationFrame(tick);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
}
init();
