(() => {
"use strict";
const UMBRAL = 0.15;          // calibrado con el motor de esta app en validación (sensibilidad 94,4 % ≥ 90 %)
const BAJA_HASTA = 0.30;      // entre el umbral y este valor: "Enferma, confianza baja"
const FOTOS_EVAL = 5;         // fotos por gallina en la muestra de evaluación (PDC)

const S = {tab: lsGet("tab","inspeccionar"), listo:false, backend:"", db:null, assets:null, downloads:null, nube:false,
  inspecciones:{}, evaluacion:{}, ultimo:null, analizando:false, gallina:null, pre:null, ubic: lsGet("ubic", {galpon:"", jaula:""})};
const $ = (q, el=document) => el.querySelector(q);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function lsGet(k,d){try{const v=localStorage.getItem("diag:"+k);return v==null?d:JSON.parse(v);}catch{return d;}}
function lsSet(k,v){try{localStorage.setItem("diag:"+k,JSON.stringify(v));}catch{}}
function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,3000);}
const seg = ms => (ms/1000).toFixed(1).replace(".", ",") + " s";
const pct = (v, d=1) => v==null || isNaN(v) ? "—" : v.toFixed(d).replace(".", ",") + " %";
const hora = iso => { try { return new Date(iso).toLocaleString("es-PE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); } catch { return iso; } };
const srcRecorte = x => x?.recorte_url || "";

function veredicto(p){
  if (p < UMBRAL) return {res:"sana", txt:"Sana", cls:"sana"};
  if (p < BAJA_HASTA) return {res:"enferma", txt:"Enferma, confianza baja", cls:"baja"};
  return {res:"enferma", txt:"Enferma", cls:"enf"};
}

/* ---------------- Guardado ---------------- */
async function subirRecorte(canvas){
  const k = Math.min(1, 360/Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas"); c.width=Math.round(canvas.width*k); c.height=Math.round(canvas.height*k);
  c.getContext("2d").drawImage(canvas,0,0,c.width,c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.88));
  return {recorte_url: await Almacen.subirImagen(blob)};
}
async function guardar(col, id, datos){
  if (col==="inspecciones") S.inspecciones[id]=datos; else S.evaluacion[id]=datos;
  await Almacen.guardar(col, id, datos);
}

/* ---------------- Analizar una foto ---------------- */
async function analizarArchivo(file){
  let bmp;
  try { bmp = await createImageBitmap(file, {imageOrientation:"from-image"}); }
  catch { throw {usuario:"No se pudo leer la foto. Configura la cámara en JPG e inténtalo de nuevo."}; }
  const r = await MotorCrestas.diagnosticar(bmp);
  bmp.close && bmp.close();
  return r;
}

/* ---------------- Vistas ---------------- */
function vIngreso(){
  return `<div class="panel" style="max-width:420px;margin:24px auto 0">
    <h2>Ingresar</h2>
    <p class="small muted" style="margin:0">Usa la cuenta que te asignó la responsable del proyecto (veterinario o galponero).</p>
    <form id="f-ingreso" style="display:flex;flex-direction:column;gap:10px">
      <label class="f">Correo<input type="email" id="i-correo" autocomplete="username" required style="font:400 1rem var(--f-body);padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)"></label>
      <label class="f">Contraseña<input type="password" id="i-clave" autocomplete="current-password" required style="font:400 1rem var(--f-body);padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)"></label>
      <button class="primary" type="submit">Ingresar</button>
    </form></div>`;
}
function render(){
  document.querySelector(".tabs").hidden = !!S.necesitaIngreso;
  if (S.necesitaIngreso){ $("#vista").innerHTML = vIngreso(); enlazarIngreso(); return; }
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab===S.tab));
  const pend = Object.values(S.inspecciones).filter(x => x.estado==="pendiente").length;
  const nb = $("#nalertas"); nb.hidden = !pend; nb.textContent = pend;
  const v = $("#vista");
  v.innerHTML = ({inspeccionar:vInspeccionar, alertas:vAlertas, evaluacion:vEvaluacion, indicadores:vIndicadores}[S.tab])();
  enlazar();
}
function bannerNube(){ return S.nube ? "" : `<div class="banner">Modo local: los datos se guardan solo en este dispositivo. Para compartir las alertas con el veterinario, configura Firebase (ver LEEME).</div>`; }
function botonFoto(id, texto, extra=""){
  return `<label class="btn primary big ${S.listo && !S.analizando ? "" : "off"}" ${extra}>${S.analizando ? '<span class="spin"></span> Analizando…' : texto}<input type="file" accept="image/*" capture="environment" data-foto="${id}" ${S.listo && !S.analizando ? "" : "disabled"}></label>`;
}

function vInspeccionar(){
  const u = S.ultimo;
  let res = "";
  if (u?.error) res = `<div class="estado e-na"><div></div><div><b class="t" style="font-size:1.1rem">${esc(u.error)}</b></div></div>`;
  else if (u){
    const v = veredicto(u.prob);
    res = `<div class="estado e-${v.cls}"><img src="${esc(srcRecorte(u))}" alt="Cresta analizada">
      <div><b class="t">${v.txt}</b><span>Probabilidad de enfermedad: <b class="mono">${pct(u.prob*100,0)}</b></span><br>
      <span class="small">Tiempo de detección: <b class="mono">${seg(u.ms_total)}</b> · análisis: <span class="mono">${seg(u.ms_modelos)}</span></span>
      ${v.res==="enferma" ? `<br><span class="small"><b>Alerta enviada al veterinario.</b></span>` : ""}</div></div>`;
  }
  return `${bannerNube()}
  <div class="panel">
    <h2>Inspección de rutina</h2>
    <div class="row">
      <label class="f">Galpón<input type="text" id="u-galpon" value="${esc(S.ubic.galpon)}" placeholder="Galpón 2"></label>
      <label class="f">Jaula / hilera<input type="text" id="u-jaula" value="${esc(S.ubic.jaula)}" placeholder="Hilera B, jaula 14"></label>
    </div>
    <label class="f">Código de la gallina (opcional)<input type="text" id="u-codigo" class="mono" placeholder="G120" autocapitalize="characters"></label>
    ${botonFoto("rutina", "Inspeccionar gallina · tomar foto")}
    <p class="small muted" style="margin:0">El tiempo de detección se mide desde que tocas el botón hasta que aparece el resultado. Toma la cresta completa, de perfil, a 20–30 cm.</p>
  </div>
  ${res}`;
}

function vAlertas(){
  const xs = Object.entries(S.inspecciones).filter(([,x]) => x.resultado==="enferma").sort((a,b)=> (a[1].estado==="pendiente"?0:1)-(b[1].estado==="pendiente"?0:1) || b[1].t_fin.localeCompare(a[1].t_fin));
  if (!xs.length) return `${bannerNube()}<div class="empty">No hay alertas. Cuando una inspección detecte una cresta enferma, aparecerá aquí para que el veterinario la revise.</div>`;
  return `${bannerNube()}<div class="lista">${xs.map(([id,x]) => {
    const v = veredicto(x.prob);
    const rev = x.revision;
    return `<div class="alerta ${x.estado==="pendiente"?"pend":""}"><img src="${esc(srcRecorte(x))}" alt="Cresta en alerta">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div class="row between"><span class="chip c-${v.cls}">${v.txt} · ${pct(x.prob*100,0)}</span><span class="small muted">${hora(x.t_fin)}</span></div>
        <span class="small">${esc([x.galpon, x.jaula, x.codigo].filter(Boolean).join(" · ") || "Sin ubicación registrada")}</span>
        ${x.estado==="pendiente" ? `
          <textarea id="nota-${id}" placeholder="Diagnóstico u observación del veterinario"></textarea>
          <div class="row"><button class="primary" data-rev="${id}" data-dec="confirmada">Enfermedad confirmada</button><button data-rev="${id}" data-dec="falsa_alarma">Falsa alarma</button></div>`
        : `<span class="small"><b>${rev?.decision==="confirmada"?"Confirmada por el veterinario":"Falsa alarma"}</b> · ${hora(rev?.t)}${rev?.nota?` · ${esc(rev.nota)}`:""}</span>`}
      </div></div>`;}).join("")}</div>`;
}

function vEvaluacion(){
  if (S.gallina) return vGallinaEval(S.gallina);
  const gs = Object.values(S.evaluacion).sort((a,b)=>a.codigo.localeCompare(b.codigo));
  return `${bannerNube()}
  <div class="panel">
    <h2>Muestra de evaluación</h2>
    <p class="small muted" style="margin:0">Para las 100 gallinas de la muestra (50 enfermas y 50 sanas, con diagnóstico del veterinario). Por cada gallina se registra el <b>pretest</b> (inspección visual del galponero, cronometrada) y el <b>postest</b> (${FOTOS_EVAL} fotos analizadas por el aplicativo).</p>
    <div class="row"><label class="f">Código de la gallina<input type="text" id="e-codigo" class="mono" placeholder="E001" autocapitalize="characters"></label>
      <button class="primary" data-acc="agregar" style="align-self:flex-end">Agregar</button></div>
  </div>
  <div class="lista">${gs.length ? gs.map(g => {
    const a = aciertos(g);
    const n = Object.keys(g.fotos||{}).length;
    return `<button class="gal" data-gal="${esc(g.codigo)}"><span class="code">${esc(g.codigo)}</span>
      <span class="row" style="gap:6px">${g.diag ? `<span class="chip c-${g.diag==="sana"?"sana":"enf"}">${g.diag==="sana"?"Sana":"Enferma"}</span>` : `<span class="chip c-baja">Sin diagnóstico</span>`}
      <span class="chip">${g.pre ? "Pretest ✓" : "Pretest —"}</span></span>
      <span class="mono small">${n}/${FOTOS_EVAL}${a!=null ? ` · A=${a}` : ""}</span></button>`;}).join("") : `<div class="empty">Agrega la primera gallina de la muestra con su código.</div>`}</div>`;
}
function aciertos(g){
  if (!g.diag) return null;
  return Object.values(g.fotos||{}).filter(f => f.res === g.diag).length;
}
function vGallinaEval(cod){
  const g = S.evaluacion[cod];
  const a = aciertos(g);
  const corriendo = S.pre && S.pre.cod === cod;
  const slots = Array.from({length:FOTOS_EVAL}, (_,i) => {
    const k = String(i+1), f = (g.fotos||{})[k];
    const est = f && g.diag ? (f.res===g.diag ? "ok" : "mal") : "";
    const v = f ? veredicto(f.prob) : null;
    return `<label class="slot ${est} ${S.listo && !S.analizando ? "" : "off"}">${f ? `<img src="${esc(srcRecorte(f))}" alt="Foto ${k}"><span>${v.txt.replace(", confianza baja"," (baja)")}</span><span class="mono">${seg(f.ms)}</span>` : `<b>Foto ${k}</b><span class="muted">${S.analizando ? "…" : "Tomar"}</span>`}
      <input type="file" accept="image/*" capture="environment" data-foto="eval:${k}" ${S.listo && !S.analizando ? "" : "disabled"}></label>`;
  }).join("");
  return `<div class="row between"><button data-acc="volver">← Lista</button><span class="code mono" style="font-size:1.1rem">${esc(cod)}</span></div>
  <div class="panel"><span class="eyebrow">Diagnóstico del veterinario (estándar de referencia)</span>
    <div class="seg"><button data-diag="sana" aria-pressed="${g.diag==="sana"}">Sana</button><button data-diag="enferma" aria-pressed="${g.diag==="enferma"}">Enferma</button></div></div>
  <div class="panel"><h3>Pretest · inspección visual del galponero</h3>
    ${g.pre ? `<p style="margin:0">Resultado: <b>${g.pre.res==="sana"?"Sin signos":"Con signos"}</b> · tiempo <b class="mono">${seg(g.pre.ms)}</b>${g.diag?` · ${g.pre.res===g.diag?"coincide con el veterinario":"no coincide con el veterinario"}`:""}</p>
      <button data-acc="pre-rehacer">Repetir pretest</button>`
    : corriendo ? `<div class="timer" id="cron">0,0 s</div><p class="small muted" style="margin:0;text-align:center">El galponero observa la gallina sin el aplicativo. Toca su conclusión:</p>
      <div class="row"><button class="primary" style="flex:1" data-pre="sana">Sin signos</button><button class="primary" style="flex:1" data-pre="enferma">Con signos</button></div>`
    : `<button class="primary big" data-acc="pre-iniciar">Iniciar inspección visual (cronómetro)</button>`}
  </div>
  <div class="panel"><div class="row between"><h3>Postest · aplicativo (${FOTOS_EVAL} fotos)</h3>${a!=null?`<span class="mono">A<sub>i</sub> = ${a}/${FOTOS_EVAL}</span>`:""}</div>
    <div class="slots">${slots}</div>
    <p class="small muted" style="margin:0">Cada foto se analiza al tomarla; el tiempo se mide desde que tocas la casilla hasta el resultado. Borde verde: coincide con el veterinario; rojo: no coincide.</p></div>`;
}

/* ---------------- Indicadores ---------------- */
function calcular(){
  const gs = Object.values(S.evaluacion).filter(g => g.diag);
  const fotos = gs.flatMap(g => Object.values(g.fotos||{}).map(f => ({...f, diag:g.diag})));
  const conPost = gs.filter(g => Object.keys(g.fotos||{}).length);
  const conPre = gs.filter(g => g.pre);
  const media = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
  const vp = fotos.filter(f=>f.diag==="enferma"&&f.res==="enferma").length, fn = fotos.filter(f=>f.diag==="enferma"&&f.res==="sana").length;
  const vn = fotos.filter(f=>f.diag==="sana"&&f.res==="sana").length, fp = fotos.filter(f=>f.diag==="sana"&&f.res==="enferma").length;
  const pre = {n:conPre.length, tpd: media(conPre.map(g=>g.pre.ms)), pdc: conPre.length ? conPre.filter(g=>g.pre.res===g.diag).length/conPre.length*100 : null};
  const post = {n:conPost.length, completas: conPost.filter(g=>Object.keys(g.fotos).length>=FOTOS_EVAL).length, fotos:fotos.length,
    tpd: media(fotos.map(f=>f.ms)), pdc: media(conPost.map(g => aciertos(g)/Object.keys(g.fotos).length*100)),
    sens: vp+fn ? vp/(vp+fn)*100 : null, esp: vn+fp ? vn/(vn+fp)*100 : null, vp, fn, vn, fp};
  const ins = Object.values(S.inspecciones);
  const al = ins.filter(x=>x.resultado==="enferma"), rev = al.filter(x=>x.revision);
  const rutina = {n:ins.length, alertas:al.length, pendientes:al.filter(x=>x.estado==="pendiente").length, revisadas:rev.length,
    falsas: rev.filter(x=>x.revision.decision==="falsa_alarma").length, tpd: media(ins.map(x=>x.ms_total)),
    hastaRev: media(rev.map(x => new Date(x.revision.t) - new Date(x.t_fin)))};
  return {pre, post, rutina};
}
function vIndicadores(){
  const {pre, post, rutina} = calcular();
  const min = ms => ms==null ? "—" : (ms/60000 < 1 ? seg(ms) : (ms/60000).toFixed(1).replace(".",",")+" min");
  return `${bannerNube()}
  <div class="panel"><h2>Indicadores de la tesis</h2>
    <p class="small muted" style="margin:0">Calculados con la muestra de evaluación y el diagnóstico del veterinario. Umbral de alerta: <span class="mono">${UMBRAL.toFixed(2)}</span>.</p>
    <div class="tw"><table>
      <tr><th>Indicador</th><th class="n">Pretest</th><th class="n">Postest</th></tr>
      <tr><td><b>TPD</b><br><span class="small muted">Tiempo promedio de detección</span></td><td class="n">${pre.tpd==null?"—":seg(pre.tpd)}</td><td class="n">${post.tpd==null?"—":seg(post.tpd)}</td></tr>
      <tr><td><b>PDC</b><br><span class="small muted">Diagnósticos correctos</span></td><td class="n">${pct(pre.pdc)}</td><td class="n">${pct(post.pdc)}</td></tr>
      <tr><td>Gallinas<br><span class="small muted">postest: con ${FOTOS_EVAL} fotos</span></td><td class="n">${pre.n}</td><td class="n">${post.n}<br><span class="small muted">${post.completas}</span></td></tr>
    </table></div>
    <p class="small muted" style="margin:0">Pretest: inspección visual del galponero, sin el aplicativo. Postest: aplicativo. PDC postest = Σ(A<sub>i</sub>/${FOTOS_EVAL} × 100)/N, con A<sub>i</sub> fotos de la gallina <i>i</i> clasificadas igual que el veterinario. PDC pretest: la conclusión del galponero coincide con el veterinario.</p>
  </div>
  <div class="panel"><h3>Análisis complementario (postest, por foto)</h3>
    <div class="tw"><table>
      <tr><td>Sensibilidad<br><span class="small muted">enfermas detectadas: ${post.vp} de ${post.vp+post.fn}</span></td><td class="n">${pct(post.sens)}</td></tr>
      <tr><td>Especificidad<br><span class="small muted">sanas bien clasificadas: ${post.vn} de ${post.vn+post.fp}</span></td><td class="n">${pct(post.esp)}</td></tr>
      <tr><td>Enfermas no detectadas (falsos negativos)</td><td class="n">${post.fn}</td></tr>
      <tr><td>Falsas alarmas (falsos positivos)</td><td class="n">${post.fp}</td></tr>
    </table></div></div>
  <div class="panel"><h3>Inspecciones de rutina</h3>
    <div class="tw"><table>
      <tr><td>Inspecciones</td><td class="n">${rutina.n}</td></tr>
      <tr><td>Alertas emitidas</td><td class="n">${rutina.alertas}</td></tr>
      <tr><td>Alertas pendientes de revisión</td><td class="n">${rutina.pendientes}</td></tr>
      <tr><td>Revisadas · falsas alarmas</td><td class="n">${rutina.revisadas} · ${rutina.falsas}</td></tr>
      <tr><td>Tiempo promedio de detección</td><td class="n">${rutina.tpd==null?"—":seg(rutina.tpd)}</td></tr>
      <tr><td>Tiempo promedio hasta la revisión del veterinario</td><td class="n">${min(rutina.hastaRev)}</td></tr>
    </table></div></div>
  <button data-acc="exportar" ${Object.keys(S.evaluacion).length||Object.keys(S.inspecciones).length?"":"disabled"}>Exportar ficha de registro (CSV)</button>
  <p class="small muted">Motor: TensorFlow.js (${esc(S.backend||"cargando")}). YOLO11s-seg localiza la cresta; el clasificador híbrido (MobileNetV2 + color) estima la probabilidad de enfermedad.</p>`;
}

/* ---------------- Acciones ---------------- */
let tInicio = {};
async function alElegirFoto(destino, file){
  if (!file) return;
  const t0 = tInicio[destino] ?? performance.now();
  S.analizando = true; render();
  let r;
  try { r = await analizarArchivo(file); }
  catch(e){ S.analizando=false; toast(e?.usuario || "No se pudo analizar la foto."); render(); return; }
  const ms_total = performance.now() - t0;
  const ahora = new Date().toISOString(), inicioISO = new Date(Date.now() - ms_total).toISOString();
  try {
    if (!r.encontrada){
      S.analizando=false;
      if (destino==="rutina") S.ultimo = {error:"No se encontró la cresta. Acércate a 20–30 cm y que la cresta salga completa."};
      else toast("No se encontró la cresta. Repite la foto.");
      render(); return;
    }
    const v = veredicto(r.prob);
    const rec = await subirRecorte(r.recorte);
    if (destino==="rutina"){
      const id = "i" + Date.now();
      const doc = {modo:"rutina", galpon:S.ubic.galpon, jaula:S.ubic.jaula, codigo:($("#u-codigo")?.value||"").trim().toUpperCase(),
        prob:+r.prob.toFixed(4), resultado:v.res, confianza_baja: v.cls==="baja", umbral:UMBRAL, conf_yolo:+r.confYolo.toFixed(3),
        color:r.color.map(x=>+x.toFixed(2)), t_inicio:inicioISO, t_fin:ahora, ms_total:Math.round(ms_total), ms_modelos:Math.round(r.ms_modelos),
        estado: v.res==="enferma" ? "pendiente" : "no_aplica", ...rec};
      await guardar("inspecciones", id, doc);
      S.ultimo = doc;
      if (v.res==="enferma") toast("Alerta enviada al panel del veterinario");
    } else {
      const k = destino.split(":")[1], g = structuredClone(S.evaluacion[S.gallina]);
      const anterior = g.fotos?.[k];
      g.fotos = {...(g.fotos||{}), [k]: {prob:+r.prob.toFixed(4), res:v.res, confianza_baja: v.cls==="baja", ms:Math.round(ms_total), ms_modelos:Math.round(r.ms_modelos), t:ahora, umbral:UMBRAL, ...rec}};
      await guardar("evaluacion", g.codigo, g);
    }
  } catch(e){
    console.error(e); toast("No se pudo guardar el resultado. Revisa la conexión o tu sesión.");
  }
  S.analizando = false; delete tInicio[destino]; render();
}
async function revisar(id, decision){
  const x = structuredClone(S.inspecciones[id]); if (!x) return;
  x.estado = "revisada"; x.revision = {decision, nota: ($("#nota-"+id)?.value||"").trim(), t: new Date().toISOString()};
  try { await guardar("inspecciones", id, x); toast(decision==="confirmada" ? "Alerta confirmada" : "Marcada como falsa alarma"); } catch { toast("No se pudo guardar la revisión."); }
  render();
}
let cronId = null;
function iniciarPre(){ S.pre = {cod:S.gallina, t0:performance.now()}; render();
  clearInterval(cronId); cronId = setInterval(()=>{ const c=$("#cron"); if (c && S.pre) c.textContent = seg(performance.now()-S.pre.t0); }, 100); }
async function terminarPre(res){
  if (!S.pre) return; const ms = performance.now() - S.pre.t0; clearInterval(cronId);
  const g = structuredClone(S.evaluacion[S.pre.cod]); g.pre = {res, ms:Math.round(ms), t:new Date().toISOString()}; S.pre = null;
  try { await guardar("evaluacion", g.codigo, g); } catch { toast("No se pudo guardar el pretest."); }
  render();
}
function csvCelda(v){ const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
async function exportar(){
  const filas = [["registro","codigo","galpon","jaula","diagnostico_veterinario","fase","foto","resultado","probabilidad_enfermedad","confianza_baja","coincide_veterinario","tiempo_deteccion_s","tiempo_analisis_s","fecha_hora","estado_alerta","decision_veterinario","nota_veterinario","umbral"]];
  for (const g of Object.values(S.evaluacion).sort((a,b)=>a.codigo.localeCompare(b.codigo))){
    if (g.pre) filas.push(["evaluacion",g.codigo,"","",g.diag,"pretest (galponero)","",g.pre.res,"","",g.diag?(g.pre.res===g.diag?"si":"no"):"",(g.pre.ms/1000).toFixed(2),"",g.pre.t,"","","",""]);
    for (const [k,f] of Object.entries(g.fotos||{}).sort()) filas.push(["evaluacion",g.codigo,"","",g.diag,"postest (aplicativo)",k,f.res,f.prob,f.confianza_baja?"si":"no",g.diag?(f.res===g.diag?"si":"no"):"",(f.ms/1000).toFixed(2),(f.ms_modelos/1000).toFixed(2),f.t,"","","",f.umbral]);
  }
  for (const x of Object.values(S.inspecciones).sort((a,b)=>a.t_fin.localeCompare(b.t_fin)))
    filas.push(["rutina",x.codigo,x.galpon,x.jaula,"","rutina","",x.resultado,x.prob,x.confianza_baja?"si":"no","",(x.ms_total/1000).toFixed(2),(x.ms_modelos/1000).toFixed(2),x.t_fin,x.estado,x.revision?.decision||"",x.revision?.nota||"",x.umbral]);
  const texto = "﻿" + filas.map(r=>r.map(csvCelda).join(",")).join("\r\n");
  try { Almacen.descargar(`ficha_diagnostico_${new Date().toISOString().slice(0,10)}.csv`, texto); toast("Ficha exportada"); }
  catch { toast("No se pudo exportar la ficha."); }
}

/* ---------------- Ingreso ---------------- */
function enlazarIngreso(){
  const f = $("#f-ingreso"); if (!f) return;
  f.onsubmit = async ev => { ev.preventDefault();
    try { S.usuario = await Almacen.entrar($("#i-correo").value.trim(), $("#i-clave").value); S.necesitaIngreso = false; conectarDatos(); render(); }
    catch { toast("Correo o contraseña incorrectos."); } };
}

/* ---------------- Eventos ---------------- */
function enlazar(){
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { S.tab=b.dataset.tab; lsSet("tab",S.tab); render(); window.scrollTo(0,0); });
  const gp=$("#u-galpon"), ja=$("#u-jaula");
  if (gp) gp.oninput = () => { S.ubic.galpon = gp.value; lsSet("ubic", S.ubic); };
  if (ja) ja.oninput = () => { S.ubic.jaula = ja.value; lsSet("ubic", S.ubic); };
  document.querySelectorAll("input[data-foto]").forEach(inp => {
    inp.onclick = () => { tInicio[inp.dataset.foto] = performance.now(); };
    inp.onchange = () => { const f = inp.files[0]; inp.value=""; alElegirFoto(inp.dataset.foto, f); };
  });
  document.querySelectorAll("[data-rev]").forEach(b => b.onclick = () => revisar(b.dataset.rev, b.dataset.dec));
  document.querySelectorAll("[data-gal]").forEach(b => b.onclick = () => { S.gallina=b.dataset.gal; render(); window.scrollTo(0,0); });
  document.querySelectorAll("[data-diag]").forEach(b => b.onclick = async () => {
    const g = structuredClone(S.evaluacion[S.gallina]); g.diag = b.dataset.diag;
    try { await guardar("evaluacion", g.codigo, g); } catch { toast("No se pudo guardar."); } render(); });
  document.querySelectorAll("[data-pre]").forEach(b => b.onclick = () => terminarPre(b.dataset.pre));
  document.querySelectorAll("[data-acc]").forEach(b => b.onclick = async () => {
    const a = b.dataset.acc;
    if (a==="volver"){ S.gallina=null; S.pre=null; clearInterval(cronId); render(); }
    if (a==="pre-iniciar" || a==="pre-rehacer") iniciarPre();
    if (a==="exportar") exportar();
    if (a==="agregar"){
      const cod = ($("#e-codigo").value||"").trim().toUpperCase().replace(/\s+/g,"");
      if (!/^[A-Z]*\d+$/.test(cod)) { toast("Usa un código como E001 (letras y números)."); return; }
      if (S.evaluacion[cod]) { S.gallina=cod; render(); return; }
      try { await guardar("evaluacion", cod, {codigo:cod, diag:"", pre:null, fotos:{}, creado:new Date().toISOString()}); S.gallina=cod; render(); }
      catch { toast("No se pudo agregar la gallina."); }
    }
  });
}

/* ---------------- Inicio ---------------- */
render();
(async () => {
  if (!window.tf || !window.MotorCrestas){ $("#carga-txt").textContent = "No se pudo cargar el motor de diagnóstico. Recarga la página."; return; }
  try {
    S.backend = await MotorCrestas.cargar("modelos/", p => { const v = Math.round(p*100); $("#carga-bar").style.width = v+"%"; $("#carga-pct").textContent = v+" %"; });
    S.listo = true; $("#carga").hidden = true; render();
  } catch(e){ $("#carga-txt").textContent = "No se pudieron cargar los modelos. Revisa la conexión y recarga la página."; }
})();
function mostrarModo(){
  const m = $("#modo");
  if (S.nube){ m.textContent = S.usuario ? S.usuario + " · salir" : "En la nube"; m.className = "chip c-sana"; m.style.cursor = S.usuario ? "pointer" : "";
    m.onclick = S.usuario ? async () => { await Almacen.salir(); location.reload(); } : null; }
  else { m.textContent = "Modo local"; m.className = "chip c-baja"; }
}
let conectado = false;
function conectarDatos(){
  if (conectado) return; conectado = true; mostrarModo();
  const suscribir = (col) => Almacen.escuchar(col, o => {
    S[col] = structuredClone(o);
    const foco = document.activeElement; if (foco && (foco.tagName==="TEXTAREA" || foco.tagName==="INPUT") && foco.type!=="file") return;
    const y = window.scrollY; render(); window.scrollTo(0,y);
  });
  suscribir("inspecciones"); suscribir("evaluacion");
}
(async () => {
  try {
    const r = await Almacen.iniciar();
    S.nube = r.modo === "nube"; S.usuario = r.usuario; S.necesitaIngreso = r.necesitaIngreso;
    mostrarModo();
    if (!S.necesitaIngreso) conectarDatos();
  } catch(e){ console.error(e); toast("No se pudo conectar con el almacenamiento."); }
  render();
})();
})();
