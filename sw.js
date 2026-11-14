/* Crayon studio : fonctionnement hors ligne.
   - page (index.html) : réseau d'abord (les mises à jour arrivent dès qu'on est en ligne), copie en cache sinon ;
   - sons (sons/inst, sons/kits) : cache d'abord, gardés au premier chargement ;
   - sons/index.json : réseau d'abord, copie en cache sinon ;
   - polices et bibliothèques externes (versions figées) : cache d'abord.
   Remplacer un son existant sous le même nom => changer SND (sinon les appareils gardent l'ancien). */
const APP = 'crayon-app-v1', SND = 'crayon-sons-v1', EXT = 'crayon-ext-v1';
const KEEP = [APP, SND, EXT, 'crayon-gm-v1'];
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const EXT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('crayon-') && !KEEP.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (cache, key, res) => { if (res && (res.ok || res.type === 'opaque')) caches.open(cache).then(c => c.put(key, res)).catch(() => {}); };

async function networkFirst(req, cache, key, ms) {
  const net = fetch(req).then(r => { put(cache, key, r.clone()); return r; });
  net.catch(() => {});
  try {
    return await (ms ? Promise.race([net, new Promise((_, no) => setTimeout(no, ms))]) : net);
  } catch (e) {
    const hit = await caches.match(key);
    if (hit) return hit;
    return net;
  }
}

async function cacheFirst(req, cache) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  put(cache, req, r.clone());
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url), base = new URL(self.registration.scope);
  if (u.origin === base.origin && u.pathname.startsWith(base.pathname)) {
    const p = u.pathname.slice(base.pathname.length);
    if (req.mode === 'navigate' || p === '' || p === 'index.html') { e.respondWith(networkFirst(req, APP, './', 5000)); return; }
    if (p === 'sons/index.json') { e.respondWith(networkFirst(req, SND, u.origin + u.pathname)); return; }
    if (p.startsWith('sons/')) { e.respondWith(cacheFirst(req, SND)); return; }
    if (p === 'manifest.webmanifest' || p.startsWith('icons/')) { e.respondWith(networkFirst(req, APP, req)); return; }
    return;
  }
  if (EXT_HOSTS.includes(u.hostname)) e.respondWith(cacheFirst(req, EXT));
});
