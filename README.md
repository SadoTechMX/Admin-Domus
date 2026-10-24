# 🍷 DOMUS · Sistema Operativo Unificado (Admin, POS, KDS & Accesos)

Plataforma web unificada de alta fidelidad para la administración, punto de venta, comandas y control de accesos de **DOMUS Centro Cultural & Club**.

El sistema opera en tiempo real conectado con **Google Sheets** (a través de Google Apps Script) y está desplegado públicamente en **GitHub Pages**.

---

## 🌐 Enlaces del Proyecto

- **Aplicación Web en Vivo (GitHub Pages):** [https://sadotechmx.github.io/Admin-Domus/](https://sadotechmx.github.io/Admin-Domus/)
- **Modo Taquilla & Accesos Directo:** [https://sadotechmx.github.io/Admin-Domus/?vista=accesos](https://sadotechmx.github.io/Admin-Domus/?vista=accesos)
- **Modo Punto de Venta / Caja (PIN):** [https://sadotechmx.github.io/Admin-Domus/?vista=caja](https://sadotechmx.github.io/Admin-Domus/?vista=caja)
- **Modo Pantalla KDS Comandas:** [https://sadotechmx.github.io/Admin-Domus/?vista=comandas](https://sadotechmx.github.io/Admin-Domus/?vista=comandas)
- **Repositorio en GitHub:** [https://github.com/SadoTechMX/Admin-Domus](https://github.com/SadoTechMX/Admin-Domus)
- **GitIngest para Análisis con LLM / ChatGPT:** [https://gitingest.com/SadoTechMX/Admin-Domus](https://gitingest.com/SadoTechMX/Admin-Domus)

---

## 🏛️ Módulos y Capacidades del Sistema

### 1. 💰 Modo Caja (Punto de Venta / POS)
- **Seguridad por PIN:** Protección con teclado táctil numérico y sesión autenticada por dispositivo.
- **Catálogo Dinámico de la Carta:** Sincronizado con la Carta Oficial de DOMUS (Cafetería, Alimentos, Coctelería de Autor, Cervezas, Vinos, Destilados, Cigarros y Souvenirs).
- **Tarifas Solar / Lunar:** Conmutación dinámica de precios según la fase del club.
- **Cuentas Abiertas:** Apertura y seguimiento de cuentas por cliente o mesa (`M-01`, etc.) con recálculo en tiempo real.
- **Cobro Multimétodo:** Efectivo con calculadora de cambio, Terminal 1, Terminal 2, Transferencia y Cortesías.
- **Alta de Productos:** Modal integrado para administradores para registrar nuevos ítems con categoría personalizada, precios Solar/Lunar y stock hacia `CATALOGO` e `INVENTARIO`.
- **Comprobantes Imprimibles:** Tickets térmicos con desglose y registro directo en `COBROS`.

### 2. 📋 Modo Comandas (KDS de Barra y Cocina)
- **Despacho en Tiempo Real:** Recepción automática de pedidos con alertas sonoras sintetizadas (Web Audio API).
- **Filtros por Destino y Estado:** Barra, Cocina o Todos; estados *Pendiente*, *En preparación*, *Listo* y *Entregado*.
- **Gestión de Incidencias & Faltantes:** Registro de mermas y solicitudes de resurtido conectadas con la hoja `RESURTIDO`.
- **Historial de Despacho:** Auditoría de tiempos de preparación y entrega por operador.

### 3. 🎟️ Modo Accesos, Taquilla, Guardarropa & Eventos (`ACTIVIDADES` & `ACCESO`)
- **Gestión de Eventos:** Conexión con `ACTIVIDADES` para fijar el evento activo de turno y leer su aforo y tarifas dinámicas (*General*, *Pareja*, *Trío* y *Guardarropa* por prenda).
- **Check-In de Asistentes:** Registro con nombre, contacto, validación de preventas (`BOL-...`) y autorizaciones de cortesía.
- **Guardarropa con Talón Desprendible:** Emisión de talón térmico con folio `GUA-A-XXXX` y gestión de custodia en tiempo real con botón de un clic para marcar devoluciones.
- **Pestañas Operativas:**
  - *Ingresos Hoy:* Log completo con reimpresión de tickets.
  - *Guardarropa Activo:* Control de prendas en resguardo.
  - *Eventos & Tarifas:* Calendario y fijación de evento activo.
- **Programación de Eventos:** Modal para dar de alta nuevas actividades con tarifas autorizadas.

---

## 🛠️ Stack Tecnológico & Conectividad

- **Frontend:** HTML5 Semántico, Vanilla CSS (Diseño Obsidian & Gold, microanimaciones, glassmorphism y diseño responsivo táctil) y Vanilla JavaScript (SPA reactiva sin dependencias externas pesadas).
- **Backend / Base de Datos:** Google Apps Script (`Code.gs`) que actúa como API REST y Web App, interactuando con las hojas de cálculo de Google:
  - `ACTIVIDADES` (Eventos y tarifas)
  - `ACCESO` (Log de entradas y guardarropa)
  - `CAJA 2` (Catálogo activo y turnos)
  - `COMANDAS` (Cola de órdenes KDS)
  - `COBROS` (Transacciones de pago)
  - `CATALOGO` / `INVENTARIO` (Stock y precios)
  - `RESURTIDO` (Solicitudes de cocina/barra)
- **Modo Autónomo & Resiliencia Offline:** Almacenamiento local `localStorage` de contingencia en caso de interrupción de red y sincronización en segundo plano con sondeo periódico.

---

## 📂 Estructura de Archivos

```
Admin-Domus/
├── index.html                   # Interfaz de usuario unificada (Caja, Comandas, Accesos)
├── css/
│   └── app.css                  # Sistema de diseño completo (Obsidian-Gold, KDS, Taquilla)
├── js/
│   └── app.js                   # Lógica unificada, ruteo por vistas, POS, KDS y Accesos
├── assets/
│   └── LOGO DOMUS-01.png        # Identidad visual oficial de DOMUS
├── google-apps-script/
│   ├── Code.gs                  # API REST y lógica de Google Apps Script para Sheets
│   └── Index.html               # Versión compilada autónoma para Apps Script Web App
├── DEPLOY_GUIDE.md              # Guía paso a paso de despliegue
└── README.md                    # Documentación y arquitectura técnica
```
