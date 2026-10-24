# 🏗️ DOMUS OS · TECHNICAL ARCHITECTURE

Documentación técnica de componentes, arquitectura en capas, flujo de datos y modelo de concurrencia.

---

## 📐 Diagrama de Arquitectura

```mermaid
graph TD
    subgraph Cliente [Frontend PWA / GitHub Pages]
        UI[Interfaces: Caja, KDS, Accesos]
        Outbox[(Outbox LocalStorage)]
        WebLock[Web Locks API Mutex]
        BC[BroadcastChannel & Storage Event]
    end

    subgraph Red [Transporte HTTPS]
        API_Call[REST POST / GET JSON]
    end

    subgraph Backend [Google Apps Script Runtime]
        Router[Api.gs Router]
        AuthModule[Auth.gs Zero-Trust RBAC]
        IdempModule[Idempotency.gs SHA-256 + LockService]
        Modules[POS.gs / KDS.gs / Access.gs / Inventory.gs / Accounts.gs]
    end

    subgraph Almacenamiento [Google Cloud & Workspace]
        Cache[ScriptCache <5ms]
        Props[ScriptProperties]
        Sheets[(Google Sheets Maestro)]
        RequestsSheet[(Hoja REQUESTS Ledger)]
    end

    UI --> Outbox
    Outbox --> WebLock
    WebLock --> API_Call
    WebLock --> BC
    API_Call --> Router
    Router --> AuthModule
    AuthModule --> IdempModule
    IdempModule --> Modules
    IdempModule -.-> Cache
    IdempModule -.-> Props
    IdempModule --> RequestsSheet
    Modules --> Sheets
```

---

## 🔄 Flujo Transaccional de una Venta (Caja ➔ KDS ➔ Sheets)

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operador (Caja)
    participant UI as Navegador (app.js)
    participant WL as Web Locks API
    participant GAS as Apps Script (Api.gs)
    participant Lock as LockService
    participant Sheet as Google Sheets (COBROS/COMANDAS)

    Op->>UI: Cobrar $500 (Efectivo)
    UI->>UI: Generar requestId (REQ-XXXX)
    UI->>UI: Encolar en Outbox (LOCAL_PENDING)
    UI->>WL: navigator.locks.request('domus-outbox-sync')
    activate WL
    WL->>GAS: POST { action: 'cajaSimpleRegistrar', requestId, payloadHash, ... }
    GAS->>GAS: Auth.gs verifica rol y sesión
    GAS->>Lock: waitLock(30000ms)
    activate Lock
    GAS->>GAS: Verificar requestId en REQUESTS / Cache
    GAS->>Sheet: Insertar venta en CAJA 2 y COBROS
    GAS->>Sheet: Despachar orden a COMANDAS (KDS)
    GAS->>Sheet: Registrar COMPLETED en hoja REQUESTS
    Lock-->>GAS: releaseLock()
    deactivate Lock
    GAS-->>WL: 200 OK { ok: true, data: receipt }
    WL->>UI: Quitar de Outbox / Marcar CONFIRMED
    WL->>UI: Notificar a otras pestañas (BroadcastChannel)
    deactivate WL
    UI->>Op: Imprimir Comprobante / Toast Éxito
```

---

## 🛡️ Capas de Resiliencia
1. **Pérdida de Red:** Las órdenes quedan encoladas localmente en Outbox y no se pierden al cerrar el navegador.
2. **Pestañas Simultáneas:** Web Locks API previene la duplicación de órdenes al reconectar.
3. **Pérdida de ACK:** Si la orden se escribió en Google Sheets pero la respuesta no llegó al navegador, el reintento detecta el `requestId` con el mismo hash en la hoja `REQUESTS` y devuelve el recibo original.
4. **Mutación de Datos:** Si un bug intenta reusar un `requestId` con otro monto, el servidor rechaza con `409 Conflict: IDEMPOTENCY_KEY_REUSED`.
