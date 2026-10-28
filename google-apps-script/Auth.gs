/**
 * ============================================================================
 * DOMUS OS · AUTHENTICATION & ZERO-TRUST RBAC (Auth.gs)
 * Validación estricta de sesión, dispositivos y autorización en servidor
 * PRINCIPIO: El servidor NUNCA confía en el rol o deviceId reportados por el cliente.
 * ============================================================================
 */

'use strict';

/**
 * Matriz de Permisos por Acción y Roles Autorizados
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

  // Operación Solar / Lunar
  operatingProfileDatos: ['CAJA', 'ACCESOS', 'GERENCIA', 'ADMIN'],
  operatingProfileSet: ['CAJA', 'GERENCIA', 'ADMIN'],

  // Catálogo, Administración y Carta
  sincronizarCartaConCatalogoDOMUS: ['ADMIN', 'GERENCIA'],
  registrarNuevoProducto: ['CAJA', 'ADMIN', 'GERENCIA'],
  sincronizarJujutsuShi: ['ADMIN', 'GERENCIA']
});

/**
 * Crea una sesión autenticada en el servidor vinculada a un rol y dispositivo
 */
function authCreateSession(requestedRole, deviceId, operator) {
  const cleanRole = (requestedRole && CONFIG.roles[requestedRole.toUpperCase()]) ? requestedRole.toUpperCase() : 'CAJA';
  const cleanDevice = String(deviceId || 'DEV-ANON').trim();
  const cleanOperator = String(operator || 'Operador').trim();
  const token = 'DOMUS-SES-' + Utilities.getUuid();
  
  const session = {
    token: token,
    role: cleanRole,
    deviceId: cleanDevice,
    operator: cleanOperator,
    created: Date.now(),
    expires: Date.now() + (CONFIG.sessionDurationHours * 3600 * 1000)
  };

  const cache = CacheService.getScriptCache();
  cache.put('ses:' + token, JSON.stringify(session), 21600); // 6 horas en cache rápido
  PropertiesService.getScriptProperties().setProperty('ses:' + token, JSON.stringify(session));

  return session;
}

/**
 * Valida de forma estricta la sesión del servidor (Zero-Trust)
 * REGLA DE ORO: El rol se determina EXCLUSIVAMENTE a partir de la sesión en servidor.
 * Si el cliente manipula el payload para pretender ser 'ADMIN' o 'CAJA'
 * teniendo una sesión de 'BARRA', la solicitud es rechazada inmediatamente.
 */
function authValidateAction(action, sessionToken, clientClaimedRole, clientDeviceId) {
  const allowedRoles = ACTION_PERMISSIONS[action];
  
  // Acciones de consulta abiertas (ping, estado básico)
  if (!allowedRoles || allowedRoles.length === 0) {
    return { ok: true, role: 'PUBLIC', operator: 'Público', deviceId: clientDeviceId };
  }

  // 1. Verificar existencia de token de sesión
  if (!sessionToken || typeof sessionToken !== 'string') {
    // Si no hay token de sesión, rechazar cualquier mutación
    throw new Error(`Acceso denegado: Se requiere un token de sesión activo para ejecutar '${action}'. Inicia sesión en la estación.`);
  }

  // 2. Recuperar la sesión guardada en el servidor (Cache + Properties)
  const cache = CacheService.getScriptCache();
  const rawSession = cache.get('ses:' + sessionToken) || PropertiesService.getScriptProperties().getProperty('ses:' + sessionToken);
  
  if (!rawSession) {
    throw new Error('Sesión inválida o expirada. Por favor autentica nuevamente la estación.');
  }

  let session;
  try {
    session = JSON.parse(rawSession);
  } catch (e) {
    throw new Error('Error de integridad en los datos de sesión del servidor.');
  }

  // 3. Validar expiración de sesión
  if (session.expires && session.expires < Date.now()) {
    throw new Error('La sesión de la estación ha caducado. Vuelve a iniciar sesión.');
  }

  const serverAssignedRole = session.role;

  // 4. Detección de Manipulación en Cliente (Anti-Tampering):
  // Si el cliente envió explícitamente un rol reclamado en el payload (ej. "ADMIN")
  // y no coincide con el rol asignado en la sesión de servidor (ej. "BARRA"), abortar.
  if (clientClaimedRole && String(clientClaimedRole).toUpperCase() !== serverAssignedRole) {
    console.warn(`[SECURITY ALERT] Intento de escalación de privilegios: Dispositivo ${clientDeviceId || session.deviceId} con sesión '${serverAssignedRole}' intentó reclamar rol '${clientClaimedRole}' para la acción '${action}'.`);
    throw new Error(`Violación de seguridad: El rol declarado '${clientClaimedRole}' discrepa del rol autenticado '${serverAssignedRole}'. Petición bloqueada.`);
  }

  // 5. Validar que el rol del servidor tenga autorización para la acción requerida
  if (!allowedRoles.includes(serverAssignedRole)) {
    throw new Error(`Acceso denegado: El rol autenticado '${serverAssignedRole}' no tiene autorización para ejecutar '${action}'. Roles autorizados: [${allowedRoles.join(', ')}].`);
  }

  return {
    ok: true,
    role: serverAssignedRole,
    operator: session.operator || 'Operador',
    deviceId: session.deviceId || clientDeviceId || 'DEV-ESTACION'
  };
}
