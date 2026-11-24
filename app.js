/* Diagnóstico de Crestas · SHILICORP — interfaz del aplicativo
 * Pantallas: Ingreso · Diagnósticos · Capturar · Alertas · Estadísticas · Cuenta
 * Depende de: motor.js (MotorCrestas), almacen.js (Almacen), Chart.js (gráficos)
 */
(() => {
"use strict";

/* ===================== Parámetros ===================== */
const UMBRAL = 0.15;      // calibrado en validación con este motor (sensibilidad 94,4 %): desde aquí se alerta
const ALTA = 0.30;        // entre UMBRAL y ALTA el caso se muestra como "Sospechosa"
const POR_PAGINA = 10;
const ENFERMEDADES = ["Bronquitis infecciosa aviar", "Enfermedad de Newcastle", "Influenza aviar", "Viruela aviar", "Coriza infecciosa", "Cólera aviar", "Otra"];
const PASOS = ["Preparación de la imagen", "Segmentación de la cresta (YOLO)", "Recorte y medidas de color", "Redimensionamiento 224 × 224", "Clasificación CNN"];

/* ===================== Estado ===================== */
const S = {
  vista: leerHash() || (["diagnosticos", "capturar", "alertas", "estadisticas", "cuenta"].includes(lsGet("vista")) ? lsGet("vista") : "diagnosticos"),
  ins: {},
  nube: false, usuario: null, necesitaIngreso: false,
  modelos: "cargando", backend: "", progresoModelos: 0,
  filtro: { texto: "", estado: "todos", periodo: "30", pagina: 1 },
  pestanaAlertas: "pendientes", periodoEst: "30",
  cap: { fase: "listo", paso: -1, doc: null, error: "" },
  ubic: lsGet("ubic", { galpon: "", jaula: "" }),
  modal: null, confirmarBorrar: false, graficos: []
};

/* ===================== Utilidades ===================== */
const $ = (q, el = document) => el.querySelector(q);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function lsGet(k, d) { try { const v = localStorage.getItem("crestas:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem("crestas:" + k, JSON.stringify(v)); } catch {} }
function leerHash() { const h = (location.hash || "").slice(1); return ["diagnosticos", "capturar", "alertas", "estadisticas", "cuenta"].includes(h) ? h : ""; }
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }
const seg = ms => ms == null || isNaN(ms) ? "—" : (ms / 1000).toFixed(1).replace(".", ",") + " s";
const pct = (v, d = 1) => v == null || isNaN(v) ? "—" : v.toFixed(d).replace(".", ",") + " %";
const fecha = iso => { try { return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso || ""; } };
const diaClave = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-CA"); };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function estadoDe(p) {
  if (p == null) return { clave: "na", txt: "Sin resultado", cls: "brand", ico: "ayuda" };
  if (p < UMBRAL) return { clave: "sana", txt: "Sana", cls: "sana", ico: "check" };
  if (p < ALTA) return { clave: "sospechosa", txt: "Sospechosa", cls: "sosp", ico: "alerta" };
  return { clave: "enferma", txt: "Enferma", cls: "enf", ico: "pulso" };
}
const esAlerta = x => x.prob >= UMBRAL;
const pendiente = x => esAlerta(x) && !x.revision;
const enfermedadDe = x => x.revision ? (x.revision.veterinario === "enferma" ? (x.revision.enfermedad || "Enfermedad confirmada") : "Sin enfermedad") : (esAlerta(x) ? "Pendiente de revisión" : "—");

/* ===================== Iconos (trazos propios, estilo lineal) ===================== */
const IC = {
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  camara: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  portapapeles: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
  medidor: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
  salir: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
  subir: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  ojo: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoNo: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.6 7.6A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1"/>',
  basura: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  pulso: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.5"/>',
  mas: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  descargar: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  mas2: '<path d="M12 5v14M5 12h14"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
const ic = (n, extra = "") => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${IC[n]}</svg>`;
const LOGO = `<svg viewBox="6 7 29 27" aria-hidden="true"><path d="M9 29l1.5-11 4 6 2-13 4 11 3-13 3 12 4-7 1 15z" fill="currentColor"/><rect x="8" y="27.5" width="25" height="4.5" rx="2.2" fill="currentColor"/></svg>`;

const chip = e => `<span class="chip f-${e.cls}">${ic(e.ico)}${e.txt}</span>`;
const barraProb = p => { const e = estadoDe(p); return `<div class="prob"><div class="barra"><i style="width:${Math.round(p * 100)}%;background:var(--${e.cls === "sosp" ? "sosp" : e.cls === "enf" ? "enf" : "sana"})"></i></div><b>${Math.round(p * 100)}%</b></div>`; };

/* ===================== Estructura ===================== */
const MENU = [
  { id: "diagnosticos", txt: "Diagnósticos", ico: "lista" },
  { id: "capturar", txt: "Capturar", ico: "camara" },
  { id: "alertas", txt: "Alertas", ico: "campana", cuenta: true },
  { id: "estadisticas", txt: "Estadísticas", ico: "grafico" }
];
function estadoModelo() {
  if (S.modelos === "listo") return `<span class="punto ok"></span>Modelos listos (${esc(S.backend)})`;
  if (S.modelos === "error") return `<span class="punto mal"></span>No se cargaron los modelos`;
  return `<span class="punto"></span>Cargando modelos… ${Math.round(S.progresoModelos * 100)} %`;
}
function armarApp() {
  $("#raiz").innerHTML = `
  <div class="app">
    <aside class="lado">
      <div class="marca"><div class="logo" style="color:var(--brand-ink)">${LOGO}</div><div><b>SHILICORP</b><span>Detección temprana en crestas</span></div></div>
      <nav class="nav" id="nav"></nav>
      <div class="pie-lado">
        <div class="estado-modelo" id="estado-modelo"></div>
        <div class="usuario"><span class="muted">${S.nube ? "Usuario" : "Modo local"}</span><b>${esc(S.usuario || "Este dispositivo")}</b></div>
        ${S.nube ? `<button class="peligro" data-acc="salir">${ic("salir")}Cerrar sesión</button>` : ""}
      </div>
    </aside>
    <header class="barra-sup"><div class="logo" style="color:var(--brand-ink)">${LOGO}</div><b>SHILICORP</b><span class="punto" id="punto-sup"></span></header>
    <main class="principal"><div class="contenedor" id="vista"></div></main>
    <nav class="abajo" id="abajo"></nav>
  </div>
  <div id="modal"></div>`;
}
function pintarNav() {
  const n = Object.values(S.ins).filter(pendiente).length;
  const cuenta = n ? `<span class="cuenta">${n}</span>` : "";
  $("#nav").innerHTML = MENU.map(m => m.grupo ? `<div class="grupo">${m.grupo}</div>` :
    `<a data-ir="${m.id}" ${S.vista === m.id ? 'aria-current="page"' : ""}>${ic(m.ico)}${m.txt}${m.cuenta ? cuenta : ""}</a>`).join("");
  const movil = [MENU[0], MENU[1], MENU[2], MENU[3], { id: "cuenta", txt: "Cuenta", ico: "persona" }];
  $("#abajo").innerHTML = movil.map(m => `<a data-ir="${m.id}" ${S.vista === m.id ? 'aria-current="page"' : ""}>${ic(m.ico)}${m.txt}${m.cuenta ? cuenta : ""}</a>`).join("");
  $("#estado-modelo").innerHTML = estadoModelo();
  const p = $("#punto-sup"); p.className = "punto " + (S.modelos === "listo" ? "ok" : S.modelos === "error" ? "mal" : ""); p.title = S.modelos === "listo" ? "Modelos listos" : "Cargando modelos";
}

/* ===================== Render ===================== */
function render() {
  if (S.necesitaIngreso) { $("#raiz").innerHTML = vIngreso(); return; }
  if (!$("#vista")) armarApp();
  pintarNav();
  S.graficos.forEach(g => g.destroy()); S.graficos = [];
  const vistas = { diagnosticos: vDiagnosticos, capturar: vCapturar, alertas: vAlertas, estadisticas: vEstadisticas, cuenta: vCuenta };
  $("#vista").innerHTML = (vistas[S.vista] || vDiagnosticos)();
  if (S.vista === "estadisticas") dibujarGraficos();
  pintarModal();
}
function ir(v) { S.vista = v; lsSet("vista", v); history.replaceState(null, "", "#" + v); render(); window.scrollTo(0, 0); }

/* ---------- Ingreso ---------- */
function vIngreso() {
  return `<div class="ingreso"><div class="caja-ingreso">
    <header><div class="logo" style="color:var(--brand)">${LOGO}</div><h1>SHILICORP</h1><p>Detección temprana de enfermedad en crestas de gallinas</p></header>
    <form id="f-ingreso" novalidate>
      <label class="campo">Correo electrónico<input type="email" id="i-correo" autocomplete="username" placeholder="ejemplo@correo.com" required></label>
      <label class="campo">Contraseña<span class="clave"><input type="password" id="i-clave" autocomplete="current-password" placeholder="••••••••" required>
        <button type="button" class="icono-btn" data-acc="ver-clave" aria-label="Mostrar contraseña">${ic("ojo")}</button></span></label>
      <button type="button" class="enlace" data-acc="olvide">¿Olvidaste tu contraseña?</button>
      <button class="primario" type="submit" style="min-height:48px">Iniciar sesión</button>
      <p class="nota-ingreso">${ic("escudo", 'style="width:14px;height:14px;vertical-align:-2px"')} Acceso solo para el personal registrado por la administradora del sistema.</p>
    </form></div></div>`;
}

/* ---------- Diagnósticos ---------- */
function filtrar() {
  const f = S.filtro, txt = f.texto.trim().toLowerCase(), desde = f.periodo === "todo" ? 0 : Date.now() - (+f.periodo) * 864e5;
  return Object.entries(S.ins).filter(([, x]) => {
    if (new Date(x.t_fin).getTime() < desde) return false;
    const e = estadoDe(x.prob);
    if (f.estado === "pendientes" ? !pendiente(x) : (f.estado !== "todos" && e.clave !== f.estado)) return false;
    if (!txt) return true;
    return [x.codigo, x.galpon, x.jaula, e.txt, enfermedadDe(x)].join(" ").toLowerCase().includes(txt);
  }).sort((a, b) => b[1].t_fin.localeCompare(a[1].t_fin));
}
function contar(lista) {
  const c = { total: lista.length, sana: 0, sospechosa: 0, enferma: 0 };
  lista.forEach(x => c[estadoDe(x.prob).clave]++); return c;
}
function kpi(titulo, valor, sub, ico, cls) {
  return `<div class="tarjeta kpi"><div><span>${titulo}</span><b class="${cls ? "t-" + cls : ""}">${valor}</b>${sub ? `<small>${sub}</small>` : ""}</div><div class="ico f-${cls || "brand"}">${ic(ico)}</div></div>`;
}
function vDiagnosticos() {
  const filas = filtrar(), c = contar(filas.map(([, x]) => x));
  const total = filas.length, paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  S.filtro.pagina = Math.min(S.filtro.pagina, paginas);
  const vista = filas.slice((S.filtro.pagina - 1) * POR_PAGINA, S.filtro.pagina * POR_PAGINA);
  const f = S.filtro;
  const opt = (v, t, sel) => `<option value="${v}" ${sel === v ? "selected" : ""}>${t}</option>`;
  const ubic = x => [x.galpon, x.jaula].filter(Boolean).join(" · ") || "Sin ubicación";
  return `
  <div class="cabecera"><div><h1>Registro de diagnósticos</h1><p>Historial de análisis de crestas de las aves${S.nube ? ", compartido con el equipo" : " de este dispositivo"}.</p></div>
    <div class="acciones"><button data-acc="exportar">${ic("descargar")}<span class="ocultable">Exportar</span></button><button class="primario" data-ir="capturar">${ic("camara")}Nuevo diagnóstico</button></div></div>
  <div class="kpis">
    ${kpi("Total escaneados", c.total, f.periodo === "todo" ? "Todo el historial" : `Últimos ${f.periodo} días`, "camara", "brand")}
    ${kpi("Sanas", c.sana, c.total ? pct(c.sana / c.total * 100, 0) + " del total" : "", "check", "sana")}
    ${kpi("Sospechosas", c.sospechosa, "Requieren revisión", "alerta", "sosp")}
    ${kpi("Enfermas", c.enferma, "Alta probabilidad", "pulso", "enf")}
  </div>
  <div class="filtros">
    <div class="buscar">${ic("buscar")}<input type="search" id="f-texto" placeholder="Buscar por ID de gallina, galpón o enfermedad…" value="${esc(f.texto)}"></div>
    <select id="f-estado" aria-label="Estado">${opt("todos", "Todos los estados", f.estado)}${opt("sana", "Sanas", f.estado)}${opt("sospechosa", "Sospechosas", f.estado)}${opt("enferma", "Enfermas", f.estado)}${opt("pendientes", "Pendientes de revisión", f.estado)}</select>
    <select id="f-periodo" aria-label="Periodo">${opt("7", "Últimos 7 días", f.periodo)}${opt("30", "Últimos 30 días", f.periodo)}${opt("90", "Últimos 90 días", f.periodo)}${opt("todo", "Todo el historial", f.periodo)}</select>
  </div>
  ${!total ? `<div class="tabla-caja"><div class="vacio">${ic("camara")}<b>No hay diagnósticos ${Object.keys(S.ins).length ? "con estos filtros" : "todavía"}</b><span>Toma la foto de una cresta en <b>Capturar</b> y el resultado aparecerá aquí.</span><button class="primario" data-ir="capturar">${ic("camara")}Nuevo diagnóstico</button></div></div>` : `
  <div class="tabla-caja ocultar-movil"><div class="tabla-scroll"><table>
    <thead><tr><th>ID gallina</th><th>Cresta</th><th>Estado</th><th>Enfermedad (veterinario)</th><th>Prob. de enfermedad</th><th>Fecha</th><th></th></tr></thead>
    <tbody>${vista.map(([id, x]) => `<tr data-ver="${id}">
      <td class="cod">${esc(x.codigo || "Sin código")}<span class="sub">${esc(ubic(x))}</span></td>
      <td><img class="mini" src="${esc(x.recorte_url || "")}" alt="Cresta ${esc(x.codigo || "")}" loading="lazy"></td>
      <td>${chip(estadoDe(x.prob))}</td>
      <td>${pendiente(x) ? `<span class="t-sosp" style="font-weight:600">Pendiente de revisión</span>` : esc(enfermedadDe(x))}</td>
      <td>${barraProb(x.prob)}</td>
      <td class="num small">${fecha(x.t_fin)}</td>
      <td style="white-space:nowrap"><button class="icono-btn" data-ver="${id}" aria-label="Ver y editar">${ic("lapiz")}</button><button class="icono-btn" data-borrar="${id}" aria-label="Eliminar" style="color:var(--enf)">${ic("basura")}</button></td>
    </tr>`).join("")}</tbody></table></div>
    ${paginacion(total, paginas)}</div>
  <div class="cartas">${vista.map(([id, x]) => { const e = estadoDe(x.prob); return `<button class="carta" data-ver="${id}">
      <img class="mini" src="${esc(x.recorte_url || "")}" alt="" loading="lazy">
      <span style="min-width:0"><b>${esc(x.codigo || "Sin código")}</b><span class="small muted" style="display:block">${esc(ubic(x))}</span><span class="small muted num" style="display:block">${fecha(x.t_fin)}</span>
        <span class="small" style="display:block;margin-top:2px">${pendiente(x) ? '<span class="t-sosp">Pendiente de revisión</span>' : esc(enfermedadDe(x))}</span></span>
      <span style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${chip(e)}<b class="small num">${Math.round(x.prob * 100)}%</b></span></button>`; }).join("")}
    ${paginas > 1 ? `<div class="tarjeta" style="padding:0">${paginacion(total, paginas)}</div>` : ""}</div>`}`;
}
function paginacion(total, paginas) {
  const p = S.filtro.pagina, d = (p - 1) * POR_PAGINA + 1, h = Math.min(total, p * POR_PAGINA);
  return `<div class="paginas"><span>${d}–${h} de ${total} registros</span><span class="acciones">
    <button data-pag="${p - 1}" ${p <= 1 ? "disabled" : ""}>Anterior</button><button data-pag="${p + 1}" ${p >= paginas ? "disabled" : ""}>Siguiente</button></span></div>`;
}

/* ---------- Detalle (panel lateral) ---------- */
function pintarModal() {
  const m = $("#modal"); if (!m) return;
  if (!S.modal) { m.innerHTML = ""; document.body.style.overflow = ""; return; }
  const x = S.ins[S.modal]; if (!x) { S.modal = null; m.innerHTML = ""; return; }
  const e = estadoDe(x.prob), r = x.revision || {};
  const vet = S.modal_vet ?? r.veterinario ?? (esAlerta(x) ? "enferma" : "sana");
  document.body.style.overflow = "hidden";
  m.innerHTML = `<div class="fondo-modal" data-acc="cerrar-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="Detalle del diagnóstico" data-dentro>
    <div style="display:flex;justify-content:space-between;align-items:center"><h2>${esc(x.codigo || "Gallina sin código")}</h2><button class="icono-btn" data-acc="cerrar-modal" aria-label="Cerrar">${ic("cerrar")}</button></div>
    <img class="grande" src="${esc(x.recorte_url || "")}" alt="Cresta analizada">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">${chip(e)}${barraProb(x.prob)}</div>
    <div class="datos" style="margin:0">
      <div>Fecha<b class="num">${fecha(x.t_fin)}</b></div><div>Tiempo de detección<b class="num">${seg(x.ms_total)}</b></div>
      <div>Análisis de los modelos<b class="num">${seg(x.ms_modelos)}</b></div><div>Confianza de YOLO<b class="num">${pct((x.conf_yolo || 0) * 100, 0)}</b></div>
    </div>
    <hr class="separador"><h3>Datos de la gallina</h3>
    <div class="formulario" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <label class="campo">ID gallina<input type="text" id="d-codigo" class="mono" value="${esc(x.codigo)}" autocapitalize="characters"></label>
      <label class="campo">Galpón<input type="text" id="d-galpon" value="${esc(x.galpon)}"></label>
      <label class="campo">Jaula / hilera<input type="text" id="d-jaula" value="${esc(x.jaula)}"></label>
    </div>
    <hr class="separador"><h3>Revisión del veterinario</h3>
    ${x.revision ? `<div class="aviso f-${r.veterinario === "enferma" ? "enf" : "sana"}">${ic(r.veterinario === "enferma" ? "pulso" : "check")}<span>Revisado el ${fecha(r.t)}: <b>${r.veterinario === "enferma" ? esc(r.enfermedad || "Enfermedad confirmada") : "sin enfermedad"}</b>${r.nota ? ` · ${esc(r.nota)}` : ""}</span></div>` : esAlerta(x) ? `<div class="aviso f-sosp">${ic("alerta")}<span>Alerta pendiente: el veterinario debe evaluar a esta gallina.</span></div>` : ""}
    <div class="seg" role="group" aria-label="Diagnóstico del veterinario"><button data-vet="sana" aria-pressed="${vet === "sana"}">Sin enfermedad</button><button data-vet="enferma" aria-pressed="${vet === "enferma"}">Enfermedad confirmada</button></div>
    ${vet === "enferma" ? `<label class="campo">Enfermedad<select id="d-enf">${ENFERMEDADES.map(n => `<option ${r.enfermedad === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>` : ""}
    <label class="campo">Observación<textarea id="d-nota" placeholder="Ej.: ronquera, aislar en jaula de observación">${esc(r.nota)}</textarea></label>
    <div class="acciones"><button class="primario" data-acc="guardar-detalle" style="flex:1">Guardar cambios</button></div>
    <hr class="separador">
    ${S.confirmarBorrar ? `<div class="aviso f-enf">${ic("alerta")}<span>¿Eliminar este diagnóstico? No se puede deshacer.</span></div><div class="acciones"><button class="peligro" data-acc="borrar-si" style="flex:1">Sí, eliminar</button><button data-acc="borrar-no" style="flex:1">Cancelar</button></div>`
      : `<button class="peligro" data-acc="borrar">${ic("basura")}Eliminar diagnóstico</button>`}
  </div></div>`;
}
async function guardarDetalle() {
  const x = structuredClone(S.ins[S.modal]); if (!x) return;
  x.codigo = ($("#d-codigo").value || "").trim().toUpperCase(); x.galpon = $("#d-galpon").value.trim(); x.jaula = $("#d-jaula").value.trim();
  const vet = S.modal_vet ?? x.revision?.veterinario ?? null;
  const nota = $("#d-nota").value.trim(), enf = $("#d-enf")?.value || "";
  if (vet) {
    const decision = esAlerta(x) ? (vet === "enferma" ? "confirmada" : "falsa_alarma") : (vet === "enferma" ? "no_detectada" : "correcta");
    x.revision = { veterinario: vet, enfermedad: vet === "enferma" ? enf : "", nota, decision, t: x.revision?.t && x.revision.veterinario === vet && x.revision.enfermedad === enf ? x.revision.t : new Date().toISOString() };
    x.estado = esAlerta(x) ? "revisada" : "no_aplica";
  }
  try { await guardar("inspecciones", S.modal, x); toast("Cambios guardados"); S.modal = null; S.modal_vet = undefined; render(); }
  catch (e) { console.error(e); toast("No se pudo guardar. Revisa la conexión."); }
}

/* ---------- Capturar ---------- */
function vCapturar() {
  const c = S.cap, listo = S.modelos === "listo", ocupado = c.fase === "procesando";
  const deshab = !listo || ocupado ? "off" : "";
  let bloque = "";
  if (c.fase === "procesando" || c.fase === "resultado" || c.fase === "error") {
    bloque = `<div class="tarjeta"><h2>Procesamiento de la imagen</h2><p class="muted small">Análisis real con los modelos entrenados, ejecutado en este dispositivo.</p>
      <div class="pasos" id="pasos">${pasosHTML()}</div></div>`;
  }
  if (c.fase === "resultado" && c.doc) {
    const x = c.doc, e = estadoDe(x.prob);
    bloque += `<div class="tarjeta"><div class="resultado"><img src="${esc(x.recorte_url)}" alt="Cresta analizada">
      <div><span class="muted small">Resultado</span><div class="veredicto t-${e.cls}">${e.txt}</div>${barraProb(x.prob)}
        <div class="datos"><div>Tiempo de detección<b class="num">${seg(x.ms_total)}</b></div><div>Análisis de los modelos<b class="num">${seg(x.ms_modelos)}</b></div>
          <div>ID gallina<b>${esc(x.codigo || "Sin código")}</b></div><div>Ubicación<b>${esc([x.galpon, x.jaula].filter(Boolean).join(" · ") || "—")}</b></div></div>
        ${esAlerta(x) ? `<div class="aviso f-${e.cls}" style="margin-top:12px">${ic("campana")}<span><b>Alerta enviada al veterinario.</b> Separa a la gallina hasta su revisión.</span></div>` : `<div class="aviso f-sana" style="margin-top:12px">${ic("check")}<span>No se detectaron signos de alteración en la cresta.</span></div>`}
        <div class="acciones" style="margin-top:14px"><button class="primario" data-acc="nueva-captura">${ic("camara")}Nueva captura</button><button data-acc="ver-ultimo">Ver detalle</button></div></div></div></div>`;
  }
  if (c.fase === "error") bloque += `<div class="aviso f-sosp">${ic("alerta")}<span>${esc(c.error)}</span></div>`;
  return `
  <div class="cabecera"><div><h1>Capturar</h1><p>Toma o sube la foto de la cresta: completa, de perfil, a 20–30 cm y con luz natural.</p></div></div>
  ${listo ? "" : `<div class="aviso f-info">${S.modelos === "error" ? ic("alerta") + "<span>No se pudieron cargar los modelos. Revisa la conexión y recarga la página.</span>" : `<span class="spin"></span><span>Cargando los modelos de diagnóstico (${Math.round(S.progresoModelos * 100)} %). La primera vez descarga unos 29 MB; después funciona sin internet.</span>`}</div>`}
  <div class="tarjeta"><h3>Datos de la inspección</h3><div class="formulario" style="margin-top:12px">
    <label class="campo">Galpón<input type="text" id="u-galpon" value="${esc(S.ubic.galpon)}" placeholder="Galpón 1"></label>
    <label class="campo">Jaula / hilera<input type="text" id="u-jaula" value="${esc(S.ubic.jaula)}" placeholder="Hilera B, jaula 14"></label>
    <label class="campo">ID gallina (opcional)<input type="text" id="u-codigo" class="mono" placeholder="G120" autocapitalize="characters"></label></div></div>
  <div class="opciones-captura">
    <div class="opcion"><div class="ico f-brand">${ic("camara")}</div><h3>Capturar foto</h3><p class="muted small">Abre la cámara del dispositivo</p>
      <label class="btn primario ${deshab}">${ic("camara")}<span class="largo">Abrir cámara</span><span class="corto">Cámara</span><input type="file" accept="image/*" capture="environment" data-foto="captura" ${deshab ? "disabled" : ""}></label></div>
    <div class="opcion"><div class="ico f-sosp">${ic("subir")}</div><h3>Subir imagen</h3><p class="muted small">Selecciona una foto de la galería</p>
      <label class="btn ${deshab}">${ic("subir")}<span class="largo">Seleccionar archivo</span><span class="corto">Galería</span><input type="file" accept="image/*" data-foto="galeria" ${deshab ? "disabled" : ""}></label></div>
  </div>
  ${bloque}`;
}
function pasosHTML() {
  const c = S.cap;
  return PASOS.map((t, i) => {
    const est = c.fase === "resultado" || i < c.paso ? "listo" : (i === c.paso && c.fase === "procesando" ? "activo" : "");
    return `<div class="paso ${est}"><div class="fila"><span>${t}</span><span>${est === "listo" ? "100 %" : est === "activo" ? "en curso" : "0 %"}</span></div><div class="barra"><i></i></div></div>`;
  }).join("");
}
let tInicio = {};
async function procesarFoto(origen, file) {
  if (!file) return;
  const t0 = tInicio[origen] ?? performance.now(); delete tInicio[origen];
  S.cap = { fase: "procesando", paso: 0, doc: null, error: "" };
  const codigo = ($("#u-codigo")?.value || "").trim().toUpperCase();
  render();
  $("#pasos")?.scrollIntoView({ behavior: "smooth", block: "center" });
  let bmp, r;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { S.cap = { fase: "error", paso: -1, error: "No se pudo leer la foto. Configura la cámara en formato JPG e inténtalo de nuevo." }; render(); return; }
  try {
    r = await MotorCrestas.diagnosticar(bmp, i => { S.cap.paso = i; const p = $("#pasos"); if (p) p.innerHTML = pasosHTML(); });
  } catch (e) { console.error(e); S.cap = { fase: "error", paso: -1, error: "Ocurrió un error al analizar la foto. Inténtalo de nuevo." }; render(); return; }
  finally { bmp.close && bmp.close(); }
  const ms_total = performance.now() - t0;
  if (!r.encontrada) { S.cap = { fase: "error", paso: -1, error: "No se encontró la cresta. Acércate a 20–30 cm y procura que la cresta salga completa y de perfil." }; render(); return; }
  try {
    const recorte_url = await subirRecorte(r.recorte);
    const ahora = new Date();
    const doc = { modo: "rutina", codigo, galpon: S.ubic.galpon, jaula: S.ubic.jaula,
      prob: +r.prob.toFixed(4), resultado: r.prob >= UMBRAL ? "enferma" : "sana", confianza_baja: r.prob >= UMBRAL && r.prob < ALTA,
      umbral: UMBRAL, conf_yolo: +r.confYolo.toFixed(3), color: r.color.map(v => +v.toFixed(2)),
      t_inicio: new Date(ahora - ms_total).toISOString(), t_fin: ahora.toISOString(), ms_total: Math.round(ms_total), ms_modelos: Math.round(r.ms_modelos),
      estado: r.prob >= UMBRAL ? "pendiente" : "no_aplica", recorte_url };
    const id = "i" + ahora.getTime();
    await guardar("inspecciones", id, doc);
    S.cap = { fase: "resultado", paso: PASOS.length, doc: { ...doc, _id: id }, error: "" };
    if (esAlerta(doc)) toast("Alerta enviada al veterinario");
  } catch (e) { console.error(e); S.cap = { fase: "error", paso: -1, error: "El análisis terminó, pero no se pudo guardar. Revisa la conexión o tu sesión." }; }
  render();
}
async function subirRecorte(canvas) {
  const k = Math.min(1, 360 / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas"); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
  return await Almacen.subirImagen(blob);
}
async function guardar(col, id, datos) {
  S.ins[id] = datos;
  await Almacen.guardar(col, id, datos);
}

/* ---------- Alertas ---------- */
function vAlertas() {
  const todas = Object.entries(S.ins).filter(([, x]) => esAlerta(x) || x.revision?.decision === "no_detectada");
  const pend = todas.filter(([, x]) => pendiente(x)).sort((a, b) => b[1].prob - a[1].prob);
  const rev = todas.filter(([, x]) => x.revision).sort((a, b) => b[1].revision.t.localeCompare(a[1].revision.t));
  const lista = S.pestanaAlertas === "pendientes" ? pend : rev;
  const tarjeta = ([id, x]) => { const e = estadoDe(x.prob), r = x.revision;
    return `<div class="tarjeta alerta" style="${!r ? `border-left:4px solid var(--${e.cls})` : ""}"><img src="${esc(x.recorte_url)}" alt="Cresta en alerta">
      <div class="cuerpo"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">${chip(e)}<span class="small muted num">${fecha(x.t_fin)}</span></div>
        <b>${esc(x.codigo || "Sin código")} <span class="muted small" style="font-weight:500">· ${esc([x.galpon, x.jaula].filter(Boolean).join(" · ") || "Sin ubicación")}</span></b>
        ${barraProb(x.prob)}
        ${r ? `<span class="small"><b class="${r.veterinario === "enferma" ? "t-enf" : "t-sana"}">${r.veterinario === "enferma" ? esc(r.enfermedad || "Enfermedad confirmada") : "Falsa alarma"}</b>${r.nota ? ` · ${esc(r.nota)}` : ""}</span>`
          : `<div class="acciones"><button class="primario" data-ver="${id}" data-vet-ini="enferma" style="flex:1">Confirmar enfermedad</button><button data-falsa="${id}" style="flex:1">Falsa alarma</button></div>`}
      </div></div>`; };
  return `
  <div class="cabecera"><div><h1>Alertas</h1><p>Gallinas con signos en la cresta que el veterinario debe evaluar.</p></div>
    <div class="pestanas" role="group"><button data-pest="pendientes" aria-pressed="${S.pestanaAlertas === "pendientes"}">Pendientes (${pend.length})</button><button data-pest="revisadas" aria-pressed="${S.pestanaAlertas === "revisadas"}">Revisadas (${rev.length})</button></div></div>
  ${lista.length ? `<div class="lista-alertas">${lista.map(tarjeta).join("")}</div>` :
    `<div class="tarjeta vacio">${ic(S.pestanaAlertas === "pendientes" ? "check" : "campana")}<b>${S.pestanaAlertas === "pendientes" ? "No hay alertas pendientes" : "Aún no hay alertas revisadas"}</b><span>${S.pestanaAlertas === "pendientes" ? "Cuando una captura salga sospechosa o enferma, aparecerá aquí." : "Las alertas revisadas por el veterinario se guardan aquí."}</span></div>`}`;
}
async function falsaAlarma(id) {
  const x = structuredClone(S.ins[id]); if (!x) return;
  x.revision = { veterinario: "sana", enfermedad: "", nota: "", decision: "falsa_alarma", t: new Date().toISOString() }; x.estado = "revisada";
  try { await guardar("inspecciones", id, x); toast("Marcada como falsa alarma"); render(); } catch { toast("No se pudo guardar."); }
}

/* ---------- Estadísticas ---------- */
function datosPeriodo() {
  const dias = S.periodoEst === "todo" ? null : +S.periodoEst;
  const desde = dias ? Date.now() - dias * 864e5 : 0;
  return Object.values(S.ins).filter(x => new Date(x.t_fin).getTime() >= desde);
}
function vEstadisticas() {
  const xs = datosPeriodo(), c = contar(xs);
  const criticos = xs.filter(pendiente).length;
  const tpd = xs.length ? xs.reduce((s, x) => s + (x.ms_total || 0), 0) / xs.length : null;
  const conf = {}; xs.forEach(x => { if (x.revision?.veterinario === "enferma") { const k = x.revision.enfermedad || "Sin especificar"; conf[k] = (conf[k] || 0) + 1; } });
  const rev = xs.filter(x => x.revision && esAlerta(x)), falsas = rev.filter(x => x.revision.veterinario === "sana").length;
  const opt = (v, t) => `<option value="${v}" ${S.periodoEst === v ? "selected" : ""}>${t}</option>`;
  return `
  <div class="cabecera"><div><h1>Estadísticas y análisis</h1><p>Resumen con gráficas de los diagnósticos del periodo.</p></div>
    <div class="acciones"><select id="e-periodo" aria-label="Periodo">${opt("7", "Últimos 7 días")}${opt("30", "Últimos 30 días")}${opt("90", "Últimos 90 días")}${opt("todo", "Todo el historial")}</select>
      <button class="primario" data-acc="exportar">${ic("descargar")}<span class="ocultable">Exportar reporte</span></button></div></div>
  <div class="kpis">
    ${kpi("Total diagnosticados", c.total, S.periodoEst === "todo" ? "Todo el historial" : `Últimos ${S.periodoEst} días`, "camara", "brand")}
    ${kpi("Tasa de salud", c.total ? pct(c.sana / c.total * 100, 0) : "—", `${c.sana} de ${c.total} gallinas sanas`, "check", "sana")}
    ${kpi("Casos críticos", criticos, "Alertas sin revisar", "alerta", "enf")}
    ${kpi("Tiempo de detección", tpd == null ? "—" : seg(tpd), "Promedio por foto", "reloj", "brand")}
  </div>
  ${!xs.length ? `<div class="tarjeta vacio">${ic("grafico")}<b>Sin datos en este periodo</b><span>Las gráficas aparecerán cuando haya diagnósticos registrados.</span></div>` : `
  <div class="graficos">
    <div class="tarjeta"><h3>Tendencias temporales</h3><p class="muted small">Diagnósticos por día según su estado</p><div class="grafico" style="margin-top:10px"><canvas id="g-tendencia" aria-label="Gráfico de tendencias"></canvas></div></div>
    <div class="tarjeta"><h3>Distribución por estado</h3><p class="muted small">Proporción del periodo</p><div class="grafico" style="margin-top:10px"><canvas id="g-estado" aria-label="Gráfico de distribución"></canvas></div></div>
  </div>
  <div class="graficos dos">
    <div class="tarjeta"><h3>Por galpón</h3><p class="muted small">Diagnósticos según estado en cada galpón</p><div class="grafico bajo" style="margin-top:10px"><canvas id="g-galpon" aria-label="Gráfico por galpón"></canvas></div></div>
    <div class="tarjeta"><h3>Revisión del veterinario</h3><p class="muted small">Alertas revisadas y enfermedades confirmadas</p>
      <div class="datos"><div>Alertas revisadas<b class="num">${rev.length}</b></div><div>Falsas alarmas<b class="num">${falsas}${rev.length ? ` (${pct(falsas / rev.length * 100, 0)})` : ""}</b></div></div>
      ${Object.keys(conf).length ? `<table class="tabla-simple" style="margin-top:12px"><thead><tr><th>Enfermedad confirmada</th><th style="text-align:right">Casos</th></tr></thead><tbody>
        ${Object.entries(conf).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num" style="text-align:right">${v}</td></tr>`).join("")}</tbody></table>`
        : `<p class="muted small" style="margin-top:12px">Aún no hay enfermedades confirmadas en este periodo.</p>`}</div>
  </div>`}`;
}
function dibujarGraficos() {
  if (!window.Chart) return;
  const xs = datosPeriodo(); if (!xs.length) return;
  const tinta = css("--muted"), linea = css("--line"), C = { sana: css("--sana"), sospechosa: css("--sosp"), enferma: css("--enf") };
  Chart.defaults.font.family = "Figtree, system-ui, sans-serif"; Chart.defaults.color = tinta;
  // días del periodo
  const fechas = xs.map(x => new Date(x.t_fin)); const min = new Date(Math.min(...fechas)); const dias = [];
  // el eje empieza en el primer diagnóstico del periodo (mínimo 7 días visibles), para no mostrar semanas vacías
  const inicio = new Date(Math.min(Math.max(min.getTime(), S.periodoEst === "todo" ? 0 : Date.now() - (+S.periodoEst - 1) * 864e5), Date.now() - 6 * 864e5));
  for (let d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()); d <= new Date(); d.setDate(d.getDate() + 1)) dias.push(d.toLocaleDateString("en-CA"));
  const serie = k => dias.map(d => xs.filter(x => diaClave(x.t_fin) === d && estadoDe(x.prob).clave === k).length);
  const etiquetas = dias.map(d => { const [a, m, dd] = d.split("-"); return `${+dd}/${+m}`; });
  const eje = { grid: { color: linea }, border: { color: linea }, ticks: { color: tinta } };
  const comunes = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } } };
  S.graficos.push(new Chart($("#g-tendencia"), { type: "bar", options: { ...comunes, interaction: { mode: "index", intersect: false }, scales: { x: { ...eje, stacked: true, grid: { display: false }, ticks: { ...eje.ticks, maxTicksLimit: 12 } }, y: { ...eje, stacked: true, beginAtZero: true, ticks: { ...eje.ticks, precision: 0 } } } },
    data: { labels: etiquetas, datasets: [["Sana", "sana"], ["Sospechosa", "sospechosa"], ["Enferma", "enferma"]].map(([n, k]) => ({ label: n, data: serie(k), backgroundColor: C[k], borderRadius: 3, maxBarThickness: 22 })) } }));
  const c = contar(xs);
  S.graficos.push(new Chart($("#g-estado"), { type: "doughnut", options: { ...comunes, cutout: "62%" },
    data: { labels: ["Sana", "Sospechosa", "Enferma"], datasets: [{ data: [c.sana, c.sospechosa, c.enferma], backgroundColor: [C.sana, C.sospechosa, C.enferma], borderColor: css("--panel"), borderWidth: 3 }] } }));
  const galpones = [...new Set(xs.map(x => x.galpon || "Sin galpón"))].sort();
  S.graficos.push(new Chart($("#g-galpon"), { type: "bar", options: { ...comunes, scales: { x: { ...eje, stacked: true }, y: { ...eje, stacked: true, beginAtZero: true, ticks: { ...eje.ticks, precision: 0 } } } },
    data: { labels: galpones, datasets: [["Sana", "sana"], ["Sospechosa", "sospechosa"], ["Enferma", "enferma"]].map(([n, k]) => ({ label: n, backgroundColor: C[k], borderRadius: 6, maxBarThickness: 46,
      data: galpones.map(g => xs.filter(x => (x.galpon || "Sin galpón") === g && estadoDe(x.prob).clave === k).length) })) } }));
}

/* ---------- Cuenta (celular) ---------- */
function vCuenta() {
  return `<div class="cabecera"><div><h1>Cuenta</h1><p>Estado del aplicativo y sesión.</p></div></div>
  <div class="tarjeta" style="display:flex;flex-direction:column;gap:10px">
    <div class="estado-modelo" style="padding:0">${estadoModelo()}</div>
    <div class="usuario"><span class="muted">${S.nube ? "Sesión iniciada como" : "Modo local"}</span><b>${esc(S.usuario || "Este dispositivo")}</b></div>
    <button data-acc="exportar">${ic("descargar")}Exportar diagnósticos (CSV)</button>
    ${S.nube ? `<button class="peligro" data-acc="salir">${ic("salir")}Cerrar sesión</button>` : ""}</div>`;
}

/* ---------- Exportar ---------- */
function csvCelda(v) { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function exportar() {
  const filas = [["id_gallina", "galpon", "jaula", "fecha_hora", "estado", "probabilidad_enfermedad", "tiempo_deteccion_s", "tiempo_analisis_s",
    "confianza_yolo", "revision_veterinario", "enfermedad", "decision", "nota", "fecha_revision", "umbral"]];
  for (const x of Object.values(S.ins).sort((a, b) => a.t_fin.localeCompare(b.t_fin))) {
    const r = x.revision || {};
    filas.push([x.codigo, x.galpon, x.jaula, x.t_fin, estadoDe(x.prob).txt, x.prob, (x.ms_total / 1000).toFixed(2), (x.ms_modelos / 1000).toFixed(2),
      x.conf_yolo ?? "", r.veterinario || "", r.enfermedad || "", r.decision || (pendiente(x) ? "pendiente" : ""), r.nota || "", r.t || "", x.umbral]);
  }
  try { Almacen.descargar(`diagnosticos_crestas_${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + filas.map(r => r.map(csvCelda).join(",")).join("\r\n")); toast("Reporte exportado"); }
  catch { toast("No se pudo exportar."); }
}

/* ===================== Eventos (delegados) ===================== */
document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-ir],[data-acc],[data-ver],[data-borrar],[data-pag],[data-pest],[data-falsa],[data-vet],input[data-foto]");
  if (!el) return;
  if (el.matches("input[data-foto]")) { tInicio[el.dataset.foto] = performance.now(); return; }
  if (el.dataset.acc === "cerrar-modal" && el.classList.contains("fondo-modal") && ev.target !== el) return;
  const d = el.dataset;
  if (d.ir) return ir(d.ir);
  if (d.ver) { ev.stopPropagation(); S.modal = d.ver; S.modal_vet = d.vetIni; S.confirmarBorrar = false; return pintarModal(); }
  if (d.borrar) { ev.stopPropagation(); S.modal = d.borrar; S.modal_vet = undefined; S.confirmarBorrar = true; return pintarModal(); }
  if (d.pag) { S.filtro.pagina = +d.pag; return render(); }
  if (d.pest) { S.pestanaAlertas = d.pest; return render(); }
  if (d.falsa) return falsaAlarma(d.falsa);
  if (d.vet) { S.modal_vet = d.vet; const y = $(".modal")?.scrollTop; pintarModal(); if ($(".modal")) $(".modal").scrollTop = y; return; }
  switch (d.acc) {
    case "cerrar-modal": S.modal = null; S.modal_vet = undefined; S.confirmarBorrar = false; return pintarModal();
    case "guardar-detalle": return guardarDetalle();
    case "borrar": S.confirmarBorrar = true; return pintarModal();
    case "borrar-no": S.confirmarBorrar = false; return pintarModal();
    case "borrar-si": { const id = S.modal; try { await Almacen.borrar("inspecciones", id); delete S.ins[id]; toast("Diagnóstico eliminado"); } catch { toast("No se pudo eliminar."); }
      S.modal = null; S.confirmarBorrar = false; return render(); }
    case "exportar": return exportar();
    case "nueva-captura": S.cap = { fase: "listo", paso: -1, doc: null }; render(); return window.scrollTo(0, 0);
    case "ver-ultimo": if (S.cap.doc) { S.modal = S.cap.doc._id; S.modal_vet = undefined; pintarModal(); } return;
    case "salir": try { await Almacen.salir(); } catch {} return location.reload();
    case "ver-clave": { const i = $("#i-clave"); i.type = i.type === "password" ? "text" : "password"; el.innerHTML = ic(i.type === "password" ? "ojo" : "ojoNo"); return; }
    case "olvide": { const c = ($("#i-correo").value || "").trim(); if (!c) { toast("Escribe tu correo y vuelve a tocar «¿Olvidaste tu contraseña?»."); return $("#i-correo").focus(); }
      try { await Almacen.restablecer(c); toast("Te enviamos un correo para restablecer la contraseña."); } catch { toast("No se pudo enviar el correo. Revisa la dirección."); } return; }
  }
});
document.addEventListener("change", ev => {
  const el = ev.target;
  if (el.matches("input[data-foto]")) { const f = el.files[0]; el.value = ""; return procesarFoto(el.dataset.foto, f); }
  if (el.id === "f-estado") { S.filtro.estado = el.value; S.filtro.pagina = 1; return render(); }
  if (el.id === "f-periodo") { S.filtro.periodo = el.value; S.filtro.pagina = 1; return render(); }
  if (el.id === "e-periodo") { S.periodoEst = el.value; return render(); }
});
document.addEventListener("input", ev => {
  const el = ev.target;
  if (el.id === "f-texto") { S.filtro.texto = el.value; S.filtro.pagina = 1; clearTimeout(el._t); el._t = setTimeout(() => { const pos = el.selectionStart; render(); const n = $("#f-texto"); n.focus(); n.setSelectionRange(pos, pos); }, 250); }
  if (el.id === "u-galpon") { S.ubic.galpon = el.value; lsSet("ubic", S.ubic); }
  if (el.id === "u-jaula") { S.ubic.jaula = el.value; lsSet("ubic", S.ubic); }
});
document.addEventListener("submit", async ev => {
  if (ev.target.id !== "f-ingreso") return; ev.preventDefault();
  const btn = ev.target.querySelector("button[type=submit]"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Ingresando…';
  try { S.usuario = await Almacen.entrar($("#i-correo").value.trim(), $("#i-clave").value); S.necesitaIngreso = false; $("#raiz").innerHTML = ""; conectar(); render(); }
  catch { btn.disabled = false; btn.textContent = "Iniciar sesión"; toast("Correo o contraseña incorrectos."); }
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && S.modal) { S.modal = null; pintarModal(); } });
window.addEventListener("hashchange", () => { const v = leerHash(); if (v && v !== S.vista) ir(v); });

/* ===================== Inicio ===================== */
let conectado = false;
function conectar() {
  if (conectado) return; conectado = true;
  const escuchar = (col, clave) => Almacen.escuchar(col, o => {
    S[clave] = structuredClone(o);
    const foco = document.activeElement;
    if (S.cap.fase === "procesando" || (foco && /INPUT|TEXTAREA|SELECT/.test(foco.tagName) && foco.type !== "file") || S.modal) { if (!S.modal) pintarNav(); return; }
    const y = window.scrollY; render(); window.scrollTo(0, y);
  });
  escuchar("inspecciones", "ins");
}
async function cargarModelos() {
  if (!window.tf || !window.MotorCrestas) { S.modelos = "error"; return; }
  try {
    S.backend = await MotorCrestas.cargar("modelos/", p => { S.progresoModelos = p; if ($("#estado-modelo")) $("#estado-modelo").innerHTML = estadoModelo(); });
    S.modelos = "listo";
  } catch (e) { console.error(e); S.modelos = "error"; }
  if (!S.necesitaIngreso) { if (S.vista === "capturar" || S.vista === "cuenta") render(); else pintarNav(); }
}
(async () => {
  try {
    const r = await Almacen.iniciar();
    S.nube = r.modo === "nube"; S.usuario = r.usuario; S.necesitaIngreso = r.necesitaIngreso;
  } catch (e) { console.error(e); toast("No se pudo conectar con el almacenamiento."); }
  render();
  if (!S.necesitaIngreso) conectar();
  cargarModelos();
})();
})();
