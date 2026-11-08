/* Offline copy of the app.
   - Only this app's own files (and Google Fonts) are handled here. Requests to the cloud
     (Firestore, sign-in, pictures) go straight to the network untouched: a service worker
     that cuts them off with a timeout breaks the connection on slow VPNs.
   - Pages: network first; if the network is slow or down, the saved copy opens at once.
   - Other files: the saved copy at once, refreshed in the background.
   - Only this app's caches are ever deleted (the old app lives on the same address). */
const VERSION = '1794173555';
const PREFIX = 'dndbyjr-online-';
const CACHE = PREFIX + VERSION;
const FONT_CACHE = PREFIX + 'fonts';
const ASSETS = ["./", "./index.html", "./dm.html", "./dnd-spells.js", "./manifest.json", "./dm-manifest.json", "./vendor/firebase-app-compat.js", "./vendor/firebase-auth-compat.js", "./vendor/firebase-firestore-compat.js", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png", "./icons-dm/icon-192.png", "./icons-dm/icon-512.png", "./icons-dm/icon-maskable-512.png", "./icons-dm/apple-touch-icon.png"];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SCOPE = new URL('./', self.location.href).pathname;

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      return Promise.all(ASSETS.map(function(u){
        return fetch(new Request(u, {cache: 'reload'})).then(function(res){
          if (res && res.ok) return cache.put(u, res);
        }).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf(PREFIX) === 0 && k !== CACHE && k !== FONT_CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function pageKey(url){ return url.origin + url.pathname; }

function fromCache(req, url){
  return caches.open(CACHE).then(function(cache){
    return cache.match(pageKey(url)).then(function(hit){
      if (hit) return hit;
      if (/dm\.html$/.test(url.pathname)) return cache.match(new URL('./dm.html', self.location.href).href);
      return cache.match(new URL('./index.html', self.location.href).href);
    });
  });
}

function networkFirst(req, url, ms){
  return new Promise(function(resolve){
    var done = false;
    function finish(res){ if (!done && res){ done = true; resolve(res); } }
    var timer = setTimeout(function(){ fromCache(req, url).then(finish); }, ms);
    fetch(req).then(function(res){
      if (res && res.ok){
        var copy = res.clone();
        caches.open(CACHE).then(function(cache){ return cache.put(pageKey(url), copy); }).catch(function(){});
      }
      clearTimeout(timer);
      if (!done){ done = true; resolve(res); }
    }).catch(function(){
      clearTimeout(timer);
      fromCache(req, url).then(function(hit){ if (!done){ done = true; resolve(hit || Response.error()); } });
    });
  });
}

function cacheThenRefresh(req, cacheName){
  return caches.open(cacheName).then(function(cache){
    return cache.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(function(){});
        return res;
      });
      if (hit){ net.catch(function(){}); return hit; }
      return net;
    });
  });
}

self.addEventListener('fetch', function(event){
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try{ url = new URL(req.url); }catch(e){ return; }
  if (FONT_HOSTS.indexOf(url.hostname) !== -1){ event.respondWith(cacheThenRefresh(req, FONT_CACHE)); return; }
  if (url.origin !== self.location.origin || url.pathname.indexOf(SCOPE) !== 0) return;
  if (req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === SCOPE){ event.respondWith(networkFirst(req, url, 4000)); return; }
  event.respondWith(cacheThenRefresh(req, CACHE));
});

self.addEventListener('message', function(event){
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
