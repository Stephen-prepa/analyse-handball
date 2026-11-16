'use strict';
/* Annotations sur la vidéo : cercle, spot, flèche, trait ; animées ; avec durée et mouvement */
const ANN_COLS = ['#FF4D4D', '#FFD83D', '#3DDC97', '#5BC0EB', '#FFFFFF'];
const ANN_NAMES = { circle: 'Cercle', spot: 'Spot', arrow: 'Flèche', line: 'Trait' };
const ANN_ANIM = { fixe: 'Fixe', tourne: 'Pointillés qui tournent', clignote: 'Clignote', pulse: 'Pulsation', trace: 'Se dessine' };
const A = () => (S.ann = S.ann || { on: false, tool: 'circle', col: ANN_COLS[0], anim: 'fixe', dur: 4, sel: null });
let annDrag = null, annMove = null;

const annList = () => (S.m && S.m.ann) || [];
const lerp = (a, b, k) => a + (b - a) * k;
/* rectangle réellement occupé par l'image dans le cadre */
function annRect(cv) {
  const v = V(), w = cv.clientWidth, h = cv.clientHeight, vw = v.videoWidth || w, vh = v.videoHeight || h;
  const s = Math.min(w / vw, h / vh), rw = vw * s, rh = vh * s;
  return { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh };
}
/* position d'un dessin à l'instant t (interpolée s'il bouge) ; coordonnées 0..1 */
function annGeo(a, t) {
  if (!a.b) return a.a;
  const k = Math.max(0, Math.min(1, (t - a.t0) / ((a.t1 - a.t0) || 1))), o = {};
  for (const key in a.a) o[key] = lerp(a.a[key], a.b[key], k);
  return o;
}
function annDraw(g, a, t, R, phase, selected) {
  if (t < a.t0 || t > a.t1) return;
  const fade = Math.min(1, (t - a.t0) / .25, (a.t1 - t) / .25), loc = (t - a.t0) + phase;
  let al = fade;
  if (a.anim === 'clignote') al *= Math.sin(loc * Math.PI * 4) > 0 ? 1 : .15;
  const s = annGeo(a, t), px = n => R.x + n * R.w, py = n => R.y + n * R.h, u = R.w / 1280;
  g.save(); g.globalAlpha = al; g.strokeStyle = a.col; g.fillStyle = a.col; g.lineWidth = Math.max(2, 6 * u); g.lineCap = 'round';
  if (a.anim === 'tourne') { g.setLineDash([18 * u, 14 * u]); g.lineDashOffset = -loc * 70 * u; }
  const X = px(s.x), Y = py(s.y);
  if (a.type === 'circle' || a.type === 'spot') {
    let r = s.r * R.w; if (a.anim === 'pulse') r *= 1 + .12 * Math.sin(loc * 7);
    if (a.type === 'circle') {
      g.beginPath(); g.arc(X, Y, r, 0, 7); g.stroke();
      if (a.anim === 'pulse') { g.globalAlpha = al * .35; g.beginPath(); g.arc(X, Y, r * 1.35, 0, 7); g.stroke(); }
    } else {
      const gr = g.createRadialGradient(X, Y, 4 * u, X, Y, r); gr.addColorStop(0, a.col + 'ee'); gr.addColorStop(.6, a.col + '66'); gr.addColorStop(1, a.col + '00');
      g.fillStyle = gr; g.beginPath(); g.ellipse(X, Y, r, r * .62, 0, 0, 7); g.fill();
    }
    if (a.label) { g.globalAlpha = fade; g.font = 'bold ' + Math.round(20 * u) + 'px sans-serif'; g.textAlign = 'center'; const wd = g.measureText(a.label).width + 16 * u; g.fillStyle = '#000a'; g.fillRect(X - wd / 2, Y - r - 44 * u, wd, 28 * u); g.fillStyle = '#fff'; g.fillText(a.label, X, Y - r - 24 * u); }
  } else {
    let x2 = px(s.x2), y2 = py(s.y2);
    if (a.anim === 'trace') { const k = Math.min(1, loc / .9); x2 = lerp(X, x2, k); y2 = lerp(Y, y2, k); }
    g.beginPath(); g.moveTo(X, Y); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
    if (a.type === 'arrow') { const an = Math.atan2(y2 - Y, x2 - X), h = 26 * u; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - h * Math.cos(an - .45), y2 - h * Math.sin(an - .45)); g.lineTo(x2 - h * Math.cos(an + .45), y2 - h * Math.sin(an + .45)); g.closePath(); g.fill(); }
  }
  if (selected) { g.setLineDash([6, 6]); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 2; const rr = (s.r !== undefined ? s.r * R.w : Math.max(24, Math.hypot(px(s.x2) - X, py(s.y2) - Y) / 2)); const cx = s.r !== undefined ? X : (X + px(s.x2)) / 2, cy = s.r !== undefined ? Y : (Y + py(s.y2)) / 2; g.strokeRect(cx - rr - 8, cy - rr - 8, rr * 2 + 16, rr * 2 + 16); }
  g.restore();
}

function annFrame() {
  requestAnimationFrame(annFrame);
  const cv = document.getElementById('annc'); if (!cv) return;
  const st = A();
  if (S.view !== 'match' || !S.m || !S.videoReady) { if (cv.width) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
  const dpr = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
  const list = annList(); if (!list.length && !annDrag) return;
  const v = V(), t = v.currentTime, R = annRect(cv), phase = v.paused ? performance.now() / 1000 : 0;
  list.forEach(a => annDraw(g, a, t, R, phase, st.on && a === st.sel));
  if (annDrag) {
    g.save(); g.strokeStyle = st.col; g.lineWidth = 4; g.setLineDash([10, 8]); const d = annDrag;
    if (st.tool === 'circle' || st.tool === 'spot') { g.beginPath(); g.arc(d.x0, d.y0, Math.hypot(d.x - d.x0, d.y - d.y0), 0, 7); g.stroke(); }
    else { g.beginPath(); g.moveTo(d.x0, d.y0); g.lineTo(d.x, d.y); g.stroke(); }
    g.restore();
  }
}

/* ---- interface ---- */
function annSeqAt(t) { return seqList().find(p => { const w = seqWin(p); return t >= w.a && t <= w.b; }); }
function renderAnnTools() {
  const box = document.getElementById('anntools'), st = A(); if (!box) return;
  box.hidden = !st.on; document.getElementById('annbtn').classList.toggle('primary', st.on);
  const rt = document.getElementById('right'); if (rt) rt.classList.toggle('annon', st.on);
  const cv = document.getElementById('annc'); cv.style.pointerEvents = st.on ? 'auto' : 'none'; cv.style.cursor = st.on ? 'crosshair' : '';
  if (!st.on) return;
  const sel = st.sel, b = (attr, val, txt, on) => `<button class="btn small ${on ? 'primary' : ''}" type="button" data-ann="${attr}:${val}">${txt}</button>`;
  const list = [...annList()].sort((a, b) => a.t0 - b.t0);
  box.innerHTML = `<div class="ann-row"><span class="ann-l">Outil</span>${Object.keys(ANN_NAMES).map(k => b('tool', k, ANN_NAMES[k], st.tool === k)).join('')}
      <span class="ann-l">Couleur</span>${ANN_COLS.map(c => `<button class="ann-col ${st.col === c ? 'on' : ''}" type="button" data-ann="col:${c}" style="background:${c}" aria-label="Couleur"></button>`).join('')}
      <span class="ann-l">Reste</span>${[2, 4, 6].map(d => b('dur', d, d + ' s', st.dur === d)).join('')}</div>
    <div class="ann-row"><span class="ann-l">Animation</span>${Object.keys(ANN_ANIM).map(k => b('anim', k, ANN_ANIM[k], st.anim === k)).join('')}</div>
    <div class="ann-row">${sel ? `<span class="ann-l">Sélection</span><button class="btn" type="button" data-ann="end:1">↝ Position de fin ici</button>${sel.b ? '<button class="btn" type="button" data-ann="end:0">Supprimer le mouvement</button>' : ''}<button class="btn" type="button" data-ann="label:1">Texte</button><button class="btn danger" type="button" data-ann="del:1">Supprimer</button>` : '<span class="muted" style="font-size:13px">Glisse sur la vidéo pour dessiner. Touche un dessin pour le déplacer ou le modifier.</span>'}
      <span class="grow"></span><button class="btn" type="button" data-ann="png:1">Image PNG</button><button class="btn primary" type="button" data-ann="off:1">Terminer</button></div>
    ${list.length ? `<div class="ann-row"><span class="ann-l">Dessins</span>${list.map(a => `<button class="btn small ${a === sel ? 'primary' : ''}" type="button" data-ann="pick:${a.id}">${ANN_NAMES[a.type]} · ${fmt(a.t0)}</button>`).join('')}</div>` : ''}`;
}
function annSet(on) {
  const st = A(); st.on = !!on; st.sel = null;
  if (on && S.fs) setFs(false);
  if (on) { if (!S.videoReady) { toast('Choisis d’abord la vidéo.'); st.on = false; return; } V().pause(); }
  renderAnnTools();
}
function annSave() { S.m.updated = Date.now(); saveMatch(); }
function annExportPNG() {
  const v = V(); if (!S.videoReady) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d'); g.drawImage(v, 0, 0, c.width, c.height);
  annList().forEach(a => annDraw(g, a, v.currentTime, { x: 0, y: 0, w: c.width, h: c.height }, 0, false));
  c.toBlob(bl => { const u = URL.createObjectURL(bl), el = document.createElement('a'); el.href = u; el.download = slug((S.m.date || '') + '-' + S.m.adversaire + '-' + fmtL(v.currentTime).replace(/:/g, '')) + '.png'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png');
}
function annNorm(cv, e) { const r = cv.getBoundingClientRect(), R = annRect(cv); return { x: (e.clientX - r.left - R.x) / R.w, y: (e.clientY - r.top - R.y) / R.h }; }
function annHit(p, t) {
  const list = annList();
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]; if (t < a.t0 || t > a.t1) continue; const s = annGeo(a, t);
    if (s.r !== undefined) { if (Math.hypot(p.x - s.x, (p.y - s.y)) < s.r + .02) return a; }
    else { const dx = s.x2 - s.x, dy = s.y2 - s.y, l = dx * dx + dy * dy || 1e-9, k = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / l)); if (Math.hypot(p.x - (s.x + k * dx), p.y - (s.y + k * dy)) < .025) return a; }
  }
  return null;
}

document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-ann],#annbtn'); if (!t) return;
  const st = A();
  if (t.id === 'annbtn') { annSet(!st.on); return; }
  const [k, v] = t.dataset.ann.split(':'); const val = t.dataset.ann.slice(k.length + 1);
  if (k === 'tool') { st.tool = val; st.sel = null; } else if (k === 'col') { st.col = val; if (st.sel) { st.sel.col = val; annSave(); } }
  else if (k === 'anim') { st.anim = val; if (st.sel) { st.sel.anim = val; annSave(); } }
  else if (k === 'dur') { st.dur = Number(val); if (st.sel) { st.sel.t1 = st.sel.t0 + st.dur; annSave(); } }
  else if (k === 'off') { annSet(false); return; }
  else if (k === 'png') { annExportPNG(); return; }
  else if (k === 'pick') { const a = annList().find(x => x.id === val); if (a) { st.sel = a; V().pause(); V().currentTime = a.t0; } }
  else if (k === 'del' && st.sel) { S.m.ann = annList().filter(x => x !== st.sel); st.sel = null; annSave(); }
  else if (k === 'end' && st.sel) {
    if (val === '1') { if (!st.sel.b) st.sel.b = JSON.parse(JSON.stringify(st.sel.a)); toast('Déplace le dessin à sa position de fin (la vidéo doit être plus loin dans le temps).', 3500); }
    else delete st.sel.b; annSave();
  }
  else if (k === 'label' && st.sel) { const s = prompt('Texte affiché avec le dessin (vide = aucun) :', st.sel.label || ''); if (s !== null) { st.sel.label = s.trim(); annSave(); } }
  renderAnnTools();
});

function annInit() {
  const cv = document.getElementById('annc'); if (!cv) return;
  cv.addEventListener('pointerdown', e => {
    const st = A(); if (!st.on) return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const p = annNorm(cv, e), v = V(), t = v.currentTime, h = annHit(p, t);
    if (h) { st.sel = h; const geo = annGeo(h, t); annMove = { a: h, p0: p, o: JSON.parse(JSON.stringify(h.b && t > (h.t0 + h.t1) / 2 ? h.b : h.a)), toEnd: !!(h.b && t > (h.t0 + h.t1) / 2) }; renderAnnTools(); return; }
    st.sel = null; const r = cv.getBoundingClientRect();
    annDrag = { x0: e.clientX - r.left, y0: e.clientY - r.top, x: e.clientX - r.left, y: e.clientY - r.top, p0: p }; renderAnnTools();
  });
  cv.addEventListener('pointermove', e => {
    if (annMove) { const p = annNorm(cv, e), m = annMove, tgt = m.toEnd ? m.a.b : m.a.a, dx = p.x - m.p0.x, dy = p.y - m.p0.y; tgt.x = m.o.x + dx; tgt.y = m.o.y + dy; if (tgt.x2 !== undefined) { tgt.x2 = m.o.x2 + dx; tgt.y2 = m.o.y2 + dy; } return; }
    if (annDrag) { const r = cv.getBoundingClientRect(); annDrag.x = e.clientX - r.left; annDrag.y = e.clientY - r.top; }
  });
  const up = e => {
    if (annMove) { annMove = null; annSave(); return; }
    if (!annDrag) return; const d = annDrag; annDrag = null; const st = A(), p = annNorm(cv, e), R = annRect(cv), t = V().currentTime;
    const len = Math.hypot(p.x - d.p0.x, (p.y - d.p0.y) * R.h / R.w);
    const a = { id: uid(), sid: (annSeqAt(t) || {}).id || null, type: st.tool, col: st.col, anim: st.anim, t0: t, t1: Math.min(t + st.dur, V().duration || t + st.dur) };
    if (st.tool === 'circle' || st.tool === 'spot') a.a = { x: d.p0.x, y: d.p0.y, r: Math.max(.03, Math.hypot(p.x - d.p0.x, (p.y - d.p0.y) * R.h / R.w)) };
    else { if (len < .02) { renderAnnTools(); return; } a.a = { x: d.p0.x, y: d.p0.y, x2: p.x, y2: p.y }; }
    S.m.ann = annList().concat([a]); st.sel = a; annSave(); renderAnnTools();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { annMove = null; annDrag = null; });
  requestAnimationFrame(annFrame);
}
document.addEventListener('DOMContentLoaded', annInit);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.ann && S.ann.on) annSet(false); });
