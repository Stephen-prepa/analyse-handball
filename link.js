'use strict';
/* Vidéo depuis un lien (Google Drive, Dropbox ou lien direct) */
const driveKey = () => ((S.settings && S.settings.driveKey) || '').trim();

function linkToUrl(raw) {
  raw = (raw || '').trim(); if (!raw) return { error: 'Colle un lien.' };
  let u; try { u = new URL(raw); } catch (e) { return { error: 'Ce lien n’est pas valide.' }; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'Le lien doit commencer par https://' };
  if (/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(u.hostname)) {
    const mt = /\/d\/([\w-]+)/.exec(u.pathname), id = mt ? mt[1] : u.searchParams.get('id');
    if (!id) return { error: 'Je ne trouve pas le fichier dans ce lien Google Drive. Utilise « Partager › Copier le lien » sur la vidéo.' };
    if (!driveKey()) return { error: 'Pour lire une vidéo Google Drive, il faut d’abord enregistrer une clé Google dans Réglages › Vidéo depuis un lien.', needKey: true };
    return { kind: 'Google Drive', url: 'https://www.googleapis.com/drive/v3/files/' + id + '?alt=media&key=' + encodeURIComponent(driveKey()) };
  }
  if (/(^|\.)dropbox\.com$/.test(u.hostname)) { u.searchParams.delete('dl'); u.searchParams.set('raw', '1'); return { kind: 'Dropbox', url: u.toString() }; }
  return { kind: 'Lien direct', url: u.toString() };
}

function loadVideoUrl(link) {
  const c = linkToUrl(link); if (c.error) return c;
  const v = V(), m = S.m; v.pause();
  if (S.url) URL.revokeObjectURL(S.url); S.url = null; S.videoReady = false;
  S.linkTry = { cors: true, url: c.url };
  v.crossOrigin = 'anonymous'; v.src = c.url; v.load();
  m.videoLink = link.trim(); m.videoName = c.kind === 'Lien direct' ? 'Lien direct' : 'Lien ' + c.kind; m.videoSize = null; saveMatch();
  toast('Chargement de la vidéo depuis ' + c.kind + '…', 3000);
  return c;
}
/* si le site de la vidéo refuse l'accès « CORS », on réessaie sans (la lecture marche, mais pas l'export PNG) */
document.addEventListener('DOMContentLoaded', () => {
  V().addEventListener('error', () => {
    const t = S.linkTry; if (!t || !V().getAttribute('src')) return;
    if (t.cors) { t.cors = false; const v = V(); v.removeAttribute('crossorigin'); v.src = t.url; v.load(); return; }
    S.videoReady = false; document.getElementById('novideo').hidden = false;
    toast('Impossible de lire ce lien. Vérifie qu’il est partagé (« toute personne disposant du lien ») et que c’est bien une vidéo MP4.', 6000);
  });
  V().addEventListener('loadedmetadata', () => { if (S.linkTry && !S.linkTry.cors) toast('Vidéo lue depuis un lien : l’export « Image PNG » des annotations ne sera pas disponible.', 5000); });
});

function dlgLink() {
  const m = S.m; if (!m) return;
  openDlg(`<h2>Ouvrir la vidéo depuis un lien</h2>
    <p class="hint">Colle un lien de partage <b>Google Drive</b> ou <b>Dropbox</b>, ou le lien direct d’un fichier vidéo (MP4). La vidéo se lit en continu, sans être stockée sur l’appareil.</p>
    <div class="list-row"><input id="lk-url" type="url" placeholder="https://drive.google.com/file/d/…" value="${esc(m.videoLink || '')}" aria-label="Lien de la vidéo"></div>
    <p id="lk-err" class="hint" style="color:var(--red)"></p>
    <p class="hint">Google Drive : clic droit sur la vidéo › Partager › « Toute personne disposant du lien » (lecteur), puis Copier le lien. Attention : toute personne qui a ce lien peut voir la vidéo.</p>
    <div class="btnrow"><button class="btn primary" type="button" data-link="go">Lire cette vidéo</button><button class="btn" type="button" data-act="closedlg">Annuler</button></div>`);
  setTimeout(() => { const i = document.getElementById('lk-url'); if (i) i.focus(); }, 50);
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-link]'); if (!b || !S.m) return;
  const a = b.dataset.link;
  if (a === 'ask') dlgLink();
  else if (a === 'saved') { const r = loadVideoUrl(S.m.videoLink || ''); if (r.error) { dlgLink(); const er = document.getElementById('lk-err'); if (er) er.textContent = r.error; } }
  else if (a === 'go') { const r = loadVideoUrl(document.getElementById('lk-url').value); if (r.error) document.getElementById('lk-err').textContent = r.error; else closeDlg(); }
});

function linkCard() {
  return `<div class="card"><div class="card-h"><h2>Vidéo depuis un lien</h2></div>
    <p class="hint">Pour lire une vidéo Google Drive sans la télécharger, l’app a besoin d’une « clé Google » gratuite (à créer une seule fois). Dropbox et les liens directs n’en ont pas besoin.</p>
    <div class="list-row"><label for="dk" style="width:110px">Clé Google</label><input id="dk" type="text" value="${esc(S.settings.driveKey || '')}" data-set="driveKey" placeholder="AIza…" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <details class="mdet"><summary>Comment créer la clé (5 minutes, sans code)</summary>
      <ol class="hint" style="padding-left:20px;line-height:1.6">
        <li>Ouvre <b>console.cloud.google.com</b> et connecte-toi avec ton compte Google.</li>
        <li>En haut, « Sélectionner un projet » › « Nouveau projet » › nomme-le « Analyse handball » › Créer.</li>
        <li>Menu ☰ › « API et services » › « Bibliothèque » › cherche <b>Google Drive API</b> › Activer.</li>
        <li>« API et services » › « Identifiants » › « Créer des identifiants » › <b>Clé API</b>.</li>
        <li>Conseillé : clique sur la clé › « Restrictions relatives aux applications » › « Sites web » › ajoute l’adresse de ton app › « Restreindre la clé » › Google Drive API › Enregistrer.</li>
        <li>Copie la clé et colle-la ci-dessus.</li>
      </ol></details>
    <p class="hint">Les vidéos doivent être partagées par lien (« toute personne disposant du lien »). Ce sont des images de mineurs : ne partage ce lien qu’avec les personnes concernées.</p></div>`;
}
