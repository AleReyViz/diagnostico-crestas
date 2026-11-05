/* Service worker: guarda la app y los modelos en el celular para usarla sin internet en el galpón.
 * Cambia VERSION cada vez que actualices los archivos o los modelos, para que los celulares descarguen la versión nueva. */
const VERSION = "crestas-v2";
const BASE = ["./", "index.html", "estilos.css", "app.js", "motor.js", "almacen.js", "config.js", "manifest.webmanifest",
  "iconos/icono-192.png", "iconos/icono-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/tensorflow/4.22.0/tf.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Firebase siempre por red (datos en tiempo real)
  if (/firestore|firebasestorage|googleapis\.com\/identitytoolkit|securetoken/.test(url.href)) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname.endsWith("cdnjs.cloudflare.com") || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("fonts.googleapis.com"))) {
      const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia));
    }
    return r;
  })));
});
