const CACHE_NAME="samexa-shell-v1";
const ASSETS=["./","./index.html","./app.js","./config.js","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(event.request.method==="GET"&&response.ok){const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone));}
    return response;
  }).catch(()=>caches.match("./index.html"))));
});