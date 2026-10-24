# 🍷 DOMUS · Sistema Operativo de Administración, Caja y Comandas

Plataforma web unificada de alta fidelidad diseñada para la gestión operativa de **DOMUS**. Permite operar de forma simultánea e integrada desde:
- **Caja (Punto de Venta / POS):** Registro de pedidos, cálculo dinámico de carta Solar/Lunar, cobro con efectivo, terminales o crédito y cálculo de cambio.
- **Comandas (Pantalla KDS de Barra y Cocina):** Tablero en tiempo real por lotes con cronómetro de urgencia, asignación de responsables, marcado de listos y entregas físicas.

---

## 🛠️ Tecnologías y Arquitectura
- **Frontend Web:** HTML5 Semántico, Vanilla CSS (diseño oscuro Obsidian & Amber Gold con glassmorphism) y Vanilla JavaScript ES6+.
- **Backend Integrado:** Google Apps Script Web App con conexión a libros maestros de Google Sheets (`CAJA 2`, `COMANDAS`, `COBROS`, `INVENTARIO`, `RESURTIDO`, `HISTORIAL`).
- **Resiliencia & Offline:** Sincronización continua con detector de conectividad y simulador local de contingencia.
- **Notificaciones Sonoras:** Alerta sonora integrada mediante Web Audio API sintetizado.

---

## 📂 Estructura del Proyecto
```
Admin-Domus/
├── index.html                   # Aplicación Web principal (SPA)
├── css/
│   └── app.css                  # Sistema de diseño, temas y componentes
├── js/
│   └── app.js                   # Lógica de Caja, Comandas, Carrito y Sincronización
├── assets/
│   └── LOGO DOMUS-01.png        # Logotipo e identidad visual oficial
├── google-apps-script/
│   ├── Code.gs                  # Código backend Apps Script (Web App + REST API)
│   └── Index.html               # Versión compilada autocontenida para Apps Script
├── DEPLOY_GUIDE.md              # Instrucciones detalladas de despliegue
└── README.md
```

---

## 🚀 Despliegue Rápido
Consulta la guía completa en [DEPLOY_GUIDE.md](file:///Users/sadotechdireccion/Documents/GitHub/Admin-Domus/DEPLOY_GUIDE.md).
- **GitHub Pages:** Habilitar desde *Settings > Pages* en la rama `main`.
- **Google Apps Script:** Implementar como Aplicación Web desde la hoja de cálculo de Google.
