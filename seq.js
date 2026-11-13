'use strict';
/* Bandeau de séquences (bas de l'écran) et raccourcis clavier.
   Les ajustements de début et de fin sont des décalages : la saisie d'origine n'est jamais modifiée. */
const SC_LABELS = {
  next: 'Séquence suivante', prev: 'Séquence précédente', end5: 'Finir 5 s plus tard', end10: 'Finir 10 s plus tard',
  start5: 'Commencer 5 s plus tôt', start10: 'Commencer 10 s plus tôt', replay: 'Rejouer la séquence', setIn: 'Début ici (image actuelle)', setOut: 'Fin ici (image actuelle)', fs: 'Grand écran / réduire'
};
const seqWin = p => ({ a: Math.max(0, p.start - (p.offS || 0)), b: p.end + (p.offE || 0) });
const seqList = () => (S.m ? S.m.possessions : []);
const catColor = (id, snap) => { const p = id && byId(S.settings.phases, id); return (p && p.color) || snap || '#9AA8B6'; };
const seqTitle = p => [p.phase ? lab(S.settings.phases, p.phase, p.phaseLabel) : 'Situation', p.jeu ? lab(S.settings.jeux, p.jeu, p.jeuLabel) : ''].filter(Boolean).join(' · ');
const seqInfo = p => {
  const w = seqWin(p), res = p.issue ? lab(S.settings.issues, p.issue, p.issueLabel) : '';
  return `<span class="mono">${fmt(w.a)} → ${fmt(w.b)} · ${Math.round(w.b - w.a)} s</span> · ${p.inc ? '<span class="seq-tag">à compléter</span>' : esc(res)}${p.pnum || p.pname ? ' · ' + esc(p.pnum ? '#' + p.pnum : p.pname) : ''}`;
};

function renderBanner() {
  const bar = document.getElementById('seqbar'); if (!bar) return;
  if (S.view !== 'match' || !S.m || S.fs) { bar.hidden = true; renderFsCol(); return; }
  bar.hidden = false;
  const list = seqList(), open = S.seqOpen !== false, sel = list.find(p => p.id === S.seqSel);
  const head = `<div class="seq-h"><b>Séquences · ${list.length}</b><span class="muted seq-hint">${list.some(p => p.inc) ? 'bord orange = à compléter' : 'touche une carte pour la revoir'}</span><span class="grow"></span>
    <button class="btn small" type="button" data-act="fs">Plein écran (F)</button>
    <button class="btn small" type="button" data-act="seqtoggle" aria-label="${open ? 'Réduire le bandeau' : 'Agrandir le bandeau'}">${open ? '▾' : '▴'}</button></div>`;
  if (!open) { bar.innerHTML = head; return; }
  let editor = '<p class="seq-help">Touche une carte pour la revoir, puis règle son début et sa fin.</p>';
  if (sel) {
    const w = seqWin(sel), dur = S.videoReady && isFinite(V().duration) ? V().duration : w.b + 8;
    const r0 = Math.max(0, w.a - 8), r1 = Math.min(dur, w.b + 8), pc = t => (((t - r0) / ((r1 - r0) || 1)) * 100).toFixed(2);
    const bt = (which, d, txt, cls) => `<button class="btn small ${cls || ''}" type="button" data-act="seqshift" data-id="${sel.id}" data-w="${which}" data-d="${d}">${txt}</button>`;
    editor = `<div class="seq-ed" style="--cc:${catColor(sel.phase, sel.phaseColor)}">
      <div class="seq-en"><b>${esc(seqTitle(sel))}</b><span class="seq-dur"><span id="seqdur">${Math.round(w.b - w.a)}</span> s <span class="muted mono">${fmt(w.a)} → ${fmt(w.b)}</span></span></div>
      <div class="seq-stripw"><div class="seq-strip" data-id="${sel.id}" data-r0="${r0}" data-r1="${r1}">
        <div class="seq-band" style="left:${pc(w.a)}%;width:${(pc(w.b) - pc(w.a)).toFixed(2)}%"></div>
        <button type="button" class="seq-hd s" style="left:${pc(w.a)}%" data-hd="s" aria-label="Début : glisser"><i></i></button>
        <button type="button" class="seq-hd e" style="left:${pc(w.b)}%" data-hd="e" aria-label="Fin : glisser"><i></i></button>
      </div><div class="seq-strip-l"><span>${fmt(r0)}</span><span>Glisse les deux bords pour régler le début et la fin</span><span>${fmt(r1)}</span></div></div>
      <div class="seq-btns">
        <div class="seq-bg"><span class="seq-bl">Commence plus tôt</span>${bt('s', -1, '+1 s')}${bt('s', -2, '+2 s')}${bt('s', -5, '+5 s')}${bt('s', 1, 'Couper 1 s', 'cut')}</div>
        <div class="seq-bg"><span class="seq-bl">Finit plus tard</span>${bt('e', 1, '+1 s')}${bt('e', 2, '+2 s')}${bt('e', 5, '+5 s')}${bt('e', -1, 'Couper 1 s', 'cut')}</div>
      </div>
      <div class="seq-ea"><button class="btn small" type="button" data-act="seqplay" data-id="${sel.id}">▶ Revoir</button>${(sel.offS || sel.offE) ? `<button class="btn small" type="button" data-act="seqreset" data-id="${sel.id}">↺ Origine</button>` : ''}</div></div>
      <p class="seq-help">Après chaque réglage, la séquence se rejoue. Ta saisie d’origine n’est jamais modifiée.</p>`;
  }
  const cards = list.map(p => `<div class="seq-card ${p.id === S.seqSel ? 'sel' : ''} ${p.inc ? 'inc' : ''}" style="--cc:${catColor(p.phase, p.phaseColor)}" data-act="seqplay" data-id="${p.id}" role="button" tabindex="0">
      <div class="seq-t"><b>${esc(seqTitle(p))}</b></div><div class="seq-m">${seqInfo(p)}${(p.offS || p.offE) ? ' · ajustée' : ''}</div></div>`).join('');
  bar.innerHTML = head + editor + `<div class="seq-row">${cards || '<p class="hint" style="margin:6px 0">Aucune séquence. Les situations que tu marques apparaissent ici.</p>'}</div>`;
  const c = bar.querySelector('.seq-card.sel'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* grand écran : la vidéo remplit la fenêtre, une colonne montre les dernières séquences */
function setFs(on) {
  S.fs = !!on && S.view === 'match';
  const m = document.getElementById('match'); if (m) m.classList.toggle('fs', S.fs);
  document.body.classList.toggle('fs', S.fs);
  const b = document.getElementById('fsbtn'); if (b) b.textContent = S.fs ? 'Réduire (F)' : 'Plein écran (F)';
  renderFsCol(); if (S.m) renderBanner();
}
function renderFsCol() {
  const col = document.getElementById('fscol'); if (!col) return;
  if (!S.fs || !S.m) { col.hidden = true; return; }
  col.hidden = false;
  const first = rqOrder()[0], opts = rqOptions(first, S.rq.cur || {});
  const marks = opts.length ? rqGrid(first, opts, S.rq.cur && S.rq.cur[first], 2)
    : first === 'joueur' ? '<p class="hint">Aucun joueur sur la feuille de match.</p>' : '<p class="hint">Aucune catégorie : ajoute-en dans Réglages.</p>';
  const undo = S.rq.undoId && Date.now() < S.rq.undoUntil ? '<div class="rq-undo"><span>Situation enregistrée</span><button class="btn small" type="button" data-act="rqundo">Annuler</button><i></i></div>' : '';
  const list = [...seqList()].sort((a, b) => (b.wall || 0) - (a.wall || 0)).slice(0, 3);
  col.innerHTML = `<div class="sect-h" style="margin:0">Marquer · ${STEP_TITLE[first]}</div>${marks}${undo}
    <div class="sect-h" style="margin:8px 0 0">Dernières séquences</div>
    ${list.map(p => `<button type="button" class="fs-card" style="--cc:${catColor(p.phase, p.phaseColor)}" data-act="fscard" data-id="${p.id}"><b>${esc(seqTitle(p))}</b><span>${seqInfo(p)}</span></button>`).join('') || '<p class="hint" style="margin:0">Aucune séquence pour l’instant.</p>'}
    <button class="btn" type="button" data-act="fsall">Toutes les séquences</button>`;
}

function seqPlay(id, from) {
  const p = seqList().find(x => x.id === id); if (!p) return;
  S.seqSel = id;
  if (S.videoReady) { const w = seqWin(p), v = V(); v.currentTime = from != null ? Math.min(Math.max(w.a, from), w.b - 0.5) : w.a; S.playWin = { id, b: w.b }; playV(); }
  else toast('Choisis d’abord la vidéo du match.');
  renderBanner(); renderFsCol();
}
/* d > 0 : l'instant se décale plus tard ; d < 0 : plus tôt */
function seqShift(id, which, d) {
  const p = seqList().find(x => x.id === id); if (!p) return;
  const w = seqWin(p), dur = S.videoReady && isFinite(V().duration) ? V().duration : Infinity;
  if (which === 's') { const t = Math.min(Math.max(0, w.a + d), w.b - 1); p.offS = p.start - t; }
  else { const t = Math.max(Math.min(dur, w.b + d), w.a + 1); p.offE = t - p.end; }
  p.updated = Date.now(); saveMatch(); renderJournal(); renderTimeline();
  const n = seqWin(p); seqPlay(id, which === 's' ? n.a : n.b - 5);
}
function seqHere(id, which) {
  const p = seqList().find(x => x.id === id); if (!p) return;
  if (!S.videoReady) { toast('Choisis d’abord la vidéo du match.'); return; }
  const t = V().currentTime, w = seqWin(p);
  if (which === 's') { if (t > w.b - 1) { toast('Le début doit être avant la fin.'); return; } p.offS = p.start - t; }
  else { if (t < w.a + 1) { toast('La fin doit être après le début.'); return; } p.offE = t - p.end; }
  saveMatch(); renderJournal(); renderTimeline(); renderBanner();
  toast((which === 's' ? 'Début' : 'Fin') + ' placé à ' + fmtL(t));
}
function seqReset(id) { const p = seqList().find(x => x.id === id); if (!p) return; p.offS = 0; p.offE = 0; saveMatch(); renderJournal(); renderTimeline(); seqPlay(id); }
function seqSelect(dir) {
  const l = seqList(); if (!l.length) return;
  let i = l.findIndex(x => x.id === S.seqSel); i = i < 0 ? (dir > 0 ? 0 : l.length - 1) : Math.min(l.length - 1, Math.max(0, i + dir));
  seqPlay(l[i].id);
}
function seqTick() {
  const pw = S.playWin; if (!pw) return;
  const v = V();
  if (v.paused) { S.playWin = null; return; }
  if (v.currentTime >= pw.b) { v.pause(); S.playWin = null; }
}

/* raccourcis clavier : la touche de chaque action se règle dans Réglages */
document.addEventListener('keydown', e => {
  if (S.view !== 'match' || !S.m) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || $('#dlg').open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && S.fs) { setFs(false); return; }
  const ph = !e.repeat && S.settings.phases.find(p => p.key && p.key === e.key);
  if (ph) { e.preventDefault(); rqPick('phase', ph.id); return; }
  const sc = S.settings.shortcuts, act = Object.keys(sc).find(k => sc[k] === e.key);
  if (!act) return;
  if (act === 'fs') { e.preventDefault(); setFs(!S.fs); return; }
  const p = seqList().find(x => x.id === S.seqSel), v = V();
  if (S.fs && S.settings.saisie.fsShrink && (p || act === 'next' || act === 'prev')) setFs(false);
  if (act === 'next') { e.preventDefault(); seqSelect(1); return; }
  if (act === 'prev') { e.preventDefault(); seqSelect(-1); return; }
  if (act === 'replay') { e.preventDefault(); if (p) seqPlay(p.id); else if (S.videoReady) { v.currentTime = Math.max(0, v.currentTime - S.settings.saisie.replaySec); playV(); } return; }
  if (!p) { toast('Choisis d’abord une séquence (touche ] ou clic sur une carte).'); return; }
  e.preventDefault();
  if (act === 'end5') seqShift(p.id, 'e', 5);
  else if (act === 'end10') seqShift(p.id, 'e', 10);
  else if (act === 'start5') seqShift(p.id, 's', -5);
  else if (act === 'start10') seqShift(p.id, 's', -10);
  else if (act === 'setIn' && S.videoReady) { p.offS = p.start - v.currentTime; saveMatch(); renderJournal(); renderTimeline(); toast('Début de séquence : ' + fmtL(v.currentTime)); }
  else if (act === 'setOut' && S.videoReady) { p.offE = v.currentTime - p.end; saveMatch(); renderJournal(); renderTimeline(); toast('Fin de séquence : ' + fmtL(v.currentTime)); }
});

function shortcutsCard() {
  const sc = S.settings.shortcuts;
  return `<div class="card"><div class="card-h"><h2>Raccourcis clavier (Mac)</h2></div>
    <p class="hint">Touche une case puis appuie sur la touche voulue. Majuscule = Maj + la lettre. Les raccourcis agissent sur la séquence sélectionnée dans le bandeau du bas. Les touches des catégories se règlent dans la liste « Catégories ». Déjà fixes : Espace, ← → (±1 s, Maj ±5 s), virgule et point (image par image).</p>
    ${Object.keys(SC_LABELS).map(k => `<div class="list-row"><label for="sc-${k}" style="flex:1">${SC_LABELS[k]}</label><input id="sc-${k}" class="w-num" type="text" readonly value="${esc(sc[k])}" data-sc="${k}" style="text-align:center;font-weight:700"></div>`).join('')}
    <button class="btn" type="button" data-act="scdefault">Remettre les raccourcis par défaut</button></div>`;
}
document.addEventListener('keydown', e => {
  const t0 = e.target;
  if (t0.dataset && t0.dataset.pkey !== undefined) {       /* touche d'une catégorie */
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
    e.preventDefault();
    const ph = S.settings.phases[Number(t0.dataset.pkey)]; if (!ph) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { ph.key = ''; t0.value = ''; saveSettings(); toast('Touche retirée.'); return; }
    if (e.key.length !== 1) { toast('Une touche simple (lettre, chiffre ou symbole). Retour arrière pour la retirer.'); return; }
    const sc = S.settings.shortcuts, ck = Object.keys(sc).find(k => sc[k] === e.key);
    if (ck) { toast('Déjà utilisée pour : ' + SC_LABELS[ck]); return; }
    const other = S.settings.phases.find(p => p !== ph && p.key === e.key);
    if (other) { toast('Déjà utilisée pour la catégorie : ' + other.label); return; }
    ph.key = e.key; t0.value = e.key.toUpperCase(); saveSettings(); toast('Touche ' + e.key.toUpperCase() + ' → ' + ph.label); return;
  }
  const t = e.target; if (!t.dataset || !t.dataset.sc) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  if (e.key.length !== 1 && e.key !== 'Enter') { toast('Une touche simple (lettre, chiffre ou symbole).'); return; }
  const sc = S.settings.shortcuts, clash = Object.keys(sc).find(k => k !== t.dataset.sc && sc[k] === e.key);
  if (clash) { toast('Déjà utilisée pour : ' + SC_LABELS[clash]); return; }
  const pc = S.settings.phases.find(p => p.key === e.key);
  if (pc) { toast('Déjà utilisée pour la catégorie : ' + pc.label); return; }
  sc[t.dataset.sc] = e.key; t.value = e.key; saveSettings();
});

document.addEventListener('focusin', e => { const t = e.target; if (t.dataset && t.dataset.pkey !== undefined) t.placeholder = 'Appuie sur une touche…'; });
document.addEventListener('focusout', e => { const t = e.target; if (t.dataset && t.dataset.pkey !== undefined) t.placeholder = 'aucune'; });

/* glisser les bords de la séquence sur la barre */
(() => {
  let d = null;
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest && e.target.closest('.seq-hd'); if (!h) return;
    const strip = h.closest('.seq-strip'), p = seqList().find(x => x.id === strip.dataset.id); if (!p) return;
    e.preventDefault(); h.setPointerCapture(e.pointerId);
    const w = seqWin(p);
    d = { h, strip, p, which: h.dataset.hd, r0: Number(strip.dataset.r0), r1: Number(strip.dataset.r1), a: w.a, b: w.b, t: null, last: 0 };
    h.classList.add('drag');
  });
  document.addEventListener('pointermove', e => {
    if (!d) return;
    const r = d.strip.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)));
    let t = d.r0 + f * (d.r1 - d.r0);
    t = d.which === 's' ? Math.min(t, d.b - 1) : Math.max(t, d.a + 1);
    t = Math.max(d.r0, Math.min(d.r1, t)); d.t = t;
    const pc = x => ((x - d.r0) / ((d.r1 - d.r0) || 1)) * 100, a = d.which === 's' ? t : d.a, b = d.which === 'e' ? t : d.b;
    d.h.style.left = pc(t) + '%';
    const band = d.strip.querySelector('.seq-band'); band.style.left = pc(a) + '%'; band.style.width = (pc(b) - pc(a)) + '%';
    const du = document.getElementById('seqdur'); if (du) du.textContent = Math.round(b - a);
    if (S.videoReady && Date.now() - d.last > 120) { d.last = Date.now(); const v = V(); v.pause(); S.playWin = null; v.currentTime = t; }
  });
  const fin = e => {
    if (!d) return;
    const x = d; d = null; x.h.classList.remove('drag');
    if (e.type === 'pointercancel' || x.t == null) { renderBanner(); return; }
    if (x.which === 's') x.p.offS = x.p.start - x.t; else x.p.offE = x.t - x.p.end;
    x.p.updated = Date.now(); saveMatch(); renderJournal(); renderTimeline();
    const n = seqWin(x.p); seqPlay(x.p.id, x.which === 's' ? n.a : Math.max(n.a, n.b - 4));
  };
  document.addEventListener('pointerup', fin);
  document.addEventListener('pointercancel', fin);
})();
