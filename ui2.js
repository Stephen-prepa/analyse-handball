'use strict';
/* Étape 2 : compte coach, choix d'un match FFHandball, création manuelle, réglages de saisie */

/* ---------- noms et recherche dans l'effectif ---------- */
const nameKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
function findRoster(x) {
  return S.roster.find(r => x.licence && r.licence === x.licence)
    || S.roster.find(r => x.code && r.code === x.code)
    || S.roster.find(r => nameKey(r.name) && nameKey(r.name) === nameKey(x.name));
}
const POSTES_RE = /^(gardien|ailier|arri[eè]re|demi-?centre|centre|pivot|ailier\s?(gauche|droit)|ag|ad|dc|ar|piv|g)$/i;
function parsePaste(text) {
  const out = [];
  text.split(/\r?\n/).forEach(line => {
    const l = line.trim(); if (!l) return;
    const mm = l.match(/^(\d{1,2})[\s.\-:)]+(.+)$/);
    const num = mm ? mm[1] : '', rest = (mm ? mm[2] : l).trim().split(/\s+/);
    let poste = '';
    if (rest.length > 1 && POSTES_RE.test(rest[rest.length - 1])) poste = rest.pop();
    out.push({ num, name: rest.join(' '), poste });
  });
  return out;
}

/* ---------- compte coach ---------- */
function loginForm() {
  const last = (() => { try { return localStorage.getItem('hb_analyse_lastlogin'); } catch (e) { return null; } })();
  return `<div class="list-row"><select id="lg-user" aria-label="Coach">${COACHS.map(c => `<option value="${c.login}" ${c.login === last ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
    <input id="lg-pw" type="password" placeholder="Mot de passe" autocomplete="current-password" style="flex:1;min-height:44px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg)"></div>
    <p id="lg-err" class="hint" style="color:var(--red)"></p>
    <div class="btnrow"><button class="btn primary" type="button" data-act="dologin">Se connecter</button></div>`;
}
function dlgLogin() {
  openDlg(`<h2>Connexion coach</h2><p class="hint">Même identifiant et même mot de passe que dans ton application de préparation.</p>${loginForm()}
    <div class="btnrow" style="margin-top:10px"><button class="btn" type="button" data-act="closedlg">Annuler</button></div>`);
}
async function doLogin() {
  const root = $('#dlg').open ? $('#dlg') : document;
  const u = $('#lg-user', root).value, pw = $('#lg-pw', root).value, err = $('#lg-err', root);
  if (!pw) { err.textContent = 'Entre ton mot de passe.'; return; }
  err.textContent = 'Connexion…';
  let ok = false;
  try { ok = await Cloud.login(u, pw); } catch (e) { err.textContent = 'Connexion impossible : vérifie internet.'; return; }
  if (!ok) { err.textContent = 'Mot de passe incorrect.'; return; }
  closeDlg(); toast('Connecté : ' + Cloud.session.name);
  const next = S.afterLogin; S.afterLogin = null;
  if (S.view === 'settings') renderSettings();
  await Cloud.sync(true);
  if (S.view === 'home') renderHome();
  if (S.view === 'settings') renderSettings();
  if (next === 'pick') dlgPick();
}
Cloud.onChange = () => { if (S.view === 'settings') renderSettings(); };

function compteCard() {
  const s = Cloud.session, st = Cloud.state;
  const last = st.last ? 'Dernière synchro : ' + new Date(st.last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Pas encore synchronisé sur cet appareil.';
  if (!s) return `<div class="card"><div class="card-h"><h2>Compte coach · sauvegarde en ligne</h2></div>
    <p class="hint">Connecte-toi pour récupérer les matchs de ton application et sauvegarder tes analyses en ligne (sans les vidéos).</p>${loginForm()}</div>`;
  return `<div class="card"><div class="card-h"><h2>Compte coach · sauvegarde en ligne</h2></div>
    <p>Connecté : <b>${esc(s.name)}</b></p>
    <p class="hint">${last}${st.msg ? ' · <span style="color:var(--red)">' + esc(st.msg) + '</span>' : ''}</p>
    <div class="btnrow"><button class="btn primary" type="button" data-act="sync" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Synchronisation…' : 'Synchroniser maintenant'}</button>
    <button class="btn" type="button" data-act="logout">Se déconnecter</button></div>
    <p class="hint">Chaque modification est envoyée automatiquement quelques secondes après, quand il y a du réseau. Si un même match est modifié sur deux appareils, la version la plus récente est conservée.</p></div>`;
}

/* ---------- réglages de saisie ---------- */
function saisieCard() {
  const k = S.settings.saisie;
  const row = (key, title, help) => `<label class="chk" style="align-items:flex-start;padding:6px 0"><input type="checkbox" data-sk="${key}" ${k[key] ? 'checked' : ''}>
    <span><b>${title}</b><br><span class="muted" style="font-size:14px">${help}</span></span></label>`;
  return `<div class="card"><div class="card-h"><h2>Saisie</h2></div>
    ${row('autoPause', 'Pause automatique au toucher', 'Quand tu touches un joueur ou la possession, la vidéo se met en pause : tu saisis tranquillement sur la bonne image.')}
    ${row('recap', 'Récapitulatif avant de valider une possession', 'Une fenêtre résume la possession (phase, jeu, issue, actions liées) pour vérifier avant d’enregistrer.')}
    ${row('replay', 'Bouton « Rejouer »', 'Un bouton sous la vidéo revient de quelques secondes en arrière et relance la lecture.')}
    <div class="list-row"><label for="rsec" style="flex:1">Durée du retour « Rejouer » (secondes)</label><input id="rsec" class="w-num" type="number" min="1" max="30" value="${k.replaySec}" data-sk="replaySec"></div></div>`;
}
function applyReplayBtn() { const b = $('#replaybtn'); if (b) { b.hidden = !S.settings.saisie.replay; b.textContent = '↺ ' + S.settings.saisie.replaySec + ' s'; } }
function autoPause() { if (S.settings.saisie.autoPause && S.videoReady && !V().paused) V().pause(); }

/* ---------- choisir un match de l'application ---------- */
function parseTitre(t) {
  const parts = String(t || '').split(/\s+vs\s+/i);
  if (parts.length === 2) {
    const a = /CLERMONT SALAGOU/i.test(parts[0]);
    return { adv: (a ? parts[1] : parts[0]).trim(), home: a };
  }
  return { adv: String(t || 'Adversaire'), home: true };
}
const parisDate = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

async function dlgPick() {
  if (!Cloud.session) { S.afterLogin = 'pick'; dlgLogin(); return; }
  openDlg('<h2>Choisir un match</h2><p class="hint">Chargement des matchs…</p>');
  let rows, off = false;
  try { rows = await Cloud.listMatches(); }
  catch (e) { const c = await Cloud.cachedMatches(); rows = c ? c.rows : []; off = true; }
  S.cloudRows = rows; S.cloudOff = off;
  renderPick();
}
function renderPick() {
  const rows = S.cloudRows || [], eq = S.pickEq || 'all';
  const equipes = [...new Set(rows.map(r => r.equipe))].sort();
  const list = rows.filter(r => eq === 'all' || String(r.equipe) === eq).slice(0, 60);
  openDlg(`<h2>Choisir un match</h2>
    <p class="hint">${S.cloudOff ? 'Hors ligne : liste enregistrée la dernière fois. ' : ''}L’effectif de la feuille FFHandball est repris automatiquement.</p>
    <div class="list-row"><select id="pick-eq" data-pick="eq" aria-label="Équipe"><option value="all">Toutes les équipes</option>${equipes.map(e => `<option value="${e}" ${String(e) === eq ? 'selected' : ''}>Équipe ${e}</option>`).join('')}</select>
      <button class="btn" type="button" data-act="cloudrefresh">Actualiser</button></div>
    ${list.length ? list.map(r => {
    const t = parseTitre(r.titre), done = S.matches.find(m => m.matchId === r.id);
    const sc = r.score_nous != null && r.score_eux != null ? ` · ${r.score_nous}-${r.score_eux}` : '';
    return `<div class="matchcard"><div class="i"><b>${t.home ? 'vs' : 'à'} ${esc(t.adv)}</b><div class="muted">É${r.equipe} · ${fmtD(parisDate(r.debut))}${sc}</div></div>
        <button class="btn ${done ? '' : 'primary'}" type="button" data-act="cloudmatch" data-id="${r.id}">${done ? 'Ouvrir' : 'Choisir'}</button></div>`;
  }).join('') : '<p class="muted">Aucun match trouvé.</p>'}
    <div class="btnrow" style="margin-top:10px"><button class="btn" type="button" data-act="closedlg">Fermer</button></div>`);
}
async function importCloudMatch(id) {
  const ex = S.matches.find(m => m.matchId === id);
  if (ex) { closeDlg(); openMatch(ex.id); return; }
  const cm = (S.cloudRows || []).find(x => x.id === id); if (!cm) return;
  toast('Chargement de la feuille…');
  let list = [], failed = false;
  try { list = await Cloud.rosterFor(cm.fdm_code); } catch (e) { failed = true; }
  const t = parseTitre(cm.titre);
  const m = {
    id: uid(), matchId: cm.id, fdm: cm.fdm_code, equipe: cm.equipe, adversaire: t.adv, domicile: t.home, date: parisDate(cm.debut),
    score: [cm.score_nous, cm.score_eux], created: Date.now(), updated: Date.now(),
    videoName: null, videoSize: null, sheet: [], marks: [], tags: [], possessions: [], open: null
  };
  for (const x of list) {
    let r = findRoster(x);
    if (!r) { r = { id: uid(), num: x.num, name: x.name, poste: x.poste, licence: x.licence, code: x.code }; S.roster.push(r); }
    else { r.licence = r.licence || x.licence; r.code = r.code || x.code; r.poste = r.poste || x.poste; r.num = r.num || x.num; }
    if (!m.sheet.some(s => s.playerId === r.id)) m.sheet.push({ playerId: r.id, num: x.num || r.num });
  }
  if (list.length) saveRoster();
  S.matches.push(m); await DB.put('matches', m).catch(warnStore); Cloud.queue(m);
  closeDlg();
  S.m = m; openMatch(m.id);
  toast(list.length ? list.length + ' joueurs sur la feuille.' : failed ? 'Feuille non lue (hors ligne ?) : compose-la à la main.' : 'Feuille FFHandball pas encore lue : compose-la à la main.');
}

/* ---------- feuille de match manuelle ---------- */
function collectSheet() {
  const sheet = [];
  $$('#dlg [data-sh]').forEach(cb => { if (cb.checked) { const pid = cb.dataset.sh; sheet.push({ playerId: pid, num: ($(`#dlg [data-shn="${pid}"]`) || { value: '' }).value.trim() }); } });
  S.m.sheet = sheet; saveMatch();
}
function dlgSheetPaste() {
  openDlg(`<h2>Coller une feuille de match</h2>
    <p class="hint">Un joueur par ligne : numéro, nom, poste (facultatif). Exemple : <b>9 Manel Ailier</b>. Les joueurs déjà dans l’effectif sont reconnus par leur nom ; les autres sont créés.</p>
    <textarea id="paste" aria-label="Feuille de match"></textarea>
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="dosheetpaste">Ajouter à la feuille</button>
    <button class="btn" type="button" data-act="sheet">Retour</button></div>`);
}
function doSheetPaste() {
  const items = parsePaste($('#paste').value); let n = 0;
  items.forEach(x => {
    let r = findRoster(x);
    if (!r) { r = { id: uid(), num: x.num, name: x.name, poste: x.poste }; S.roster.push(r); }
    const s = S.m.sheet.find(z => z.playerId === r.id);
    if (s) s.num = x.num || s.num; else S.m.sheet.push({ playerId: r.id, num: x.num || r.num });
    n++;
  });
  saveRoster(); saveMatch(); toast(n + ' joueurs sur la feuille.'); dlgSheet();
}
function dlgNewPlayer() {
  openDlg(`<h2>Nouveau joueur</h2>
    <div class="list-row"><label for="np-num" style="width:80px">N°</label><input id="np-num" class="w-num" type="text" inputmode="numeric"></div>
    <div class="list-row"><label for="np-name" style="width:80px">Nom</label><input id="np-name" type="text" placeholder="Prénom Nom"></div>
    <div class="list-row"><label for="np-poste" style="width:80px">Poste</label><input id="np-poste" type="text" placeholder="Ailier, Arrière, Pivot, Gardien…"></div>
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="donewplayer">Ajouter à l’effectif et à la feuille</button>
    <button class="btn" type="button" data-act="sheet">Retour</button></div>`);
}
function doNewPlayer() {
  const name = $('#np-name').value.trim(); if (!name) { toast('Entre un nom.'); return; }
  const r = { id: uid(), num: $('#np-num').value.trim(), name, poste: $('#np-poste').value.trim() };
  S.roster.push(r); S.m.sheet.push({ playerId: r.id, num: r.num });
  saveRoster(); saveMatch(); toast(name + ' ajouté.'); dlgSheet();
}

/* ---------- récapitulatif avant validation ---------- */
function dlgRecap() {
  const o = S.m.open, st = S.settings;
  let end = o.end ?? V().currentTime; if (end <= o.start) end = o.start + 1;
  S.recapEnd = end;
  const acts = S.m.tags.filter(t => t.poss === o.id || (!t.poss && t.vt >= o.start && t.vt <= end));
  const row = (k, v) => `<div class="list-row"><span class="muted" style="width:120px">${k}</span><b style="flex:1">${esc(v)}</b></div>`;
  openDlg(`<h2>Vérifier la possession</h2>
    ${row('Moment', `${fmtL(o.start)} → ${fmtL(end)} (${Math.round(end - o.start)} s)`)}
    ${row('Temps de jeu', gameLabel(S.m, o.start))}
    ${row('Phase', lab(st.phases, o.phase))}${row('Jeu', lab(st.jeux, o.jeu))}${row('Issue', lab(st.issues, o.issue))}
    ${row('Jeu réalisé', o.real ? lab(st.realisations, o.real) : '—')}${row('Cause d’échec', o.cause ? lab(st.causes, o.cause) : '—')}
    ${row('Actions liées', acts.length ? acts.map(t => playerLabel(t) + ' · ' + lab(st.actions, t.actionId, t.actionLabel)).join(' / ') : 'aucune')}
    <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="pconfirm">Valider</button>
    <button class="btn" type="button" data-act="closedlg">Modifier</button></div>`);
}

document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'lg-pw') doLogin(); });
