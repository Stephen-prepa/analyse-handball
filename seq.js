'use strict';
/* Bandeau de séquences (bas de l'écran) et raccourcis clavier.
   Les ajustements de début et de fin sont des décalages : la saisie d'origine n'est jamais modifiée. */
const SC_LABELS = {
  next: 'Séquence suivante', prev: 'Séquence précédente', end5: 'Fin : +5 s', end10: 'Fin : +10 s',
  start5: 'Début : −5 s', start10: 'Début : −10 s', replay: 'Rejouer la séquence', setIn: 'Début ici (image actuelle)', setOut: 'Fin ici (image actuelle)'
};
const seqWin = p => ({ a: Math.max(0, p.start - (p.offS || 0)), b: p.end + (p.offE || 0) });
const seqList = () => (S.m ? S.m.possessions : []);

function renderBanner() {
  const bar = document.getElementById('seqbar'); if (!bar) return;
  if (S.view !== 'match' || !S.m) { bar.hidden = true; return; }
  bar.hidden = false;
  const list = seqList(), st = S.settings, open = S.seqOpen !== false;
  const head = `<div class="seq-h"><b>Séquences · ${list.length}</b><span class="muted seq-hint">${list.some(p => p.inc) ? 'orange = à compléter' : 'touche une carte pour la revoir'}</span><span class="grow"></span>
    <button class="btn small" type="button" data-act="seqtoggle" aria-label="${open ? 'Réduire' : 'Agrandir'}">${open ? '▾' : '▴'}</button></div>`;
  if (!open) { bar.innerHTML = head; return; }
  const cards = list.map(p => {
    const w = seqWin(p), sel = S.seqSel === p.id, res = p.issue ? lab(st.issues, p.issue, p.issueLabel) : '';
    const title = [p.phase ? lab(st.phases, p.phase, p.phaseLabel) : 'Situation', p.jeu ? lab(st.jeux, p.jeu, p.jeuLabel) : ''].filter(Boolean).join(' · ');
    const mod = (p.offS || p.offE) ? ' · ajustée' : '';
    return `<div class="seq-card ${sel ? 'sel' : ''} ${p.inc ? 'inc' : ''}" data-act="seqplay" data-id="${p.id}" role="button" tabindex="0">
      <div class="seq-t"><b>${esc(title)}</b></div>
      <div class="seq-m"><span class="mono">${fmt(w.a)} → ${fmt(w.b)} · ${Math.round(w.b - w.a)} s${mod}</span> · ${p.inc ? '<span class="seq-tag">à compléter</span>' : esc(res)}${p.pnum || p.pname ? ' · ' + esc(p.pnum ? '#' + p.pnum : p.pname) : ''}</div>
      <div class="seq-b"><span>Début</span><button class="btn small" type="button" data-act="seqoff" data-id="${p.id}" data-w="s" data-d="10">−10 s</button><button class="btn small" type="button" data-act="seqoff" data-id="${p.id}" data-w="s" data-d="5">−5 s</button>
        <span>Fin</span><button class="btn small" type="button" data-act="seqoff" data-id="${p.id}" data-w="e" data-d="5">+5 s</button><button class="btn small" type="button" data-act="seqoff" data-id="${p.id}" data-w="e" data-d="10">+10 s</button>
        ${(p.offS || p.offE) ? `<button class="btn small" type="button" data-act="seqreset" data-id="${p.id}" aria-label="Revenir à la fenêtre d’origine">↺</button>` : ''}</div></div>`;
  }).join('');
  bar.innerHTML = head + `<div class="seq-row">${cards || '<p class="hint" style="margin:6px 0">Aucune séquence. Les situations que tu marques apparaissent ici.</p>'}</div>`;
  const sel = bar.querySelector('.seq-card.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function seqPlay(id) {
  const p = seqList().find(x => x.id === id); if (!p) return;
  S.seqSel = id;
  if (S.videoReady) { const w = seqWin(p), v = V(); v.currentTime = w.a; S.playWin = { id, b: w.b }; playV(); }
  else toast('Choisis d’abord la vidéo du match.');
  renderBanner();
}
function seqOff(id, which, d) {
  const p = seqList().find(x => x.id === id); if (!p) return;
  if (which === 's') p.offS = Math.max(-(p.end - p.start - 1), (p.offS || 0) + d); else p.offE = Math.max(-(p.end - p.start - 1), (p.offE || 0) + d);
  p.updated = Date.now(); saveMatch(); renderJournal(); renderTimeline(); seqPlay(id);
}
function seqReset(id) { const p = seqList().find(x => x.id === id); if (!p) return; p.offS = 0; p.offE = 0; saveMatch(); renderBanner(); }
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
  const sc = S.settings.shortcuts, act = Object.keys(sc).find(k => sc[k] === e.key);
  if (!act) return;
  const p = seqList().find(x => x.id === S.seqSel), v = V();
  if (act === 'next') { e.preventDefault(); seqSelect(1); return; }
  if (act === 'prev') { e.preventDefault(); seqSelect(-1); return; }
  if (act === 'replay') { e.preventDefault(); if (p) seqPlay(p.id); else if (S.videoReady) { v.currentTime = Math.max(0, v.currentTime - S.settings.saisie.replaySec); playV(); } return; }
  if (!p) { toast('Choisis d’abord une séquence (touche ] ou clic sur une carte).'); return; }
  e.preventDefault();
  if (act === 'end5') seqOff(p.id, 'e', 5);
  else if (act === 'end10') seqOff(p.id, 'e', 10);
  else if (act === 'start5') seqOff(p.id, 's', 5);
  else if (act === 'start10') seqOff(p.id, 's', 10);
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
