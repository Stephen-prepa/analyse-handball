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
    const w = seqWin(sel), grp = (which, label, t) => `<div class="seq-eg"><div class="seq-et"><b>${label}</b><span class="mono">${fmt(t)}</span></div>
      <div class="seq-eb">${[-10, -5, 5, 10].map(d => `<button class="btn small" type="button" data-act="seqshift" data-id="${sel.id}" data-w="${which}" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)} s</button>`).join('')}
      <button class="btn small" type="button" data-act="seqhere" data-id="${sel.id}" data-w="${which}">Ici</button></div></div>`;
    editor = `<div class="seq-ed" style="--cc:${catColor(sel.phase, sel.phaseColor)}"><div class="seq-en"><b>${esc(seqTitle(sel))}</b><span class="muted">${Math.round(w.b - w.a)} s</span></div>
      ${grp('s', 'Début', w.a)}${grp('e', 'Fin', w.b)}
      <div class="seq-ea"><button class="btn small" type="button" data-act="seqplay" data-id="${sel.id}">▶ Revoir</button>${(sel.offS || sel.offE) ? `<button class="btn small" type="button" data-act="seqreset" data-id="${sel.id}">↺ Origine</button>` : ''}</div></div>
      <p class="seq-help"><b>−</b> = plus tôt, <b>+</b> = plus tard. « Ici » = l’image affichée en ce moment. Ta saisie d’origine n’est jamais modifiée.</p>`;
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
  const list = [...seqList()].sort((a, b) => (b.wall || 0) - (a.wall || 0)).slice(0, 6);
  col.innerHTML = `<div class="sect-h" style="margin:0">Dernières séquences</div>
    ${list.map(p => `<button type="button" class="fs-card" style="--cc:${catColor(p.phase, p.phaseColor)}" data-act="fscard" data-id="${p.id}"><b>${esc(seqTitle(p))}</b><span>${seqInfo(p)}</span></button>`).join('') || '<p class="hint">Aucune séquence pour l’instant.</p>'}
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
    <p class="hint">Touche une case puis appuie sur la touche voulue. Majuscule = Maj + la lettre. Les raccourcis agissent sur la séquence sélectionnée dans le bandeau du bas. Déjà fixes : Espace, ← → (±1 s, Maj ±5 s), virgule et point (image par image).</p>
    ${Object.keys(SC_LABELS).map(k => `<div class="list-row"><label for="sc-${k}" style="flex:1">${SC_LABELS[k]}</label><input id="sc-${k}" class="w-num" type="text" readonly value="${esc(sc[k])}" data-sc="${k}" style="text-align:center;font-weight:700"></div>`).join('')}
    <button class="btn" type="button" data-act="scdefault">Remettre les raccourcis par défaut</button></div>`;
}
document.addEventListener('keydown', e => {
  const t = e.target; if (!t.dataset || !t.dataset.sc) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  if (e.key.length !== 1 && e.key !== 'Enter') { toast('Une touche simple (lettre, chiffre ou symbole).'); return; }
  const sc = S.settings.shortcuts, clash = Object.keys(sc).find(k => k !== t.dataset.sc && sc[k] === e.key);
  if (clash) { toast('Déjà utilisée pour : ' + SC_LABELS[clash]); return; }
  sc[t.dataset.sc] = e.key; t.value = e.key; saveSettings();
});
