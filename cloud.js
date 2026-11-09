'use strict';
/* Connexion coach + sauvegarde/synchronisation Supabase (étape 2)
   La clé ci-dessous est la clé « publique » de ton projet : elle est faite pour être dans le code.
   La vraie protection, c'est la connexion coach + les règles de la base. */
const SB_URL = 'https://cponudkorfxtwptwtulq.supabase.co';
const SB_KEY = 'sb_publishable_nJX25A0br_xcAsvEzUrJCg_olfuuySe';
const COACHS = [
  { login: 'stephen', name: 'Stephen' }, { login: 'sandrine', name: 'Sandrine' },
  { login: 'arthur', name: 'Arthur' }, { login: 'nicolas', name: 'Nicolas' }
];

const Cloud = (() => {
  const SK = 'hb_analyse_session';
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SK) || 'null'); } catch (e) { }
  const saveSession = () => { try { session ? localStorage.setItem(SK, JSON.stringify(session)) : localStorage.removeItem(SK); } catch (e) { } };
  const api = { state: { last: null, busy: false, msg: '' }, onChange: () => { } };
  Object.defineProperty(api, 'session', { get: () => session });

  async function auth(path, body) {
    const r = await fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && !!d.access_token, d };
  }
  function store(d, login, name) {
    session = {
      access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000,
      login: login || (session && session.login), name: name || (session && session.name), id: (d.user && d.user.id) || (session && session.id)
    };
    saveSession();
  }
  api.login = async (login, pw) => {
    const { ok, d } = await auth('token?grant_type=password', { email: login + '@hbccs.local', password: pw });
    if (!ok) return false;
    store(d, login, (COACHS.find(c => c.login === login) || {}).name || login);
    try { localStorage.setItem('hb_analyse_lastlogin', login); } catch (e) { }
    return true;
  };
  api.logout = () => {
    if (session) fetch(SB_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token } }).catch(() => { });
    session = null; saveSession();
  };
  async function ensure() {
    if (!session) return null;
    if (session.expires_at - Date.now() > 60000) return session;
    try {
      const { ok, d } = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      if (!ok) { session = null; saveSession(); return null; }   // refusé par le serveur : il faut se reconnecter
      store(d);
    } catch (e) { /* hors ligne : on garde la session, la requête échouera proprement */ }
    return session;
  }
  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const s = await ensure();
    if (!s) throw new Error('auth');
    const h = { apikey: SB_KEY, Authorization: 'Bearer ' + s.access_token };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    const r = await fetch(SB_URL + '/rest/v1/' + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error('http ' + r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  /* ----- matchs et feuilles déjà dans ton appli ----- */
  api.listMatches = async () => {
    const rows = await rest('matches?select=id,equipe,titre,debut,fdm_code,score_nous,score_eux,journee,phase&order=debut.desc');
    await DB.put('kv', { key: 'cloudMatches', value: { at: Date.now(), rows } }).catch(() => { });
    return rows;
  };
  api.cachedMatches = async () => { try { const c = await DB.get('kv', 'cloudMatches'); return c ? c.value : null; } catch (e) { return null; } };
  const inList = a => '(' + a.map(x => encodeURIComponent('"' + String(x).replace(/"/g, '') + '"')).join(',') + ')';
  api.rosterFor = async fdm => {
    const st = await rest('player_match_stats?fdm_code=eq.' + encodeURIComponent(fdm) + '&select=licence,numero');
    if (!st.length) return [];
    const js = await rest('ffhb_joueurs?licence=in.' + inList(st.map(x => x.licence)) + '&select=licence,nom,numero,player_code');
    const codes = js.map(j => j.player_code).filter(Boolean);
    let ps = [];
    if (codes.length) { try { ps = await rest('players?code=in.' + inList(codes) + '&select=code,name,postes,numero'); } catch (e) { } }
    return st.map(x => {
      const j = js.find(y => y.licence === x.licence) || {}, p = ps.find(y => y.code === j.player_code) || {};
      return { licence: x.licence, num: String(x.numero ?? j.numero ?? ''), name: j.nom || p.name || '?', poste: (p.postes || []).join(' / '), code: j.player_code || null };
    });
  };

  /* ----- sauvegarde de MES analyses ----- */
  const pushMatch = m => rest('analyse_matchs?on_conflict=id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ id: m.id, match_id: m.matchId || null, data: m, updated_at: new Date().toISOString() }]
  });
  const pushPrefs = () => rest('analyse_reglages?on_conflict=cle', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ cle: 'reglages', valeur: { updated: S.prefsUpdated, settings: S.settings, roster: S.roster }, updated_at: new Date().toISOString() }]
  });

  const pending = new Map(); let timer = null, ptimer = null, prefsPending = false;
  api.queue = m => { pending.set(m.id, m); clearTimeout(timer); timer = setTimeout(flush, 15000); };
  api.queuePrefs = () => { prefsPending = true; clearTimeout(ptimer); ptimer = setTimeout(flush, 15000); };
  async function flush() {
    if (!session || !navigator.onLine) return;
    try {
      for (const [id, m] of [...pending]) { await pushMatch(m); pending.delete(id); }
      if (prefsPending) { await pushPrefs(); prefsPending = false; }
      api.state.last = Date.now(); api.onChange();
    } catch (e) { /* on réessaiera à la prochaine synchro */ }
  }
  api.flush = flush;

  api.remove = async id => {
    pending.delete(id);
    let del = []; try { const k = await DB.get('kv', 'pendingDeletes'); del = (k && k.value) || []; } catch (e) { }
    if (!del.includes(id)) del.push(id);
    await DB.put('kv', { key: 'pendingDeletes', value: del }).catch(() => { });
    if (session && navigator.onLine) api.sync(true);
  };

  /* synchronisation complète : la version la plus récente de chaque match gagne */
  api.sync = async (silent) => {
    if (!session) return null;
    if (api.state.busy) return null;
    api.state.busy = true; api.onChange();
    const res = { down: 0, up: 0 };
    try {
      let del = []; try { const k = await DB.get('kv', 'pendingDeletes'); del = (k && k.value) || []; } catch (e) { }
      for (const id of [...del]) { await rest('analyse_matchs?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }); del = del.filter(x => x !== id); await DB.put('kv', { key: 'pendingDeletes', value: del }); }

      const remote = await rest('analyse_matchs?select=id,data,updated_at');
      const rmap = new Map(remote.map(r => [r.id, r]));
      for (const r of remote) {
        const loc = S.matches.find(m => m.id === r.id);
        if (del.includes(r.id)) continue;
        if (!loc) { S.matches.push(r.data); await DB.put('matches', r.data); res.down++; }
        else if ((r.data.updated || 0) > (loc.updated || 0)) {
          const i = S.matches.indexOf(loc); S.matches[i] = r.data; if (S.m === loc) S.m = r.data;
          await DB.put('matches', r.data); res.down++;
        }
      }
      for (const m of S.matches) {
        const r = rmap.get(m.id);
        if (!r || (m.updated || 0) > (r.data.updated || 0)) { await pushMatch(m); pending.delete(m.id); res.up++; }
      }

      const rp = await rest('analyse_reglages?cle=eq.reglages&select=valeur');
      const rv = rp.length ? rp[0].valeur : null;
      if (rv && (rv.updated || 0) > (S.prefsUpdated || 0)) {
        S.settings = Object.assign(clone(DEFAULTS), rv.settings || {});
        S.settings.saisie = Object.assign({}, DEFAULTS.saisie, S.settings.saisie || {});
        S.roster = rv.roster || [];
        S.prefsUpdated = rv.updated;
        await DB.put('kv', { key: 'settings', value: S.settings }); await DB.put('kv', { key: 'roster', value: S.roster });
        await DB.put('kv', { key: 'prefsUpdated', value: S.prefsUpdated }); res.down++;
      } else if (!rv || (S.prefsUpdated || 0) > (rv.updated || 0)) {
        if (!S.prefsUpdated) { S.prefsUpdated = Date.now(); await DB.put('kv', { key: 'prefsUpdated', value: S.prefsUpdated }); }
        await pushPrefs(); prefsPending = false; res.up++;
      }
      api.state.last = Date.now(); api.state.msg = '';
    } catch (e) {
      api.state.msg = e.message === 'auth' ? 'Reconnecte-toi.' : 'Synchronisation impossible pour l’instant (réseau ?).';
      res.error = true;
    }
    api.state.busy = false; api.onChange();
    return res;
  };
  return api;
})();
window.addEventListener('online', () => { if (Cloud.session) Cloud.sync(true); });
