// Guarda la app en el celular para que abra aunque no haya señal. Los datos los maneja Firebase.
const V = 'fichas-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url), mismo = u.origin === location.origin;
  if (!mismo && !/gstatic\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return;
  if (mismo) { e.respondWith(fetch(r).then(x => { if (x.ok) { const c = x.clone(); caches.open(V).then(ca => ca.put(r, c)); } return x; }).catch(() => caches.match(r, { ignoreSearch: true }))); return; }
  e.respondWith(caches.match(r).then(h => h || fetch(r).then(x => { const c = x.clone(); caches.open(V).then(ca => ca.put(r, c)); return x; })));
});
