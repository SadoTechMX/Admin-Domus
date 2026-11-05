/**
 * ============================================================================
 * DOMUS OS · ARCHITECTURE & CONFIGURATION MODULE (Config.gs)
 * Base de configuración centralizada, entornos aislados y políticas de acceso
 * ============================================================================
 */

'use strict';

/**
 * Diccionario Canónico de Entornos (Aislamiento Estricto Staging vs Producción)
 */
const ENVIRONMENTS = Object.freeze({
  PRODUCTION: Object.freeze({
    name: 'PRODUCTION',
    mainSheetId: '1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U', // DOMUS · SISTEMA OPERATIVO (Producción)
    opsSheetId: '1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc'    // DOMUS · BARRA Y RESURTIDO (Producción)
  }),
  STAGING: Object.freeze({
    name: 'STAGING',
    mainSheetId: '114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg', // DOMUS-STAGING · SISTEMA OPERATIVO
    opsSheetId: '1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'    // DOMUS-STAGING · BARRA Y RESURTIDO
  })
});

/**
 * Determina el entorno activo de ejecución garantizando que Staging jamás toque Producción.
 * Prioridad de resolución:
 * 1. ScriptProperties 'DOMUS_ENV' ('PRODUCTION' | 'STAGING')
 * 2. ScriptProperties 'STAGING_MAIN_SHEET_ID' y 'STAGING_OPS_SHEET_ID'
 * 3. Inyección contextual D.env
 * 4. Fallback seguro
 */
function getActiveEnvironment_() {
  try {
    if (typeof PropertiesService !== 'undefined') {
      const props = PropertiesService.getScriptProperties();
      const propEnv = props.getProperty('DOMUS_ENV');
      
      if (propEnv === 'PRODUCTION') {
        return ENVIRONMENTS.PRODUCTION;
      }

      if (propEnv === 'STAGING') {
        const customMain = props.getProperty('STAGING_MAIN_SHEET_ID') || ENVIRONMENTS.STAGING.mainSheetId;
        const customOps = props.getProperty('STAGING_OPS_SHEET_ID') || ENVIRONMENTS.STAGING.opsSheetId;
        if (customMain !== ENVIRONMENTS.STAGING.mainSheetId || customOps !== ENVIRONMENTS.STAGING.opsSheetId) {
          throw new Error('ENVIRONMENT_MISMATCH: STAGING debe usar ambos libros aislados aprobados.');
        }
        return {
          name: 'STAGING',
          mainSheetId: customMain,
          opsSheetId: customOps
        };
      }
    }
  } catch (e) { throw e; }

  // An unconfigured installation must never silently select real money books.
  return ENVIRONMENTS.STAGING;
}

const ACTIVE_ENV = getActiveEnvironment_();

const CONFIG = Object.freeze({
  // Entorno activo
  environment: ACTIVE_ENV.name,
  isStaging: ACTIVE_ENV.name === 'STAGING',
  
  // Identificadores de Google Sheets
  mainSheetId: ACTIVE_ENV.mainSheetId,
  opsSheetId: ACTIVE_ENV.opsSheetId,
  
  // Lista de Gerencia & Supervisión
  managers: typeof D !== 'undefined' && D.managers ? D.managers : ['direccion@domusccc.net', 'sadotechfet@gmail.com'],
  
  // Operadores Autorizados del Club
  staff: ['René', 'Miguel', 'Mike', 'Taichi Mike', 'Meaw', 'Wall E', 'Iván', 'Kas', 'Steven', 'Angel'],
  
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
