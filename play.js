'use strict';
/* Séance vidéo : lecture enchaînée des séquences d'un filtre */
const plDuration = poss => { const s = Math.round(poss.reduce((a, x) => { const w = seqWin(x.p); return a + (w.b - w.a); }, 0)); return s >= 60 ? Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s' : s + ' s'; };

function plStart(poss) {
  const items = poss.slice().sort((a, b) => (a.m.date + a.m.created).localeCompare(b.m.date + b.m.created) || a.p.start - b.p.start).map(x => ({ mid: x.m.id, pid: x.p.id }));
  if (!items.length) return;
  S.pl = { items, i: 0, auto: true };
  plGo(0);
}
function plGo(i) {
  const pl = S.pl; if (!pl) return;
  pl.i = Math.max(0, Math.min(pl.items.length - 1, i)); pl.auto = true;
  const it = pl.items[pl.i];
  if (!S.m || S.m.id !== it.mid || !S.videoReady) {
    const same = S.m && S.m.id === it.mid;
    if (!same) openMatch(it.mid); else setView('match');
    S.afterVideo = it.pid; S.seqSel = it.pid;
    toast('Choisis la vidéo du match « ' + S.m.adversaire + ' » : la lecture démarre ensuite.', 5000);
    renderBanner();
  } else { seqPlay(it.pid); }
  plRender();
}
function plAdvance() {
  const pl = S.pl; if (!pl) return;
  if (pl.i >= pl.items.length - 1) { pl.auto = false; toast('Fin de la séance : ' + pl.items.length + ' séquences vues.', 4000); plRender(); return; }
  const next = pl.items[pl.i + 1];
  pl.i++; plRender();
  if (S.m && S.m.id === next.mid && S.videoReady) setTimeout(() => { if (S.pl === pl && pl.auto) seqPlay(next.pid); }, 800);
  else { S.afterVideo = next.pid; plGo(pl.i); }
}
function plStop() { S.pl = null; S.afterVideo = null; plRender(); }

function plRender() {
  const box = document.getElementById('plbar'); if (!box) return;
  const pl = S.pl;
  if (!pl || S.view !== 'match' || !S.m) { box.hidden = true; return; }
  const it = pl.items[pl.i], m = S.matches.find(x => x.id === it.mid), p = m && m.possessions.find(x => x.id === it.pid);
  if (!p) { box.hidden = true; return; }
  box.hidden = false;
  const paused = !S.playWin;
  const html = `<div class="pl-h"><b>Séance vidéo · ${pl.i + 1} / ${pl.items.length}</b>
      <span class="pl-t" style="border-left:4px solid ${catColor(p.phase, p.phaseColor)}">${esc(seqTitle(p))}</span>
      <span class="muted">${esc(m.adversaire)}${p.pnum || p.pname ? ' · ' + esc(p.pnum ? '#' + p.pnum : p.pname) : ''}${p.issue ? ' · ' + esc(lab(S.settings.issues, p.issue, p.issueLabel)) : ''}</span></div>
    <div class="pl-b"><button class="btn small" type="button" data-pl="prev">⏮ Précédente</button>
      <button class="btn small primary" type="button" data-pl="${paused ? 'play' : 'pause'}">${paused ? '▶ Lire' : '⏸ Pause'}</button>
      <button class="btn small" type="button" data-pl="next">Suivante ⏭</button>
      <button class="btn small" type="button" data-pl="again">↻ Répéter</button>
      <label class="pl-a"><input type="checkbox" data-pl="auto" ${pl.auto ? 'checked' : ''}> Enchaîner</label>
      <span class="grow"></span><button class="btn small" type="button" data-pl="stop">Arrêter</button></div>`;
  if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-pl],[data-act=plstart]'); if (!b) return;
  if (b.dataset.act === 'plstart') { plStart(statsPoss(statsMatches())); return; }
  const pl = S.pl; if (!pl) return; const a = b.dataset.pl;
  const it = pl.items[pl.i];
  if (a === 'next') { if (pl.i < pl.items.length - 1) { pl.i++; plGo(pl.i); } }
  else if (a === 'prev') { plGo(Math.max(0, pl.i - 1)); }
  else if (a === 'again') { plGo(pl.i); }
  else if (a === 'pause') { V().pause(); S.playWin = null; pl.auto = false; plRender(); }
  else if (a === 'play') { pl.auto = true; seqPlay(it.pid, V().currentTime); plRender(); }
  else if (a === 'stop') plStop();
});
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.pl === 'auto' && S.pl) S.pl.auto = t.checked; });
setInterval(() => { if (S.pl) plRender(); }, 500);
