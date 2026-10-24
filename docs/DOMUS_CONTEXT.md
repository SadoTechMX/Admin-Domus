# 🏛️ DOMUS OS · CONTEXTO OPERACIONAL Y DEL NEGOCIO

> [!NOTE]
> Este documento resume el propósito, cultura, operaciones y particularidades del club para que cualquier agente de IA o desarrollador entienda **por qué el sistema funciona como funciona**.

---

## 🎭 ¿Qué es DOMUS?
**DOMUS Centro Cultural & Club** es un espacio multidisciplinario en la Ciudad de México que integra:
* Club nocturno y presentaciones en vivo.
* Barra de coctelería y destilados.
* Cocina y alimentos preparados.
* Acceso, taquilla, eventos especiales y control de aforo en tiempo real.
* Guardarropa con seguimiento de prendas.
* Cuentas abiertas de confianza para socios, artistas y staff.

---

## ☀️🌙 Fases Operativas: Solar vs. Lunar
El día en DOMUS se divide en dos fases con dinámicas completamente distintas:

1. **Fase Solar (Día / Tarde):**
   * Ambiente cultural, café, comidas y coctelería suave.
   * Catálogo con precios Solar (menores para incentivar permanencia).
   * Despacho enfocado principalmente en cocina.
2. **Fase Lunar (Noche / Club):**
   * Operación de alta intensidad, barra saturada, venta de botellas y coctelería de autor.
   * Catálogo con precios Lunar.
   * Despacho enfocado principalmente en estaciones de Barra.
   * Requisito de latencia mínima en KDS para no frenar la preparación.

El sistema refleja este cambio a través de la celda `F2` en la hoja `CAJA 2`, cambiando dinámicamente precios y reglas de despacho.

---

## 👥 Estaciones y Roles de Operación (RBAC)
* **CAJA:** Estación principal de cobro, apertura de tickets y recepción de pagos (Efectivo, Tarjeta, Transferencia).
* **BARRA:** Visualización y despacho de bebidas en KDS.
* **COCINA:** Visualización y preparación de alimentos en KDS.
* **ACCESOS:** Validación de entradas, preventas, listas de invitados, aforo y guardarropa.
* **GERENCIA:** Supervisión general, anulación de tickets, autorización de cortesías.
* **ADMIN:** Acceso total a configuración, catálogo y arqueo.

---

## 🎯 Principios de Filosofía Operacional (NEC)
1. **La tecnología nunca frena el servicio:** Si la red se cae, la barra sigue sirviendo y la caja sigue registrando (Outbox Offline).
2. **Confianza con auditoría:** Se permiten cuentas abiertas ("amigos / artistas"), pero todo movimiento queda registrado con folio único.
3. **Respeto a los inventarios físicos:** No se da de baja una botella hasta que el bartender la abre físicamente.
4. **Cortesías controladas:** El personal de caja o barra no puede autorizar cortesías arbitrariamente; requiere flag de dirección o gerencia.
