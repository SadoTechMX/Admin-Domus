# ⚖️ DOMUS OS · REGLAS OPERATIVAS INMUTABLES (Non-Negotiables)

> [!CAUTION]
> **REGLAS DE ORO**: Ningún desarrollador ni agente de inteligencia artificial (Antigravity, ChatGPT, etc.) debe modificar, reinterpretar ni "optimizar" estas reglas sin una solicitud explícita del usuario y un Architecture Decision Record (ADR) aprobado.

---

### 1. Inmutabilidad de Registros Financieros
* **Regla:** Ninguna fila en `COBROS` se sobrescribe, borra o reasigna.
* **Mecanismo:** Las cancelaciones se asientan como transacciones compensatorias o notas de crédito, conservando el folio original intacto para auditoría del SAT y arqueo de caja.

### 2. Disminución de Inventario en Entrega Física
* **Regla:** El stock de insumos y productos se descuenta **únicamente cuando la comanda es despachada y entregada físicamente** al cliente en barra o cocina.
* **Razón:** Prevenir que órdenes capturadas en caja pero canceladas antes de preparación alteren los conteos físicos de botellas o cocina.

### 3. Cuentas Abiertas y Amigos
* **Regla:** Se permite acumular consumos bajo una cuenta abierta (`CTA-...`) sin requerir liquidación inmediata al momento del pedido.
* **Mecanismo:** El saldo pendiente se recalcula sumando consumos de `CAJA 2` y restando abonos en `COBROS`. El saldo puede permanecer vivo entre turnos.

### 4. Zero-Trust en Roles y Permisos (RBAC)
* **Regla:** La estación de trabajo (`role`) declarada en el cuerpo JSON por el cliente en el navegador se considera **no confiable** por defecto.
* **Mecanismo:** El backend (`Auth.gs`) verifica el `sessionToken`, recupera el rol genuino almacenado en el servidor y rechaza cualquier solicitud con discrepancias (`403 Forbidden`).

### 5. Idempotencia Vinculada a Contenido (Payload Binding)
* **Regla:** Un `requestId` no solo debe ser único, sino que está vinculado indisolublemente a `action + payloadHash + deviceId`.
* **Mecanismo:** Si el mismo `requestId` reaparece con el mismo payload (reintento por fallo de red), se devuelve el comprobante original. Si el payload difiere, se rechaza inmediatamente con `409 Conflict: IDEMPOTENCY_KEY_REUSED`.

### 6. Exclusión Mutua Multi-Pestaña
* **Regla:** Dos pestañas del navegador en una misma estación de trabajo jamás deben disparar peticiones de Outbox concurrentes.
* **Mecanismo:** Exclusión mutua obligatoria mediante **Web Locks API** (`navigator.locks.request('domus-outbox-sync', ...)`), con fallback a lease temporal en `localStorage`.

### 7. Autorización de Cortesías
* **Regla:** Las cortesías no descuentan el precio a $0 sin una validación explícita de correo de gerencia (`CONFIG.managers`) o bandera autorizada por el supervisor en turno.

### 8. Seguridad de Credenciales
* **Regla:** Los secretos (Personal Access Tokens, contraseñas, llaves de API) jamás deben aparecer en URLs remotas de Git, archivos de código, commits o logs del sistema.
