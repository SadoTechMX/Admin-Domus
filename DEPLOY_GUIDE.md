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
   - **Modo Caja:** `https://script.google.com/a/macros/domusccc.net/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec?vista=caja`
   - **Modo Comandas:** `https://script.google.com/a/macros/domusccc.net/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec?vista=comandas`

---

## 💻 Características del Sistema
- **Navegación Rápida:** Cambia entre **Modo Caja** y **Modo Comandas** con un solo toque desde la barra superior.
- **Modo Offline & Resiliencia:** Si la conexión con Google tarda o falla, el sistema activa el simulador interactivo de DOMUS sin interrumpir la interfaz.
- **Sonido de Comandas (Audio Chime):** Sintetizador Web Audio integrado con alertas para nuevos pedidos.
- **Cálculo de Cambio y Billetes:** Botones rápidos de $50, $100, $200 y $500 con cálculo de cambio y propina voluntaria.
