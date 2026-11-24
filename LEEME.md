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
| `firestore.rules` | Reglas de seguridad de la base de datos |

**Tecnologías:** HTML, CSS y JavaScript sin frameworks · TensorFlow.js 4.22 · Firebase (Authentication y Cloud Firestore) · Progressive Web App.

---

## 3. Probarlo en tu computadora

El navegador no carga los modelos si abres `index.html` con doble clic. Hay que servirlo:

- **Con VS Code:** instala la extensión *Live Server*, abre la carpeta y haz clic en **Go Live**.
- **Con Python:** en la carpeta del proyecto, ejecuta `python -m http.server 8000` y abre `http://localhost:8000`.

Sin configurar Firebase, funciona en **modo local**: los datos quedan guardados solo en ese navegador.

---

## 4. Publicarlo en internet (GitHub Pages, gratis)

1. Crea una cuenta en [github.com](https://github.com).
2. Crea un repositorio **público** con el botón **New**, por ejemplo `diagnostico-crestas`.
3. En el repositorio, elige **Add file → Upload files** y arrastra **todo el contenido de esta carpeta**, incluidas las carpetas `modelos` e `iconos` y el archivo `.nojekyll`. Presiona **Commit changes**.
   > En Windows, los archivos que empiezan con punto, como `.nojekyll`, pueden estar ocultos. Actívalos en *Vista → Mostrar → Elementos ocultos*.
4. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, luego la rama **main** y la carpeta **/ (root)**. Presiona **Save**.
5. En uno o dos minutos, tu aplicativo estará en
   **`https://TU-USUARIO.github.io/diagnostico-crestas/`**
6. Ábrelo en el celular. En Chrome, el menú **⋮ → Instalar aplicación** (o *Agregar a pantalla principal*) lo instala como app. Después de la primera carga, que descarga unos 29 MB de modelos, funciona **sin internet**.

**Otra opción sin GitHub:** [Netlify Drop](https://app.netlify.com/drop). Arrastra la carpeta completa y te da una dirección pública al instante.

---

## 5. Compartir datos entre el galponero y el veterinario (Firebase, gratis)

En modo local, cada celular guarda sus propios datos. Para que **las alertas del galponero le lleguen al veterinario**, conecta Firebase:

1. Entra a [console.firebase.google.com](https://console.firebase.google.com), elige **Agregar proyecto** y créalo. Google Analytics no es necesario.
2. **Registra la app web:** en *Configuración del proyecto → Tus apps*, haz clic en el ícono `</>`. Copia el objeto `firebaseConfig` y pégalo en `config.js` así:
   ```js
   window.CONFIG_FIREBASE = { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };
   ```
3. **Usuarios:** en *Authentication → Método de acceso*, activa **Correo electrónico/contraseña**. Luego, en *Usuarios → Agregar usuario*, crea una cuenta para el veterinario y otra para cada galponero.
4. **Dominio autorizado:** en *Authentication → Configuración → Dominios autorizados*, agrega `TU-USUARIO.github.io`.
5. **Base de datos:** en *Firestore Database → Crear base de datos*, elige **modo de producción** y la región `southamerica-east1` (São Paulo). En la pestaña **Reglas**, reemplaza todo por el contenido de `firestore.rules` y presiona **Publicar**.
6. Sube el `config.js` actualizado a GitHub.

Desde entonces, el aplicativo pide **correo y contraseña**, y todos los usuarios ven las mismas inspecciones y alertas en tiempo real.

> **Seguridad:** la `apiKey` de Firebase no es secreta. Puede estar en un sitio público, porque lo que protege los datos son las reglas de `firestore.rules`: solo los usuarios que tú creaste pueden leer y escribir.
> **Costo:** el plan gratuito *Spark* alcanza de sobra para este proyecto. No se usa Firebase Storage, que exige un plan de pago: los recortes de cresta (~30 KB) se guardan dentro de cada registro.

---

## 6. Actualizar el aplicativo o los modelos

1. Reemplaza los archivos en GitHub. Para un modelo nuevo, reemplaza las carpetas `modelos/yolo` o `modelos/clf`.
2. En `sw.js`, sube el número de `VERSION` (la versión actual es `"crestas-v5"`; la siguiente será `"crestas-v6"`, y así sucesivamente). Si no lo cambias, los celulares que ya instalaron la app seguirán usando la versión guardada.
3. Si cambias el clasificador, **vuelve a calibrar el umbral** (`UMBRAL` al inicio de `app.js`) con el conjunto de validación.

---

## 7. Limitaciones del prototipo

- No envía notificaciones push: el veterinario ve las alertas al abrir la pestaña **Alertas**.
- El tiempo de análisis depende del celular. Con GPU (WebGL) suele tomar pocos segundos; sin GPU puede tardar bastante más.
- Los modelos se entrenaron con 90 gallinas (dataset v1). Ampliar el dataset mejorará el desempeño.
- El diagnóstico definitivo es siempre responsabilidad del médico veterinario.
