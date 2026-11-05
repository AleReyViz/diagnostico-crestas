/* Motor de diagnóstico de crestas (TensorFlow.js)
 * Reproduce el proceso del notebook Sistema_YOLO_clasificador_crestas:
 *   foto -> YOLO11s-seg (cresta con mayor confianza) -> recorte con fondo negro
 *   -> reducción a 128 px -> 6 medidas de color -> 224x224 -> clasificador híbrido.
 */
(function (global) {
  "use strict";
  const LADO = 640, CONF_MIN = 0.25, MAX_TRABAJO = 4096, MAX_LADO = 128, TAM = 224;
  let yolo = null, clf = null;

  async function cargar(base, alProgreso) {
    const tf = global.tf;
    let ok = false;
    if (!global.__forzarCPU) { try { ok = await tf.setBackend("webgl"); await tf.ready(); } catch (e) { ok = false; } }
    if (!ok) { await tf.setBackend("cpu"); }
    await tf.ready();
    let a = 0, b = 0;
    yolo = await tf.loadGraphModel(base + "yolo/model.json", { onProgress: p => { a = p; alProgreso && alProgreso((a * 0.7 + b * 0.3)); } });
    clf = await tf.loadGraphModel(base + "clf/model.json", { onProgress: p => { b = p; alProgreso && alProgreso((a * 0.7 + b * 0.3)); } });
    // calentamiento
    tf.tidy(() => { const o = yolo.execute(tf.zeros([1, LADO, LADO, 3])); (Array.isArray(o) ? o : [o]).forEach(t => t.dataSync()); });
    tf.tidy(() => { clf.execute({ imagen: tf.zeros([1, TAM, TAM, 3]), color: tf.zeros([1, 6]) }).dataSync(); });
    return tf.getBackend();
  }

  function lienzo(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  /* ---- Medidas de color (idénticas a skimage rgb2lab / rgb2hsv del notebook) ---- */
  function lin(c) { return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; }
  function fLab(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function medidasColor(imgData) {
    const d = imgData.data; const L = [], A = []; let blanq = 0, osc = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      if (R + G + B <= 40) continue;
      if (R > 245 && G > 245 && B > 245) continue;
      const r = R / 255, g = G / 255, b = B / 255;
      const rl = lin(r), gl = lin(g), bl = lin(b);
      const X = (0.412453 * rl + 0.357580 * gl + 0.180423 * bl) / 0.95047;
      const Y = (0.212671 * rl + 0.715160 * gl + 0.072169 * bl);
      const fy = fLab(Y);
      L.push(116 * fy - 16); A.push(500 * (fLab(X) - fy));
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = mx === 0 ? 0 : (mx - mn) / mx;
      if (s < 0.25 && mx > 0.6) blanq++;
      if (mx < 0.35) osc++;
      n++;
    }
    if (n < 10) return [0, 0, 0, 0, 0, 0];
    const media = v => v.reduce((s, x) => s + x, 0) / v.length;
    const desv = (v, m) => Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length);
    const mL = media(L), mA = media(A);
    return [mL, desv(L, mL), mA, desv(A, mA), blanq / n * 100, osc / n * 100];
  }

  async function reducir(canvas, maxLado) {
    const k = Math.min(1, maxLado / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * k)), h = Math.max(1, Math.round(canvas.height * k));
    if (k === 1) return canvas;
    try {
      const bmp = await createImageBitmap(canvas, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
      const c = lienzo(w, h); c.getContext("2d").drawImage(bmp, 0, 0); bmp.close && bmp.close(); return c;
    } catch (e) {
      let src = canvas;
      while (src.width / 2 > w) { const c = lienzo(Math.round(src.width / 2), Math.round(src.height / 2)); const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height); src = c; }
      const c = lienzo(w, h); const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h); return c;
    }
  }

  /* ---- Remuestreo idéntico a Pillow (ImagingResample: horizontal y luego vertical, con redondeo a 8 bits) ---- */
  const FILTROS = {
    lanczos: { soporte: 3, f: x => { if (x === 0) return 1; if (x <= -3 || x >= 3) return 0; const a = Math.PI * x; return 3 * Math.sin(a) * Math.sin(a / 3) / (a * a); } },
    bilinear: { soporte: 1, f: x => { x = Math.abs(x); return x < 1 ? 1 - x : 0; } }
  };
  function coeficientes(entrada, salida, b0, b1, filtro) {
    const escala = (b1 - b0) / salida, fe = Math.max(escala, 1), soporte = filtro.soporte * fe;
    const lista = [];
    for (let xx = 0; xx < salida; xx++) {
      const centro = b0 + (xx + 0.5) * escala;
      let xmin = Math.trunc(centro - soporte + 0.5); if (xmin < 0) xmin = 0;
      let xmax = Math.trunc(centro + soporte + 0.5); if (xmax > entrada) xmax = entrada;
      const k = []; let suma = 0;
      for (let x = xmin; x < xmax; x++) { const w = filtro.f((x - centro + 0.5) / fe); k.push(w); suma += w; }
      lista.push({ xmin, k: k.map(w => suma ? w / suma : 0) });
    }
    return lista;
  }
  function resamplePIL(img, w2, h2, nombre, caja) {
    const filtro = FILTROS[nombre], [b0x, b0y, b1x, b1y] = caja || [0, 0, img.w, img.h];
    const cx = coeficientes(img.w, w2, b0x, b1x, filtro), cy = coeficientes(img.h, h2, b0y, b1y, filtro);
    const tmp = new Uint8ClampedArray(w2 * img.h * 4);
    for (let y = 0; y < img.h; y++) for (let xx = 0; xx < w2; xx++) {
      const { xmin, k } = cx[xx]; let r = 0, g = 0, b = 0;
      for (let t = 0; t < k.length; t++) { const i = (y * img.w + xmin + t) * 4; r += img.d[i] * k[t]; g += img.d[i + 1] * k[t]; b += img.d[i + 2] * k[t]; }
      const o = (y * w2 + xx) * 4; tmp[o] = Math.round(r); tmp[o + 1] = Math.round(g); tmp[o + 2] = Math.round(b); tmp[o + 3] = 255;
    }
    const out = new Uint8ClampedArray(w2 * h2 * 4);
    for (let yy = 0; yy < h2; yy++) { const { xmin, k } = cy[yy];
      for (let x = 0; x < w2; x++) { let r = 0, g = 0, b = 0;
        for (let t = 0; t < k.length; t++) { const i = ((xmin + t) * w2 + x) * 4; r += tmp[i] * k[t]; g += tmp[i + 1] * k[t]; b += tmp[i + 2] * k[t]; }
        const o = (yy * w2 + x) * 4; out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b); out[o + 3] = 255; } }
    return { w: w2, h: h2, d: out };
  }
  function reducirPIL(img, fx, fy) {       // Image.reduce((fx, fy)): promedio por bloques (bloques de borde incompletos)
    const w2 = Math.ceil(img.w / fx), h2 = Math.ceil(img.h / fy), out = new Uint8ClampedArray(w2 * h2 * 4);
    for (let yy = 0; yy < h2; yy++) for (let xx = 0; xx < w2; xx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = yy * fy; y < Math.min(img.h, (yy + 1) * fy); y++) for (let x = xx * fx; x < Math.min(img.w, (xx + 1) * fx); x++) {
        const i = (y * img.w + x) * 4; r += img.d[i]; g += img.d[i + 1]; b += img.d[i + 2]; n++; }
      const o = (yy * w2 + xx) * 4; out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
    }
    return { w: w2, h: h2, d: out };
  }
  function thumbnailPIL(img, maxLado) {     // Image.thumbnail((n, n), LANCZOS), reducing_gap = 2.0
    if (img.w <= maxLado && img.h <= maxLado) return img;
    const aspecto = img.w / img.h; let x = maxLado, y = maxLado;
    const redondear = (num, clave) => Math.max([Math.floor(num), Math.ceil(num)].reduce((a, b) => clave(b) < clave(a) ? b : a), 1);
    if (x / y >= aspecto) x = redondear(y * aspecto, n => Math.abs(aspecto - n / y));
    else y = redondear(x / aspecto, n => n === 0 ? 0 : Math.abs(aspecto - x / n));
    const fx = Math.max(1, Math.trunc(img.w / x / 2)), fy = Math.max(1, Math.trunc(img.h / y / 2));
    if (fx > 1 || fy > 1) { const red = reducirPIL(img, fx, fy); return resamplePIL(red, x, y, "lanczos", [0, 0, img.w / fx, img.h / fy]); }
    return resamplePIL(img, x, y, "lanczos", [0, 0, img.w, img.h]);
  }
  function aLienzo(img) { const c = lienzo(img.w, img.h); c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(img.d), img.w, img.h), 0, 0); return c; }

  /* ---- Diagnóstico de una imagen (ImageBitmap o HTMLImageElement) ---- */
  async function diagnosticar(fuente) {
    const tf = global.tf; if (!yolo || !clf) throw new Error("Modelos no cargados");
    const W0 = fuente.width, H0 = fuente.height;
    // imagen de trabajo (para recortar)

    // letterbox 640 (como Ultralytics: relleno gris 114, centrado)
    const r = Math.min(LADO / W0, LADO / H0);
    const nw = Math.round(W0 * r), nh = Math.round(H0 * r);
    const dw = (LADO - nw) / 2, dh = (LADO - nh) / 2;
    const px = Math.round(dw - 0.1), py = Math.round(dh - 0.1);
    const lb = lienzo(LADO, LADO); const cx = lb.getContext("2d");
    cx.fillStyle = "rgb(114,114,114)"; cx.fillRect(0, 0, LADO, LADO);
    cx.imageSmoothingQuality = "high"; cx.drawImage(fuente, px, py, nw, nh);

    const t0 = performance.now();
    const res = tf.tidy(() => {
      const ent = tf.browser.fromPixels(lb).toFloat().div(255).expandDims(0);
      let salidas = yolo.execute(ent); if (!Array.isArray(salidas)) salidas = [salidas];
      const det = salidas.find(t => t.rank === 3), proto = salidas.find(t => t.rank === 4);
      const D = det.squeeze([0]);                       // [37, 8400]
      const puntajes = D.slice([4, 0], [1, -1]).squeeze([0]);
      const mejor = puntajes.argMax().dataSync()[0];
      const conf = puntajes.dataSync()[mejor];
      if (conf < CONF_MIN) return { conf };
      const col = D.slice([0, mejor], [-1, 1]).squeeze([1]).dataSync();
      const caja = [col[0] - col[2] / 2, col[1] - col[3] / 2, col[0] + col[2] / 2, col[1] + col[3] / 2];
      const coef = tf.tensor1d(Array.from(col.slice(5, 37)));
      const P = proto.squeeze([0]);                     // [160,160,32]
      const ph = P.shape[0], pw = P.shape[1];
      // Igual que Ultralytics 8.4 (process_mask, upsample=True): ampliar los logits a 640, binarizar y recortar a la caja
      const logit = P.reshape([ph * pw, 32]).matMul(coef.reshape([32, 1])).reshape([ph, pw, 1]);
      const m640 = tf.image.resizeBilinear(logit, [LADO, LADO], false, true).squeeze([2]).greater(0);
      const xs = tf.range(0, LADO).reshape([1, LADO]), ys = tf.range(0, LADO).reshape([LADO, 1]);
      const dentro = xs.greaterEqual(caja[0]).logicalAnd(xs.less(caja[2])).logicalAnd(ys.greaterEqual(caja[1])).logicalAnd(ys.less(caja[3]));
      return { conf, caja, mascara: m640.logicalAnd(dentro).dataSync() };
    });
    const t_yolo = performance.now() - t0;
    if (!res.mascara) return { encontrada: false, confYolo: res.conf || 0, ms_modelos: t_yolo };

    // Recorte como el notebook: contorno de la máscara (masks.xy) llevado a la foto original y relleno.
    // Un píxel de la foto (X, Y) queda dentro si la máscara, interpolada en (X·r + px, Y·r + py), vale al menos 0,5.
    const M = res.mascara; let x0 = LADO, y0 = LADO, x1 = -1, y1 = -1;
    for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) if (M[y * LADO + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return { encontrada: false, confYolo: res.conf, ms_modelos: t_yolo };
    const aO = u => Math.min(W0, Math.max(0, (u - px) / r)), bO = v => Math.min(H0, Math.max(0, (v - py) / r));
    const X0 = Math.floor(aO(x0)), Y0 = Math.floor(bO(y0)), X1 = Math.ceil(aO(x1)), Y1 = Math.ceil(bO(y1));
    const bw = Math.max(1, X1 - X0), bh = Math.max(1, Y1 - Y0);
    const foto = lienzo(bw, bh); foto.getContext("2d").drawImage(fuente, X0, Y0, bw, bh, 0, 0, bw, bh);
    const src = foto.getContext("2d").getImageData(0, 0, bw, bh);
    const mv = (u, v) => (u < 0 || v < 0 || u >= LADO || v >= LADO) ? 0 : M[v * LADO + u];
    const dst = new ImageData(bw, bh);
    for (let y = 0; y < bh; y++) {
      const v = (Y0 + y) * r + py, v0 = Math.floor(v), fv = v - v0;
      for (let x = 0; x < bw; x++) {
        const u = (X0 + x) * r + px, u0 = Math.floor(u), fu = u - u0;
        const val = (1 - fu) * (1 - fv) * mv(u0, v0) + fu * (1 - fv) * mv(u0 + 1, v0) + (1 - fu) * fv * mv(u0, v0 + 1) + fu * fv * mv(u0 + 1, v0 + 1);
        const i = (y * bw + x) * 4;
        if (val >= 0.5) { dst.data[i] = src.data[i]; dst.data[i + 1] = src.data[i + 1]; dst.data[i + 2] = src.data[i + 2]; }
        dst.data[i + 3] = 255;
      }
    }
    const recorte = lienzo(bw, bh); recorte.getContext("2d").putImageData(dst, 0, 0);

    // procesar como en el notebook: reducir a 128, medir color, centrar en cuadrado negro, 224x224
    const base = { w: bw, h: bh, d: dst.data };
    const chicoImg = thumbnailPIL(base, MAX_LADO);                       // img.thumbnail((128,128), LANCZOS)
    const color = medidasColor({ data: chicoImg.d });
    const lado = Math.max(chicoImg.w, chicoImg.h);
    const cuadImg = { w: lado, h: lado, d: new Uint8ClampedArray(lado * lado * 4) };
    const ox = Math.floor((lado - chicoImg.w) / 2), oy = Math.floor((lado - chicoImg.h) / 2);
    for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) { cuadImg.d[(y * lado + x) * 4 + 3] = 255; }
    for (let y = 0; y < chicoImg.h; y++) for (let x = 0; x < chicoImg.w; x++) {
      const a = (y * chicoImg.w + x) * 4, b = ((y + oy) * lado + x + ox) * 4;
      cuadImg.d[b] = chicoImg.d[a]; cuadImg.d[b + 1] = chicoImg.d[a + 1]; cuadImg.d[b + 2] = chicoImg.d[a + 2];
    }
    const img224 = resamplePIL(cuadImg, TAM, TAM, "bilinear", [0, 0, lado, lado]);   // L.resize((224,224), BILINEAR)
    const c224 = aLienzo(img224), chico = aLienzo(chicoImg);

    const t1 = performance.now();
    const rgb = new Float32Array(TAM * TAM * 3);
    for (let p = 0, q = 0; p < img224.d.length; p += 4) { rgb[q++] = img224.d[p]; rgb[q++] = img224.d[p + 1]; rgb[q++] = img224.d[p + 2]; }
    const prob = tf.tidy(() => clf.execute({ imagen: tf.tensor4d(rgb, [1, TAM, TAM, 3]), color: tf.tensor2d([color]) }).dataSync()[0]);
    const t_clf = performance.now() - t1;
    return { encontrada: true, prob, confYolo: res.conf, color, recorte, entrada224: c224, chico, ms_modelos: t_yolo + t_clf };
  }

  global.MotorCrestas = { cargar, diagnosticar, medidasColor, _pil: { thumbnailPIL, resamplePIL } };
})(window);
