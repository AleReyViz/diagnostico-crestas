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

### Pestañas
| Pestaña | Para qué sirve |
|---|---|
| **Inspeccionar** | El galponero toma la foto y recibe *Sana* o *Enferma*, con el tiempo de detección. Si sale enferma, se crea una alerta. |
| **Alertas** | El veterinario ve la cresta y la ubicación de la gallina, y marca *Enfermedad confirmada* o *Falsa alarma*. |
| **Evaluación** | Muestra de evaluación (100 gallinas): diagnóstico del veterinario, **pretest** (inspección visual cronometrada) y **postest** (5 fotos con el aplicativo). |
| **Indicadores** | Calcula **TPD** y **PDC** (pretest y postest), sensibilidad y especificidad, y exporta la ficha de registro en CSV. |

---

## 2. Estructura del proyecto

| Archivo / carpeta | Contenido |
|---|---|
| `index.html` | Página principal |
| `estilos.css` | Estilos (modo claro y oscuro, diseño para celular) |
| `app.js` | Interfaz, flujo de inspección, alertas, evaluación e indicadores |
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
2. En `sw.js`, cambia `VERSION = "crestas-v1"` por `"crestas-v2"`, y así sucesivamente. Sin este cambio, los celulares que ya la instalaron seguirán usando la versión guardada.
3. Si cambias el clasificador, **vuelve a calibrar el umbral** (`UMBRAL` al inicio de `app.js`) con el conjunto de validación.

---

## 7. Limitaciones del prototipo

- No envía notificaciones push: el veterinario ve las alertas al abrir la pestaña **Alertas**.
- El tiempo de análisis depende del celular. Con GPU (WebGL) suele tomar pocos segundos; sin GPU puede tardar bastante más.
- Los modelos se entrenaron con 90 gallinas (dataset v1). Ampliar el dataset mejorará el desempeño.
- El diagnóstico definitivo es siempre responsabilidad del médico veterinario.
