# Diagnóstico de Crestas SHILICORP

Aplicativo web de visión computacional para la detección temprana de enfermedades en crestas de gallinas ponedoras.
**Tesis:** Aplicativo de visión computacional con redes neuronales convolucionales en la detección temprana de enfermedades en crestas de gallinas, SHILICORP SAC, 2026.
**Autora:** Alexandra M. Reyna Vizcarra · Universidad Nacional de Cañete

El aplicativo **no diagnostica enfermedades específicas**: detecta signos de enfermedad en la cresta y alerta al veterinario, que hace el diagnóstico.

---

## 1. Cómo funciona

```
Foto de la cresta ─► YOLO11s-seg ─► recorte de la cresta ─► clasificador híbrido ─► Sana / Enferma ─► alerta al veterinario
                     (localiza)      (fondo negro)           (MobileNetV2 + color)
```

- Los **dos modelos se ejecutan en el celular**, en el navegador, con TensorFlow.js. Las fotos no se envían a ningún servidor para analizarse.
- **Umbral de alerta: 0,15.** Se calibró con el motor de este aplicativo en el conjunto de validación, para detectar al menos el 90 % de las gallinas enfermas (sensibilidad en validación: 94,4 %).
- Resultados en el conjunto de prueba del dataset v1 (13 gallinas, 39 fotos): **PDC 76,9 %**, sensibilidad 83,3 %, especificidad 71,4 %.

### Pantallas (versión 3)
En computadora el menú va a la izquierda. En el celular va abajo: Diagnósticos, Capturar, Alertas, Estadísticas y Cuenta (estado de los modelos, exportar y cerrar sesión).

| Pantalla | Para qué sirve |
|---|---|
| **Iniciar sesión** | Correo y contraseña de Firebase, con un enlace *¿Olvidaste tu contraseña?* que envía el correo para restablecerla. |
| **Diagnósticos** | Registro de todas las capturas, con indicadores (total, sanas, sospechosas y enfermas), búsqueda, filtros por estado y periodo, y paginación. Cada registro se puede ver, editar (código, galpón, revisión) o eliminar. |
| **Capturar** | Para la foto se puede abrir la cámara o subir una imagen. Se muestran los 5 pasos reales del procesamiento: preparación de la imagen, segmentación con YOLO, recorte y medidas de color, redimensionamiento a 224 × 224 y clasificación con la CNN. Después aparecen el resultado y el tiempo de detección. |
| **Alertas** | Gallinas *Sospechosas* o *Enfermas*. El veterinario confirma la enfermedad, eligiéndola de una lista, o marca *Falsa alarma*. Tiene dos pestañas: Pendientes y Revisadas. |
| **Usuarios** | Solo para el veterinario: crea los usuarios (nombre, correo, contraseña temporal y rol) y administra sus accesos. |
| **Estadísticas** | Gráficos de tendencia por día, distribución por estado y comparación por galpón. Incluye las enfermedades confirmadas por el veterinario, la tasa de salud, el tiempo promedio de detección y la opción de exportar el reporte. |

### Roles de usuario
| Rol | Qué puede hacer |
|---|---|
| **Veterinario (administrador)** | Ve todos los diagnósticos del equipo, revisa las alertas y da el diagnóstico final (enfermedad confirmada o falsa alarma), ve las estadísticas, exporta el reporte y **gestiona los usuarios**: los crea, cambia su rol, los desactiva o activa, y les envía el correo para restablecer la contraseña. |
| **Galponero** | Captura fotos y ve **solo sus capturas**, con la revisión y la indicación del veterinario. No puede editar, eliminar ni revisar. |

Los perfiles se guardan en la colección `usuarios` de Firestore, con los campos nombre, correo, rol y activo. Las reglas de `firestore.rules` hacen cumplir estos permisos en el servidor.

**Primera vez:** en `firestore.rules`, reemplaza `CORREO_DE_LA_ADMINISTRADORA` por tu correo y publica las reglas en Firebase. Luego inicia sesión y toca **Activar cuenta de administradora**. Desde ese momento, los demás usuarios se crean en la pantalla **Usuarios**.

**Estados de la cresta** (probabilidad de enfermedad *p* que da el clasificador):

| Estado | Rango | Qué pasa |
|---|---|---|
| Sana | *p* < 0,15 | Sin alerta |
| Sospechosa | 0,15 ≤ *p* < 0,30 | Alerta al veterinario (confianza baja) |
| Enferma | *p* ≥ 0,30 | Alerta al veterinario |

*Sospechosa* cuenta como resultado **Enferma** (supera el umbral de alerta), así se conserva la clasificación binaria Sana / Enferma.

---

## 2. Estructura del proyecto

| Archivo / carpeta | Contenido |
|---|---|
| `index.html` | Página principal |
| `estilos.css` | Estilos (modo claro y oscuro, diseño para celular) |
| `app.js` | Interfaz: ingreso, diagnósticos, captura, alertas y estadísticas |
| `motor.js` | Motor de diagnóstico: YOLO, recorte, medidas de color y clasificador (replica el notebook) |
| `almacen.js` | Guardado de datos: Firebase (nube) o IndexedDB (modo local) |
| `config.js` | Configuración de Firebase (opcional) |
| `modelos/yolo/` | YOLO11s-seg convertido a TensorFlow.js (pesos en float16, ~20 MB) |
| `modelos/clf/` | Clasificador híbrido convertido a TensorFlow.js (~9 MB) |
| `sw.js`, `manifest.webmanifest`, `iconos/` | Instalación como app y uso sin internet |
| `firestore.rules` | Reglas de seguridad de la base de datos (se publican a mano en Firebase) |
| `firebase.json` | Configuración del sitio `crestavet-shilicorp` en Firebase Hosting |
| `.github/workflows/publicar.yml` | Publicación automática: cada *Commit* en GitHub publica la app |

**Tecnologías:** HTML, CSS y JavaScript sin frameworks · TensorFlow.js 4.22 · Firebase (Authentication y Cloud Firestore) · Progressive Web App.

---

## 3. Probarlo en tu computadora

El navegador no carga los modelos si abres `index.html` con doble clic. Hay que servirlo:

- **Con VS Code:** instala la extensión *Live Server*, abre la carpeta y haz clic en **Go Live**.
- **Con Python:** en la carpeta del proyecto, ejecuta `python -m http.server 8000` y abre `http://localhost:8000`.

Sin configurar Firebase, funciona en **modo local**: los datos quedan guardados solo en ese navegador.

---

## 4. Dónde está publicada

- **Dirección oficial:** **https://crestavet-shilicorp.web.app** (Firebase Hosting, gratis).
- **Código:** repositorio de GitHub `AleReyViz/diagnostico-crestas`.
- **Publicación automática:** cada vez que guardas un cambio en GitHub con *Commit changes*, GitHub Actions publica la app en Firebase en 1 o 2 minutos. El avance se ve en la pestaña **Actions**: check verde si se publicó, X roja si falló.

### Conexión GitHub → Firebase (solo una vez, ya hecha si Actions sale en verde)
1. Con Node.js instalado, en una carpeta que tenga `firebase.json`, ejecuta `firebase login` y luego `firebase init hosting:github`. Autoriza a Firebase en GitHub e indica el repositorio `AleReyViz/diagnostico-crestas`. A las preguntas sobre *build script* y *PR merged* responde **n**.
2. Eso crea en GitHub el secreto `FIREBASE_SERVICE_ACCOUNT_DIAGNOSTICO_CRESTAS`, que usa `publicar.yml`.
3. Si `.github/workflows/publicar.yml` no está en el repositorio, créalo en GitHub con *Add file → Create new file* y pega su contenido.

---

## 5. Firebase: usuarios y base de datos

- **Authentication:** el método *Correo electrónico/contraseña* está activado. En *Configuración → Dominios autorizados* debe estar `crestavet-shilicorp.web.app`.
- **Firestore:** las colecciones son `usuarios` (perfiles y roles) e `inspecciones` (diagnósticos). Las reglas de `firestore.rules` se publican en *Firestore Database → Reglas → Publicar*. En ellas debe ir el correo de la administradora en lugar de `CORREO_DE_LA_ADMINISTRADORA`.
- **Usuarios:** se crean desde la app, en la pantalla **Usuarios** del veterinario. No hace falta crearlos en la consola de Firebase.

> **Seguridad:** la `apiKey` de `config.js` no es secreta. Puede estar en un sitio público, porque lo que protege los datos son las reglas de `firestore.rules`.
> **Costo:** el plan gratuito *Spark* alcanza para el proyecto. Firebase Hosting gratuito permite unos 360 MB de descarga al día: los modelos (~29 MB) se descargan solo la primera vez en cada celular.

---

## 6. Actualizar el aplicativo o los modelos

1. En GitHub, edita el archivo (ícono del lápiz) o súbelo con *Add file → Upload files*. Para un modelo nuevo, reemplaza las carpetas `modelos/yolo` o `modelos/clf`.
2. En `sw.js`, sube el número de `VERSION` (la versión actual es `"crestas-v9"`; la siguiente será `"crestas-v10"`, y así sucesivamente). Si no lo cambias, los celulares que ya instalaron la app seguirán usando la versión guardada.
3. Presiona **Commit changes**. La app se publica sola en unos minutos.
4. Si cambias el clasificador, **vuelve a calibrar el umbral** (`UMBRAL` al inicio de `app.js`) con el conjunto de validación.

---

## 7. Limitaciones del prototipo

- No envía notificaciones push: el veterinario ve las alertas al abrir la pestaña **Alertas**.
- El tiempo de análisis depende del celular. Con GPU (WebGL) suele tomar pocos segundos; sin GPU puede tardar bastante más.
- Los modelos se entrenaron con 90 gallinas (dataset v1). Ampliar el dataset mejorará el desempeño.
- El diagnóstico definitivo es siempre responsabilidad del médico veterinario.
