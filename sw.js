const CACHE = 'orbit-v3';
const SHELL = ['/', '/index.html', '/manifest.json', '/orbit-core.js', '/orbit-storage.js', '/orbit-experience.js', '/orbit-experience.css'];
self.addEventListener('install', e => {e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate', e => {e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('ag-')||k.startsWith('orbit-'))&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch', e => {
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/.netlify/'))return;
  if(!SHELL.includes(url.pathname))return;
  e.respondWith(fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}
    return response;
  }).catch(()=>caches.match(e.request).then(cached=>cached||new Response('Offline: this page is not available yet.',{status:503}))));
});
