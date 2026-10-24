/**
 * ============================================================================
 * DOMUS OS · ARCHITECTURE & CONFIGURATION MODULE (Config.gs)
 * Base de configuración centralizada, libros maestros y políticas de acceso
 * ============================================================================
 */

'use strict';

const CONFIG = Object.freeze({
  // Identificadores de Google Sheets
  mainSheetId: typeof D !== 'undefined' && D.main ? D.main : '1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U',
  opsSheetId: typeof D !== 'undefined' && D.ops ? D.ops : '1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc',
  
  // Lista de Gerencia & Supervisión
  managers: typeof D !== 'undefined' && D.managers ? D.managers : ['direccion@domusccc.net', 'sadotechfet@gmail.com'],
  
  // Operadores Autorizados del Club
  staff: ['René', 'Miguel', 'Mike', 'Meaw', 'Wall E', 'Iván', 'Kas', 'Steven', 'Angel'],
  
  // Parámetros de Sesión y Seguridad
  sessionDurationHours: 12,
  lockTimeoutMs: 30000,
  
  // Roles de Estación Autorizados (RBAC)
  roles: Object.freeze({
    CAJA: 'CAJA',
    BARRA: 'BARRA',
    COCINA: 'COCINA',
    ACCESOS: 'ACCESOS',
    GERENCIA: 'GERENCIA',
    ADMIN: 'ADMIN'
  })
});
