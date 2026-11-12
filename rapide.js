'use strict';
/* Marquage rapide : un appui dès qu'on repère une situation, puis 2 à 3 boutons.
   Les étapes (catégorie, jeu, résultat, joueur) et leur ordre sont réglables. */
const STEP_TITLE = { phase: 'Que vois-tu ?', jeu: 'Quel jeu ?', res: 'Résultat ?', joueur: 'Quel joueur ?' };
const STEP_NAME = { phase: 'Catégorie', jeu: 'Jeu', res: 'Résultat', joueur: 'Joueur' };
const RQ_STEPS = ['phase', 'jeu', 'res', 'joueur'];

const rqCfg = () => S.settings.rapide;
const rqPhase = id => byId(S.settings.phases, id);
const rqJeux = ph => ph ? S.settings.jeux.filter(j => j.side === 'both' || j.side === ph.side) : [];
const rqResIds = ph => (rqCfg().res[(ph && ph.side) || 'attaque'] || []).filter(id => byId(S.settings.issues, id));

/* ordre normalisé : toutes les étapes présentes, et la catégorie avant le jeu et le résultat (elle décide des listes) */
function rqOrder() {
  const o = (rqCfg().order || []).filter((s, i, a) => RQ_STEPS.includes(s) && a.indexOf(s) === i);
  RQ_STEPS.forEach(s => { if (!o.includes(s)) o.push(s); });
  const pi = o.indexOf('phase'), first = Math.min(o.indexOf('jeu'), o.indexOf('res'));
  if (pi > first) { o.splice(pi, 1); o.splice(first, 0, 'phase'); }
  return o;
}
const rqNewCur = () => ({ t0: V().currentTime, wall0: performance.now(), phase: null, jeu: null, res: null, joueur: null });
const rqFilled = (s, c) => !!c[s];
function rqApplies(s, c) {
  if (s === 'jeu') { const ph = rqPhase(c.phase); return !!ph && ph.jeu !== false && rqJeux(ph).length > 0; }
  return true;
}
function rqNext(c) {
  for (const s of rqOrder()) {
    if (rqFilled(s, c)) continue;
    if ((s === 'jeu' || s === 'res') && !c.phase) continue;
    if (!rqApplies(s, c)) continue;
    return s;
  }
  return null;
}
function rqOptions(step, c) {
  const st = S.settings;
  if (step === 'phase') return st.phases.map(p => ({ id: p.id, label: p.label, color: p.color }));
  if (step === 'jeu') return rqJeux(rqPhase(c && c.phase)).map(j => ({ id: j.id, label: j.label }));
  if (step === 'res') return rqResIds(rqPhase(c && c.phase)).map(id => ({ id, label: lab(st.issues, id), cls: id === 'but' ? 'good' : id === 'but-enc' ? 'bad' : 'neutral' }));
  return sheetPlayers(S.m).map(p => ({ id: p.id, label: p.num || '?', sub: p.name }));
}
function rqValueLabel(s, id) {
  if (s === 'phase') return lab(S.settings.phases, id);
  if (s === 'jeu') return lab(S.settings.jeux, id);
  if (s === 'res') return lab(S.settings.issues, id);
  const p = sheetPlayers(S.m).find(x => x.id === id); return p ? '#' + p.num + ' ' + p.name : '?';
}

/* grille dont la taille des boutons s'adapte au nombre de boutons */
function rqGrid(step, opts, chosen) {
  const n = opts.length;
  const cols = step === 'joueur' ? (n <= 6 ? 3 : n <= 16 ? 4 : 5) : (n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5);
  const h = n <= 2 ? 96 : n <= 4 ? 80 : n <= 6 ? 72 : n <= 9 ? 64 : n <= 16 ? 58 : 48;
  const fs = n <= 4 ? 20 : n <= 9 ? 16 : n <= 16 ? 15 : 13;
  return `<div class="rq-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));--rq-h:${h}px;--rq-fs:${fs}px">${opts.map(o =>
    `<button type="button" class="rq-opt ${step === 'joueur' ? 'rq-pl' : ''} ${o.cls || ''} ${o.color ? 'rq-cat' : ''}" ${o.color ? `style="--cc:${esc(o.color)}"` : ''} aria-pressed="${chosen === o.id}" data-act="rq" data-s="${step}" data-id="${esc(o.id)}"><b>${esc(o.label)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}</button>`).join('')}</div>`;
}

function rqHtml() {
  const c = S.rq.cur, ord = rqOrder(), first = ord[0];
  const fOpts = rqOptions(first, c || {});
  const fBody = fOpts.length ? rqGrid(first, fOpts, c && c[first])
    : first === 'joueur' ? '<p class="hint">Aucun joueur sur la feuille de match.</p><button class="btn" type="button" data-act="sheet">Composer la feuille</button>' : '<p class="hint">Aucune catégorie : ajoute-en dans Réglages.</p>';
  let lower;
  if (!c) lower = `<p class="rq-idle">Appuie dès que tu repères la situation.<br>Les boutons suivants apparaîtront ici.</p>`;
  else {
    const crumbs = ord.filter(s => rqFilled(s, c)).map(s => `<button type="button" class="rq-crumb" ${s === 'phase' ? `style="--cc:${esc(catColor(c.phase))}"` : ''} data-act="rqclear" data-s="${s}">${esc(rqValueLabel(s, c[s]))} ✕</button>`).join('');
    const nx = rqNext(c), n = ord.filter(s => rqFilled(s, c)).length + 1;
    const opts = nx ? rqOptions(nx, c) : [];
    lower = `<div class="rq-crumbs">${crumbs}</div>` + (nx ? `<p class="sect">${n} · ${STEP_TITLE[nx]}</p>` + (opts.length ? rqGrid(nx, opts, null) : `<p class="hint">Aucun choix disponible pour cette étape.</p>${nx === 'joueur' ? '<button class="btn" type="button" data-act="sheet">Composer la feuille</button>' : ''}`) : '');
  }
  const undo = S.rq.undoId && Date.now() < S.rq.undoUntil ? `<div class="rq-undo"><span>Situation enregistrée</span><button class="btn small" type="button" data-act="rqundo">Annuler</button><i></i></div>` : '';
  return `<section class="card"><div class="card-h"><h2>${STEP_TITLE[first]}</h2><span class="rq-timer" id="rqtimer">objectif 4 s</span></div>${fBody}</section>
    <section class="card">${lower}</section>${undo}`;
}

function rqRender() { if (S.view === 'match' && (S.tab || 'rapide') === 'rapide') renderPanel(); }
function rqRefreshAll() { renderPanel(); renderTimeline(); renderJournal(); }

function rqPick(step, id) {
  if (!needVideo()) return;
  const ord = rqOrder(), first = ord[0];
  let c = S.rq.cur;
  if (c && step === first && ord.some(s => s !== first && c[s])) { rqSave(true); c = null; }   // nouvelle situation
  if (!c) c = S.rq.cur = rqNewCur();
  c[step] = id;
  if (step === 'phase') {
    const ph = rqPhase(id);
    if (c.jeu && !rqJeux(ph).some(j => j.id === c.jeu)) c.jeu = null;
    if (c.res && !rqResIds(ph).includes(c.res)) c.res = null;
  }
  if (rqNext(c) === null) rqSave(false); else rqRender();
}
function rqClear(step) {
  const c = S.rq.cur; if (!c) return;
  c[step] = null;
  if (step === 'phase') { c.jeu = null; c.res = null; }
  if (!RQ_STEPS.some(s => c[s])) S.rq.cur = null;
  rqRender();
}

function rqSave(forceInc) {
  const c = S.rq.cur; if (!c) return;
  const st = S.settings, cfg = rqCfg(), ph = rqPhase(c.phase), j = byId(st.jeux, c.jeu);
  const miss = !c.phase || (rqApplies('jeu', c) && !c.jeu) || !c.res || !c.joueur;
  const inc = !!forceInc || miss;
  const sh = S.m.sheet.find(x => x.playerId === c.joueur), pl = S.roster.find(r => r.id === c.joueur);
  const L = (list, id) => id ? lab(list, id) : '';
  const dur = V().duration;
  const p = {
    id: uid(), mark: c.t0, start: Math.max(0, c.t0 - cfg.before), end: isFinite(dur) ? Math.min(dur, c.t0 + cfg.after) : c.t0 + cfg.after,
    phase: c.phase, jeu: c.jeu, issue: c.res, real: null, cause: null, phaseColor: ph ? ph.color : null,
    side: ph ? ph.side : null, jeuKind: j ? j.kind : null,
    phaseLabel: L(st.phases, c.phase), jeuLabel: L(st.jeux, c.jeu), issueLabel: L(st.issues, c.res), realLabel: '', causeLabel: '',
    playerId: c.joueur || null, pnum: sh ? sh.num : (pl ? pl.num : ''), pname: pl ? pl.name : '',
    rq: true, inc, offS: 0, offE: 0, wall: Date.now()
  };
  if (p.end <= p.start) p.end = p.start + 1;
  S.m.possessions.push(p); S.m.possessions.sort((a, b) => a.start - b.start);
  S.rq.cur = null; S.seqSel = p.id;
  saveMatch();
  if (!forceInc) {
    S.rq.lastSecs = (performance.now() - c.wall0) / 1000;
    S.rq.undoId = p.id; S.rq.undoUntil = Date.now() + 6000;
    setTimeout(() => { if (Date.now() >= S.rq.undoUntil) { S.rq.undoId = null; rqRender(); } }, 6100);
  }
  rqRefreshAll();
}
function rqUndo() {
  const id = S.rq.undoId; if (!id) return;
  S.m.possessions = S.m.possessions.filter(x => x.id !== id); S.rq.undoId = null; S.rq.lastSecs = null;
  saveMatch(); rqRefreshAll();
}
function rqResume(id) {
  const p = S.m.possessions.find(x => x.id === id); if (!p) return;
  if (S.rq.cur) rqSave(true);
  S.m.possessions = S.m.possessions.filter(x => x.id !== id);
  S.rq.cur = { t0: p.mark ?? p.start + rqCfg().before, wall0: performance.now(), phase: p.phase, jeu: p.jeu, res: p.issue, joueur: p.playerId };
  S.tab = 'rapide'; saveMatch(); rqRefreshAll(); toast('Complète les étapes manquantes.');
}

/* chrono dans la carte (appelé à chaque image) */
function rqTick() {
  const el = document.getElementById('rqtimer'); if (!el) return;
  const c = S.rq.cur;
  if (c) { const s = (performance.now() - c.wall0) / 1000; el.textContent = s.toFixed(1).replace('.', ',') + ' s'; el.className = 'rq-timer ' + (s <= 4 ? 'ok' : 'slow'); }
  else if (S.rq.lastSecs != null) { const s = S.rq.lastSecs; el.textContent = 'saisi en ' + s.toFixed(1).replace('.', ',') + ' s'; el.className = 'rq-timer ' + (s <= 4 ? 'ok' : 'slow'); }
  else { el.textContent = 'objectif 4 s'; el.className = 'rq-timer'; }
}

/* ---------- Réglages ---------- */
function moveInArray(a, i, d) { const j = i + d; if (j < 0 || j >= a.length) return false; [a[i], a[j]] = [a[j], a[i]]; return true; }
function rapideCard() {
  const cfg = S.settings.rapide, ord = rqOrder();
  const issueOpts = v => S.settings.issues.map(i => `<option value="${esc(i.id)}" ${i.id === v ? 'selected' : ''}>${esc(i.label)}</option>`).join('');
  const resBlock = (side, title) => `<h3>${title}</h3>${(cfg.res[side] || []).map((id, i) => `<div class="list-row">
      <select data-rqres="${side}.${i}" aria-label="Résultat">${issueOpts(id)}</select>
      <button class="btn small" type="button" data-act="rqresmove" data-side="${side}" data-i="${i}" data-d="-1" aria-label="Monter">▲</button>
      <button class="btn small" type="button" data-act="rqresmove" data-side="${side}" data-i="${i}" data-d="1" aria-label="Descendre">▼</button>
      <button class="btn danger small" type="button" data-act="rqresdel" data-side="${side}" data-i="${i}" aria-label="Supprimer">✕</button></div>`).join('')}
    <button class="btn small" type="button" data-act="rqresadd" data-side="${side}">Ajouter un résultat</button>`;
  return `<div class="card"><div class="card-h"><h2>Marquage rapide</h2></div>
    <p class="hint">Ordre des étapes : la première est toujours visible sous la vidéo, les suivantes apparaissent au fil de tes appuis. Mets « Joueur » en premier pour commencer par le joueur. La catégorie doit rester avant le jeu et le résultat, car elle décide de leurs listes.</p>
    ${ord.map((s, i) => `<div class="list-row"><span style="flex:1"><b>${i + 1}.</b> ${STEP_NAME[s]}</span>
      <button class="btn small" type="button" data-act="stepmove" data-s="${s}" data-d="-1" aria-label="Monter">▲</button>
      <button class="btn small" type="button" data-act="stepmove" data-s="${s}" data-d="1" aria-label="Descendre">▼</button></div>`).join('')}
    <h3>Fenêtre de la séquence</h3>
    <div class="list-row"><label for="rq-b" style="flex:1">Secondes avant ton premier appui</label><input id="rq-b" class="w-num" type="number" min="0" max="60" value="${cfg.before}" data-rq="before"></div>
    <div class="list-row"><label for="rq-a" style="flex:1">Secondes après ton premier appui</label><input id="rq-a" class="w-num" type="number" min="0" max="60" value="${cfg.after}" data-rq="after"></div>
    ${resBlock('attaque', 'Boutons « résultat » · catégories d’attaque')}${resBlock('defense', 'Boutons « résultat » · catégories de défense')}
    <p class="hint">Les catégories sont les « phases » ci-dessous : tu peux les renommer, en ajouter, les réordonner (▲▼) et choisir si elles demandent un jeu. La taille des boutons s’adapte à leur nombre.</p></div>`;
}
