'use strict';
/* Annotations sur la vidéo : cercle, spot, flèche, trait ; animées ; avec durée et mouvement */
const ANN_COLS = ['#FF4D4D', '#FFD83D', '#3DDC97', '#5BC0EB', '#FFFFFF'];
const ANN_NAMES = { circle: 'Cercle', spot: 'Spot', arrow: 'Flèche', line: 'Trait', joueur: 'Joueur', espace: 'Espace' };
const ANN_ANIM = { fixe: 'Fixe', tourne: 'Tourne', clignote: 'Clignote', pulse: 'Pulse', trace: 'Se dessine' };
const A = () => (S.ann = S.ann || { on: false, tool: 'circle', col: ANN_COLS[0], anim: 'fixe', dur: 4, freeze: 'manual', undo: [], sel: null, follow: null, pair: null });
let annDrag = null, annMove = null, annFr = null, annLast = null, annHold = null;
const annFired = new Set();
const FRZ = { 0: 'Aucun', manual: 'Jusqu’à Lecture', 2: '2 s', 4: '4 s', 6: '6 s' };
function annPush() { const st = A(); st.undo.push(JSON.stringify(annList())); if (st.undo.length > 30) st.undo.shift(); }
function annUndo() {
  const st = A(); if (!st.undo.length) { toast('Rien à annuler.'); return; }
  const id = st.sel && st.sel.id; S.m.ann = JSON.parse(st.undo.pop()); st.sel = S.m.ann.find(x => x.id === id) || null; annSave(); renderAnnTools();
}
/* arrêt sur image automatique : on détecte le passage de l'instant d'apparition pendant la lecture */
function annFreezeTick(v, cv) {
  const t = v.currentTime, last = annLast; annLast = t;
  if (!v.paused) annHold = null;
  for (const id of [...annFired]) { const a = annList().find(x => x.id === id); if (!a || t < a.t0 - .05) annFired.delete(id); }
  if (v.paused) { if (annHold && annHold.until && performance.now() >= annHold.until) { annHold = null; v.play().catch(() => {}); } return; }
  if (v.seeking || last === null || t < last || t - last > 1) return;
  for (const a of annList()) {
    if (!a.freeze || annFired.has(a.id)) continue;
    if (last < a.t0 && t >= a.t0) {
      annFired.add(a.id); v.pause(); v.currentTime = a.t0 + .02;
      annHold = { id: a.id, until: a.freeze === 'manual' ? 0 : performance.now() + Number(a.freeze) * 1000 };
      break;
    }
  }
}

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
/* ---- points joueurs (positions clés) et espace entre 2 joueurs ---- */
const annById = id => annList().find(x => x.id === id);
function pjPos(a, t) {
  const k = a.kf; if (t <= k[0].t) return k[0];
  const l = k[k.length - 1]; if (t >= l.t) return l;
  for (let i = 0; i < k.length - 1; i++) if (t < k[i + 1].t) { const q = (t - k[i].t) / ((k[i + 1].t - k[i].t) || 1); return { x: lerp(k[i].x, k[i + 1].x, q), y: lerp(k[i].y, k[i + 1].y, q) }; }
  return l;
}
function annName(a) {
  if (a.type === 'joueur') return 'Joueur ' + (a.label || a.n || '');
  if (a.type === 'espace') { const p = annById(a.p1), q = annById(a.p2); return 'Espace ' + ((p && (p.label || p.n)) || '?') + '↔' + ((q && (q.label || q.n)) || '?'); }
  return ANN_NAMES[a.type] + (a.label ? ' · ' + a.label : '');
}
const annOrdered = () => { const r = x => x.type === 'espace' ? 0 : x.type === 'joueur' ? 2 : 1; return [...annList()].sort((a, b) => r(a) - r(b)); };
function annDrawPlayer(g, a, t, R, al, selected, phase, showPath) {
  const px = n => R.x + n * R.w, py = n => R.y + n * R.h, u = R.w / 1280, s = pjPos(a, t), X = px(s.x), Y = py(s.y), r = Math.max(10, 17 * u);
  g.save(); g.globalAlpha = al;
  if (showPath && a.kf.length > 1) { g.setLineDash([6, 6]); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); a.kf.forEach((k, i) => i ? g.lineTo(px(k.x), py(k.y)) : g.moveTo(px(k.x), py(k.y))); g.stroke(); g.setLineDash([]); a.kf.forEach(k => { g.fillStyle = '#fff'; g.beginPath(); g.arc(px(k.x), py(k.y), 4, 0, 7); g.fill(); }); }
  if (a.anim === 'pulse') { g.globalAlpha = al * .4; g.strokeStyle = a.col; g.lineWidth = 3; g.beginPath(); g.arc(X, Y, r * (1.4 + .25 * Math.sin((t - a.t0 + phase) * 7)), 0, 7); g.stroke(); g.globalAlpha = al; }
  g.fillStyle = a.col; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#0E1318'; g.font = 'bold ' + Math.round(r * 1.1) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(a.label || a.n || ''), X, Y + 1);
  if (selected) { g.setLineDash([5, 5]); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, r + 7, 0, 7); g.stroke(); }
  g.restore();
}
function annDrawSpace(g, a, t, R, al, selected, loc) {
  const p = annById(a.p1), q = annById(a.p2); if (!p || !q) return;
  const px = n => R.x + n * R.w, py = n => R.y + n * R.h, u = R.w / 1280, s1 = pjPos(p, t), s2 = pjPos(q, t);
  const X1 = px(s1.x), Y1 = py(s1.y), X2 = px(s2.x), Y2 = py(s2.y), d = Math.hypot(X2 - X1, Y2 - Y1), ang = Math.atan2(Y2 - Y1, X2 - X1);
  let ra = Math.max(d / 2, 12 * u); if (a.anim === 'pulse') ra *= 1 + .08 * Math.sin(loc * 7);
  const rb = Math.max(ra * .45, 16 * u);
  g.save(); g.translate((X1 + X2) / 2, (Y1 + Y2) / 2); g.rotate(ang); g.strokeStyle = a.col; g.fillStyle = a.col; g.lineWidth = Math.max(2, 5 * u); g.lineCap = 'round';
  g.globalAlpha = al * .28; g.beginPath(); g.ellipse(0, 0, ra, rb, 0, 0, 7); g.fill();
  g.globalAlpha = al; if (a.anim === 'tourne') { g.setLineDash([16 * u, 12 * u]); g.lineDashOffset = -loc * 70 * u; }
  g.beginPath(); g.ellipse(0, 0, ra, rb, 0, 0, 7); g.stroke(); g.setLineDash([6, 8]); g.globalAlpha = al * .7; g.lineWidth = Math.max(1.5, 2.5 * u); g.beginPath(); g.moveTo(-d / 2, 0); g.lineTo(d / 2, 0); g.stroke();
  if (selected) { g.globalAlpha = 1; g.setLineDash([6, 6]); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, ra + 8, rb + 8, 0, 0, 7); g.stroke(); }
  g.restore();
  if (a.label) { g.save(); g.globalAlpha = al; g.font = 'bold ' + Math.round(20 * u) + 'px sans-serif'; g.textAlign = 'center'; const mx = (X1 + X2) / 2, my = (Y1 + Y2) / 2 - rb - 26 * u, wd = g.measureText(a.label).width + 16 * u; g.fillStyle = '#000a'; g.fillRect(mx - wd / 2, my - 20 * u, wd, 28 * u); g.fillStyle = '#fff'; g.fillText(a.label, mx, my); g.restore(); }
}
function annDraw(g, a, t, R, phase, selected) {
  if (t < a.t0 || t > a.t1) return;
  const fade = Math.min(1, (t - a.t0) / .25, (a.t1 - t) / .25), loc = (t - a.t0) + phase;
  let al = fade;
  if (a.anim === 'clignote') al *= Math.sin(loc * Math.PI * 4) > 0 ? 1 : .15;
  if (a.type === 'joueur') { annDrawPlayer(g, a, t, R, a.anim === 'clignote' ? al : fade, selected, phase, selected && A().on); return; }
  if (a.type === 'espace') { annDrawSpace(g, a, t, R, al, selected, loc); return; }
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
  const v = V(); annFreezeTick(v, cv);
  const t = v.currentTime, R = annRect(cv), phase = v.paused ? performance.now() / 1000 : 0;
  const ph = document.getElementById('annph'), fr = document.getElementById('annfr');
  if (ph && fr) { const ra = Number(fr.dataset.a), rb = Number(fr.dataset.b); ph.style.left = 'calc(' + Math.max(0, Math.min(1, (t - ra) / ((rb - ra) || 1))) + ' * (100% - 12px))'; }
  annOrdered().forEach(a => annDraw(g, a, t, R, phase, st.on && (a === st.sel || (st.pair && a.id === st.pair))));
  if (annHold && v.paused) {
    const secs = annHold.until ? Math.max(0, Math.ceil((annHold.until - performance.now()) / 1000)) : 0, txt = annHold.until ? '⏸ Arrêt sur image · reprise dans ' + secs + ' s' : '⏸ Arrêt sur image · appuie sur Lecture pour continuer';
    g.save(); g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; const wd = g.measureText(txt).width + 24; g.fillStyle = '#000b'; g.fillRect(cv.clientWidth / 2 - wd / 2, 10, wd, 30); g.fillStyle = '#fff'; g.fillText(txt, cv.clientWidth / 2, 31); g.restore();
  }
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
    <div class="ann-row"><span class="ann-l">Arrêt sur image</span>${Object.keys(FRZ).map(k => b('frz', k, FRZ[k], String(sel ? (sel.freeze || 0) : (st.freeze || 0)) === k)).join('')}</div>
    ${annToolHint(st, sel)}
    <div class="ann-row">${sel ? `<span class="ann-l">Sélection</span>${sel.type === 'joueur' ? '<button class="btn" type="button" data-ann="delkf:1">Supprimer cette position</button>' : sel.type === 'espace' ? '' : `<button class="btn" type="button" data-ann="end:1">↝ Position de fin ici</button>${sel.b ? '<button class="btn" type="button" data-ann="end:0">Supprimer le mouvement</button>' : ''}<button class="btn" type="button" data-ann="dup:1">⧉ Dupliquer plus tard</button>`}<button class="btn" type="button" data-ann="label:1">Texte</button><button class="btn danger" type="button" data-ann="del:1">Supprimer</button>` : '<span class="muted" style="font-size:13px">Touche un dessin pour le déplacer ou le modifier.</span>'}
      <span class="grow"></span><button class="btn" type="button" data-ann="undo:1" ${st.undo.length ? '' : 'disabled'} aria-label="Annuler">↶ Annuler</button><button class="btn" type="button" data-ann="png:1">Image PNG</button><button class="btn primary" type="button" data-ann="off:1">Terminer</button></div>
    ${annFriseHtml(list, sel)}`;
}
function annToolHint(st, sel) {
  if (st.tool === 'joueur') {
    const f = st.follow && annById(st.follow);
    return `<div class="ann-row ann-hint"><span>${f ? '<b>Joueur ' + esc(String(f.label || f.n)) + '</b> sélectionné : avance la vidéo, puis touche sa nouvelle position.' : 'Touche la position d’un joueur sur la vidéo (sur pause). <span class="muted">Rouge = défense · bleu = attaque.</span>'}</span><span class="grow"></span>
      <button class="btn small" type="button" data-ann="step:-0.5">−0,5 s</button><button class="btn small" type="button" data-ann="step:0.5">+0,5 s</button><button class="btn small" type="button" data-ann="step:1">+1 s</button>${f ? '<button class="btn small primary" type="button" data-ann="newp:1">+ Nouveau joueur</button>' : ''}</div>`;
  }
  if (st.tool === 'espace') {
    const p = st.pair && annById(st.pair);
    return `<div class="ann-row ann-hint"><span>${p ? 'Joueur ' + esc(String(p.label || p.n)) + ' choisi : touche <b>le 2e joueur</b>.' : 'Touche <b>2 points joueurs</b> pour créer l’espace entre eux. <span class="muted">Pose d’abord les joueurs avec l’outil « Joueur ».</span>'}</span></div>`;
  }
  return sel ? '' : '<div class="ann-row ann-hint"><span>Glisse sur la vidéo pour dessiner.</span></div>';
}
function annFriseHtml(list, sel) {
  if (!list.length) return '';
  const v = V(), t = v.currentTime || 0, sq = (sel && sel.sid && seqList().find(p => p.id === sel.sid)) || annSeqAt(t);
  let ra, rb; if (sq) { const w = seqWin(sq); ra = w.a; rb = w.b; } else { ra = Math.max(0, t - 10); rb = t + 20; }
  let items = list.filter(a => a.t1 >= ra && a.t0 <= rb); if (sel && !items.includes(sel)) items.push(sel);
  items.forEach(a => { ra = Math.min(ra, a.t0); rb = Math.max(rb, a.t1); });
  rb = Math.min(rb, v.duration || rb); ra = Math.max(0, ra); if (rb - ra < 4) rb = ra + 4;
  items.sort((x, y) => x.t0 - y.t0);
  const pc = x => ((x - ra) / (rb - ra) * 100).toFixed(2);
  return `<div class="ann-l" style="margin-top:6px">Frise des dessins <span class="muted">· touche une barre pour la choisir, tire ses bords pour régler apparition / disparition</span></div>
    <div class="frise" id="annfr" data-a="${ra}" data-b="${rb}"><div class="fr-ph" id="annph"></div>
    ${items.map(a => `<div class="fr-row" data-t="1"><div class="fr-bar ${a === sel ? 'sel' : ''}" data-id="${a.id}" style="left:${pc(a.t0)}%;width:${Math.max(1.5, pc(a.t1) - pc(a.t0))}%;background:${a.col}"><i class="fr-h l" data-h="l"></i><span>${a.freeze ? '⏸ ' : ''}${esc(annName(a))}</span><i class="fr-h r" data-h="r"></i></div></div>`).join('')}
    <div class="fr-ax"><span>${fmt(ra)}</span><span>${fmt(rb)}</span></div></div>`;
}
function annSet(on) {
  const st = A(); st.on = !!on; st.sel = null;
  if (on && S.fs) setFs(false);
  if (on) { if (!S.videoReady) { toast('Choisis d’abord la vidéo.'); st.on = false; return; } V().pause(); }
  renderAnnTools();
}
function annSave() { S.m.updated = Date.now(); saveMatch(); try { renderBanner(); renderJournal(); } catch (e) { } }
function annExportPNG() {
  const v = V(); if (!S.videoReady) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d'); g.drawImage(v, 0, 0, c.width, c.height);
  annOrdered().forEach(a => annDraw(g, a, v.currentTime, { x: 0, y: 0, w: c.width, h: c.height }, 0, false));
  c.toBlob(bl => { const u = URL.createObjectURL(bl), el = document.createElement('a'); el.href = u; el.download = slug((S.m.date || '') + '-' + S.m.adversaire + '-' + fmtL(v.currentTime).replace(/:/g, '')) + '.png'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png');
}
function annNorm(cv, e) { const r = cv.getBoundingClientRect(), R = annRect(cv); return { x: (e.clientX - r.left - R.x) / R.w, y: (e.clientY - r.top - R.y) / R.h }; }
function annHitPlayer(p, t) {
  const R = annRect(document.getElementById('annc')), asp = R.h / R.w, list = annList();
  for (let i = list.length - 1; i >= 0; i--) { const a = list[i]; if (a.type !== 'joueur' || t < a.t0 || t > a.t1) continue; const s = pjPos(a, t); if (Math.hypot(p.x - s.x, (p.y - s.y) * asp) < .03) return a; }
  return null;
}
function annHit(p, t) {
  const hp = annHitPlayer(p, t); if (hp) return hp;
  const R = annRect(document.getElementById('annc')), asp = R.h / R.w, list = annList();
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]; if (t < a.t0 || t > a.t1 || a.type === 'joueur') continue;
    if (a.type === 'espace') {
      const P = annById(a.p1), Q = annById(a.p2); if (!P || !Q) continue; const s1 = pjPos(P, t), s2 = pjPos(Q, t);
      const dx = s2.x - s1.x, dy = (s2.y - s1.y) * asp, d = Math.hypot(dx, dy) || 1e-9, mx = (s1.x + s2.x) / 2, my = (s1.y + s2.y) / 2, ux = dx / d, uy = dy / d, qx = p.x - mx, qy = (p.y - my) * asp;
      const lx = qx * ux + qy * uy, ly = -qx * uy + qy * ux, ra = d / 2, rb = Math.max(ra * .45, .02);
      if ((lx * lx) / (ra * ra) + (ly * ly) / (rb * rb) <= 1.1) return a; continue;
    }
    const s = annGeo(a, t);
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
  if (k === 'tool') { st.tool = val; st.sel = null; st.pair = null; if (val !== 'joueur') st.follow = null; } else if (k === 'col') { st.col = val; if (st.sel) { annPush(); st.sel.col = val; annSave(); } }
  else if (k === 'anim') { st.anim = val; if (st.sel) { annPush(); st.sel.anim = val; annSave(); } }
  else if (k === 'dur') { st.dur = Number(val); if (st.sel) { annPush(); st.sel.t1 = st.sel.type === 'joueur' ? st.sel.kf[st.sel.kf.length - 1].t + st.dur : st.sel.t0 + st.dur; annSave(); } }
  else if (k === 'step') { const v = V(); v.pause(); v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + Number(val))); setTimeout(renderAnnTools, 60); return; }
  else if (k === 'newp') { st.follow = null; st.sel = null; }
  else if (k === 'delkf' && st.sel && st.sel.type === 'joueur' && st.sel.kf.length > 1) { annPush(); const t = V().currentTime; let bi = 0; st.sel.kf.forEach((q, i) => { if (Math.abs(q.t - t) < Math.abs(st.sel.kf[bi].t - t)) bi = i; }); st.sel.kf.splice(bi, 1); st.sel.t0 = Math.min(st.sel.t0, st.sel.kf[0].t); annSave(); }
  else if (k === 'frz') { const f = val === 'manual' ? 'manual' : Number(val); st.freeze = f; if (st.sel) { annPush(); st.sel.freeze = f; annFired.delete(st.sel.id); annSave(); } }
  else if (k === 'undo') { annUndo(); return; }
  else if (k === 'dup' && st.sel) {
    annPush(); const o = st.sel, d = JSON.parse(JSON.stringify(o)); d.id = uid(); const len = Math.max(1, o.t1 - o.t0);
    d.a = JSON.parse(JSON.stringify(o.b || o.a)); delete d.b; d.t0 = o.t1; d.t1 = Math.min(d.t0 + len, V().duration || d.t0 + len);
    S.m.ann = annList().concat([d]); st.sel = d; annSave(); V().pause(); V().currentTime = d.t0; toast('Copie créée à l’instant suivant. Modifie-la (déplace, change l’outil ou la couleur).', 3500);
  }
  else if (k === 'off') { annSet(false); return; }
  else if (k === 'png') { annExportPNG(); return; }
  else if (k === 'pick') { const a = annList().find(x => x.id === val); if (a) { st.sel = a; V().pause(); V().currentTime = a.t0 + .02; } }
  else if (k === 'del' && st.sel) { annPush(); const gone = st.sel; S.m.ann = annList().filter(x => x !== gone && !(x.type === 'espace' && (x.p1 === gone.id || x.p2 === gone.id))); st.sel = null; if (st.follow === gone.id) st.follow = null; annSave(); }
  else if (k === 'end' && st.sel) {
    annPush(); if (val === '1') { if (!st.sel.b) st.sel.b = JSON.parse(JSON.stringify(st.sel.a)); toast('Déplace le dessin à sa position de fin (la vidéo doit être plus loin dans le temps).', 3500); }
    else delete st.sel.b; annSave();
  }
  else if (k === 'label' && st.sel) { const s = prompt('Texte affiché avec le dessin (vide = aucun) :', st.sel.label || ''); if (s !== null) { annPush(); st.sel.label = s.trim(); annSave(); } }
  renderAnnTools();
});

/* retouche d'un joueur existant : on déplace sa position clé la plus proche, ou on en crée une à cet instant */
function annPlayerGrab(st, h, p, t) {
  st.sel = h; st.follow = h.id; st.pair = null;
  const snap = JSON.stringify(annList());
  let kf = h.kf.find(k => Math.abs(k.t - t) < .25);
  if (!kf && t >= h.kf[0].t && t <= h.kf[h.kf.length - 1].t) { const s = pjPos(h, t); kf = { t, x: s.x, y: s.y }; h.kf.push(kf); h.kf.sort((a, b) => a.t - b.t); }
  if (kf) annMove = { snap, a: h, kf, p0: p, o: { x: kf.x, y: kf.y } };
}
/* outils « Joueur » et « Espace » : renvoie vrai si le toucher a été traité */
function annPlayerTap(st, p, t) {
  const hit = annHitPlayer(p, t);
  if (st.tool === 'espace') {
    if (!hit) { st.pair = null; return false; }
    if (!st.pair || st.pair === hit.id) { st.pair = hit.id; toast('Touche maintenant le 2e joueur.', 2500); return true; }
    const P = annById(st.pair); st.pair = null; if (!P) return true;
    annPush(); let t0 = Math.max(P.t0, hit.t0), t1 = Math.min(P.t1, hit.t1); if (t1 - t0 < 1) { t0 = t; t1 = Math.min(t + st.dur, V().duration || t + st.dur); }
    const a = { id: uid(), sid: (annSeqAt(t) || {}).id || null, type: 'espace', p1: P.id, p2: hit.id, col: st.col, anim: st.anim === 'trace' ? 'clignote' : st.anim, t0, t1 };
    if (st.freeze) a.freeze = st.freeze; S.m.ann = annList().concat([a]); st.sel = a; annFired.add(a.id); annSave(); toast('Espace créé. Lance la lecture pour le voir bouger avec les joueurs.', 3500); return true;
  }
  if (hit) return false; /* retouche d'un joueur : gérée par le cas général */
  const snap = JSON.stringify(annList()), f = st.follow && annById(st.follow);
  if (f) {
    let kf = f.kf.find(k => Math.abs(k.t - t) < .12);
    if (kf) { kf.x = p.x; kf.y = p.y; } else { kf = { t, x: p.x, y: p.y }; f.kf.push(kf); f.kf.sort((a, b) => a.t - b.t); }
    f.t0 = Math.min(f.t0, f.kf[0].t); f.t1 = Math.max(f.t1, f.kf[f.kf.length - 1].t + st.dur); st.sel = f;
    annMove = { snap, a: f, kf, p0: p, o: { x: kf.x, y: kf.y } };
  } else {
    const sid = (annSeqAt(t) || {}).id || null, n = annList().filter(x => x.type === 'joueur' && x.sid === sid && x.col === st.col).length + 1;
    const a = { id: uid(), sid, type: 'joueur', col: st.col, anim: st.anim === 'trace' ? 'fixe' : st.anim, t0: t, t1: Math.min(t + st.dur, V().duration || t + st.dur), n: String(n), kf: [{ t, x: p.x, y: p.y }], freeze: 0 };
    S.m.ann = annList().concat([a]); st.sel = a; st.follow = a.id;
    annMove = { snap, a, kf: a.kf[0], p0: p, o: { x: p.x, y: p.y } };
  }
  return true;
}
function annInit() {
  const cv = document.getElementById('annc'); if (!cv) return;
  cv.addEventListener('pointerdown', e => {
    const st = A(); if (!st.on) return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const p = annNorm(cv, e), v = V(), t = v.currentTime;
    if (st.tool === 'joueur' || st.tool === 'espace') { if (annPlayerTap(st, p, t)) { renderAnnTools(); return; } }
    const h = annHit(p, t);
    if (h && h.type === 'joueur') { annPlayerGrab(st, h, p, t); renderAnnTools(); return; }
    if (h && h.type === 'espace') { st.sel = h; renderAnnTools(); return; }
    if (h) { st.sel = h; const geo = annGeo(h, t); annMove = { snap: JSON.stringify(annList()), a: h, p0: p, o: JSON.parse(JSON.stringify(h.b && t > (h.t0 + h.t1) / 2 ? h.b : h.a)), toEnd: !!(h.b && t > (h.t0 + h.t1) / 2) }; renderAnnTools(); return; }
    st.sel = null; const r = cv.getBoundingClientRect();
    if (st.tool === 'joueur' || st.tool === 'espace') { renderAnnTools(); return; }
    annDrag = { x0: e.clientX - r.left, y0: e.clientY - r.top, x: e.clientX - r.left, y: e.clientY - r.top, p0: p }; renderAnnTools();
  });
  cv.addEventListener('pointermove', e => {
    if (annMove && annMove.kf) { const p = annNorm(cv, e), m = annMove; m.kf.x = m.o.x + p.x - m.p0.x; m.kf.y = m.o.y + p.y - m.p0.y; return; }
    if (annMove) { const p = annNorm(cv, e), m = annMove, tgt = m.toEnd ? m.a.b : m.a.a, dx = p.x - m.p0.x, dy = p.y - m.p0.y; tgt.x = m.o.x + dx; tgt.y = m.o.y + dy; if (tgt.x2 !== undefined) { tgt.x2 = m.o.x2 + dx; tgt.y2 = m.o.y2 + dy; } return; }
    if (annDrag) { const r = cv.getBoundingClientRect(); annDrag.x = e.clientX - r.left; annDrag.y = e.clientY - r.top; }
  });
  const up = e => {
    if (annMove) { const m = annMove; annMove = null; if (JSON.stringify(annList()) !== m.snap) { A().undo.push(m.snap); if (A().undo.length > 30) A().undo.shift(); annSave(); } renderAnnTools(); return; }
    if (!annDrag) return; const d = annDrag; annDrag = null; const st = A(), p = annNorm(cv, e), R = annRect(cv), t = V().currentTime;
    const len = Math.hypot(p.x - d.p0.x, (p.y - d.p0.y) * R.h / R.w);
    const a = { id: uid(), sid: (annSeqAt(t) || {}).id || null, type: st.tool, col: st.col, anim: st.anim, t0: t, t1: Math.min(t + st.dur, V().duration || t + st.dur) };
    if (st.tool === 'circle' || st.tool === 'spot') a.a = { x: d.p0.x, y: d.p0.y, r: Math.max(.03, Math.hypot(p.x - d.p0.x, (p.y - d.p0.y) * R.h / R.w)) };
    else { if (len < .02) { renderAnnTools(); return; } a.a = { x: d.p0.x, y: d.p0.y, x2: p.x, y2: p.y }; }
    annPush(); if (st.freeze) a.freeze = st.freeze; S.m.ann = annList().concat([a]); st.sel = a; annFired.add(a.id); annSave(); renderAnnTools();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { annMove = null; annDrag = null; });
  const box = document.getElementById('anntools');
  box.addEventListener('pointerdown', e => {
    const bar = e.target.closest('.fr-bar'), fr = document.getElementById('annfr');
    if (!fr) return;
    const rowEl = fr.querySelector('.fr-row'), W = rowEl ? rowEl.clientWidth : 1, ra = Number(fr.dataset.a), rb = Number(fr.dataset.b);
    if (!bar) { const row = e.target.closest('.fr-row'); if (row) { const r = row.getBoundingClientRect(); V().pause(); V().currentTime = ra + (e.clientX - r.left) / r.width * (rb - ra); } return; }
    const a = annList().find(x => x.id === bar.dataset.id); if (!a) return; e.preventDefault();
    const h = e.target.dataset && e.target.dataset.h;
    annFr = { a, bar, h: h || 'm', x0: e.clientX, t0: a.t0, t1: a.t1, kf0: a.kf ? JSON.parse(JSON.stringify(a.kf)) : null, W, ra, rb, span: rb - ra, snap: JSON.stringify(annList()), moved: false };
  });
  document.addEventListener('pointermove', e => {
    if (!annFr) return; const f = annFr, dt = (e.clientX - f.x0) / f.W * f.span; if (Math.abs(e.clientX - f.x0) > 3) f.moved = true; if (!f.moved) return;
    const dur = V().duration || f.rb;
    if (f.h === 'm') { const len = f.t1 - f.t0; f.a.t0 = Math.max(0, Math.min(dur - len, f.t0 + dt)); f.a.t1 = f.a.t0 + len; if (f.kf0) f.a.kf = f.kf0.map(k => ({ t: k.t + (f.a.t0 - f.t0), x: k.x, y: k.y })); }
    else if (f.h === 'l') f.a.t0 = Math.max(0, Math.min(f.t1 - .5, f.t0 + dt));
    else f.a.t1 = Math.min(dur, Math.max(f.t0 + .5, f.t1 + dt));
    const pc = x => ((x - f.ra) / f.span * 100); f.bar.style.left = pc(f.a.t0) + '%'; f.bar.style.width = Math.max(1.5, pc(f.a.t1) - pc(f.a.t0)) + '%';
  });
  const frUp = () => {
    if (!annFr) return; const f = annFr; annFr = null; const st = A();
    if (f.moved) { if (JSON.stringify(annList()) !== f.snap) { st.undo.push(f.snap); annFired.delete(f.a.id); annSave(); } }
    else { st.sel = f.a; V().pause(); V().currentTime = f.a.t0 + .02; }
    renderAnnTools();
  };
  document.addEventListener('pointerup', frUp); document.addEventListener('pointercancel', frUp);
  requestAnimationFrame(annFrame);
}
document.addEventListener('DOMContentLoaded', annInit);
document.addEventListener('keydown', e => {
  if (!(S.ann && S.ann.on)) return;
  if (e.key === 'Escape') annSet(false);
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); annUndo(); }
});
