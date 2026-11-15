'use strict';
/* Page d'accueil : reprise, matchs, matchs à venir, dernières séquences */
const mStatus = m => m.done ? 'done' : (!m.marks.length && !m.possessions.length && !m.tags.length) ? 'new' : 'run';
const mIncomplete = m => m.possessions.filter(p => p.inc).length;
const sizeTxt = n => !n ? '' : n > 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' Go' : Math.round(n / 1e6) + ' Mo';
const BADGE = { done: ['Terminé', 'b-ok'], run: ['En cours', 'b-run'], new: ['À commencer', 'b-new'] };
const lastOf = m => m.possessions.length ? m.possessions.reduce((a, b) => (b.start > a.start ? b : a)) : null;
const gtxt = (m, t) => { const g = gameInfo(m, t); return g ? 'P' + g.period + ' · ' + fmt(g.t) : fmtL(t); };
const ago = ts => { if (!ts) return ''; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? 'à l’instant' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : s < 86400 ? 'il y a ' + Math.round(s / 3600) + ' h' : 'il y a ' + Math.round(s / 86400) + ' j'; };

function vidLine(m) {
  const n = m.videoName ? esc(m.videoName) + (m.videoSize ? ' · ' + sizeTxt(m.videoSize) : '') : 'Pas de vidéo choisie';
  return `<div class="vid"><span class="dot" style="background:${m.videoName ? 'var(--green)' : 'var(--muted)'}"></span>${n}${m.videoNote ? ' · 📁 ' + esc(m.videoNote) : ''}</div>`;
}

function renderHome() {
  const ms = [...S.matches].sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created));
  const analysed = ms.filter(m => m.possessions.length);
  const nSeq = ms.reduce((a, m) => a + m.possessions.length, 0), nInc = ms.reduce((a, m) => a + mIncomplete(m), 0);
  const last = [...S.matches].filter(m => m.opened).sort((a, b) => b.opened - a.opened)[0];
  const sync = Cloud.session ? (Cloud.state && Cloud.state.last ? 'synchronisé ' + ago(Cloud.state.last) : 'connecté') : 'non connecté';

  const resume = last ? (() => {
    const st = mStatus(last), inc = mIncomplete(last), np = periodsOf(last) * 2, nm = last.marks.filter(x => /^p\d[se]$/.test(x.type)).length;
    const lp = lastOf(last);
    return `<p class="sect">Reprendre là où tu t’es arrêté</p>
    <div class="card resume">
      <div class="row"><h3>HBCCS vs ${esc(last.adversaire)}</h3><span class="badge ${BADGE[st][1]}">${BADGE[st][0]}</span></div>
      <div class="muted">${fmtD(last.date)}${lp ? ' · dernière séquence : ' + gtxt(last, lp.start) : ' · aucune séquence'}</div>
      <div class="bar"><i style="width:${Math.min(100, Math.round(nm / np * 100))}%"></i></div>
      <div class="row muted" style="font-size:13px"><span>Repères : ${nm} sur ${np}</span><span>·</span><span>${last.possessions.length} séquences</span>${inc ? `<span>·</span><span style="color:var(--accent)">${inc} à compléter</span>` : ''}</div>
      ${vidLine(last)}
      <div class="row" style="margin-top:12px"><button class="btn primary" type="button" data-act="openmatch" data-id="${last.id}">Reprendre</button><button class="btn" type="button" data-act="stats">Statistiques</button></div>
    </div>`;
  })() : '';

  const cards = ms.map(m => {
    const st = mStatus(m), inc = mIncomplete(m);
    return `<div class="match"><div><h4>HBCCS vs ${esc(m.adversaire)} <span class="badge ${BADGE[st][1]}">${BADGE[st][0]}</span></h4>
      <div class="muted" style="font-size:14px">${fmtD(m.date)}${m.score && m.score[0] != null ? ' · ' + m.score[0] + '-' + m.score[1] : ''} · ${m.possessions.length ? m.possessions.length + ' séquences' : 'aucune séquence'}${inc ? ` · <span style="color:var(--accent)">${inc} à compléter</span>` : ''}</div>
      ${vidLine(m)}</div>
      <div class="row"><button class="btn" type="button" data-act="openmatch" data-id="${m.id}">Ouvrir</button><button class="btn more" type="button" data-act="matchinfo" data-id="${m.id}" aria-label="Détails du match">⋯</button></div></div>`;
  }).join('');

  const seqs = [];
  S.matches.forEach(m => m.possessions.forEach(p => seqs.push({ m, p })));
  seqs.sort((a, b) => (b.p.wall || b.m.updated || 0) - (a.p.wall || a.m.updated || 0));
  const tagOf = p => {
    if (p.inc) return '<span class="tag t-inc">À compléter</span>';
    const r = p.issue ? lab(S.settings.issues, p.issue, p.issueLabel) : '';
    return r ? `<span class="tag ${p.issue === 'but' ? 't-but' : p.issue === 'but-enc' ? 't-enc' : 't-no'}">${esc(r)}</span>` : '';
  };
  const seqHtml = seqs.slice(0, 8).map(({ m, p }) => `<button class="seq" type="button" data-act="homeseq" data-m="${m.id}" data-id="${p.id}">
      <span class="sw" style="background:${catColor(p.phase, p.phaseColor)}"></span>
      <div class="si"><b>${esc(seqTitle(p))}</b><div class="m">${esc(m.adversaire)} · ${gtxt(m, p.start)}${p.pnum || p.pname ? ' · ' + esc(p.pnum ? '#' + p.pnum + (p.pname ? ' ' + p.pname : '') : p.pname) : ''}</div></div>
      ${tagOf(p)}<span class="go">›</span></button>`).join('');

  $('#home').innerHTML = `<div class="page">
    <div class="hero"><div><div class="sub">Saison ${seasonLabel()} · HBCCS</div><h2>Analyse vidéo</h2></div><span class="grow"></span>
      <button class="btn primary" type="button" data-act="pickmatch">Choisir un match</button>
      <button class="btn" type="button" data-act="newmatch">Nouveau match (saisie libre)</button></div>
    <div class="kpis">
      <div class="kpi"><b>${analysed.length}</b><span>matchs analysés</span></div>
      <div class="kpi"><b>${nSeq}</b><span>séquences marquées</span></div>
      <div class="kpi ${nInc ? 'warn' : ''}"><b>${nInc}</b><span>séquences à compléter</span></div>
      <div class="kpi"><b style="font-size:20px">${sync}</b><span>${Cloud.session ? 'sauvegarde en ligne' : 'Réglages → Connexion'}</span></div>
    </div>
    <div class="grid">
      <div>
        ${resume}
        <p class="sect">Matchs analysés</p>
        <div class="card">${cards || '<p class="muted" style="margin:0">Aucun match pour l’instant. Choisis-en un ci-dessus pour commencer.</p>'}</div>
        <div id="home-up"></div>
      </div>
      <div>
        <p class="sect">Dernières séquences</p>
        <div class="card">${seqHtml || '<p class="muted" style="margin:0">Les séquences que tu marques apparaîtront ici.</p>'}
          ${seqs.length ? '<button class="btn" style="width:100%;margin-top:8px" type="button" data-act="stats">Voir les statistiques</button>' : ''}</div>
        <p class="sect">Accès rapides</p>
        <div class="card"><div class="quick">
          <button class="btn" type="button" data-act="stats"><b>Statistiques</b><small>tous les matchs</small></button>
          <button class="btn" type="button" data-act="roster"><b>Effectif</b><small>${S.roster.length} joueur${S.roster.length > 1 ? 's' : ''}</small></button>
          <button class="btn" type="button" data-act="settings"><b>Réglages</b><small>catégories, touches, périodes</small></button>
          <button class="btn" type="button" data-act="backup"><b>Sauvegarder</b><small>fichier de secours</small></button>
        </div>
        <div class="sync"><span class="dot" style="background:${Cloud.session ? 'var(--green)' : 'var(--muted)'}"></span>${Cloud.session ? 'Connecté · ' + sync : 'Non connecté : connecte-toi dans Réglages pour récupérer matchs et effectifs.'}</div></div>
        <p class="hint">Les vidéos restent sur l’appareil. Utilise « Sauvegarder » régulièrement.</p>
      </div>
    </div>
  </div>`;
  renderUpcoming();
}

const seasonLabel = () => { const d = new Date(), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return y + '-' + String(y + 1).slice(2); };

/* matchs à venir : issus de ton application, si connecté (ou dernière liste enregistrée) */
async function renderUpcoming() {
  const box = document.getElementById('home-up'); if (!box) return;
  let rows = S.cloudRows;
  if (!rows) { const c = await Cloud.cachedMatches().catch(() => null); rows = c && c.rows; if (rows) S.cloudRows = rows; }
  if (Cloud.session && navigator.onLine && !S.upTried) { S.upTried = true; try { rows = await Cloud.listMatches(); S.cloudRows = rows; } catch (e) { } }
  if (!rows || !rows.length || S.view !== 'home') return;
  const lastEq = [...S.matches].sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created))[0];
  const eq = lastEq && lastEq.equipe;
  const now = Date.now() - 3 * 3600e3;
  const up = rows.filter(r => r.debut && new Date(r.debut).getTime() > now && !S.matches.some(m => m.matchId === r.id) && (!eq || String(r.equipe) === String(eq)))
    .sort((a, b) => new Date(a.debut) - new Date(b.debut)).slice(0, 3);
  if (!up.length) return;
  const fmtUp = r => { const d = new Date(r.debut), o = { timeZone: 'Europe/Paris' };
    return d.toLocaleDateString('fr-FR', { ...o, weekday: 'short', day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('fr-FR', { ...o, hour: '2-digit', minute: '2-digit' }); };
  box.innerHTML = `<p class="sect">Matchs à venir</p><div class="card">${up.map(r => { const t = parseTitre(r.titre);
    return `<div class="up"><div><b>${t.home ? 'HBCCS vs ' + esc(t.adv) : esc(t.adv) + ' vs HBCCS'}</b><div class="muted" style="font-size:13px">${fmtUp(r)}${t.home ? '' : ' · à l’extérieur'}</div></div>
      <button class="btn" type="button" data-act="cloudmatch" data-id="${r.id}">Préparer le match</button></div>`; }).join('')}</div>`;
}

/* détails d'un match : emplacement de la vidéo, terminé, export, suppression */
function dlgMatchInfo(id) {
  const m = S.matches.find(x => x.id === id); if (!m) return;
  openDlg(`<h2>HBCCS vs ${esc(m.adversaire)}</h2>
    <p class="hint">${fmtD(m.date)}</p>
    <div class="list-row"><label style="flex:1"><input type="checkbox" data-mf="done" data-id="${m.id}" ${m.done ? 'checked' : ''}> Match terminé</label></div>
    <p class="hint" style="margin-top:12px">Emplacement de la vidéo (pour la retrouver). Le navigateur ne donne pas le chemin du fichier : note-le ici, par exemple « Disque Matchs › U15 › Costière ».</p>
    <div class="list-row"><input type="text" data-mf="videoNote" data-id="${m.id}" value="${esc(m.videoNote || '')}" placeholder="Disque dur, dossier, iCloud…" aria-label="Emplacement de la vidéo"></div>
    ${m.videoName ? `<p class="hint">Dernier fichier choisi : ${esc(m.videoName)}${m.videoSize ? ' · ' + sizeTxt(m.videoSize) : ''}</p>` : ''}
    <div class="btnrow" style="margin-top:12px">
      <button class="btn" type="button" data-act="matchcsv" data-id="${m.id}">Export CSV</button>
      <button class="btn danger" type="button" data-act="delmatch2" data-id="${m.id}">Supprimer le match</button>
      <button class="btn primary" type="button" data-act="closedlg">Fermer</button></div>`);
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || !t.dataset.mf) return;
  const m = S.matches.find(x => x.id === t.dataset.id); if (!m) return;
  m[t.dataset.mf] = t.type === 'checkbox' ? t.checked : t.value.trim();
  m.updated = Date.now(); DB.put('matches', m).catch(warnStore); Cloud.queue(m);
  if (S.view === 'home') renderHome();
});
