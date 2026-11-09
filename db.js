'use strict';
/* Stockage local (IndexedDB) + valeurs par défaut */

const DB = (() => {
  let db;
  const open = () => db ? Promise.resolve(db) : new Promise((res, rej) => {
    const r = indexedDB.open('hb-analyse', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('matches', { keyPath: 'id' });
      d.createObjectStore('kv', { keyPath: 'key' });
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
  const run = (store, mode, fn) => open().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
  return {
    get: (s, k) => run(s, 'readonly', o => o.get(k)),
    put: (s, v) => run(s, 'readwrite', o => o.put(v)),
    del: (s, k) => run(s, 'readwrite', o => o.delete(k)),
    all: s => run(s, 'readonly', o => o.getAll())
  };
})();

/* side : 'attaque' | 'defense' | 'both'
   kind (jeux) : 'combinaison' | 'enclenchement' | 'libre' | 'systeme' */
const DEFAULTS = {
  periodMinutes: 25,
  fps: 25,
  saisie: { autoPause: true, recap: true, replay: true, replaySec: 5 },
  actions: [
    { id: 'tir', label: 'Tir' },
    { id: 'but', label: 'But' },
    { id: 'perte', label: 'Perte de balle' },
    { id: 'passe', label: 'Passe décisive' },
    { id: 'arret', label: 'Arrêt' },
    { id: 'faute', label: 'Faute' },
    { id: 'exclusion', label: 'Exclusion' }
  ],
  phases: [
    { id: 'att-placee', label: 'Attaque placée', side: 'attaque' },
    { id: 'contre', label: 'Contre-attaque', side: 'attaque' },
    { id: 'sup', label: 'Supériorité numérique', side: 'attaque' },
    { id: 'inf', label: 'Infériorité numérique', side: 'attaque' },
    { id: 'repli', label: 'Repli', side: 'defense' },
    { id: 'def-placee', label: 'Défense placée', side: 'defense' }
  ],
  jeux: [
    { id: 'comb-a', label: 'Combinaison A', kind: 'combinaison', side: 'attaque' },
    { id: 'comb-b', label: 'Combinaison B', kind: 'combinaison', side: 'attaque' },
    { id: 'comb-c', label: 'Combinaison C', kind: 'combinaison', side: 'attaque' },
    { id: 'encl-1', label: 'Enclenchement 1', kind: 'enclenchement', side: 'attaque' },
    { id: 'encl-2', label: 'Enclenchement 2', kind: 'enclenchement', side: 'attaque' },
    { id: 'libre', label: 'Jeu libre', kind: 'libre', side: 'attaque' },
    { id: 'def-60', label: 'Défense 6-0', kind: 'systeme', side: 'defense' },
    { id: 'def-51', label: 'Défense 5-1', kind: 'systeme', side: 'defense' },
    { id: 'def-321', label: 'Défense 3-2-1', kind: 'systeme', side: 'defense' }
  ],
  issues: [
    { id: 'but', label: 'But', side: 'attaque' },
    { id: 'tir-arrete', label: 'Tir arrêté', side: 'attaque' },
    { id: 'tir-manque', label: 'Tir manqué', side: 'attaque' },
    { id: 'perte', label: 'Perte de balle', side: 'attaque' },
    { id: 'faute-prov', label: 'Faute provoquée / 7 m', side: 'attaque' },
    { id: 'excl-prov', label: 'Exclusion provoquée', side: 'attaque' },
    { id: 'but-enc', label: 'But encaissé', side: 'defense' },
    { id: 'arret-def', label: 'Arrêt du gardien', side: 'defense' },
    { id: 'tir-adv-manque', label: 'Tir adverse manqué', side: 'defense' },
    { id: 'recup', label: 'Ballon récupéré', side: 'defense' },
    { id: 'faute-def', label: 'Faute / exclusion', side: 'defense' },
    { id: 'interrompue', label: 'Interrompue', side: 'both' }
  ],
  realisations: [
    { id: 'complete', label: 'Jouée jusqu’au bout' },
    { id: 'interrompue', label: 'Interrompue' },
    { id: 'non-lancee', label: 'Non lancée' }
  ],
  causes: [
    { id: 'lu', label: 'Défense a lu le jeu' },
    { id: 'technique', label: 'Erreur technique' },
    { id: 'placement', label: 'Mauvais placement' }
  ]
};
