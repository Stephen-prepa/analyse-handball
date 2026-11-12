'use strict';
/* Tailles réglables des panneaux (poignées) + glisser-déposer des listes de Réglages */
const Layout = (() => {
  const KEY = 'hb-layout';
  let L = {};
  try { L = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { L = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { } };
  const M = () => document.getElementById('match');
  const apply = () => {
    const m = M(); if (!m) return;
    ['rw', 'fw'].forEach(k => L[k] ? m.style.setProperty('--' + k, L[k] + 'px') : m.style.removeProperty('--' + k));
    L.vh ? m.style.setProperty('--vh', L.vh + 'px') : m.style.removeProperty('--vh');
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reset = () => { L = {}; save(); apply(); };

  function drag(handle, move) {
    let t0 = 0;
    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); handle.setPointerCapture(e.pointerId); handle.classList.add('drag'); document.body.classList.add('dragging');
    });
    handle.addEventListener('pointermove', e => { if (handle.hasPointerCapture(e.pointerId)) move(e); });
    const end = e => { handle.classList.remove('drag'); document.body.classList.remove('dragging'); save(); };
    handle.addEventListener('pointerup', e => {
      end(e);
      const n = Date.now(); if (n - t0 < 400) { reset(); } t0 = n;     /* double-appui */
    });
    handle.addEventListener('pointercancel', end);
  }
  function init() {
    apply();
    const h = document.getElementById('hsplit'), v = document.getElementById('vsplit');
    if (h) drag(h, e => {
      const m = M(), r = m.getBoundingClientRect(), fs = m.classList.contains('fs');
      const w = Math.round(clamp(r.right - e.clientX, fs ? 200 : 260, Math.min(fs ? 520 : 720, r.width * .6)));
      L[fs ? 'fw' : 'rw'] = w; m.style.setProperty(fs ? '--fw' : '--rw', w + 'px');
    });
    if (v) drag(v, e => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const hh = Math.round(clamp(e.clientY - st.top, 110, window.innerHeight * .7));
      L.vh = hh; M().style.setProperty('--vh', hh + 'px');
    });
  }

  /* glisser-déposer des lignes de listes (Réglages) */
  let dr = null;
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest && e.target.closest('[data-grip]'); if (!g) return;
    e.preventDefault();
    const row = g.closest('.list-row'); if (!row) return;
    dr = { list: g.dataset.grip, from: Number(g.dataset.i), row, to: Number(g.dataset.i), pos: 'before', el: g };
    g.setPointerCapture(e.pointerId); row.classList.add('dragging'); document.body.classList.add('dragging');
  });
  document.addEventListener('pointermove', e => {
    if (!dr) return;
    const rows = [...dr.row.parentElement.querySelectorAll('.list-row[data-rowlist="' + dr.list + '"]')];
    rows.forEach(r => r.classList.remove('drop-before', 'drop-after'));
    let best = null;
    for (const r of rows) { const b = r.getBoundingClientRect(); if (e.clientY >= b.top && e.clientY <= b.bottom) best = r; }
    if (!best) best = e.clientY < rows[0].getBoundingClientRect().top ? rows[0] : rows[rows.length - 1];
    const b = best.getBoundingClientRect();
    dr.to = Number(best.dataset.rowi); dr.pos = e.clientY < b.top + b.height / 2 ? 'before' : 'after';
    best.classList.add(dr.pos === 'before' ? 'drop-before' : 'drop-after');
  });
  const fin = e => {
    if (!dr) return;
    const d = dr; dr = null;
    document.body.classList.remove('dragging'); d.row.classList.remove('dragging');
    document.querySelectorAll('.drop-before,.drop-after').forEach(r => r.classList.remove('drop-before', 'drop-after'));
    if (e.type === 'pointercancel') return;
    let idx = d.to + (d.pos === 'after' ? 1 : 0);
    const arr = S.settings[d.list]; if (!arr) return;
    const [it] = arr.splice(d.from, 1);
    if (idx > d.from) idx--;
    arr.splice(idx, 0, it);
    if (idx !== d.from) { saveSettings(); }
    renderSettings();
  };
  document.addEventListener('pointerup', fin);
  document.addEventListener('pointercancel', fin);

  return { init, reset, apply };
})();
document.addEventListener('DOMContentLoaded', Layout.init);
