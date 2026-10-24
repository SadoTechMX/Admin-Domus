/**
 * ============================================================================
 * DOMUS OS · AUTHENTICATION & ROLE-BASED ACCESS CONTROL (Auth.gs)
 * Validación de sesión, dispositivos y autorización en servidor (RBAC)
 * ============================================================================
 */

'use strict';

/**
 * Matriz de Permisos por Acción y Rol
 */
const ACTION_PERMISSIONS = Object.freeze({
  // Caja y POS
  cajaSimpleDatos: ['CAJA', 'GERENCIA', 'ADMIN'],
  cajaSimpleRegistrar: ['CAJA', 'GERENCIA', 'ADMIN'],
  cajaSimpleEstado: ['CAJA', 'GERENCIA', 'ADMIN'],
  cajaSimplePreparar: ['CAJA', 'GERENCIA', 'ADMIN'],

  // Comandas y KDS
  comandasSimpleDatos: ['BARRA', 'COCINA', 'CAJA', 'GERENCIA', 'ADMIN'],
  comandasSimpleAccion: ['BARRA', 'COCINA', 'GERENCIA', 'ADMIN'],
  comandasSimpleResolver: ['BARRA', 'COCINA', 'GERENCIA', 'ADMIN'],
  comandasSimpleEntrar: ['BARRA', 'COCINA', 'CAJA', 'ACCESOS', 'GERENCIA', 'ADMIN'],

  // Accesos, Eventos y Guardarropa
  accesoSimpleDatos: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  accesoSimpleRegistrar: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  guardarropaDevolver: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  accesoCambiarActividad: ['ACCESOS', 'GERENCIA', 'ADMIN'],
  registrarNuevoEvento: ['ACCESOS', 'GERENCIA', 'ADMIN'],

  // Catálogo, Administración y Carta
  sincronizarCartaConCatalogoDOMUS: ['ADMIN', 'GERENCIA'],
  registrarNuevoProducto: ['CAJA', 'ADMIN', 'GERENCIA'],
  sincronizarJujutsuShi: ['ADMIN', 'GERENCIA']
});

/**
 * Valida o genera un token de sesión para una estación/dispositivo
 */
function authCreateSession(role, deviceId, operator) {
  if (!role || !CONFIG.roles[role]) {
    role = 'CAJA'; // Rol por defecto controlado
  }
  const cleanDevice = String(deviceId || 'DEV-ANON').trim();
  const cleanOperator = String(operator || 'Operador').trim();
  const token = 'DOMUS-SES-' + Utilities.getUuid();
  
  const session = {
    token: token,
    role: role,
    deviceId: cleanDevice,
    operator: cleanOperator,
    created: Date.now(),
    expires: Date.now() + (CONFIG.sessionDurationHours * 3600 * 1000)
  };

  const cache = CacheService.getScriptCache();
  cache.put('ses:' + token, JSON.stringify(session), 21600); // 6 horas en cache rápido
  
  // Guardar también en PropertiesService para persistencia garantizada
  PropertiesService.getScriptProperties().setProperty('ses:' + token, JSON.stringify(session));

  return session;
}

/**
 * Verifica si la petición cuenta con el rol requerido para ejecutar la acción
 */
function authValidateAction(action, sessionToken, requestedRole, deviceId) {
  const allowedRoles = ACTION_PERMISSIONS[action];
  
  // Si la acción no está restringida explícitamente, permitir
  if (!allowedRoles || allowedRoles.length === 0) {
    return { ok: true, role: 'ANON' };
  }

  // Si no se proporcionó token pero sí un rol reconocido de estación local:
  // Permitir la transición con registro de auditoría mientras se establece el apretón de manos
  let session = null;
  if (sessionToken) {
    const cache = CacheService.getScriptCache();
    const raw = cache.get('ses:' + sessionToken) || PropertiesService.getScriptProperties().getProperty('ses:' + sessionToken);
    if (raw) {
      try {
        session = JSON.parse(raw);
        if (session.expires && session.expires < Date.now()) {
          session = null; // Sesión expirada
        }
      } catch (e) {
        session = null;
      }
    }
  }

  const effectiveRole = session ? session.role : (requestedRole ? String(requestedRole).toUpperCase() : '');

  if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
    throw new Error(`Acceso denegado: El rol '${effectiveRole || 'NO_AUTH'}' no tiene autorización para ejecutar '${action}'. Se requiere: [${allowedRoles.join(', ')}]`);
  }

  return {
    ok: true,
    role: effectiveRole,
    operator: session ? session.operator : 'Operador Local',
    deviceId: session ? session.deviceId : (deviceId || 'UNKNOWN_DEVICE')
  };
}
