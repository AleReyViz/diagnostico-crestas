/* Almacenamiento del aplicativo.
 * - Si config.js trae la configuración de Firebase: Firestore (datos y recortes de cresta) + Authentication (usuarios).
 *   Los recortes (~30 KB) se guardan dentro del documento, así no se necesita Firebase Storage (que exige plan de pago).
 *   Todos los dispositivos comparten las inspecciones y las alertas en tiempo real.
 * - Si no: modo local con IndexedDB. Los datos quedan solo en este dispositivo.
 * Interfaz (window.Almacen):
 *   iniciar() -> {modo: "nube"|"local", usuario, necesitaIngreso}
 *   entrar(correo, clave), salir()
 *   escuchar(coleccion, alCambiar)      alCambiar({id: datos, ...})
 *   guardar(coleccion, id, datos)
 *   subirImagen(blob) -> data URL del recorte (se guarda en el documento)
 *   descargar(nombreArchivo, texto)
 */
(function () {
  "use strict";
  const VERSION_FIREBASE = "10.14.1";
  const oyentes = {};
  let modo = "local", fb = null;

  /* ---------- Modo local (IndexedDB) ---------- */
  const DB_NOMBRE = "diagnostico-crestas", COLECCIONES = ["inspecciones", "evaluacion"];
  let idb = null; const cache = {};
  function abrirIDB() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(DB_NOMBRE, 1);
      r.onupgradeneeded = () => COLECCIONES.forEach(c => { if (!r.result.objectStoreNames.contains(c)) r.result.createObjectStore(c); });
      r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error);
    });
  }
  function leerTodo(col) {
    return new Promise((ok, mal) => {
      const t = idb.transaction(col, "readonly").objectStore(col), out = {};
      const cur = t.openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } else ok(out); };
      cur.onerror = () => mal(cur.error);
    });
  }
  function escribirIDB(col, id, datos) {
    return new Promise((ok, mal) => {
      const tx = idb.transaction(col, "readwrite"); tx.objectStore(col).put(datos, id);
      tx.oncomplete = ok; tx.onerror = () => mal(tx.error);
    });
  }
  const avisar = col => (oyentes[col] || []).forEach(f => f({ ...cache[col] }));

  /* ---------- API ---------- */
  async function iniciar() {
    const cfg = window.CONFIG_FIREBASE;
    if (cfg && cfg.apiKey && cfg.projectId) {
      const base = `https://www.gstatic.com/firebasejs/${VERSION_FIREBASE}/`;
      const [app, auth, fs] = await Promise.all([
        import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
      const a = app.initializeApp(cfg);
      fb = { auth, fs, A: auth.getAuth(a), F: fs.getFirestore(a) };
      modo = "nube";
      const usuario = await new Promise(ok => { const u = auth.onAuthStateChanged(fb.A, x => { u(); ok(x); }); });
      return { modo, usuario: usuario ? usuario.email : null, necesitaIngreso: !usuario };
    }
    idb = await abrirIDB();
    for (const c of COLECCIONES) cache[c] = await leerTodo(c);
    modo = "local";
    return { modo, usuario: null, necesitaIngreso: false };
  }
  async function entrar(correo, clave) { await fb.auth.signInWithEmailAndPassword(fb.A, correo, clave); return correo; }
  async function salir() { if (fb) await fb.auth.signOut(fb.A); }

  function escuchar(col, alCambiar) {
    if (modo === "nube") {
      const { fs, F } = fb;
      return fs.onSnapshot(fs.collection(F, col), snap => {
        const o = {}; snap.forEach(d => { o[d.id] = d.data(); }); alCambiar(o);
      }, err => console.error("Firestore:", err));
    }
    (oyentes[col] = oyentes[col] || []).push(alCambiar);
    alCambiar({ ...cache[col] });
    return () => { oyentes[col] = oyentes[col].filter(f => f !== alCambiar); };
  }
  async function guardar(col, id, datos) {
    if (modo === "nube") { const { fs, F } = fb; await fs.setDoc(fs.doc(F, col, id), datos); return; }
    cache[col][id] = datos; await escribirIDB(col, id, datos); avisar(col);
  }
  async function subirImagen(blob) {   // el recorte viaja como data URL dentro del documento (nube y local)
    return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  }
  function descargar(nombre, texto) {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  window.Almacen = { iniciar, entrar, salir, escuchar, guardar, subirImagen, descargar, get modo() { return modo; } };
})();
