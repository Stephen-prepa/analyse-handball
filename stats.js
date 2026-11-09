'use strict';
/* Étape 2 : statistiques et filtres (par match, combinaison, enclenchement, joueur…) */

function statsMatches() { return S.sf.match === 'all' ? S.matches : S.matches.filter(m => m.id === S.sf.match); }

function statsPoss(ms) {
  const st = S.settings, f = S.sf, out = [];
  ms.forEach(m => m.possessions.forEach(p => {
    const ph = byId(st.phases, p.phase), j = byId(st.jeux, p.jeu);
    const side = (ph && ph.side) || p.side || '', kind = (j && j.kind) || p.jeuKind || '';
    if (f.side && side !== f.side) return;
    if (f.kind && kind !== f.kind) return;
    if (f.jeu && p.jeu !== f.jeu) return;
    if (f.issue && p.issue !== f.issue) return;
    if (f.real && p.real !== f.real) return;
    if (f.player && !m.tags.some(t => t.poss === p.id && t.playerId === f.player)) return;
    out.push({ m, p, side, kind });
  }));
  return out;
}

const pc = (n, d) => d ? Math.round(n / d * 100) + ' %' : '—';

function renderStats() {
  const st = S.settings, f = S.sf, ms = statsMatches();
  if (f.match !== 'all' && !S.matches.some(m => m.id === f.match)) f.match = 'all';
  const poss = statsPoss(ms);
  const possActive = !!(f.side || f.kind || f.jeu || f.issue || f.real);
  const okPoss = new Set(poss.map(x => x.p.id));

  /* par jeu */
  const groups = new Map();
  poss.forEach(x => {
    const key = x.p.jeu, g = groups.get(key) || { label: lab(st.jeux, x.p.jeu, x.p.jeuLabel), kind: x.kind, side: x.side, n: 0, buts: 0, done: 0, withReal: 0 };
    g.n++;
    if (x.side === 'defense' ? x.p.issue === 'but-enc' : x.p.issue === 'but') g.buts++;
    if (x.p.real) { g.withReal++; if (x.p.real === 'complete') g.done++; }
    groups.set(key, g);
  });
  const jeuRows = [...groups.values()].sort((a, b) => b.n - a.n);

  /* issues et causes */
  const cnt = (arr, fn) => { const m = new Map(); arr.forEach(x => { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const issues = cnt(poss, x => lab(st.issues, x.p.issue, x.p.issueLabel));
  const causes = cnt(poss, x => x.p.cause ? lab(st.causes, x.p.cause, x.p.causeLabel) : '');

  /* actions par joueur */
  const tags = [];
  ms.forEach(m => m.tags.forEach(t => {
    if (possActive && !(t.poss && okPoss.has(t.poss))) return;
    if (f.player && t.playerId !== f.player) return;
    tags.push({ m, t });
  }));
  const actIds = [...new Set(tags.map(x => x.t.actionId))];
  const actLabel = id => lab(st.actions, id, (tags.find(x => x.t.actionId === id) || { t: {} }).t.actionLabel);
  const players = new Map();
  tags.forEach(({ t }) => {
    const r = S.roster.find(z => z.id === t.playerId);
    const key = t.playerId, nm = (r && r.name) || t.pname || '?', num = t.pnum || (r && r.num) || '';
    const o = players.get(key) || { name: nm, num, c: {}, total: 0 };
    o.c[t.actionId] = (o.c[t.actionId] || 0) + 1; o.total++; players.set(key, o);
  });
  const playerRows = [...players.values()].sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));

  /* listes de filtres */
  const allPlayers = new Map();
  S.matches.forEach(m => m.tags.forEach(t => { if (!allPlayers.has(t.playerId)) { const r = S.roster.find(z => z.id === t.playerId); allPlayers.set(t.playerId, (r && r.name) || t.pname || '?'); } }));
  const sel = (key, label, opts) => `<label class="sf"><span>${label}</span><select data-sf="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(f[key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const tbl = (head, rows) => rows.length ? `<div class="tw"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="hint">Rien à afficher avec ces filtres.</p>';

  $('#stats').innerHTML = `<div class="page wide">
    <div class="card"><div class="card-h"><h2>Filtres</h2><button class="btn small" type="button" data-act="sfreset">Tout afficher</button></div>
      <div class="sfgrid">
        ${sel('match', 'Match', [['all', 'Tous les matchs'], ...[...S.matches].sort((a, b) => b.date.localeCompare(a.date)).map(m => [m.id, fmtD(m.date) + ' · ' + m.adversaire])])}
        ${sel('side', 'Côté', [['', 'Attaque + défense'], ['attaque', 'Attaque'], ['defense', 'Défense']])}
        ${sel('kind', 'Type de jeu', [['', 'Tous'], ...Object.entries(KINDS)])}
        ${sel('jeu', 'Jeu précis', [['', 'Tous'], ...st.jeux.map(j => [j.id, j.label])])}
        ${sel('issue', 'Issue', [['', 'Toutes'], ...st.issues.map(i => [i.id, i.label])])}
        ${sel('real', 'Jeu réalisé ?', [['', 'Tous'], ...st.realisations.map(i => [i.id, i.label])])}
        ${sel('player', 'Joueur', [['', 'Tous'], ...[...allPlayers.entries()].map(([id, n]) => [id, n])])}
      </div>
      <p class="hint">${ms.length} match${ms.length > 1 ? 's' : ''} · ${poss.length} possession${poss.length > 1 ? 's' : ''} · ${tags.length} action${tags.length > 1 ? 's' : ''} correspondantes. ${f.player ? 'Filtre joueur : possessions où ce joueur a une action saisie.' : ''}</p>
      <div class="btnrow"><button class="btn" type="button" data-act="csvsel" ${ms.length ? '' : 'disabled'}>Exporter ces matchs en CSV</button></div>
    </div>
    <div class="card"><div class="card-h"><h2>Possessions par jeu</h2></div>
      ${tbl(['Jeu', 'Type', 'Poss.', 'Buts*', '% buts', 'Jouée jusqu’au bout'], jeuRows.map(g => [esc(g.label), esc(KINDS[g.kind] || '—') + (g.side === 'defense' ? ' · déf.' : ''), g.n, g.buts, pc(g.buts, g.n), pc(g.done, g.withReal)]))}
      <p class="hint">* En attaque : buts marqués. En défense : buts encaissés. « Jouée jusqu’au bout » est calculé sur les possessions où tu as renseigné « Jeu réalisé ? ».</p></div>
    <div class="card"><div class="card-h"><h2>Issues</h2></div>${tbl(['Issue', 'Nombre', '%'], issues.map(([l, n]) => [esc(l), n, pc(n, poss.length)]))}</div>
    <div class="card"><div class="card-h"><h2>Causes d’échec</h2></div>${tbl(['Cause', 'Nombre', '%'], causes.map(([l, n]) => [esc(l), n, pc(n, poss.length)]))}</div>
    <div class="card"><div class="card-h"><h2>Actions par joueur</h2></div>
      ${tbl(['Joueur', ...actIds.map(a => esc(actLabel(a))), 'Total'], playerRows.map(p => [esc((p.num ? p.num + ' ' : '') + p.name), ...actIds.map(a => p.c[a] || ''), p.total]))}
      ${possActive ? '<p class="hint">Filtres de possession actifs : seules les actions rattachées à ces possessions sont comptées.</p>' : ''}</div>
  </div>`;
}
