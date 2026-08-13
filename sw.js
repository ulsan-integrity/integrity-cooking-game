const CACHE='integrity-meal-online-v17';
const ASSETS=[
  './','./index.html','./admin.html','./admin.js','./firebase-config.js','./firebase-bridge.js','./question-bank.js',
  './manifest.webmanifest','./privacy-policy.html','./404.html',
  './icons/icon-192.png','./icons/icon-512.png',
  './assets/mascot-head.png','./assets/mascot-wave.png','./assets/mascot-hero-soft.png','./assets/ulsan-udc-logo-ko.png'
];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(async()=>await caches.match(event.request)||await caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response})));
});
