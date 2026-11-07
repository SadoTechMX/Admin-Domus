# ADR-007 — Contexto durable de jornada en el POS de recuperación

Estado: implementación aislada, pendiente de compatibilidad/validación/activación. No implica aprobación de producción ni de la regla de cierre con transferencias/entregas pendientes.

La instrucción de Steven fija evento/proyecto/jornada y ciclo apertura de caja → corte explícito, conservando hora real sin cierre automático. La rama previa de turnos identifica día por fecha, agrega columnas y escribe directo; trasladarla íntegra rompería la recuperación de la candidata.

Se adaptan sus permisos y exclusión por estación/gaveta a los RPC `turnoAbrir`, `turnoEstado`, `corteZCerrar`, persistidos con REQUESTS/journal. La identidad estable es `JOR-<requestId de apertura>`. Un mapa explícito de servidor determina las identidades y estaciones; no hay migración inferida de ACTIVIDADES/TURNOS. Venta y cobro posterior guardan contextos separados sin mover el origen. Se conservan idempotencia por contenido/dispositivo, lock, inventario a la entrega, cuentas abiertas y fórmula/guardia SEMANA.

El corte adaptado cierra la jornada y captura únicamente recibos POS vinculados. Se declara `financialFinal:false`; no sustituye arqueo de todos los canales ni liquidación/reparto. El cierre con transferencias/entregas pendientes permanece bloqueado hasta decisión explícita. No se amplían permisos a Accesos en este alcance de Caja.

Consecuencias: no necesita nuevas columnas financieras, pero tampoco es interoperable por simple copia con TURNOS/CORTES_Z antiguos. Quitar la configuración después de usar jornadas falla cerrado; un rollback a código que ignore contexto requiere detener nuevas mutaciones y conservar recuperación compatible. Operar fuera de SEMANA sigue pendiente de fórmulas/reportes y pruebas reales autorizadas. [Contrato, pruebas y límites](../JOURNEY_INTEGRATION_20261107.md).
