# 🚀 GUÍA DE DESPLIEGUE · DOMUS WEB APP

Esta aplicación unifica el **Modo Caja (Punto de Venta y Cobro)** y el **Modo Comandas (Pantalla KDS de Barra y Cocina)** en una sola plataforma de alto rendimiento.

---

## 🌐 Opción A: Despliegue en GitHub Pages ("Google Pages")
Para acceder a la aplicación desde cualquier navegador web (iPad en caja, celular de mesero o monitor en barra):

1. **Subir los cambios al repositorio GitHub:**
   ```bash
   git add .
   git commit -m "feat: interfaz web unificada DOMUS Caja y Comandas"
   git push origin main
   ```
2. **Habilitar GitHub Pages:**
   - Abre tu repositorio en GitHub: [https://github.com/SadoTechMX/Admin-Domus](https://github.com/SadoTechMX/Admin-Domus)
   - Ve a **Settings** (Configuración) > **Pages** (en el menú lateral izquierdo).
   - En **Build and deployment > Source**, selecciona **Deploy from a branch**.
   - En **Branch**, selecciona `main` y la carpeta `/ (root)`.
   - Haz clic en **Save** (Guardar).
3. **Tu enlace público estará listo en:**
   👉 **`https://sadotechmx.github.io/Admin-Domus/`**

---

## ⚡ Opción B: Despliegue directo en Google Apps Script
Para que funcione directamente dentro del entorno seguro de Google Workspace (`domusccc.net`):

1. Abre tu hoja de cálculo maestra de DOMUS:
   [DOMUS · BARRA Y RESURTIDO](https://docs.google.com/spreadsheets/d/1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc/edit)
2. Ve al menú superior: **Extensiones > Apps Script**.
3. En el editor de Apps Script:
   - En el archivo `Code.gs` (o `Codigo.gs`), copia y pega el código de [`google-apps-script/Code.gs`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/google-apps-script/Code.gs).
   - Crea un nuevo archivo HTML llamado `Index` (pulsando el botón `+` > **HTML**) y pega el contenido completo de [`google-apps-script/Index.html`](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/google-apps-script/Index.html).
4. **Publicar nueva versión:**
   - Haz clic en el botón azul superior **Implementar > Gestionar implementaciones**.
   - Selecciona la implementación activa (la que termina en `I1WRGJGL`).
   - Pulsa el icono del lápiz (**Editar**).
   - En **Versión**, elige **Nueva versión**.
   - Haz clic en **Implementar**.
5. **Listo.** La URL oficial mantendrá el acceso:
   - **Modo Caja PRODUCCIÓN:** `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec?vista=caja`
   - **Modo Comandas PRODUCCIÓN:** `https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec?vista=comandas`

---

## 💻 Características del Sistema
- **Navegación Rápida:** Cambia entre **Modo Caja** y **Modo Comandas** con un solo toque desde la barra superior.
- **Modo Offline & Resiliencia:** Si la conexión con Google tarda o falla, el sistema activa el simulador interactivo de DOMUS sin interrumpir la interfaz.
- **Sonido de Comandas (Audio Chime):** Sintetizador Web Audio integrado con alertas para nuevos pedidos.
- **Cálculo de Cambio y Billetes:** Botones rápidos de $50, $100, $200 y $500 con cálculo de cambio y propina voluntaria.


## 🚨 Contrato de despliegue obligatorio

Un deployment de DOMUS **NO está completo** si sólo contiene los archivos `.gs`.

El proyecto Apps Script de PRODUCCIÓN debe contener, como mínimo:
- backend `.gs` de producción;
- `Index.html` copiado desde `google-apps-script/Index.html`;
- Script Property `DOMUS_ENV=PRODUCTION`.

Gate obligatorio después de desplegar:
1. `?action=health` devuelve `environment=PRODUCTION`.
2. `mainSheetId=1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U`.
3. `opsSheetId=1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc`.
4. La URL raíz `?vista=caja` devuelve HTML de DOMUS, NO el JSON `DOMUS OS API ONLINE`.
5. Dentro de Caja, `STATE.isNativeGas=true` y las llamadas usan `google.script.run`.
6. Caja carga catálogo y KDS sin mostrar `MODO SIN CONEXIÓN`.

**Prohibido:** copiar `DOMUS_STAGING_BUNDLE.gs` al proyecto de producción.
