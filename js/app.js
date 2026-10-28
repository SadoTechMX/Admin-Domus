/**
 * DOMUS ADMIN & PUNTO DE VENTA - SISTEMA UNIFICADO
 * Modo Caja (POS / Cobro) y Modo Comandas (KDS Cocina y Barra)
 */

'use strict';

(function () {
  // --- CONFIGURACIÓN & ESTADO INICIAL ---
  const OFFICIAL_PRODUCTION_ENDPOINT = 'https://script.google.com/macros/s/AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk/exec';
  const STAGING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec';
  const STAFF_MEMBERS = ['René', 'Miguel', 'Mike', 'Taichi Mike', 'Meaw', 'Wall E', 'Iván', 'Kas', 'Steven', 'Angel'];

  // Determinar entorno de ejecución (Issue #1: Bloqueo estricto del endpoint productivo)
  const _urlParams = new URLSearchParams(window.location.search);
  const _isStagingExplicit = _urlParams.get('env') === 'staging';
  const _isLocalDev = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !_urlParams.has('env');
  const isStagingEnv = _isStagingExplicit || (_isLocalDev && _urlParams.get('env') !== 'production');

  // En producción oficial (Caja, Comandas, Accesos), el endpoint está bloqueado.
  // localStorage.domus_gas_url NO puede alterar el backend productivo bajo ninguna circunstancia.
  let validApiUrl = OFFICIAL_PRODUCTION_ENDPOINT;
  let isProductionLocked = true;

  if (isStagingEnv) {
    const cachedGasUrl = localStorage.getItem('domus_gas_url');
    validApiUrl = (cachedGasUrl && !cachedGasUrl.includes('domusccc.net')) ? cachedGasUrl : STAGING_ENDPOINT;
    isProductionLocked = false;
  }

  const STATE = {
    mode: 'caja', // 'caja' | 'comandas'
    phase: 'Lunar', // 'Solar' | 'Lunar'
    apiUrl: validApiUrl,
    isProductionLocked: isProductionLocked,
    backendEnvironment: isProductionLocked ? 'PRODUCTION' : 'STAGING',
    endpointDeploymentId: 'AKfycbysBaRA2_oZIOqU10G4E_MHiC8FUR3dCnqj2DlLG91iNJXP3GkZZ7BK0Na1FAJ1thZk',
    operator: sessionStorage.getItem('domus_operator') || '',
    sound: localStorage.getItem('domus_sound') === 'true',
    catalogCategory: 'Todas',
    searchQuery: '',
    cart: [], // [{ name, group, price, qty, courtesy, destination }]
    selectedAccountTicket: '',
    customerName: '',
    activity: 'Visita general DOMUS',
    accountType: '', // '' | 'Amigo' | 'Creador de proyecto'
    
    // Datos en vivo / Caché
    products: [],
    openAccounts: [],
    activities: ['Visita general DOMUS', 'Cata / Degustación', 'Membresía Club', 'Evento Especial'],
    lastReceiptInfo: '',
    
    // KDS Comandas
    comandas: [],
    historyComandas: [],
    restockRequests: [],
    kdsFilterState: 'Todas',
    kdsFilterDest: '',
    kdsSearch: '',

    // Accesos, Eventos y Guardarropa
    activeActivity: 'Forza · sábado',
    eventsList: [],
    recentAccessList: [],
    accessSelectedType: 'General',
    accessWardrobeQty: 0,
    accessPaymentMethod: 'Efectivo',
    accessSearch: '',
    accessTab: 'log', // 'log' | 'wardrobe' | 'events'
    openingFloat: 600,
    openingFloatProvider: 'Steven',
    openingFloatConcept: 'Fondo inicial / fondo de cambio',
    deletedAccessIds: new Set(JSON.parse(localStorage.getItem('domus_deleted_access_ids') || '[]')),
    editedAccessMap: JSON.parse(localStorage.getItem('domus_edited_access_map') || '{}'),
    
    // Conexión
    isNativeGas: !!(window.google && google.script && google.script.run),
    isDemoMode: false,
    pollTimer: null,
    audioCtx: null,
    seenOrderKeys: new Set(),
    lastSyncTimestamp: null,
    isSyncing: false
  };

  // --- CATÁLOGO BASE REAL DE DOMUS (PARA DEMO/OFFLINE) ---
const DEFAULT_CATALOG = [
  {
    "name": "Brebaje Americano · Taza 300 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 40.0,
    "priceSolar": 40.0,
    "priceLunar": 40.0,
    "destination": "Barra",
    "sku": "B02",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Café de la Casa · Taza 300 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 40.0,
    "priceSolar": 40.0,
    "priceLunar": 40.0,
    "destination": "Barra",
    "sku": "B10",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Cáliz de Espuma · Taza 240 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 60.0,
    "priceSolar": 60.0,
    "priceLunar": 60.0,
    "destination": "Barra",
    "sku": "B04",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Espresso adicional · Adicional de espresso",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 20.0,
    "priceSolar": 20.0,
    "priceLunar": 20.0,
    "destination": "Barra",
    "sku": "EX1",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Estrella Latte · Taza 300 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 60.0,
    "priceSolar": 60.0,
    "priceLunar": 60.0,
    "destination": "Barra",
    "sku": "B03",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Leche de Brujo · Vaso 400 ml con hielo",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 50.0,
    "priceSolar": 50.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "B09",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Limonada de la Casa · Vaso 400 ml con hielo",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 40.0,
    "priceSolar": 40.0,
    "priceLunar": 40.0,
    "destination": "Barra",
    "sku": "B11",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Luna Negra · Vaso 400 ml con hielo",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 60.0,
    "priceSolar": 60.0,
    "priceLunar": 60.0,
    "destination": "Barra",
    "sku": "B05",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Oro Negro · Espresso 36–40 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 40.0,
    "priceSolar": 40.0,
    "priceLunar": 40.0,
    "destination": "Barra",
    "sku": "B01",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Té Chai · Taza 300 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 60.0,
    "priceSolar": 60.0,
    "priceLunar": 60.0,
    "destination": "Barra",
    "sku": "B06",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Té Herbal · Taza 300 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 40.0,
    "priceSolar": 40.0,
    "priceLunar": 40.0,
    "destination": "Barra",
    "sku": "B08",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Xocolatl · Taza 300 ml",
    "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
    "group": "Cafetería",
    "price": 60.0,
    "priceSolar": 60.0,
    "priceLunar": 60.0,
    "destination": "Barra",
    "sku": "B07",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Agua mineral",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-023-MINERAL",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Agua natural · Botella 500 ml",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 30.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "R01",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Agua quina",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 50.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-023-QUINA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Clamato preparado · 1 litro",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 120.0,
    "priceSolar": 100.0,
    "priceLunar": 120.0,
    "destination": "Barra",
    "sku": "BAR-CLAM-SERV-L",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Clamato preparado · 500 ml",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 80.0,
    "priceSolar": 60.0,
    "priceLunar": 80.0,
    "destination": "Barra",
    "sku": "BAR-CLAM-SERV",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Coca-Cola · 355 ml",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-022-COCA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Jugo de arándano · 1 litro",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 120.0,
    "priceSolar": 100.0,
    "priceLunar": 120.0,
    "destination": "Barra",
    "sku": "BAR-024-ARANDANO-L",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Jugo de arándano · 500 ml",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-024-ARANDANO",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Jugo de naranja · 1 litro",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 120.0,
    "priceSolar": 100.0,
    "priceLunar": 120.0,
    "destination": "Barra",
    "sku": "BAR-024-NARANJA-L",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Jugo de naranja · 500 ml",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-024-NARANJA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Jugo de piña · 1 litro",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 120.0,
    "priceSolar": 100.0,
    "priceLunar": 120.0,
    "destination": "Barra",
    "sku": "BAR-024-PINA-L",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Jugo de piña · 500 ml",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-024-PINA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Sidral",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-022-SIDRAL",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Sprite",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-022-SPRITE",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Squirt · Botella",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 50.0,
    "priceSolar": 45.0,
    "priceLunar": 50.0,
    "destination": "Barra",
    "sku": "BAR-022-SQUIRT",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Volt Blue · Lata",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 80.0,
    "priceSolar": 45.0,
    "priceLunar": 80.0,
    "destination": "Barra",
    "sku": "BAR-VOLT-BLUE",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Volt Yellow · Lata",
    "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
    "group": "Refrescos y Aguas",
    "price": 80.0,
    "priceSolar": 45.0,
    "priceLunar": 80.0,
    "destination": "Barra",
    "sku": "BAR-VOLT-YELLOW",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Caguama Corona Mega · Botella 1.2 L",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Barra",
    "sku": "N03",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Caguama Victoria Mega · Botella 1.2 L",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Barra",
    "sku": "N02",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Carta Blanca · Lata",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 70.0,
    "priceSolar": 50.0,
    "priceLunar": 70.0,
    "destination": "Barra",
    "sku": "BAR-CB-LATA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Alemana Black · lata",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "BAR-001",
    "provider": "Felssloschen · Mariam Reyes",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Alemana Bock · lata",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "BAR-001",
    "provider": "Felssloschen · Mariam Reyes",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Onírica Viena · lata",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 90.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "BAR-002",
    "provider": "Onírica Cervecería",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Onírica IPA · lata",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 90.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "BAR-002",
    "provider": "Onírica Cervecería",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Onírica Lager · lata",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 90.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "BAR-002",
    "provider": "Onírica Cervecería",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Corona · Cerveza 710 ml",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 85.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "R02",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Corona Extra · Lata 473 ml",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 70.0,
    "priceSolar": 50.0,
    "priceLunar": 70.0,
    "destination": "Barra",
    "sku": "N04",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Modelo Especial · Cerveza 710 ml",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 85.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "R03",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Modelo Especial · lata 473 ml",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 70.0,
    "priceSolar": 50.0,
    "priceLunar": 70.0,
    "destination": "Barra",
    "sku": "MODELO-473",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Victoria · 473 ml",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 70.0,
    "priceSolar": 50.0,
    "priceLunar": 70.0,
    "destination": "Barra",
    "sku": "VICTORIA-473",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Victoria · Cerveza 710 ml",
    "officialCat": "CERVEZAS",
    "group": "Cervezas",
    "price": 100.0,
    "priceSolar": 85.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "R04",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Chelada LIMON/SAL · Vaso 1 L  · Corona · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 150.0,
    "priceSolar": 100.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "M12-CORONA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Chelada ·LIMON/SAL  Vaso 1 L  · Modelo Especial · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 150.0,
    "priceSolar": 100.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "M12-MODELO",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Chelada ·LIMON/SAL  Vaso 1 L · Victoria · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 150.0,
    "priceSolar": 100.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "M12-VICTORIA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Chelada ·LIMON/SAL  Vaso 500 ml · Corona · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 110.0,
    "priceSolar": 70.0,
    "priceLunar": 110.0,
    "destination": "Barra",
    "sku": "M11-CORONA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Chelada ·LIMON/SAL  Vaso 500 ml· Modelo Especial · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 110.0,
    "priceSolar": 70.0,
    "priceLunar": 110.0,
    "destination": "Barra",
    "sku": "M11-MODELO",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Chelada ·LIMON/SAL  Vaso 500 ml · Victoria · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 110.0,
    "priceSolar": 70.0,
    "priceLunar": 110.0,
    "destination": "Barra",
    "sku": "M11-VICTORIA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada clásica · Vaso 1 L · Corona · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 150.0,
    "priceSolar": 100.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "M22-CORONA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada clásica · Vaso 1 L · Modelo Especial · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 150.0,
    "priceSolar": 100.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "M22-MODELO",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada clásica · Vaso 1 L · Victoria · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 150.0,
    "priceSolar": 100.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "M22-VICTORIA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada clásica · Vaso 500 ml  · Corona · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 100.0,
    "priceSolar": 80.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "M21-CORONA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada clásica · Vaso 500 ml  · Modelo Especial · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 100.0,
    "priceSolar": 80.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "M21-MODELO",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada clásica · Vaso 500 ml · Victoria · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 100.0,
    "priceSolar": 80.0,
    "priceLunar": 100.0,
    "destination": "Barra",
    "sku": "M21-VICTORIA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada con Clamato · Vaso 1 L  Corona · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 160.0,
    "priceSolar": 110.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "M32-CORONA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada con Clamato · Vaso 1 L · Modelo Especial · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 160.0,
    "priceSolar": 110.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "M32-MODELO",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada con Clamato · Vaso 1L· Victoria · Vaso 1 L; 710 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 160.0,
    "priceSolar": 110.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "M32-VICTORIA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada con Clamato · Vaso 500 ml  · Corona · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 110.0,
    "priceSolar": 90.0,
    "priceLunar": 110.0,
    "destination": "Barra",
    "sku": "M31-CORONA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada con Clamato · Vaso 500 ml · Modelo Especial · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 110.0,
    "priceSolar": 90.0,
    "priceLunar": 110.0,
    "destination": "Barra",
    "sku": "M31-MODELO",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Michelada con Clamato · Vaso 500 ml  · Victoria · Vaso 500 ml; 355 ml cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 110.0,
    "priceSolar": 90.0,
    "priceLunar": 110.0,
    "destination": "Barra",
    "sku": "M31-VICTORIA",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Vaso preparado chelada · Recargo por vaso de 500 ml; sin cerveza · Vaso 500 ml sin cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 20.0,
    "priceSolar": 20.0,
    "priceLunar": 20.0,
    "destination": "Barra",
    "sku": "P1",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Vaso preparado michelada clásica · Recargo por vaso de 500 ml; sin cerveza · Vaso 500 ml sin cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 30.0,
    "priceSolar": 30.0,
    "priceLunar": 30.0,
    "destination": "Barra",
    "sku": "P2",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Vaso preparado michelada con clamato · Recargo por vaso de 500 ml; sin cerveza · Vaso 500 ml sin cerveza",
    "officialCat": "CHELADAS / MICHELADAS",
    "group": "Cheladas y Micheladas",
    "price": 40.0,
    "priceSolar": 40.0,
    "priceLunar": 40.0,
    "destination": "Barra",
    "sku": "P3",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Azulito · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "E22",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Azulito · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "E21",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Cuba · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "L12",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Cuba · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "L11",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Eyaculada · ron, coco y piña · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "E62",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Eyaculada · ron, coco y piña · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "E61",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Gin de pepino · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "E72",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Gin de pepino · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "E71",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Gin tonic · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 180.0,
    "priceSolar": 120.0,
    "priceLunar": 180.0,
    "destination": "Barra",
    "sku": "E42",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Gin tonic · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 160.0,
    "priceSolar": 110.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "E41",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Lunar · tinto dulce · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "E52",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Lunar · tinto dulce · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "E51",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Mezcal con mineral · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 180.0,
    "priceSolar": 120.0,
    "priceLunar": 180.0,
    "destination": "Barra",
    "sku": "E102",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Mezcal con mineral · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 160.0,
    "priceSolar": 110.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "E101",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Mojito de mezcal · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 180.0,
    "priceSolar": 120.0,
    "priceLunar": 180.0,
    "destination": "Barra",
    "sku": "E32",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Mojito de mezcal · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 160.0,
    "priceSolar": 110.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "E31",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Paloma · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "L22",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Paloma · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "L21",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Perla Negra · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 220.0,
    "priceSolar": 170.0,
    "priceLunar": 220.0,
    "destination": "Barra",
    "sku": "E82",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Perla Negra · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 180.0,
    "priceSolar": 130.0,
    "priceLunar": 180.0,
    "destination": "Barra",
    "sku": "E81",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Solar · vodka y frutas · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "E12",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Solar · vodka y frutas · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "E11",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Vodka limón · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "L32",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Vodka limón · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "L31",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Whisky con cola · Vaso 1 L con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 170.0,
    "priceSolar": 120.0,
    "priceLunar": 170.0,
    "destination": "Barra",
    "sku": "E92",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Whisky con cola · Vaso 500 ml con hielo",
    "officialCat": "CÓCTELES 500 ML / 1 L",
    "group": "Cócteles",
    "price": 150.0,
    "priceSolar": 110.0,
    "priceLunar": 150.0,
    "destination": "Barra",
    "sku": "E91",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "SHOT MEZCAL 45ML",
    "officialCat": "SHOT 45ML",
    "group": "Shots",
    "price": 160.0,
    "priceSolar": 100.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "K03",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "SHOT GIN 45ML",
    "officialCat": "SHOT 45ML",
    "group": "Shots",
    "price": 160.0,
    "priceSolar": 100.0,
    "priceLunar": 160.0,
    "destination": "Barra",
    "sku": "K01",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "SHOT VODKA, TEQ, RON, WHISKY 45ML",
    "officialCat": "SHOT 45ML",
    "group": "Shots",
    "price": 130.0,
    "priceSolar": 100.0,
    "priceLunar": 130.0,
    "destination": "Barra",
    "sku": "K02",
    "provider": "DOMUS",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Aderezo adicional",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 20.0,
    "priceSolar": 20.0,
    "priceLunar": 20.0,
    "destination": "Cocina",
    "sku": "CT10",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Alitas sumisas — 10 piezas",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 200.0,
    "priceSolar": 200.0,
    "priceLunar": 200.0,
    "destination": "Cocina",
    "sku": "CT15b",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Alitas sumisas — 6 piezas",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 130.0,
    "priceSolar": 130.0,
    "priceLunar": 130.0,
    "destination": "Cocina",
    "sku": "CT15a",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Bastones de castigo",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Cocina",
    "sku": "CT04",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Boneless",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 150.0,
    "priceSolar": 150.0,
    "priceLunar": 150.0,
    "destination": "Cocina",
    "sku": "CT14",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Espaghetti",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 50.0,
    "priceSolar": 50.0,
    "priceLunar": 50.0,
    "destination": "Cocina",
    "sku": "CT20",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Gajitos",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 50.0,
    "priceSolar": 50.0,
    "priceLunar": 50.0,
    "destination": "Cocina",
    "sku": "CT08",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Guacamole regular",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 50.0,
    "priceSolar": 50.0,
    "priceLunar": 50.0,
    "destination": "Cocina",
    "sku": "CT05",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Hamburguesa Kinki",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 150.0,
    "priceSolar": 150.0,
    "priceLunar": 150.0,
    "destination": "Cocina",
    "sku": "CT11",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "La Dominatrix",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 200.0,
    "priceSolar": 200.0,
    "priceLunar": 200.0,
    "destination": "Cocina",
    "sku": "CT12",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Misioneritas",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 30.0,
    "priceSolar": 30.0,
    "priceLunar": 30.0,
    "destination": "Cocina",
    "sku": "CT07",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Nachos libres",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "CT16",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Orden de pajitas",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 20.0,
    "priceSolar": 20.0,
    "priceLunar": 20.0,
    "destination": "Cocina",
    "sku": "CT06",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Orden de queso",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 30.0,
    "priceSolar": 30.0,
    "priceLunar": 30.0,
    "destination": "Cocina",
    "sku": "CT09",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Orgía de botanas",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 40.0,
    "priceSolar": 40.0,
    "priceLunar": 40.0,
    "destination": "Cocina",
    "sku": "CT01",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Papas gajo",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "CT03",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Papas misioneras",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 60.0,
    "priceSolar": 60.0,
    "priceLunar": 60.0,
    "destination": "Cocina",
    "sku": "CT02",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Ramen de abuelita",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "CT19",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Sado nachos",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 130.0,
    "priceSolar": 130.0,
    "priceLunar": 130.0,
    "destination": "Cocina",
    "sku": "CT17",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Sado sampler — sin infusión",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 350.0,
    "priceSolar": 350.0,
    "priceLunar": 350.0,
    "destination": "Cocina",
    "sku": "CT22",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Tacos de la parrilla",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 50.0,
    "priceSolar": 50.0,
    "priceLunar": 50.0,
    "destination": "Cocina",
    "sku": "CT18",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Trío de jochis",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 130.0,
    "priceSolar": 130.0,
    "priceLunar": 130.0,
    "destination": "Cocina",
    "sku": "CT13",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "Waffle vainilla",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "Alimentos Cocina",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "CT21",
    "provider": "Canna Treats",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "MUFFINS",
    "officialCat": "ALIMENTOS ANDY",
    "group": "🌿 Menú Cannábico",
    "price": 150.0,
    "priceSolar": 150.0,
    "priceLunar": 150.0,
    "destination": "Cocina",
    "sku": "CT45",
    "provider": "ANDY",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "CHOCOLATES 2 DOSIS",
    "officialCat": "ALIMENTOS ANDY",
    "group": "🌿 Menú Cannábico",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "CT46",
    "provider": "ANDY",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "CHOCOLATES 4 DOSIS",
    "officialCat": "ALIMENTOS ANDY",
    "group": "🌿 Menú Cannábico",
    "price": 200.0,
    "priceSolar": 200.0,
    "priceLunar": 200.0,
    "destination": "Cocina",
    "sku": "CT47",
    "provider": "ANDY",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "CHOCOLATES VAGINA",
    "officialCat": "ALIMENTOS ANDY",
    "group": "🌿 Menú Cannábico",
    "price": 150.0,
    "priceSolar": 150.0,
    "priceLunar": 150.0,
    "destination": "Cocina",
    "sku": "CT48",
    "provider": "ANDY",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "GREENBURGESA FELIZ",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 230.0,
    "priceSolar": 230.0,
    "priceLunar": 230.0,
    "destination": "Cocina",
    "sku": "CT-CAN-01",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "ESPAGUETI VERDE",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "CT-CAN-02",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "MONCHIS PIZZA 420",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 150.0,
    "priceSolar": 150.0,
    "priceLunar": 150.0,
    "destination": "Cocina",
    "sku": "CT-CAN-03",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "GUACANABIS",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "CT-CAN-04",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "ORDEN DE GUACANABIS",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Cocina",
    "sku": "CT-CAN-05",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "CANADIP",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 50.0,
    "priceSolar": 50.0,
    "priceLunar": 50.0,
    "destination": "Cocina",
    "sku": "CT-CAN-06",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "WAFLE BDSM",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "CT-CAN-07",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "CHEESCAKE",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Cocina",
    "sku": "CT-CAN-08",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "CANABITES",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Cocina",
    "sku": "CT-CAN-09",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "GALLETONA",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "CT-CAN-10",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "PELON",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Cocina",
    "sku": "ALI-CAN-001",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "GALLETA DUBAI",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Cocina",
    "sku": "CT-CAN-12",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "PAN DE MUERTO",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 120.0,
    "priceSolar": 120.0,
    "priceLunar": 120.0,
    "destination": "Cocina",
    "sku": "CT-CAN-13",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "CHOCOLATE AMARGO",
    "officialCat": "ALIMENTOS · CANNA TREATS",
    "group": "🌿 Menú Cannábico",
    "price": 80.0,
    "priceSolar": 80.0,
    "priceLunar": 80.0,
    "destination": "Cocina",
    "sku": "ALI-CAN-003",
    "provider": "Canna Treats",
    "containsCannabis": true,
    "enabled": true
  },
  {
    "name": "NOBARA",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ01",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "ITADORI",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ02",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "MEGUMI",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ03",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "MAKI",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ04",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "TODO",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ05",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "CHOSO",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ06",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "GOJO",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ07",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "SASAKI",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ08",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  },
  {
    "name": "RIKA",
    "officialCat": "JUJUTSU-SHI",
    "group": "Sushi",
    "price": 100.0,
    "priceSolar": 100.0,
    "priceLunar": 100.0,
    "destination": "Cocina",
    "sku": "JJ09",
    "provider": "JujuTsu-shi",
    "containsCannabis": false,
    "enabled": true
  }
];

  // Comandas Demo Iniciales
  const DEFAULT_ORDERS = [
    {
      key: 'DCS-101',
      version: '1',
      id: 'C2-0045',
      ticket: 'CTA-20261023-0001',
      batch: 'BATCH-A',
      alias: 'Fernando L.',
      product: 'Modelo Especial - lata 473 ml',
      notes: 'Bien fría',
      destination: 'Barra',
      state: 'Pendiente',
      responsible: '',
      sent: Date.now() - 6 * 60000,
      credit: false,
      incident: ''
    },
    {
      key: 'DCS-102',
      version: '1',
      id: 'C2-0046',
      ticket: 'CTA-20261023-0001',
      batch: 'BATCH-A',
      alias: 'Fernando L.',
      product: 'Jujutsu-shi - Nobara',
      notes: 'Sin aderezo picante',
      destination: 'Cocina',
      state: 'Pendiente',
      responsible: '',
      sent: Date.now() - 6 * 60000,
      credit: false,
      incident: ''
    },
    {
      key: 'DCS-103',
      version: '1',
      id: 'C2-0047',
      ticket: 'CTA-20261023-0002',
      batch: 'BATCH-B',
      alias: 'Leo Leonidas',
      product: 'Mezcalina Frutos Rojos',
      notes: '',
      destination: 'Barra',
      state: 'En preparación',
      responsible: 'Miguel',
      sent: Date.now() - 14 * 60000,
      credit: true,
      incident: ''
    }
  ];

  // Configuración Operativa Especial FORZA 24/10/2026
  const FORZA_CONFIG = Object.freeze({
    organizer: 'FORZA',
    openingFloat: 600,
    openingFloatProvider: 'Steven',
    openingFloatConcept: 'Fondo inicial / fondo de cambio',
    advance: 3000,
    feePerAttendee: 150,
    doorCoverDomus: 0,
    wardrobeDomus: 0
  });

  // Eventos y Actividades Base (para Demo / Offline)
  const DEFAULT_EVENTS = [
    {
      name: 'Forza · sábado',
      date: '2026-10-24',
      type: 'Club nocturno',
      organizer: 'FORZA',
      priceGeneral: 0,
      pricePareja: 0,
      priceTrio: 0,
      priceGuardarropa: 0,
      capacity: 200,
      status: 'Confirmado',
      salesChannel: 'BOLETERA_EXTERNA',
      ticketProvider: 'FORZA',
      advance: 3000,
      forzaFeePerAttendee: 150,
      agreement: 'Confirmado',
      notes: 'Boletera externa y guardarropa gestionados por FORZA ($0 DOMUS). Asistencia genera $150/asistente liquidable vs $3,000 anticipo.',
      ticketTypes: [
        { id: 'General', name: 'General (1 Asistente)', price: 0, persons: 1 },
        { id: 'Pareja', name: 'Pareja (2 Asistentes)', price: 0, persons: 2 },
        { id: 'Trío', name: 'Trío (3 Asistentes)', price: 0, persons: 3 }
      ]
    },
    { name: 'Sensorama fetish y kinky', date: '2026-10-25', type: 'Fiesta temática', organizer: 'DOMUS', priceGeneral: 150, pricePareja: 260, priceTrio: 360, priceGuardarropa: 50, capacity: 150, status: 'Confirmado' },
    { name: 'Chilangoticas · Haunted', date: '2026-10-23', type: 'Fiesta Drag / Performance', organizer: 'Chilangoticas', priceGeneral: 100, pricePareja: 180, priceTrio: 250, priceGuardarropa: 50, capacity: 180, status: 'Confirmado' },
    { name: 'Videojuegos y películas · miércoles', date: '2026-10-21', type: 'Social / Gaming', organizer: 'DOMUS', priceGeneral: 80, pricePareja: 150, priceTrio: 200, priceGuardarropa: 50, capacity: 120, status: 'Confirmado' },
    { name: 'Evento de Steven · registro obligatorio', date: '2026-10-20', type: 'Comunidad / Privado', organizer: 'Steven', priceGeneral: 0, pricePareja: 0, priceTrio: 0, priceGuardarropa: 50, capacity: 100, status: 'Confirmado' },
    { name: 'Operación diaria', date: '2026-10-24', type: 'Club general', organizer: 'DOMUS', priceGeneral: 50, pricePareja: 90, priceTrio: 120, priceGuardarropa: 50, capacity: 100, status: 'Confirmado' }
  ];

  // Accesos Iniciales de Muestra (para Demo / Offline)
  const DEFAULT_ACCESS_RECORDS = [
    { id: 'A-0101', date: '2026-10-24 21:15', activity: 'Sensorama fetish y kinky', customer: 'Arturo & Elena', email: 'arturo@ejemplo.com', phone: '5512345678', entryType: 'Pareja', packages: 2, wardrobeQty: 2, totalAmount: 360, paid: 360, due: 0, method: 'Efectivo', ticketGuardarropa: 'GUA-A-0101', devuelto: false },
    { id: 'A-0102', date: '2026-10-24 21:30', activity: 'Sensorama fetish y kinky', customer: 'Valeria R.', email: 'valeria@ejemplo.com', phone: '5598765432', entryType: 'General', packages: 1, wardrobeQty: 1, totalAmount: 200, paid: 200, due: 0, method: 'Terminal 1', ticketGuardarropa: 'GUA-A-0102', devuelto: false },
    { id: 'A-0103', date: '2026-10-24 21:45', activity: 'Sensorama fetish y kinky', customer: 'Mateo, Sofía & Leo', email: '', phone: '', entryType: 'Trío', packages: 3, wardrobeQty: 0, totalAmount: 360, paid: 360, due: 0, method: 'Efectivo', ticketGuardarropa: '', devuelto: false },
    { id: 'A-0104', date: '2026-10-24 22:00', activity: 'Sensorama fetish y kinky', customer: 'Rodrigo P.', email: 'rodrigo@ejemplo.com', phone: '5544332211', entryType: 'Preventa', packages: 1, wardrobeQty: 1, totalAmount: 50, paid: 50, due: 0, presaleFolio: 'BOL-SENSO-089', method: 'Efectivo', ticketGuardarropa: 'GUA-A-0104', devuelto: false }
  ];

  // --- SELECTORES DOM ---
  const $ = id => document.getElementById(id);

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isRealAccessRecord(r) {
    if (!r) return false;
    // Un registro real tiene fecha válida o nombre de cliente real (no fila de plantilla vacía de la hoja)
    const hasDate = !!(r.date && String(r.date).trim() !== '');
    const hasCustomer = !!(r.customer && String(r.customer).trim() !== '' && String(r.customer).trim().toLowerCase() !== 'anónimo');
    const hasPayment = Number(r.paid || r.doorCollected || r.amountPaidAtDoor || 0) > 0;
    const hasExternal = !!(r.externalTicketId && String(r.externalTicketId).trim() !== '');
    return hasDate || hasCustomer || hasPayment || hasExternal;
  }

  // --- AUDIO SYNTHESIZER ---
  function playChime(kind = 'alert') {
    if (!STATE.sound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!STATE.audioCtx) STATE.audioCtx = new AudioCtx();
      if (STATE.audioCtx.state === 'suspended') STATE.audioCtx.resume();

      const ctx = STATE.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (kind === 'alert') {
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (kind === 'success') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.38);
      }
    } catch (e) {
      console.warn('Audio no disponible:', e);
    }
  }

  // --- NOTIFICACIONES TOAST ---
  function toast(message, type = 'ok') {
    const container = $('toastContainer');
    if (!container) return;
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.textContent = message;
    container.appendChild(item);

    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(10px)';
      setTimeout(() => item.remove(), 300);
    }, 4000);
  }

  // --- FORMATEO DE MONEDA Y FECHAS ---
  function money(val) {
    const n = Number(val) || 0;
    return '$' + n.toFixed(2);
  }

  function formatTime(timestamp) {
    if (!timestamp) return '--:--';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function minutesAgo(timestamp) {
    if (!timestamp) return 0;
    const diff = Math.max(0, Date.now() - new Date(timestamp).getTime());
    return Math.floor(diff / 60000);
  }

  // --- SEGURIDAD Y CONTROL DE ACCESO A CAJA ---
  const DEFAULT_CAJA_PIN = '2026';

  function getCajaPin() {
    return localStorage.getItem('domus_caja_pin') || DEFAULT_CAJA_PIN;
  }

  function isCajaAuthorized() {
    return localStorage.getItem('domus_caja_authorized') === 'true' ||
           sessionStorage.getItem('domus_caja_session') === 'true';
  }

  function openCajaLockModal() {
    const modal = $('cajaLockModal');
    if (!modal) return;
    $('cajaPinInput').value = '';
    $('cajaPinError').textContent = '';
    modal.classList.add('open');
    setTimeout(() => $('cajaPinInput').focus(), 150);
  }

  function closeCajaLockModal() {
    const modal = $('cajaLockModal');
    if (modal) modal.classList.remove('open');
  }

  function unlockCajaWithPin() {
    const entered = $('cajaPinInput').value.trim();
    const correctPin = getCajaPin();

    if (entered === correctPin) {
      const remember = $('rememberCajaDeviceCheckbox').checked;
      if (remember) {
        localStorage.setItem('domus_caja_authorized', 'true');
        toast('Equipo autorizado como Máquina de Caja.', 'ok');
      } else {
        sessionStorage.setItem('domus_caja_session', 'true');
        toast('Caja desbloqueada para esta sesión.', 'ok');
      }
      closeCajaLockModal();
      setMode('caja');
      playChime('success');
    } else {
      $('cajaPinError').textContent = 'Contraseña o PIN incorrecto. Reintenta.';
      $('cajaPinInput').value = '';
      $('cajaPinInput').focus();
      playChime('alert');
    }
  }

  function lockCajaOnDevice() {
    localStorage.removeItem('domus_caja_authorized');
    sessionStorage.removeItem('domus_caja_session');
    $('btnLockCaja').classList.add('hidden');
    setMode('comandas');
    toast('Caja bloqueada en este equipo. Modo Comandas activo.', 'warn');
  }

  // --- RUTA Y NAVEGACIÓN ---
  function initRouting() {
    // Limpieza de URLs si se pegó formato de markdown o corchetes accidentales
    if (window.location.search && (window.location.search.includes(']') || window.location.search.includes('%5D') || window.location.search.includes('('))) {
      try {
        let cleanSearch = window.location.search.split(']')[0].split('%5D')[0].split('(')[0];
        window.history.replaceState({}, document.title, window.location.pathname + cleanSearch);
      } catch (e) {}
    }
    const params = new URLSearchParams(window.location.search);
    let vista = params.get('vista') || '';
    if (vista.includes(']')) vista = vista.split(']')[0];
    if (vista.includes('%5D')) vista = vista.split('%5D')[0];
    if (vista.includes('(')) vista = vista.split('(')[0];
    if (vista === 'caja') {
      if (isCajaAuthorized()) {
        setMode('caja', false);
      } else {
        setMode('comandas', false);
        openCajaLockModal();
      }
    } else if (vista === 'comandas') {
      setMode('comandas', false);
    } else if (vista === 'accesos') {
      setMode('accesos', false);
    } else {
      const saved = localStorage.getItem('domus_view');
      if (saved === 'caja' && isCajaAuthorized()) {
        setMode('caja', false);
      } else if (saved === 'accesos') {
        setMode('accesos', false);
      } else {
        setMode('comandas', false);
      }
    }
  }

  function setMode(newMode, updateUrl = true) {
    if (newMode === 'caja' && !isCajaAuthorized()) {
      openCajaLockModal();
      return;
    }

    if (STATE.mode !== newMode) {
      STATE.mode = newMode;
      localStorage.setItem('domus_view', newMode);
    }

    STATE.mode = newMode;
    localStorage.setItem('domus_view', newMode);

    if (updateUrl) {
      const url = new URL(window.location);
      url.searchParams.set('vista', newMode);
      window.history.replaceState({}, '', url);
    }

    $('btnModeCaja').classList.toggle('active', newMode === 'caja');
    $('btnModeComandas').classList.toggle('active', newMode === 'comandas');
    if ($('btnModeAccesos')) $('btnModeAccesos').classList.toggle('active', newMode === 'accesos');

    $('viewCaja').classList.toggle('hidden', newMode !== 'caja');
    $('viewComandas').classList.toggle('hidden', newMode !== 'comandas');
    if ($('viewAccesos')) $('viewAccesos').classList.toggle('hidden', newMode !== 'accesos');

    const btnLock = $('btnLockCaja');
    if (btnLock) {
      btnLock.classList.toggle('hidden', newMode !== 'caja' || !isCajaAuthorized());
    }

    if (newMode === 'comandas') {
      renderComandasBoard();
    } else if (newMode === 'accesos') {
      renderAccesosView();
    } else {
      renderCatalog();
    }
  }

  // --- OUTBOX & IDEMPOTENCIA TRANSACCIONAL (FASE 0C) ---
  const MUTATION_ACTIONS = new Set([
    'cajaSimpleRegistrar',
    'comandasSimpleAccion',
    'comandasSimpleResolver',
    'accesoSimpleRegistrar',
    'guardarropaDevolver',
    'accesoCambiarActividad',
    'registrarNuevoEvento',
    'registrarNuevoProducto',
    'sincronizarCartaConCatalogoDOMUS'
  ]);

  function getDeviceId() {
    let devId = localStorage.getItem('domus_device_id');
    if (!devId) {
      devId = 'DEV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      localStorage.setItem('domus_device_id', devId);
    }
    return devId;
  }

  function getSessionToken(targetRole) {
    const role = targetRole || getStationRole();
    return sessionStorage.getItem('domus_session_token_' + role) ||
           sessionStorage.getItem('domus_session_token') ||
           localStorage.getItem('domus_session_token_' + role) ||
           (localStorage.getItem('domus_session_role') === role ? localStorage.getItem('domus_session_token') : '') ||
           '';
  }

  function setSessionToken(token, role) {
    if (token) {
      const cleanRole = role || getStationRole();
      sessionStorage.setItem('domus_session_token_' + cleanRole, token);
      sessionStorage.setItem('domus_session_token', token);
      localStorage.setItem('domus_session_token_' + cleanRole, token);
      localStorage.setItem('domus_session_role_' + cleanRole, cleanRole);
      localStorage.setItem('domus_session_token', token);
      localStorage.setItem('domus_session_role', cleanRole);
    }
  }

  function getStationRole() {
    if (STATE.mode === 'caja') return 'CAJA';
    if (STATE.mode === 'comandas') return 'BARRA';
    if (STATE.mode === 'accesos') return 'ACCESOS';
    return 'CAJA';
  }

  let isEnsuringSession = false;
  const pendingSessionCallbacks = [];

  function ensureSessionToken(onDone, targetRole) {
    const currentRole = targetRole || getStationRole();
    const currentToken = getSessionToken(currentRole);
    const savedRole = localStorage.getItem('domus_session_role_' + currentRole) || localStorage.getItem('domus_session_role');

    if (currentToken && (!savedRole || savedRole === currentRole)) {
      if (onDone) onDone();
      return;
    }

    if (onDone) pendingSessionCallbacks.push(onDone);
    if (isEnsuringSession) return;
    isEnsuringSession = true;

    const role = currentRole;
    const devId = getDeviceId();
    const endpoint = `${STATE.apiUrl}?action=authCrearSesion`;

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'authCrearSesion',
        args: [role, 'Operador ' + role, devId],
        role: role,
        deviceId: devId
      })
    })
    .then(r => r.json())
    .then(res => {
      isEnsuringSession = false;
      if (res && res.data && res.data.token) {
        setSessionToken(res.data.token, role);
        console.log('[DOMUS AUTO-AUTH] Sesión creada exitosamente:', role, res.data.token);
      } else {
        const fallbackToken = 'DOMUS-SES-' + role + '-' + devId;
        setSessionToken(fallbackToken, role);
      }
      const cbs = [...pendingSessionCallbacks];
      pendingSessionCallbacks.length = 0;
      cbs.forEach(cb => cb());
    })
    .catch(err => {
      isEnsuringSession = false;
      console.warn('[DOMUS AUTO-AUTH] Error al crear sesión automática:', err);
      const fallbackToken = 'DOMUS-SES-' + role + '-' + devId;
      setSessionToken(fallbackToken, role);
      const cbs = [...pendingSessionCallbacks];
      pendingSessionCallbacks.length = 0;
      cbs.forEach(cb => cb());
    });
  }

  function getOutbox() {
    try {
      const raw = localStorage.getItem('domus_outbox');
      return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  let outboxBroadcastChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      outboxBroadcastChannel = new BroadcastChannel('domus-outbox-sync-channel');
      outboxBroadcastChannel.onmessage = e => {
        if (e && e.data && e.data.type === 'OUTBOX_CHANGE') {
          updateOutboxUI();
        }
      };
    }
  } catch (e) {}

  function notifyOutboxTabs() {
    if (outboxBroadcastChannel) {
      try {
        outboxBroadcastChannel.postMessage({ type: 'OUTBOX_CHANGE', timestamp: Date.now() });
      } catch (e) {}
    }
  }

  function saveOutbox(queue) {
    try {
      localStorage.setItem('domus_outbox', JSON.stringify(queue));
    } catch (e) {
      console.warn('Error al guardar outbox en localStorage:', e);
    }
    updateOutboxUI();
    notifyOutboxTabs();
  }

  function enqueueOutbox(action, args, type = 'MUTATION') {
    // Protección estricta (Issue #1): nunca encolar una orden de caja sin productos
    if (action === 'cajaSimpleRegistrar' && (!args || !args[0] || !args[0].items || !args[0].items.length)) {
      console.warn('[OUTBOX] Rechazado intento de encolar orden de caja vacía sin productos.');
      return null;
    }
    const queue = getOutbox();
    const existingReq = (args && args[0] && (args[0].id || args[0].requestId)) ? (args[0].id || args[0].requestId) : null;
    const reqId = existingReq || ('REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase());

    if (args && args[0] && typeof args[0] === 'object') {
      args[0].requestId = reqId;
      if (!args[0].id) args[0].id = reqId;
    }

    const item = {
      requestId: reqId,
      deviceId: getDeviceId(),
      operatorId: STATE.operator || 'Operador',
      role: getStationRole(),
      createdAt: new Date().toISOString(),
      type: type,
      action: action,
      args: args,
      status: 'LOCAL_PENDING',
      attempts: 0,
      lastAttempt: null,
      serverReceipt: null,
      lastError: null
    };

    queue.push(item);
    saveOutbox(queue);
    return item;
  }

  /**
   * Clasificador centralizado de fallos de mutación (Issue #1):
   * - 'REQUIRES_REVIEW': Errores deterministas, validación, negocio, permisos, 409 idempotencia, datos incorrectos.
   *   JAMÁS deben reintentarse automáticamente ni por el botón de reintento.
   * - 'RETRY': Errores estrictamente transitorios (red, timeout, 502/503/504).
   */
  function classifyMutationFailure(error) {
    if (!error) return 'RETRY';
    const msg = (typeof error === 'string' ? error : (error.message || error.error || '')).toLowerCase();
    const code = error.code || error.status;

    // 1. Errores Deterministas / Validación / Negocio -> REQUIRES_REVIEW
    if (
      code === 409 ||
      code === 'IDEMPOTENCY_KEY_REUSED' ||
      msg.includes('idempotency_key_reused') ||
      msg.includes('infringen las reglas de validación') ||
      msg.includes('validación de datos') ||
      msg.includes('reglas de validación') ||
      msg.includes('product_not_found') ||
      msg.includes('producto no encontrado') ||
      msg.includes('event_pricing_not_confirmed') ||
      msg.includes('tarifa de evento no confirmada') ||
      msg.includes('acceso denegado') ||
      msg.includes('violación de seguridad') ||
      msg.includes('violacion') ||
      msg.includes('discrepa') ||
      msg.includes('rol') ||
      msg.includes('inválido') ||
      msg.includes('invalido') ||
      msg.includes('cambió la carta') ||
      msg.includes('fase') ||
      msg.includes('no hay filas libres') ||
      msg.includes('pedido vacío') ||
      (code >= 400 && code < 500 && code !== 408 && code !== 429)
    ) {
      return 'REQUIRES_REVIEW';
    }

    // 2. Errores estrictamente transitorios -> RETRY
    if (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('aborterror') ||
      msg.includes('load failed') ||
      msg.includes('sin conexión') ||
      code === 408 ||
      code === 429 ||
      code === 502 ||
      code === 503 ||
      code === 504 ||
      (code >= 500 && code <= 599)
    ) {
      return 'RETRY';
    }

    // Por defecto, cualquier fallo que no sea explícitamente de conectividad se envía a revisión
    return 'REQUIRES_REVIEW';
  }

  /**
   * Migración segura de operaciones Outbox a v13 (Issue #1 - FASE 1.E):
   * Cuarentena sin eliminación de elementos con errores deterministas.
   */
  function migrateLegacyOutbox_() {
    try {
      const queue = getOutbox();
      let modified = false;
      const updatedQueue = queue.map(item => {
        if (item.status === 'LOCAL_PENDING' || item.status === 'RETRY') {
          const err = item.lastError || '';
          const hasEmptyItems = item.action === 'cajaSimpleRegistrar' && (!item.args || !item.args[0] || !item.args[0].items || !item.args[0].items.length);
          const hasRecordedError = String(err).trim().length > 0;
          const isDeterministic = hasEmptyItems || (hasRecordedError && classifyMutationFailure(err) === 'REQUIRES_REVIEW');

          if (isDeterministic) {
            console.warn(`[OUTBOX MIGRATION v13] Migrando item determinista a REQUIRES_REVIEW: ${item.requestId} (${err || 'Empty items'})`);
            item.status = 'REQUIRES_REVIEW';
            item.quarantineReason = err || 'v13: Operación previa vacía o con error determinista';
            item.quarantinedAt = new Date().toISOString();
            modified = true;
          }
        }
        return item;
      });

      if (modified) {
        saveOutbox(updatedQueue);
      }
    } catch (e) {
      console.warn('[OUTBOX] Error al migrar outbox histórico:', e);
    }
  }

  /**
   * Sincronizador de Outbox con exclusión mutua entre contextos del navegador.
   * Mecanismo principal: Web Locks API (W3C standard) garantizado por el navegador entre pestañas.
   * Mecanismo secundario: Fallback con lease temporal en localStorage.
   */
  async function sincronizarOutbox() {
    if (window.navigator && window.navigator.locks && typeof window.navigator.locks.request === 'function') {
      try {
        await window.navigator.locks.request('domus-outbox-sync', { ifAvailable: true }, async (lock) => {
          if (!lock) {
            console.log('[OUTBOX-WEBLOCKS] Otra pestaña del navegador tiene el lock exclusivo de sincronización.');
            return;
          }
          await sincronizarOutboxCore_();
        });
      } catch (err) {
        console.warn('[OUTBOX] Error con Web Locks, aplicando fallback:', err);
        await sincronizarOutboxFallback_();
      }
    } else {
      await sincronizarOutboxFallback_();
    }
  }

  function acquireOutboxFallbackLock() {
    const lockKey = 'domus_outbox_lock_lease';
    const now = Date.now();
    const currentLock = parseInt(localStorage.getItem(lockKey), 10);
    if (currentLock && (now - currentLock) < 15000) {
      return false;
    }
    localStorage.setItem(lockKey, now.toString());
    return true;
  }

  function releaseOutboxFallbackLock() {
    localStorage.removeItem('domus_outbox_lock_lease');
  }

  async function sincronizarOutboxFallback_() {
    if (!acquireOutboxFallbackLock()) return;
    try {
      await sincronizarOutboxCore_();
    } finally {
      releaseOutboxFallbackLock();
    }
  }

  let isOutboxCoreRunning = false;
  async function sincronizarOutboxCore_() {
    if (isOutboxCoreRunning) return;
    isOutboxCoreRunning = true;

    try {
      while (true) {
        const queue = getOutbox();
        const pendingItems = queue.filter(it => it.status === 'LOCAL_PENDING' || it.status === 'RETRY');
        if (pendingItems.length === 0) {
          updateOutboxUI();
          break;
        }

        const item = pendingItems[0];

        // Issue #1: Validación de orden vacía en cola sin mutar ni purgar silentemente
        if (item.action === 'cajaSimpleRegistrar' && (!item.args || !item.args[0] || !item.args[0].items || !item.args[0].items.length)) {
          console.warn('[OUTBOX] Operación vacía detectada. Marcando en REQUIRES_REVIEW:', item.requestId);
          item.status = 'REQUIRES_REVIEW';
          item.lastError = 'Operación de caja sin productos en el pedido.';
          saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));
          continue;
        }

        item.status = 'SYNCING';
        item.attempts = (item.attempts || 0) + 1;
        item.lastAttempt = new Date().toISOString();
        saveOutbox(queue);

        const endpoint = `${STATE.apiUrl}?action=${encodeURIComponent(item.action)}`;
        const itemRole = item.role || getStationRole();
        
        let sToken = getSessionToken(itemRole);
        if (!sToken) {
          try {
            await new Promise(resolve => ensureSessionToken(resolve, itemRole));
            sToken = getSessionToken(itemRole);
          } catch (e) {}
        }

        // Issue #1: PROHIBICIÓN TOTAL DE INFERIR O MUTAR CREDIT = 'Amigo'.
        // El payload original se preserva íntegramente sin añadir ni cambiar ningún campo.
        const payload = {
          action: item.action,
          args: item.args,
          requestId: item.requestId,
          deviceId: item.deviceId,
          operator: item.operatorId,
          role: itemRole,
          sessionToken: sToken
        };

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });

          const json = await res.json();
          if (json && json.ok) {
            item.status = 'CONFIRMED';
            item.serverReceipt = json.data;
            const updatedQueue = getOutbox().filter(q => q.requestId !== item.requestId);
            saveOutbox(updatedQueue);
            toast(`Operación sincronizada exitosamente con Google Sheets.`, 'ok');
            playChime('success');
            updateSyncPill('ok');
            updateOutboxUI();
            syncBackendData();
          } else {
            const errorMsg = (json && (json.error || json.message)) || 'Error en servidor';
            const classification = classifyMutationFailure({ message: errorMsg, code: json && (json.code || json.status) });

            item.lastError = errorMsg;
            item.status = classification;

            if (classification === 'REQUIRES_REVIEW') {
              saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));
              toast(`🛑 Operación puesta en cuarentena para revisión: ${errorMsg}`, 'warn');
              break;
            } else {
              saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));
              break;
            }
          }
        } catch (fetchErr) {
          const classification = classifyMutationFailure(fetchErr);
          item.status = classification;
          item.lastError = fetchErr.message || String(fetchErr);
          saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));
          updateSyncPill('error');
          break;
        }
      }
    } finally {
      isOutboxCoreRunning = false;
      updateOutboxUI();
    }
  }

  function processOutbox() {
    sincronizarOutbox();
  }

  // Sincronización entre pestañas y reactividad a conexión de red
  window.addEventListener('storage', e => {
    if (e.key === 'domus_outbox') {
      updateOutboxUI();
    }
  });

  window.addEventListener('online', () => {
    console.log('[NETWORK] Conexión recuperada. Procesando Outbox...');
    processOutbox();
  });

  function updateOutboxUI() {
    const banner = $('outboxBanner');
    const text = $('outboxStatusText');
    const btnRetry = $('btnOutboxRetry');
    const queue = getOutbox();
    const pending = queue.filter(q => q.status === 'LOCAL_PENDING' || q.status === 'RETRY' || q.status === 'SYNCING');
    const inReview = queue.filter(q => q.status === 'REQUIRES_REVIEW');

    if (!banner || !text) return;

    if (pending.length > 0 || inReview.length > 0) {
      banner.classList.remove('hidden');
      const messages = [];
      if (pending.length > 0) {
        messages.push(`⚠️ MODO LOCAL · ${pending.length} operación(es) pendiente(s) de sincronizar`);
      }
      if (inReview.length > 0) {
        messages.push(`🛑 ${inReview.length} operación(es) en revisión manual / cuarentena`);
      }
      text.textContent = messages.join(' | ');
      if (btnRetry) {
        btnRetry.style.display = pending.length > 0 ? 'inline-block' : 'none';
      }
    } else {
      banner.classList.add('hidden');
    }
  }

  function cacheQuerySnapshot(fnName, data) {
    try {
      if (data && typeof data === 'object') {
        localStorage.setItem('domus_cache_' + fnName, JSON.stringify({
          cachedAt: Date.now(),
          data: data
        }));
      }
    } catch (e) {}
  }

  function getCachedQuerySnapshot(fnName) {
    try {
      const raw = localStorage.getItem('domus_cache_' + fnName);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.data || null;
      }
    } catch (e) {}
    return null;
  }

  // --- COMUNICACIÓN CON BACKEND (IDEMPOTENTE & CON OUTBOX) ---
  function callBackend(fnName, args, onSuccess, onError) {
    STATE.isSyncing = true;
    updateSyncPill();

    const isMutation = MUTATION_ACTIONS.has(fnName);
    const reqId = (args && args[0] && (args[0].id || args[0].requestId)) 
      ? (args[0].id || args[0].requestId) 
      : ('REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase());

    if (args && args[0] && typeof args[0] === 'object') {
      if (!args[0].id) args[0].id = reqId;
      args[0].requestId = reqId;
    }

    // 1. Modo nativo dentro de Google Apps Script Web App
    if (STATE.isNativeGas && window.google && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(res => {
          STATE.isSyncing = false;
          STATE.lastSyncTimestamp = Date.now();
          updateSyncPill('ok');
          if (!isMutation) cacheQuerySnapshot(fnName, res);
          if (onSuccess) onSuccess(res);
        })
        .withFailureHandler(err => {
          STATE.isSyncing = false;
          STATE.lastSyncTimestamp = Date.now();
          updateSyncPill('error');
          if (onError) onError(err);
        })[fnName](...args);
      return;
    }

    // 2. Modo Externo (GitHub Pages / Fetch API con Outbox)
    // A) Consultas de sólo lectura: GET directo ultra-rápido, sin bloqueo de token ni errores de redirección POST de Google Apps Script
    if (!isMutation) {
      const getUrl = `${STATE.apiUrl}?action=${encodeURIComponent(fnName)}&token=${encodeURIComponent(getSessionToken())}&role=${encodeURIComponent(getStationRole())}&_=${Date.now()}`;
      fetch(getUrl, {
        method: 'GET',
        cache: 'no-cache'
      })
      .then(res => res.json())
      .then(json => {
        STATE.isSyncing = false;
        STATE.lastSyncTimestamp = Date.now();
        if (!json.ok && json.error) throw new Error(json.error);

        updateSyncPill('ok');
        const data = json.data !== undefined ? json.data : json;
        cacheQuerySnapshot(fnName, data);
        if (onSuccess) onSuccess(data);
      })
      .catch(err => {
        console.warn(`Consulta GET '${fnName}' falló:`, err);
        STATE.isSyncing = false;
        STATE.lastSyncTimestamp = Date.now();
        const cached = getCachedQuerySnapshot(fnName);
        if (cached && onSuccess) {
          updateSyncPill('ok');
          onSuccess(cached);
        } else {
          updateSyncPill('error');
          if (onError) onError(err);
        }
      });
      return;
    }

    // B) Mutaciones transaccionales (POST con token, idempotencia y encolado en Outbox)
    const stationRole = getStationRole();
    if (!getSessionToken(stationRole)) {
      ensureSessionToken(() => {
        callBackend(fnName, args, onSuccess, onError);
      }, stationRole);
      return;
    }

    const endpoint = `${STATE.apiUrl}?action=${encodeURIComponent(fnName)}`;
    const payload = {
      action: fnName,
      args: args,
      requestId: reqId,
      deviceId: getDeviceId(),
      operator: STATE.operator || 'Operador',
      role: stationRole,
      sessionToken: getSessionToken(stationRole)
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(json => {
      STATE.isSyncing = false;
      STATE.lastSyncTimestamp = Date.now();
      if (!json.ok) {
        const backendError = new Error((json && (json.error || json.message)) || 'Error en servidor');
        backendError.code = json && json.code;
        backendError.status = json && json.status;
        throw backendError;
      }

      updateSyncPill('ok');
      const data = json.data !== undefined ? json.data : json;
      if (onSuccess) onSuccess(data);
      processOutbox();
    })
    .catch(err => {
      STATE.isSyncing = false;
      STATE.lastSyncTimestamp = Date.now();
      updateSyncPill('error');

      // Encolar de forma segura en Outbox (si no fue descartado por validación de orden vacía)
      const item = enqueueOutbox(fnName, args, 'MUTATION');
      if (item) {
        const classification = classifyMutationFailure(err);
        item.lastError = err.message || String(err);
        item.status = classification;
        saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));

        if (classification === 'REQUIRES_REVIEW') {
          toast(`🛑 Operación en revisión manual. No se registró como venta: ${item.lastError}`, 'warn');
          if (onError) onError(err);
          return;
        }

        toast(`⚠️ Sin conexión con Google Sheets. Operación guardada en Outbox local (${reqId}).`, 'warn');
        if (onSuccess) {
          onSuccess({
            ok: true,
            localOutbox: true,
            status: 'RETRY',
            requestId: reqId,
            rowId: reqId,
            id: reqId,
            ticket: reqId,
            message: `Guardado en Outbox local (${reqId}). Se sincronizará automáticamente al volver la señal.`
          });
        }
      }
    });
  }

  function updateSyncPill(state = 'ok') {
    const dot = $('statusDot');
    const label = $('syncLabel');
    if (!dot || !label) return;

    if (state === 'error') {
      dot.className = 'status-dot error';
      label.textContent = 'Error de enlace';
    } else if (STATE.isDemoMode) {
      dot.className = 'status-dot warn';
      label.textContent = 'Simulador DOMUS';
    } else if (state === 'warn') {
      dot.className = 'status-dot warn';
      label.textContent = 'Sincronizando Outbox…';
    } else if (STATE.isSyncing) {
      dot.className = 'status-dot';
      label.textContent = 'Sincronizando…';
    } else {
      dot.className = 'status-dot';
      label.textContent = STATE.lastSyncTimestamp ? `Sinc: ${formatTime(STATE.lastSyncTimestamp)}` : 'Conectado';
    }
  }

  // --- CARGA INICIAL DE DATOS ---
  function loadInitialData() {
    STATE.products = [...DEFAULT_CATALOG];
    // Migración segura de operaciones Outbox a v13 (conservando historial en cuarentena)
    migrateLegacyOutbox_();

    STATE.comandas = [...DEFAULT_ORDERS];

    // Inicializar eventos y accesos (preservando evento nocturno activo de jornada en vivo)
    STATE.eventsList = [...DEFAULT_EVENTS];
    STATE.recentAccessList = [];
    const savedActiveAct = localStorage.getItem('domus_active_event');
    STATE.activeActivity = (savedActiveAct && savedActiveAct !== 'Operación diaria')
      ? savedActiveAct 
      : 'Forza · sábado';

    try {
      const savedEvents = JSON.parse(localStorage.getItem('domus_custom_events') || '[]');
      if (Array.isArray(savedEvents) && savedEvents.length) {
        STATE.eventsList = [...savedEvents, ...STATE.eventsList];
      }
      const savedAccess = JSON.parse(localStorage.getItem('domus_custom_access') || '[]');
      if (Array.isArray(savedAccess) && savedAccess.length) {
        STATE.recentAccessList = [...savedAccess, ...STATE.recentAccessList]
          .filter(r => r && r.id && !STATE.deletedAccessIds.has(r.id))
          .map(r => (STATE.editedAccessMap[r.id] ? { ...r, ...STATE.editedAccessMap[r.id] } : r));
      }
    } catch (e) {}

    renderStaffDropdown();
    renderCategoryChips();
    updateOutboxUI();
    processOutbox();
    updateAccesosBadge();
    if (STATE.mode === 'accesos') {
      renderAccesosView();
    }
    syncBackendData();
    startPolling();
  }

  function syncBackendData() {
    // 1. Catálogo y cuentas de Caja solo en modo Caja
    if (STATE.mode === 'caja') {
      callBackend('cajaSimpleDatos', [], data => {
        if (data.phase) {
          STATE.phase = data.phase;
          $('currentPhaseBadge').textContent = `Fase ${data.phase}`;
        }
        if (data.products && data.products.length) {
          const canonMapByName = new Map(DEFAULT_CATALOG.map(c => [c.name.trim().toLowerCase(), c]));
          const canonMapBySku = new Map(DEFAULT_CATALOG.filter(c => c.sku).map(c => [c.sku.trim().toLowerCase(), c]));

          const catalogMap = new Map();
          // Base canónica oficial (143 productos autorizados)
          DEFAULT_CATALOG.forEach(cp => {
            catalogMap.set(cp.name.trim().toLowerCase(), { ...cp });
          });

          // Enlazar con datos de backend (preservando SKUs u opciones adicionales)
          data.products.forEach(bp => {
            const bName = bp.name ? bp.name.trim().toLowerCase() : '';
            const bSku = bp.sku ? bp.sku.trim().toLowerCase() : '';
            const canon = canonMapByName.get(bName) || (bSku ? canonMapBySku.get(bSku) : null);
            if (canon) {
              const current = catalogMap.get(canon.name.trim().toLowerCase());
              if (current && bp.sku && !current.sku) {
                current.sku = bp.sku;
              }
            } else if (!bName.includes('— staff')) {
              // Producto adicional no staff
              catalogMap.set(bName, bp);
            }
          });

          // Fusionar productos personalizados creados localmente
          try {
            const custom = JSON.parse(localStorage.getItem('domus_custom_products') || '[]');
            if (Array.isArray(custom) && custom.length) {
              custom.forEach(c => {
                const cKey = (c.name || '').trim().toLowerCase();
                if (cKey && !catalogMap.has(cKey)) {
                  catalogMap.set(cKey, c);
                }
              });
            }
          } catch (e) {}

          STATE.products = Array.from(catalogMap.values());
          renderCategoryChips();
          renderCatalog();
        }
        if (data.accounts) {
          STATE.openAccounts = data.accounts;
          renderAccountDropdown();
        }
        if (data.activities) {
          STATE.activities = data.activities;
          renderActivityDropdown();
        }
        if (data.lastReceipt) {
          STATE.lastReceiptInfo = data.lastReceipt;
        }
        renderCatalog();
      }, err => {
        console.warn('No se pudo leer datos de Caja desde el servidor:', err);
      });
    }

    // 2. Comandas en Modo Comandas y Modo Caja
    if (STATE.mode === 'comandas' || STATE.mode === 'caja') {
      callBackend('comandasSimpleDatos', [sessionStorage.getItem('domus_token') || ''], d => {
        if (d.orders) {
          const currentKeys = new Set(d.orders.map(o => o.key));
          if (STATE.seenOrderKeys.size > 0) {
            const hasNew = [...currentKeys].some(k => !STATE.seenOrderKeys.has(k));
            if (hasNew) playChime('alert');
          }
          STATE.seenOrderKeys = currentKeys;
          STATE.comandas = d.orders;
        }
        if (d.history) STATE.historyComandas = d.history;
        if (d.requests) STATE.restockRequests = d.requests;

        updateKdsBadgeCount();
        if (STATE.mode === 'comandas') renderComandasBoard();
      }, err => {
        console.warn('Fallo al refrescar comandas:', err);
      });
    }

    // 3. Accesos exclusivamente en Modo Accesos
    if (STATE.mode === 'accesos') {
      callBackend('accesoSimpleDatos', [], data => {
        if (data.activities && data.activities.length) {
          STATE.eventsList = data.activities;
        }
        // REGLA DE ORO DE GOBERNANZA:
        // Si el backend devuelve activeActivity válido, USARLO incondicionalmente
        // aunque su fecha sea el día calendario anterior (evento nocturno sobre medianoche).
        if (data.activeActivity) {
          STATE.activeActivity = data.activeActivity;
          localStorage.setItem('domus_active_event', data.activeActivity);
        } else if (!STATE.activeActivity) {
          const forza = (STATE.eventsList || []).find(e => e.name && e.name.includes('Forza'));
          STATE.activeActivity = forza ? forza.name : (STATE.eventsList[0] ? STATE.eventsList[0].name : 'Forza · sábado');
        }
        if (data.recentAccess) {
          const backendRecords = data.recentAccess
            .filter(isRealAccessRecord)
            .filter(r => !STATE.deletedAccessIds.has(r.id || r.rowId))
            .map(r => {
              const id = r.id || r.rowId;
              if (STATE.editedAccessMap[id]) {
                return { ...r, ...STATE.editedAccessMap[id] };
              }
              return r;
            });
          const backendIds = new Set(backendRecords.map(r => r.id || r.rowId));
          // Preservar los registros registrados localmente en esta puerta que aún no figuren en la respuesta de red
          const localOnly = (STATE.recentAccessList || [])
            .filter(r => r && r.id && !backendIds.has(r.id) && !STATE.deletedAccessIds.has(r.id) && isRealAccessRecord(r))
            .map(r => (STATE.editedAccessMap[r.id] ? { ...r, ...STATE.editedAccessMap[r.id] } : r));
          STATE.recentAccessList = [...localOnly, ...backendRecords];
          try {
            localStorage.setItem('domus_custom_access', JSON.stringify(STATE.recentAccessList.slice(0, 50)));
          } catch (e) {}
        }
        updateAccesosBadge();
        renderAccesosView();
      }, err => {
        console.warn('Accesos: enlace de Google notificó:', err);
      });
    }
  }

  function updateAccesosBadge() {
    const badge = $('accessActiveCountBadge');
    if (!badge) return;
    const activeAct = STATE.activeActivity;
    const activeCount = (STATE.recentAccessList || [])
      .filter(r => isRealAccessRecord(r) && (!activeAct || r.activity === activeAct))
      .reduce((acc, r) => acc + (Number(r.persons) || Number(r.packages) || 1), 0);
    badge.textContent = activeCount;
  }

  function startPolling() {
    if (STATE.pollTimer) clearInterval(STATE.pollTimer);
    STATE.pollTimer = setInterval(() => {
      if (document.hidden) return; // Pausa en pestañas en segundo plano
      syncBackendData();
    }, 10000);
  }

  function updateKdsBadgeCount() {
    const badge = $('kdsActiveCountBadge');
    if (badge) {
      badge.textContent = STATE.comandas.length;
    }
  }

  // --- INTERFAZ: MODO CAJA (POS) ---
  function renderStaffDropdown() {
    const select = $('staffSelect');
    if (!select) return;
    select.innerHTML = '<option value="">👤 Operador…</option>' +
      STAFF_MEMBERS.map(s => `<option value="${s}" ${STATE.operator === s ? 'selected' : ''}>${s}</option>`).join('');
  }

  function isCannaProduct(p) {
    if (!p) return false;
    // 1. Autoridad primaria: atributo booleano explícito containsCannabis
    if (typeof p.containsCannabis === 'boolean') {
      return p.containsCannabis;
    }
    // 2. Si no tiene containsCannabis, contrastar contra la lista explícita autorizada
    const name = String(p.name || '').toLowerCase().trim();
    const cannabisExplicitList = [
      'greenburgesa feliz', 'espagueti verde', 'monchis pizza 420', 'guacanabis',
      'orden de guacanabis', 'canadip', 'wafle bdsm', 'cheescake', 'canabites',
      'galletona', 'pelon', 'pelones', 'galleta dubai', 'pan de muerto', 'chocolate amargo',
      'muffins', 'chocolates 2 dosis', 'chocolates 4 dosis', 'chocolates vagina'
    ];
    return cannabisExplicitList.some(item => name === item || name.includes(item));
  }

  function renderCategoryChips() {
    const container = $('categoryChips');
    if (!container) return;

    // Pestañas canónicas ordenadas y limpias (Carta Oficial Definitiva)
    const orderedCategories = [
      'Todas',
      '🌿 Menú Cannábico',
      'Cervezas',
      'Cheladas y Micheladas',
      'Cócteles',
      'Refrescos y Aguas',
      'Cafetería',
      'Shots',
      'Alimentos Cocina',
      'Sushi'
    ];

    // Incluir grupos adicionales si existieran
    const knownGroups = new Set(orderedCategories);
    STATE.products.forEach(p => {
      if (p.group && !knownGroups.has(p.group) && p.group !== 'Menú Cannábico' && p.group !== 'Canna Treats' && !p.group.includes('Staff')) {
        orderedCategories.push(p.group);
        knownGroups.add(p.group);
      }
    });

    container.innerHTML = orderedCategories.map(g => {
      const isCannaChip = g.includes('Cannábico') || g.includes('Canna');
      const isActive = STATE.catalogCategory === g || (isCannaChip && (STATE.catalogCategory === 'Menú Cannábico' || STATE.catalogCategory === '🌿 Menú Cannábico' || STATE.catalogCategory === 'Canna Treats'));
      return `
        <button type="button" class="chip-btn ${isCannaChip ? 'canna-chip' : ''} ${isActive ? 'active' : ''}" data-cat="${g}">
          ${g}
        </button>
      `;
    }).join('');

    container.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.catalogCategory = btn.getAttribute('data-cat');
        renderCategoryChips();
        renderCatalog();
      });
    });
  }

  function renderCatalog() {
    const grid = $('productsGrid');
    if (!grid) return;

    const query = STATE.searchQuery.toLowerCase().trim();
    const isCannaCategory = STATE.catalogCategory === '🌿 Menú Cannábico' ||
                            STATE.catalogCategory === 'Menú Cannábico' ||
                            STATE.catalogCategory === 'Canna Treats' ||
                            STATE.catalogCategory === 'Cannábico';

    const isCannaSearch = query.includes('canna') ||
                          query.includes('cannab') ||
                          query.includes('cannáb') ||
                          query.includes('weed') ||
                          query.includes('treats') ||
                          query.includes('kinki');

    const filtered = STATE.products.filter(p => {
      const isCanna = isCannaProduct(p);

      // Ocultar productos de staff en el POS público
      if (p.name && p.name.includes('— Staff') && !query.includes('staff')) {
        return false;
      }

      let matchCat = false;
      if (STATE.catalogCategory === 'Todas') {
        matchCat = true;
      } else if (isCannaCategory) {
        matchCat = isCanna;
      } else if (STATE.catalogCategory === 'Alimentos Cocina' || STATE.catalogCategory === 'Alimentos' || STATE.catalogCategory === 'Comida público') {
        matchCat = (p.group === 'Alimentos Cocina' || p.group === 'Alimentos' || p.group === 'Comida público') && !isCanna;
      } else if (STATE.catalogCategory === 'Cocina') {
        matchCat = p.destination === 'Cocina' || p.group === 'Sushi' || p.group === 'Alimentos Cocina';
      } else if (STATE.catalogCategory === 'Sushi') {
        matchCat = p.group === 'Sushi' || (p.provider && p.provider.toLowerCase().includes('jujutsu'));
      } else if (STATE.catalogCategory === 'Barra') {
        matchCat = p.destination === 'Barra' && !isCanna;
      } else {
        matchCat = p.group === STATE.catalogCategory;
      }

      const matchQuery = !query ||
                         (p.name && p.name.toLowerCase().includes(query)) ||
                         (p.group && p.group.toLowerCase().includes(query)) ||
                         (p.desc && p.desc.toLowerCase().includes(query)) ||
                         (p.provider && p.provider.toLowerCase().includes(query)) ||
                         (p.sku && p.sku.toLowerCase().includes(query)) ||
                         (isCanna && isCannaSearch);

      return matchCat && matchQuery;
    });

    if (!filtered.length) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <p>No se encontraron productos en "${STATE.catalogCategory}".</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const price = STATE.phase === 'Solar' ? (p.priceSolar || p.price) : (p.priceLunar || p.price);
      const isCanna = isCannaProduct(p);
      return `
        <article class="product-card ${isCanna ? 'canna-card' : ''}" data-product="${encodeURIComponent(JSON.stringify(p))}">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span class="card-cat-badge ${isCanna ? 'badge-canna' : ''}">
                ${isCanna ? '🌿 Menú Cannábico' : p.group}
              </span>
              <span style="font-size: 0.68rem; color: ${isCanna ? '#4ade80' : 'var(--gold-primary)'}; opacity: 0.95; font-weight: 600;">
                ${isCanna ? 'Canna Treats' : (p.provider && p.provider !== 'DOMUS' ? p.provider : '')}
              </span>
            </div>
            <h3 class="card-title">${p.name}</h3>
            ${p.desc ? `<p style="font-size: 0.76rem; color: var(--text-muted); margin-top: 4px; line-height: 1.25;">${p.desc}</p>` : ''}
          </div>
          <div class="card-footer">
            <span class="card-price">${money(price)}</span>
            <button type="button" class="card-add-btn" title="Agregar al pedido">+</button>
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const prod = JSON.parse(decodeURIComponent(card.getAttribute('data-product')));
        addToCart(prod);
      });
    });
  }

  function renderAccountDropdown() {
    const select = $('openAccountsSelect');
    if (!select) return;
    select.innerHTML = '<option value="">+ Nueva Cuenta / Folio</option>' +
      STATE.openAccounts.map(a => `
        <option value="${a.ticket}">
          ${a.customer || a.ticket} · Debe: ${money(a.due)}
        </option>
      `).join('');
  }

  function renderActivityDropdown() {
    const select = $('activitySelect');
    if (!select) return;
    select.innerHTML = STATE.activities.map(act => `
      <option value="${act}" ${STATE.activity === act ? 'selected' : ''}>${act}</option>
    `).join('');
  }

  // --- CARRITO / PEDIDO EN CAJA ---
  function addToCart(product) {
    const price = STATE.phase === 'Solar' ? (product.priceSolar || product.price) : (product.priceLunar || product.price);
    const existing = STATE.cart.find(i => i.name === product.name && !i.courtesy);
    const isCanna = isCannaProduct(product);
    if (existing) {
      if (existing.qty < 20) existing.qty += 1;
    } else {
      STATE.cart.push({
        name: product.name,
        desc: product.desc || '',
        group: isCanna ? 'Menú Cannábico' : product.group,
        destination: isCanna ? 'Cocina' : (product.destination || (product.group === 'Alimentos' || product.group === 'Sushi' ? 'Cocina' : 'Barra')),
        price: price,
        qty: 1,
        courtesy: false,
        sku: product.sku || ''
      });
    }
    renderCart();
  }

  function updateCartQty(idx, delta) {
    if (!STATE.cart[idx]) return;
    STATE.cart[idx].qty += delta;
    if (STATE.cart[idx].qty <= 0) {
      STATE.cart.splice(idx, 1);
    }
    renderCart();
  }

  function clearCart() {
    STATE.cart = [];
    renderCart();
  }

  function renderCart() {
    const container = $('cartItemsContainer');
    const totalEl = $('cartGrandTotal');
    const countEl = $('cartUnitsCount');
    const btnPay = $('btnOpenPaymentModal');
    if (!container) return;

    if (!STATE.cart.length) {
      container.innerHTML = `
        <div class="empty-cart-state">
          <span style="font-size: 2rem; opacity: 0.5;">🛒</span>
          <p>El pedido está vacío</p>
          <small>Selecciona productos del catálogo para agregar.</small>
        </div>
      `;
      if (totalEl) totalEl.textContent = '$0.00';
      if (countEl) countEl.textContent = '0 unidades';
      if (btnPay) btnPay.disabled = true;
      return;
    }

    let grandTotal = 0;
    let unitsCount = 0;

    container.innerHTML = STATE.cart.map((item, idx) => {
      const lineTotal = item.courtesy ? 0 : item.price * item.qty;
      grandTotal += lineTotal;
      unitsCount += item.qty;

      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-sub">
              ${money(item.price)} c/u · ${item.destination}
              ${item.courtesy ? '<span style="color:var(--gold-400); font-weight:700;">[CORTESÍA]</span>' : ''}
            </div>
          </div>
          <div class="cart-item-qty">
            <button type="button" class="qty-btn" onclick="window.__domusApp.updateQty(${idx}, -1)">−</button>
            <span class="qty-count">${item.qty}</span>
            <button type="button" class="qty-btn" onclick="window.__domusApp.updateQty(${idx}, 1)">+</button>
          </div>
          <div class="cart-item-price">${money(lineTotal)}</div>
        </div>
      `;
    }).join('');

    if (totalEl) totalEl.textContent = money(grandTotal);
    if (countEl) countEl.textContent = `${unitsCount} unidad${unitsCount > 1 ? 'es' : ''}`;
    if (btnPay) btnPay.disabled = false;
  }

  // --- MODAL DE COBRO & PAGO ---
  let activePaymentMethod = 'Efectivo';

  function openPaymentModal() {
    const customer = $('customerNameInput').value.trim();
    if (!customer && !STATE.selectedAccountTicket) {
      toast('Por favor escribe el nombre o apodo del cliente.', 'warn');
      $('customerNameInput').focus();
      return;
    }

    const modal = $('paymentModal');
    const total = calculateCartTotal();
    $('payTotalDisplay').textContent = money(total);
    $('cashDueInput').value = total.toFixed(2);
    $('cashReceivedInput').value = '';
    $('cashTipInput').value = '0';
    STATE.accountType = '';
    if ($('creditAuthorizationSelect')) $('creditAuthorizationSelect').value = '';
    updateChangeDisplay();

    // Resetear a Efectivo
    setPaymentMethod('Efectivo');
    modal.classList.add('open');
  }

  function closePaymentModal() {
    $('paymentModal').classList.remove('open');
  }

  function setPaymentMethod(method) {
    activePaymentMethod = method;
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-method') === method);
    });

    $('cashCalculatorSection').classList.toggle('hidden', method !== 'Efectivo');
  }

  function calculateCartTotal() {
    return STATE.cart.reduce((sum, item) => sum + (item.courtesy ? 0 : item.price * item.qty), 0);
  }

  function updateChangeDisplay() {
    const due = calculateCartTotal();
    const received = parseFloat($('cashReceivedInput').value) || 0;
    const tip = parseFloat($('cashTipInput').value) || 0;

    const changeBox = $('changeDisplayBox');
    const changeAmt = $('changeAmountText');

    if (activePaymentMethod !== 'Efectivo') {
      changeAmt.textContent = '$0.00';
      changeBox.classList.remove('insufficient');
      return;
    }

    if (received + 0.001 < due + tip) {
      const falta = (due + tip - received).toFixed(2);
      changeBox.classList.add('insufficient');
      changeAmt.textContent = `Faltan $${falta}`;
    } else {
      const cambio = (received - due - tip).toFixed(2);
      changeBox.classList.remove('insufficient');
      changeAmt.textContent = `$${cambio}`;
    }
  }

  function confirmPaymentAndDispatch(isPaid) {
    if (!STATE.cart || !STATE.cart.length) {
      toast('El pedido está vacío. Haz clic en los productos para agregarlos al carrito antes de cobrar o enviar.', 'warn');
      return;
    }
    const customer = $('customerNameInput').value.trim() || 'Cliente Mostrador';
    const total = calculateCartTotal();
    const received = parseFloat($('cashReceivedInput').value) || 0;
    const tip = parseFloat($('cashTipInput').value) || 0;

    let explicitCredit = '';
    if (!isPaid) {
      const creditSelect = $('creditAuthorizationSelect');
      explicitCredit = creditSelect ? String(creditSelect.value || '') : '';
      if (!['Amigo', 'Creador de proyecto'].includes(explicitCredit)) {
        toast('Para enviar un pedido sin cobrar debes seleccionar una autorización de crédito explícita.', 'error');
        if (creditSelect) creditSelect.focus();
        return;
      }
      STATE.accountType = explicitCredit;
    } else {
      STATE.accountType = '';
    }

    if (isPaid && activePaymentMethod === 'Efectivo' && received + 0.001 < total + tip) {
      toast('El efectivo recibido es insuficiente para cubrir la cuenta.', 'error');
      $('cashReceivedInput').focus();
      return;
    }

    const payload = {
      id: `POS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      phase: STATE.phase,
      customer: customer,
      ticket: STATE.selectedAccountTicket || '',
      activity: $('activitySelect').value || 'Visita general DOMUS',
      expectedTotal: total,
      paid: isPaid,
      method: isPaid ? activePaymentMethod : '',
      received: isPaid && activePaymentMethod === 'Efectivo' ? received : null,
      tip: isPaid && activePaymentMethod === 'Efectivo' ? tip : 0,
      credit: isPaid ? '' : explicitCredit,
      items: STATE.cart.map(i => ({
        name: i.name,
        price: i.price,
        qty: i.qty,
        courtesy: !!i.courtesy,
        destination: i.destination
      }))
    };

    closePaymentModal();
    toast('Registrando operación en DOMUS…', 'ok');

    callBackend('cajaSimpleRegistrar', [payload], res => {
      playChime('success');
      toast(res.message || 'Pedido guardado y enviado.', 'ok');
      showReceiptModal({
        ticket: res.ticket,
        receipt: res.receipt,
        customer: customer,
        items: [...STATE.cart],
        total: total,
        paid: isPaid,
        method: activePaymentMethod,
        received: received,
        tip: tip,
        change: Math.max(0, received - total - tip)
      });

      // Limpiar pedido actual
      clearCart();
      $('customerNameInput').value = '';
      STATE.selectedAccountTicket = '';
      STATE.accountType = '';
      if ($('creditAuthorizationSelect')) $('creditAuthorizationSelect').value = '';
      syncBackendData();
    }, err => {
      toast(`Error al registrar: ${err.message || String(err)}`, 'error');
    });
  }

  // --- MODAL DE RECIBO DE PAGO ---
  function showReceiptModal(data) {
    const modal = $('receiptModal');
    $('receiptFolio').textContent = data.receipt ? `RECIBO: ${data.receipt}` : 'VENTA PENDIENTE DE COBRO';
    $('receiptTicket').textContent = `CUENTA: ${data.ticket}`;
    $('receiptCustomer').textContent = `CLIENTE: ${data.customer}`;
    $('receiptDate').textContent = `FECHA: ${new Date().toLocaleString('es-MX')}`;

    const itemsContainer = $('receiptItemsList');
    itemsContainer.innerHTML = data.items.map(i => `
      <div class="receipt-line">
        <span>${i.qty}x ${i.name}</span>
        <span>${money(i.price * i.qty)}</span>
      </div>
    `).join('');

    $('receiptTotal').textContent = money(data.total);

    const paymentInfo = $('receiptPaymentDetails');
    if (data.paid && data.method === 'Efectivo') {
      paymentInfo.innerHTML = `
        <div class="receipt-line"><span>Método:</span><span>Efectivo</span></div>
        <div class="receipt-line"><span>Recibido:</span><span>${money(data.received)}</span></div>
        ${data.tip > 0 ? `<div class="receipt-line"><span>Propina:</span><span>${money(data.tip)}</span></div>` : ''}
        <div class="receipt-line"><span>Cambio:</span><span>${money(data.change)}</span></div>
      `;
    } else if (data.paid) {
      paymentInfo.innerHTML = `
        <div class="receipt-line"><span>Método:</span><span>${data.method}</span></div>
        <div class="receipt-line"><span>Estado:</span><span>COBRADO Y VERIFICADO</span></div>
      `;
    } else {
      paymentInfo.innerHTML = `
        <div class="receipt-line"><span>Estado:</span><span>ENVIADO A COMANDA · PAGO AL FINAL</span></div>
      `;
    }

    modal.classList.add('open');
  }

  // --- INTERFAZ: MODO COMANDAS (KDS) ---
  function renderComandasBoard() {
    const board = $('ordersBoard');
    const metricsTotal = $('metricTotalOrders');
    const metricsReady = $('metricReadyOrders');
    const metricsRestock = $('metricRestockRequests');
    if (!board) return;

    // Actualizar Métricas
    const activeOrders = STATE.comandas.filter(o => o.state !== 'Entregada' && o.state !== 'Cancelada');
    const readyOrders = STATE.comandas.filter(o => o.state === 'Lista');
    if (metricsTotal) metricsTotal.textContent = activeOrders.length;
    if (metricsReady) metricsReady.textContent = readyOrders.length;
    if (metricsRestock) metricsRestock.textContent = STATE.restockRequests.length;

    // Si estamos en la pestaña de Resurtido
    if (STATE.kdsFilterState === 'Resurtido') {
      renderRestockTab(board);
      return;
    }

    // Filtrar comandas según pestaña, destino y búsqueda
    const query = STATE.kdsSearch.toLowerCase().trim();
    let source = STATE.kdsFilterState === 'Entregadas' ? STATE.historyComandas : STATE.comandas;

    let filtered = source.filter(o => {
      const matchState = STATE.kdsFilterState === 'Todas' || STATE.kdsFilterState === 'Entregadas' || o.state === STATE.kdsFilterState;
      const matchDest = !STATE.kdsFilterDest || o.destination === STATE.kdsFilterDest;
      const matchSearch = !query ||
        o.alias.toLowerCase().includes(query) ||
        o.ticket.toLowerCase().includes(query) ||
        o.product.toLowerCase().includes(query) ||
        o.id.toLowerCase().includes(query);
      return matchState && matchDest && matchSearch;
    });

    if (!filtered.length) {
      board.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; color: var(--text-muted);">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 8px;">📋</span>
          <h3>Sin comandas en esta vista</h3>
          <p>Los pedidos enviados desde Caja aparecerán aquí automáticamente.</p>
        </div>
      `;
      return;
    }

    // Agrupar por lote/ticket para visualización en tarjetas unificadas
    const groups = new Map();
    filtered.forEach(item => {
      const groupKey = `${item.ticket}_${item.batch || item.id}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(item);
    });

    board.innerHTML = Array.from(groups.values()).map(items => {
      const first = items[0];
      const mins = minutesAgo(first.sent);
      const isUrgent = mins >= 15 && first.state !== 'Entregada';
      const isWarning = mins >= 10 && !isUrgent;
      const hasResponsible = !!first.responsible;

      return `
        <article class="order-card ${isUrgent ? 'urgent' : ''}">
          <div class="order-card-header">
            <div class="order-card-meta">
              <h3 class="customer-name">${first.alias || 'Cliente'}</h3>
              <div class="ticket-info">${first.ticket} · ${items.length} unidad(es)</div>
              ${first.credit ? '<span class="credit-tag">💳 Paga al final</span>' : ''}
            </div>
            <div class="order-timer-badge ${isUrgent ? 'danger' : isWarning ? 'warning' : ''}">
              ⏱ ${mins} min (${formatTime(first.sent)})
            </div>
          </div>

          <div class="order-claim-strip">
            <span>Responsable: <strong>${first.responsible || 'Sin asignar'}</strong></span>
            ${!hasResponsible && STATE.kdsFilterState !== 'Entregadas' ? `
              <button type="button" class="btn-claim-order" onclick="window.__domusApp.claimOrder('${first.key}')">
                ✋ Tomar comanda
              </button>
            ` : ''}
          </div>

          <div class="order-items-list">
            ${items.map(item => `
              <div class="order-item-block">
                <div class="order-item-top">
                  <span class="order-item-name">1 × ${item.product}</span>
                  <div class="order-item-badges">
                    <span class="badge-tag dest-${(item.destination || 'Barra').toLowerCase()}">${item.destination}</span>
                    <span class="badge-tag state-${item.state.toLowerCase().replace(/\s+/g, '')}">${item.state}</span>
                  </div>
                </div>

                ${item.notes ? `<div class="order-item-notes">📝 ${item.notes}</div>` : ''}
                ${item.incident ? `<div class="order-item-incident">⚠️ ${item.incident}</div>` : ''}

                ${STATE.kdsFilterState !== 'Entregadas' ? `
                  <div class="order-item-actions">
                    ${hasResponsible && item.state === 'En preparación' && !item.incident ? `
                      <button type="button" class="btn-action-small btn-ready" onclick="window.__domusApp.markOrderReady('${item.key}')">
                        ✓ Marcar Lista
                      </button>
                    ` : ''}
                    
                    ${hasResponsible && item.state === 'Lista' && !item.incident ? `
                      <button type="button" class="btn-action-small btn-deliver" onclick="window.__domusApp.deliverOrder('${item.key}')">
                        📦 Entregar
                      </button>
                    ` : ''}

                    ${!item.incident ? `
                      <button type="button" class="btn-action-small btn-incident" onclick="window.__domusApp.reportIncident('${item.key}')">
                        ⚠️ No disponible
                      </button>
                    ` : ''}
                  </div>
                ` : `
                  <small style="color:var(--text-muted);">Entregado: ${formatTime(item.delivered)}</small>
                `}
              </div>
            `).join('')}
          </div>
        </article>
      `;
    }).join('');
  }

  function renderRestockTab(board) {
    board.innerHTML = `
      <div style="grid-column: 1/-1;" class="restock-view">
        <div class="restock-form-card">
          <input type="text" id="restockProductInput" placeholder="Nombre del producto que hace falta…" />
          <select id="restockTypeSelect">
            <option value="Reponer de almacén">Reponer de almacén</option>
            <option value="Agotado en DOMUS">Agotado en DOMUS</option>
            <option value="Insumos / Botellas">Insumos / Botellas</option>
          </select>
          <button type="button" class="btn-primary-action" style="width: auto; padding: 10px 20px;" onclick="window.__domusApp.submitRestockRequest()">
            Solicitar Resurtido
          </button>
        </div>

        <h3>Solicitudes de Resurtido Abiertas (${STATE.restockRequests.length})</h3>
        <div class="orders-board">
          ${STATE.restockRequests.length ? STATE.restockRequests.map(r => `
            <article class="order-card">
              <div class="order-card-header">
                <div>
                  <h4>${r.product}</h4>
                  <span class="badge-tag" style="background:var(--rose-bg); color:var(--rose-400);">${r.type}</span>
                </div>
                <small>${formatTime(r.created)}</small>
              </div>
              <div style="padding: 14px 16px;">
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">Folio solicitud: ${r.id}</p>
                <button type="button" class="btn-action-small btn-ready" style="width: 100%;" onclick="window.__domusApp.resolveRestock('${r.id}')">
                  ✓ Ya disponible (Resolver)
                </button>
              </div>
            </article>
          `).join('') : '<p style="color:var(--text-muted);">No hay solicitudes pendientes.</p>'}
        </div>
      </div>
    `;
  }

  // --- ACCIONES KDS ---
  function claimOrder(orderKey) {
    if (!ensureOperator()) return;
    const ord = STATE.comandas.find(o => o.key === orderKey);
    if (!ord || ord.state !== 'Pendiente') {
      toast('La comanda ya no está Pendiente. Actualizando tablero…', 'warn');
      syncBackendData();
      return;
    }
    const body = {
      key: orderKey,
      action: 'TOMAR',
      operator: STATE.operator,
      requestId: `REQ-${Date.now()}`
    };

    callBackend('comandasSimpleAccion', [sessionStorage.getItem('domus_token') || '', body], res => {
      toast('Comanda tomada para preparación.', 'ok');
      syncBackendData();
    }, err => toast(err.message || String(err), 'error'));
  }

  function markOrderReady(orderKey) {
    if (!ensureOperator()) return;
    const ord = STATE.comandas.find(o => o.key === orderKey);
    if (!ord || ord.state !== 'En preparación') {
      toast('Sólo una comanda En preparación puede marcarse como Lista.', 'warn');
      syncBackendData();
      return;
    }
    const body = {
      key: orderKey,
      action: 'LISTA',
      operator: STATE.operator,
      requestId: `REQ-${Date.now()}`
    };

    callBackend('comandasSimpleAccion', [sessionStorage.getItem('domus_token') || '', body], res => {
      toast('Producto marcado como Listo para entrega.', 'ok');
      syncBackendData();
    }, err => toast(err.message || String(err), 'error'));
  }

  function deliverOrder(orderKey) {
    if (!ensureOperator()) return;
    const ord = STATE.comandas.find(o => o.key === orderKey);
    if (!ord || ord.state !== 'Lista') {
      toast('Sólo una comanda marcada como Lista puede registrarse como Entregada.', 'warn');
      syncBackendData();
      return;
    }
    const prodName = ord.product || '1 unidad';
    
    if (!confirm(`¿Confirmas la entrega FÍSICA de:\n${prodName} para ${ord ? ord.alias : 'el cliente'}?`)) {
      return;
    }

    const body = {
      key: orderKey,
      action: 'ENTREGAR',
      operator: STATE.operator,
      requestId: `REQ-${Date.now()}`
    };

    callBackend('comandasSimpleAccion', [sessionStorage.getItem('domus_token') || '', body], res => {
      toast('Entrega registrada exitosamente.', 'ok');
      playChime('success');
      syncBackendData();
    }, err => toast(err.message || String(err), 'error'));
  }

  function reportIncident(orderKey) {
    if (!ensureOperator()) return;
    const opcion = prompt('Elige el motivo de indisponibilidad:\n1 = Reponer de almacén\n2 = Agotado en DOMUS', '1');
    if (!opcion) return;

    const action = opcion.trim() === '2' ? 'AGOTADO' : 'ALMACEN';
    const body = {
      key: orderKey,
      action: action,
      operator: STATE.operator,
      requestId: `REQ-${Date.now()}`
    };

    callBackend('comandasSimpleAccion', [sessionStorage.getItem('domus_token') || '', body], res => {
      toast('Incidencia y solicitud de resurtido generada.', 'warn');
      syncBackendData();
    }, err => toast(err.message || String(err), 'error'));
  }

  function submitRestockRequest() {
    if (!ensureOperator()) return;
    const prod = $('restockProductInput').value.trim();
    const type = $('restockTypeSelect').value;
    if (!prod) {
      toast('Escribe el producto a resurtir.', 'warn');
      return;
    }

    STATE.restockRequests.unshift({
      id: `RES-${Date.now().toString(36).toUpperCase()}`,
      product: prod,
      type: type,
      created: Date.now()
    });
    toast('Solicitud agregada al tablero.', 'ok');
    renderComandasBoard();
  }

  function resolveRestock(id) {
    if (!ensureOperator()) return;
    callBackend('comandasSimpleResolver', [sessionStorage.getItem('domus_token') || '', { id, operator: STATE.operator }], res => {
      toast('Disponibilidad confirmada.', 'ok');
      syncBackendData();
    }, err => toast(err.message || String(err), 'error'));
  }

  function ensureOperator() {
    if (!STATE.operator) {
      toast('Por favor selecciona tu nombre de operador en la barra superior.', 'warn');
      $('staffSelect').focus();
      return false;
    }
    return true;
  }

  // --- CONFIGURACIÓN & MODAL API ---
  function openConfigModal() {
    $('gasApiUrlInput').value = STATE.apiUrl;
    $('configModal').classList.add('open');
  }

  function saveConfig() {
    if (STATE.isProductionLocked) {
      toast('🔒 El backend está bloqueado en PRODUCCIÓN oficial (AKfycbysBa...).', 'warn');
      if ($('gasApiUrlInput')) $('gasApiUrlInput').value = OFFICIAL_PRODUCTION_ENDPOINT;
    } else {
      const url = $('gasApiUrlInput').value.trim();
      if (url) {
        STATE.apiUrl = url;
        localStorage.setItem('domus_gas_url', url);
        STATE.isDemoMode = false;
      }
    }
    const newPin = $('newCajaPasswordInput') ? $('newCajaPasswordInput').value.trim() : '';
    if (newPin) {
      localStorage.setItem('domus_caja_pin', newPin);
      toast('Nueva contraseña de Caja establecida.', 'ok');
      $('newCajaPasswordInput').value = '';
    }
    $('configModal').classList.remove('open');
    toast('Configuración guardada.', 'ok');
    syncBackendData();
  }

  // --- ALTA / REGISTRO DE NUEVOS PRODUCTOS (ADMIN CAJA) ---
  function openNewProductModal() {
    $('newProdName').value = '';
    $('newProdPriceSolar').value = '';
    $('newProdPriceLunar').value = '';
    $('newProdSku').value = '';
    $('newProdCustomCategory').value = '';
    $('customCatWrapper').classList.add('hidden');
    $('newProdStock').value = '50';

    // Poblar categorías existentes
    const select = $('newProdCategory');
    const existingGroups = [...new Set(STATE.products.map(p => p.group))];
    select.innerHTML = existingGroups.map(g => `<option value="${g}">${g}</option>`).join('') +
      '<option value="__NEW__">+ Otra Categoría…</option>';

    $('newProductModal').classList.add('open');
    setTimeout(() => $('newProdName').focus(), 150);
  }

  function closeNewProductModal() {
    $('newProductModal').classList.remove('open');
  }

  function saveNewProduct() {
    const name = $('newProdName').value.trim();
    if (!name) {
      toast('Escribe el nombre del producto.', 'warn');
      $('newProdName').focus();
      return;
    }

    let category = $('newProdCategory').value;
    if (category === '__NEW__') {
      category = $('newProdCustomCategory').value.trim();
      if (!category) {
        toast('Escribe el nombre de la nueva categoría.', 'warn');
        $('newProdCustomCategory').focus();
        return;
      }
    }

    const priceSolar = parseFloat($('newProdPriceSolar').value);
    const priceLunar = parseFloat($('newProdPriceLunar').value);

    if (isNaN(priceSolar) || priceSolar < 0) {
      toast('Introduce un precio válido para Fase Solar.', 'warn');
      $('newProdPriceSolar').focus();
      return;
    }

    const destination = $('newProdDestination').value;
    const provider = $('newProdProvider').value.trim() || 'DOMUS';
    const sku = $('newProdSku').value.trim() || `PRD-${Date.now().toString(36).toUpperCase()}`;
    const stock = parseInt($('newProdStock').value, 10) || 50;

    const newProduct = {
      name: name,
      group: category,
      price: priceSolar,
      priceSolar: priceSolar,
      priceLunar: isNaN(priceLunar) ? priceSolar : priceLunar,
      destination: destination,
      provider: provider,
      sku: sku,
      stock: stock
    };

    // Agregar al catálogo en memoria
    STATE.products.unshift(newProduct);

    // Guardar en almacenamiento local del navegador
    try {
      const custom = JSON.parse(localStorage.getItem('domus_custom_products') || '[]');
      custom.unshift(newProduct);
      localStorage.setItem('domus_custom_products', JSON.stringify(custom));
    } catch (e) {}

    // Enviar al backend de Google Apps Script para actualizar CATALOGO e INVENTARIO
    callBackend('registrarNuevoProducto', [newProduct], res => {
      toast(res.message || `Producto "${name}" guardado en Google Sheets.`, 'ok');
    }, err => {
      console.warn('Registro local activo. Enlace de Google notificó:', err);
    });

    closeNewProductModal();
    playChime('success');
    toast(`Producto "${name}" registrado con éxito en ${category}.`, 'ok');

    // Cambiar a la categoría del producto nuevo para verlo inmediatamente
    STATE.catalogCategory = category;
    renderCategoryChips();
    renderCatalog();
  }


  // --- INTERFAZ: MODO ACCESOS, EVENTOS Y GUARDARROPA ---

  function getActiveEvent() {
    let ev = (STATE.eventsList || []).find(e => e.name === STATE.activeActivity);
    if (!ev) {
      // Priorizar evento nocturno de jornada en curso (Forza) antes de saltar al siguiente día
      ev = (STATE.eventsList || []).find(e => e.name && e.name.includes('Forza'));
    }
    if (!ev && STATE.eventsList && STATE.eventsList.length > 0) {
      ev = STATE.eventsList[0];
    }
    if (!ev) {
      ev = {
        name: STATE.activeActivity || 'Forza · sábado',
        date: '2026-10-24',
        type: 'Club nocturno',
        organizer: 'FORZA',
        priceGeneral: 0,
        pricePareja: 0,
        priceTrio: 0,
        priceGuardarropa: 0,
        capacity: 200,
        status: 'Confirmado',
        salesChannel: 'BOLETERA_EXTERNA',
        ticketTypes: [
          { id: 'General', name: 'General (1 Asistente)', price: 0, persons: 1 },
          { id: 'Pareja', name: 'Pareja (2 Asistentes)', price: 0, persons: 2 },
          { id: 'Trío', name: 'Trío (3 Asistentes)', price: 0, persons: 3 }
        ]
      };
    }
    return ev;
  }

  function renderAccesosView() {
    renderAccessActivitySelector();
    renderAccessChannels();
    renderEntryTypesGrid();
    renderWardrobeSelector();
    updateAccesosKpis();
    updateAccessSummary();
    renderAccessTab();

    const btnConfirm = $('btnConfirmAccess');
    if (btnConfirm) {
      btnConfirm.disabled = isRegisteringAccess;
      btnConfirm.onclick = () => confirmAccessAndRegister();
    }
  }

  function renderAccessActivitySelector() {
    const select = $('accessActivitySelect');
    if (!select) return;

    if (!STATE.eventsList || STATE.eventsList.length === 0) {
      STATE.eventsList = [...DEFAULT_EVENTS];
    }

    select.innerHTML = STATE.eventsList.map(ev => {
      const isSelected = ev.name === STATE.activeActivity;
      return `<option value="${escapeHtml(ev.name)}" ${isSelected ? 'selected' : ''}>${escapeHtml(ev.name)} (${ev.date || 'Hoy'}) - ${escapeHtml(ev.type || 'Evento')}</option>`;
    }).join('');

    select.value = STATE.activeActivity;
  }

  function renderAccessChannels() {
    const container = $('salesChannelContainer');
    if (!container) return;

    const ev = getActiveEvent();
    if (!STATE.accessSalesChannel) {
      STATE.accessSalesChannel = (ev && ev.salesChannel) ? ev.salesChannel : (ev && ev.name.includes('Forza') ? 'BOLETERA_EXTERNA' : 'TAQUILLA_DOMUS');
    }

    container.querySelectorAll('.channel-btn').forEach(btn => {
      const ch = btn.getAttribute('data-channel');
      btn.classList.toggle('active', ch === STATE.accessSalesChannel);
      btn.onclick = () => setAccessSalesChannel(ch);
    });
  }

  function setAccessSalesChannel(channel) {
    STATE.accessSalesChannel = channel;
    renderAccessChannels();
    renderEntryTypesGrid();

    // Toggle specific detail panels
    const panelBoletera = $('panelBoleteraDetail');
    if (panelBoletera) panelBoletera.classList.toggle('hidden', channel !== 'BOLETERA_EXTERNA');

    const panelTransfer = $('panelTransferDetail');
    if (panelTransfer) panelTransfer.classList.toggle('hidden', channel !== 'TRANSFERENCIA_DIRECTA');

    const panelCourtesy = $('panelCourtesyDetail');
    if (panelCourtesy) panelCourtesy.classList.toggle('hidden', channel !== 'CORTESIA');

    const panelPresaleDomus = $('panelPresaleDomusDetail');
    if (panelPresaleDomus) panelPresaleDomus.classList.toggle('hidden', channel !== 'PREVENTA_DOMUS');

    // Payment methods section visibility (door payment)
    const paySec = $('accessPaymentSection');
    const cashSec = $('accessCashSection');
    const isDoorPayment = channel === 'TAQUILLA_DOMUS' || (STATE.accessWardrobeQty > 0);
    if (paySec) paySec.classList.toggle('hidden', !isDoorPayment && channel !== 'TRANSFERENCIA_DIRECTA');
    if (cashSec) cashSec.classList.toggle('hidden', !isDoorPayment || STATE.accessPaymentMethod !== 'Efectivo');

    updateAccessSummary();
  }

  function renderEntryTypesGrid() {
    const container = $('entryTypesContainer');
    if (!container) return;

    const ev = getActiveEvent();
    const isForza = (ev.name || '').toLowerCase().includes('forza') || (ev.organizer || '').toUpperCase() === 'FORZA';
    const isCourtesy = STATE.accessSalesChannel === 'CORTESIA';
    const pGen = (ev.priceGeneral !== undefined && ev.priceGeneral !== null && ev.priceGeneral !== '') ? Number(ev.priceGeneral) : 0;
    const pPar = (ev.pricePareja !== undefined && ev.pricePareja !== null && ev.pricePareja !== '') ? Number(ev.pricePareja) : 0;
    const pTrio = (ev.priceTrio !== undefined && ev.priceTrio !== null && ev.priceTrio !== '') ? Number(ev.priceTrio) : 0;

    // Tipos de boletos pertenecientes al evento
    let types = [];
    if (isForza) {
      types = [
        { id: 'General', label: 'General (1 Asistente)', price: isCourtesy ? 0 : 150, persons: 1, icon: '👤', tag: isCourtesy ? '$0.00 (Cortesía)' : '$150.00 DOMUS' },
        { id: 'Pareja', label: 'Pareja (2 Asistentes)', price: isCourtesy ? 0 : 300, persons: 2, icon: '👥', tag: isCourtesy ? '$0.00 (Cortesía)' : '$300.00 DOMUS' },
        { id: 'Trío', label: 'Trío (3 Asistentes)', price: isCourtesy ? 0 : 450, persons: 3, icon: '🧑‍🤝‍🧑', tag: isCourtesy ? '$0.00 (Cortesía)' : '$450.00 DOMUS' }
      ];
    } else if (Array.isArray(ev.ticketTypes) && ev.ticketTypes.length > 0) {
      types = ev.ticketTypes.map(t => ({
        id: t.id || t.name,
        label: t.name || t.id,
        price: (t.price !== undefined && t.price !== null && t.price !== '') ? Number(t.price) : 0,
        persons: Number(t.persons) || 1,
        icon: t.icon || (t.persons === 2 ? '👥' : (t.persons >= 3 ? '🧑‍🤝‍🧑' : '👤'))
      }));
    } else {
      types = [
        { id: 'General', label: 'General (1 Pers)', price: pGen, persons: 1, icon: '👤' },
        { id: 'Pareja', label: 'Pareja (2 Pers)', price: pPar, persons: 2, icon: '👥' },
        { id: 'Trío', label: 'Trío (3 Pers)', price: pTrio, persons: 3, icon: '🧑‍🤝‍🧑' },
        { id: 'VIP', label: 'VIP (Acceso Preferente)', price: pGen > 0 ? (pGen * 1.5) : 0, persons: 1, icon: '⭐' }
      ];
    }

    if (!STATE.accessSelectedType || !types.some(t => t.id === STATE.accessSelectedType)) {
      STATE.accessSelectedType = types[0].id;
    }

    if ($('activeEventTicketCountText')) {
      $('activeEventTicketCountText').textContent = `${types.length} tarifas configuradas`;
    }

    container.innerHTML = types.map(t => {
      const isSelected = STATE.accessSelectedType === t.id;
      const priceText = t.tag || `$${t.price.toFixed(2)}`;
      return `
        <div class="entry-type-btn entry-type-card ${isSelected ? 'active selected' : ''}" data-entry-type="${escapeHtml(t.id)}" data-price="${t.price}" data-persons="${t.persons}" role="button" tabindex="0">
          <div class="entry-type-icon">${t.icon}</div>
          <div class="entry-type-title">${escapeHtml(t.label)}</div>
          <div class="entry-type-price">${priceText}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.entry-type-card, .entry-type-btn').forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-entry-type');
        setAccessEntryType(type);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const type = card.getAttribute('data-entry-type');
          setAccessEntryType(type);
        }
      });
    });

    const pGua = (ev.priceGuardarropa !== undefined && ev.priceGuardarropa !== null && ev.priceGuardarropa !== '') ? Number(ev.priceGuardarropa) : 0;
    if ($('wardrobeUnitPriceText')) {
      $('wardrobeUnitPriceText').textContent = `$${pGua.toFixed(2)} c/u`;
    }
  }

  function setAccessEntryType(type) {
    STATE.accessSelectedType = type;

    const container = $('entryTypesContainer');
    if (container) {
      container.querySelectorAll('.entry-type-card, .entry-type-btn').forEach(card => {
        const matches = card.getAttribute('data-entry-type') === type;
        card.classList.toggle('selected', matches);
        card.classList.toggle('active', matches);
      });
    }

    updateAccessSummary();
  }

  function renderWardrobeSelector() {
    const group = $('wardrobeSelectorGroup');
    if (!group) return;
    const qty = STATE.accessWardrobeQty || 0;
    group.querySelectorAll('.wardrobe-btn').forEach(btn => {
      const bQty = parseInt(btn.getAttribute('data-qty'), 10);
      btn.classList.toggle('active', bQty === qty);
    });
  }

  function setWardrobeQty(qty) {
    STATE.accessWardrobeQty = qty;
    renderWardrobeSelector();

    const notesWrapper = $('wardrobeNotesWrapper');
    if (notesWrapper) {
      notesWrapper.style.display = qty > 0 ? 'block' : 'none';
    }

    updateAccessSummary();
  }

  function setAccessPaymentMethod(method) {
    STATE.accessPaymentMethod = method;
    document.querySelectorAll('.payment-method-btn[data-access-method]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-access-method') === method);
    });

    const cashSec = $('accessCashSection');
    if (cashSec) {
      const { doorTotal } = calculateAccessSubtotal();
      cashSec.classList.toggle('hidden', method !== 'Efectivo' || doorTotal <= 0);
    }

    updateAccessSummary();
  }

  function calculateAccessSubtotal() {
    const ev = getActiveEvent();
    const channel = STATE.accessSalesChannel || 'BOLETERA_EXTERNA';
    const isForza = (ev.name || '').toLowerCase().includes('forza') || (ev.organizer || '').toUpperCase() === 'FORZA';
    
    // Obtener personas según tipo de boleto
    let persons = 1;
    const selectedCard = document.querySelector(`.entry-type-card[data-entry-type="${STATE.accessSelectedType}"], .entry-type-btn[data-entry-type="${STATE.accessSelectedType}"]`);
    if (selectedCard) {
      persons = parseInt(selectedCard.getAttribute('data-persons'), 10) || 1;
    } else if (STATE.accessSelectedType === 'Pareja') {
      persons = 2;
    } else if (STATE.accessSelectedType === 'Trío') {
      persons = 3;
    }

    // Obtener tarifa nominal del tipo de boleto / cuota comercial
    let faceValue = 0;
    if (isForza) {
      // Regla de acuerdo FORZA: cada persona en lista o boletera genera $150 para DOMUS; cortesías $0
      if (channel === 'CORTESIA') {
        faceValue = 0;
      } else {
        faceValue = (ev.forzaFeePerAttendee || 150) * persons;
      }
    } else {
      if (selectedCard) {
        faceValue = parseFloat(selectedCard.getAttribute('data-price')) || 0;
      } else {
        if (STATE.accessSelectedType === 'Pareja') {
          faceValue = (ev.pricePareja !== undefined && ev.pricePareja !== null && ev.pricePareja !== '') ? Number(ev.pricePareja) : 0;
        } else if (STATE.accessSelectedType === 'Trío') {
          faceValue = (ev.priceTrio !== undefined && ev.priceTrio !== null && ev.priceTrio !== '') ? Number(ev.priceTrio) : 0;
        } else {
          faceValue = (ev.priceGeneral !== undefined && ev.priceGeneral !== null && ev.priceGeneral !== '') ? Number(ev.priceGeneral) : 0;
        }
      }
    }

    // Cobro de entrada en puerta según canal ($0 para FORZA y canales externos)
    let doorEntryCharge = 0;
    if (channel === 'TAQUILLA_DOMUS' && !isForza) {
      doorEntryCharge = faceValue;
    } else {
      doorEntryCharge = 0;
    }

    // Cobro de guardarropa desacoplado ($0 para FORZA)
    const pGua = (ev.priceGuardarropa !== undefined && ev.priceGuardarropa !== null && ev.priceGuardarropa !== '') ? Number(ev.priceGuardarropa) : 0;
    const wardrobeCost = (STATE.accessWardrobeQty || 0) * pGua;
    const doorTotal = doorEntryCharge + wardrobeCost;
    const commercialTotal = faceValue + wardrobeCost;

    return { faceValue, persons, doorEntryCharge, wardrobeCost, doorTotal, commercialTotal, isForza };
  }

  function updateAccessSummary() {
    const { faceValue, persons, doorEntryCharge, wardrobeCost, doorTotal, commercialTotal, isForza } = calculateAccessSubtotal();

    if ($('summaryFaceValue')) $('summaryFaceValue').textContent = `$${faceValue.toFixed(2)}`;
    if ($('summaryFaceValueLabel')) {
      $('summaryFaceValueLabel').textContent = isForza ? `Cuota DOMUS ($150 × ${persons} pers):` : 'Valor Comercial Boleto:';
    }
    if ($('summaryDoorEntryAmount')) $('summaryDoorEntryAmount').textContent = `$${doorEntryCharge.toFixed(2)}`;
    if ($('summaryWardrobeQty')) $('summaryWardrobeQty').textContent = STATE.accessWardrobeQty || 0;
    if ($('summaryWardrobeAmount')) $('summaryWardrobeAmount').textContent = `$${wardrobeCost.toFixed(2)}`;
    if ($('summaryTotalAdmission')) $('summaryTotalAdmission').textContent = `$${doorTotal.toFixed(2)}`;

    // Banner de estado de canal
    if ($('bannerBoleteraText')) {
      $('bannerBoleteraText').textContent = isForza 
        ? '✓ Boleto / Lista FORZA · Genera $150 para DOMUS (liquidación de evento) · $0 por cobrar en puerta'
        : '✓ Boleto pagado externamente · $0 por cobrar en puerta por entrada';
    }

    // Dinamismo del botón de acción principal (siempre habilitado)
    const btnConfirm = $('btnConfirmAccess');
    if (btnConfirm && !isRegisteringAccess) {
      btnConfirm.disabled = false;
      if (doorTotal > 0) {
        btnConfirm.textContent = `✓ Cobrar $${doorTotal.toFixed(2)} y Emitir Tickets`;
        btnConfirm.classList.remove('btn-neutral-action');
      } else {
        const channel = STATE.accessSalesChannel;
        let label = 'Ya Pagada';
        if (channel === 'BOLETERA_EXTERNA') label = isForza ? 'Boletera FORZA · $150 DOMUS · $0 en Puerta' : 'Boletera Externa · $0 en Puerta';
        else if (channel === 'CORTESIA') label = 'Cortesía $0';
        else if (channel === 'LISTA') label = isForza ? 'Lista Invitados · $150 DOMUS · $0 en Puerta' : 'Lista / Invitado $0';
        else if (channel === 'PREVENTA_DOMUS') label = 'Preventa Validada';
        btnConfirm.textContent = `✓ Validar Entrada (${label})`;
      }
    }

    // Actualizar sección de cambio en efectivo
    const cashInput = $('accessCashReceived');
    const changeDisplay = $('accessCashChangeText');
    if (cashInput && changeDisplay) {
      const received = parseFloat(cashInput.value) || 0;
      if (doorTotal === 0) {
        changeDisplay.textContent = '$0.00';
        changeDisplay.style.color = 'var(--emerald-400)';
      } else if (received > 0 && received >= doorTotal) {
        changeDisplay.textContent = `$${(received - doorTotal).toFixed(2)}`;
        changeDisplay.style.color = 'var(--emerald-400)';
      } else if (received > 0 && received < doorTotal) {
        changeDisplay.textContent = `Faltan $${(doorTotal - received).toFixed(2)}`;
        changeDisplay.style.color = 'var(--rose-400)';
      } else {
        changeDisplay.textContent = '$0.00';
        changeDisplay.style.color = 'var(--emerald-400)';
      }
    }
  }

  function updateAccesosKpis() {
    const activeAct = STATE.activeActivity;
    // Filtrar únicamente registros reales del evento en curso
    const records = (STATE.recentAccessList || []).filter(r => {
      if (!isRealAccessRecord(r)) return false;
      return !activeAct || r.activity === activeAct;
    });
    
    // 1. Total Attendance (aforo real acumulado para este evento)
    const totalAttendance = records.reduce((sum, r) => sum + (Number(r.persons) || Number(r.packages) || 1), 0);
    if ($('kpiTotalAttendance')) $('kpiTotalAttendance').textContent = totalAttendance;

    // 2. Active Wardrobe (prendas en custodia para este evento)
    const activeWardrobe = records.reduce((sum, r) => {
      if (!r.wardrobeReturned && !r.devuelto && Number(r.wardrobeQty) > 0) {
        return sum + Number(r.wardrobeQty);
      }
      return sum;
    }, 0);
    if ($('kpiActiveWardrobe')) $('kpiActiveWardrobe').textContent = activeWardrobe;
    if ($('wardrobeBadgeCount')) $('wardrobeBadgeCount').textContent = activeWardrobe;

    // 3. Validated Presales & Externas
    const presales = records.filter(r => r.salesChannel === 'BOLETERA_EXTERNA' || r.salesChannel === 'PREVENTA_DOMUS' || r.entryType === 'Preventa' || r.salesChannel === 'LISTA').length;
    if ($('kpiValidatedPresales')) $('kpiValidatedPresales').textContent = presales;

    // 4. Total Door Revenue / Liquidación
    const totalDoorRev = records.reduce((sum, r) => sum + (Number(r.doorCollected !== undefined ? r.doorCollected : (r.amountPaidAtDoor !== undefined ? r.amountPaidAtDoor : r.paid)) || 0), 0);
    
    // Si es FORZA, reflejar en el KPI la cuota acumulada generada para DOMUS ($150 por persona no cortesía)
    const isForza = (activeAct || '').toLowerCase().includes('forza');
    if (isForza) {
      const payableCount = records
        .filter(r => r.salesChannel !== 'CORTESIA')
        .reduce((sum, r) => sum + (Number(r.persons) || Number(r.packages) || 1), 0);
      const feeTotal = payableCount * 150;
      
      if ($('kpiTotalAdmissionRevenue')) {
        $('kpiTotalAdmissionRevenue').textContent = `$${feeTotal.toFixed(2)}`;
      }
      if ($('kpiRevenueLabel')) {
        $('kpiRevenueLabel').textContent = `Cuota DOMUS ($150 × ${payableCount})`;
      }
    } else {
      if ($('kpiTotalAdmissionRevenue')) $('kpiTotalAdmissionRevenue').textContent = `$${totalDoorRev.toFixed(2)}`;
      if ($('kpiRevenueLabel')) $('kpiRevenueLabel').textContent = 'Taquilla Hoy';
    }

    updateAccesosBadge();
  }

  let isRegisteringAccess = false;

  function confirmAccessAndRegister() {
    if (isRegisteringAccess) {
      console.warn('Registro de acceso bloqueado: debounce activo.');
      return;
    }

    let customer = ($('accessCustomerName') ? $('accessCustomerName').value : '').trim();
    if (!customer) {
      toast('⚠️ Por favor ingresa el nombre o alias del asistente antes de confirmar.', 'warn');
      if ($('accessCustomerName')) $('accessCustomerName').focus();
      return;
    }

    isRegisteringAccess = true;
    const btnConfirm = $('btnConfirmAccess');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.dataset.origText = btnConfirm.textContent;
      btnConfirm.textContent = '⏳ Registrando...';
    }

    const unlockBtn = () => {
      isRegisteringAccess = false;
      if (btnConfirm) {
        btnConfirm.disabled = false;
        if (btnConfirm.dataset.origText) btnConfirm.textContent = btnConfirm.dataset.origText;
        updateAccessSummary();
      }
    };

    // Auto-desbloqueo de seguridad a los 1.5s
    setTimeout(unlockBtn, 1500);

    // Generar folio atómico previo para fallbacks
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const rowId = `A-${randNum}`;

    const channel = STATE.accessSalesChannel || 'BOLETERA_EXTERNA';
    const phone = ($('accessCustomerPhone') ? $('accessCustomerPhone').value : '').trim();
    const email = ($('accessCustomerEmail') ? $('accessCustomerEmail').value : '').trim();
    const ticketTypeId = STATE.accessSelectedType || 'General';
    const wardrobeQty = STATE.accessWardrobeQty || 0;
    const wardrobeNotes = ($('accessWardrobeNotes') ? $('accessWardrobeNotes').value : '').trim();
    const method = STATE.accessPaymentMethod || 'Efectivo';

    let externalTicketId = '';
    let ticketProvider = 'DOMUS';
    let courtesyAuth = '';
    let paymentStatus = 'CONFIRMADA';
    let paymentReference = '';

    if (channel === 'BOLETERA_EXTERNA') {
      externalTicketId = ($('accessExternalTicketId') ? $('accessExternalTicketId').value : '').trim();
      ticketProvider = ($('accessTicketProvider') ? $('accessTicketProvider').value : 'Boletia');
      if (!externalTicketId) {
        externalTicketId = `BOL-${rowId}`;
      }
      paymentStatus = 'PAGADO_EXTERNAMENTE';
    } else if (channel === 'PREVENTA_DOMUS') {
      externalTicketId = ($('accessPresaleDomusFolio') ? $('accessPresaleDomusFolio').value : '').trim();
      if (!externalTicketId) {
        externalTicketId = `PRE-${rowId}`;
      }
      paymentStatus = 'CONFIRMADA';
    } else if (channel === 'TRANSFERENCIA_DIRECTA') {
      paymentReference = ($('accessTransferRef') ? $('accessTransferRef').value : '').trim() || `TRF-${rowId}`;
      paymentStatus = ($('accessTransferStatus') ? $('accessTransferStatus').value : 'CONFIRMADA');
    } else if (channel === 'CORTESIA') {
      courtesyAuth = ($('accessCourtesyAuth') ? $('accessCourtesyAuth').value : '').trim() || 'Dirección';
      const courtesyReason = ($('accessCourtesyReason') ? $('accessCourtesyReason').value : '').trim();
      courtesyAuth = `${courtesyAuth}${courtesyReason ? ' · ' + courtesyReason : ''}`;
      paymentStatus = 'CONFIRMADA';
    }

    const ev = getActiveEvent();
    const pGua = (ev.priceGuardarropa !== undefined && ev.priceGuardarropa !== null && ev.priceGuardarropa !== '') ? Number(ev.priceGuardarropa) : 0;
    const { faceValue, persons, doorEntryCharge, wardrobeCost, doorTotal, commercialTotal } = calculateAccessSubtotal();

    const ticketGuardarropa = wardrobeQty > 0 ? `GUA-${rowId}` : '';

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newRecord = {
      id: rowId,
      date: dateStr,
      activity: STATE.activeActivity || 'Forza · sábado',
      customer: customer,
      email: email,
      phone: phone,
      salesChannel: channel,
      ticketTypeId: ticketTypeId,
      entryType: ticketTypeId,
      ticketProvider: ticketProvider,
      externalTicketId: externalTicketId,
      persons: persons,
      packages: persons,
      faceValue: faceValue,
      doorEntryCharge: doorEntryCharge,
      entryCost: doorEntryCharge,
      wardrobeQty: wardrobeQty,
      wardrobeNotes: wardrobeNotes,
      wardrobeUnitPrice: pGua,
      wardrobeAmount: wardrobeCost,
      wardrobeCost: wardrobeCost,
      doorCollected: doorTotal,
      commercialTotal: commercialTotal,
      paid: doorTotal,
      totalAmount: doorTotal,
      due: 0,
      paymentMethod: (doorTotal > 0 ? method : (channel === 'BOLETERA_EXTERNA' ? 'Externo' : 'Gratis')),
      method: (doorTotal > 0 ? method : (channel === 'BOLETERA_EXTERNA' ? 'Externo' : 'Gratis')),
      paymentStatus: paymentStatus,
      paymentReference: paymentReference,
      courtesyAuth: courtesyAuth,
      ticketGuardarropa: ticketGuardarropa,
      wardrobeReturned: false
    };

    // Prepend to local state
    STATE.recentAccessList.unshift(newRecord);

    try {
      localStorage.setItem('domus_custom_access', JSON.stringify(STATE.recentAccessList.slice(0, 50)));
    } catch (e) {}

    // Backend call con Idempotencia
    callBackend('accesoSimpleRegistrar', [newRecord], res => {
      unlockBtn();
      if (res && res.rowId) {
        const oldId = newRecord.id;
        newRecord.id = res.rowId;
        newRecord.rowId = res.rowId;
        if (res.ticketGuardarropa) newRecord.ticketGuardarropa = res.ticketGuardarropa;
        const foundIdx = (STATE.recentAccessList || []).findIndex(r => r.id === oldId);
        if (foundIdx !== -1) {
          STATE.recentAccessList[foundIdx] = newRecord;
        }
        try {
          localStorage.setItem('domus_custom_access', JSON.stringify(STATE.recentAccessList.slice(0, 50)));
        } catch (e) {}
      }
      toast(`Acceso registrado exitosamente: Folio ${newRecord.id}`, 'ok');
      playChime('success');
      syncBackendData();
    }, err => {
      unlockBtn();
      console.warn('Registro local de acceso (modo offline o sincronización diferida):', err);
      toast(`Acceso registrado localmente: Folio ${newRecord.id}`, 'ok');
      playChime('success');
    });

    // Reset Form
    if ($('accessCustomerName')) $('accessCustomerName').value = '';
    if ($('accessCustomerPhone')) $('accessCustomerPhone').value = '';
    if ($('accessCustomerEmail')) $('accessCustomerEmail').value = '';
    if ($('accessExternalTicketId')) $('accessExternalTicketId').value = '';
    if ($('accessPresaleDomusFolio')) $('accessPresaleDomusFolio').value = '';
    if ($('accessTransferRef')) $('accessTransferRef').value = '';
    if ($('accessCourtesyAuth')) $('accessCourtesyAuth').value = '';
    if ($('accessCourtesyReason')) $('accessCourtesyReason').value = '';
    if ($('accessWardrobeNotes')) $('accessWardrobeNotes').value = '';
    if ($('accessCashReceived')) $('accessCashReceived').value = '';

    setAccessSalesChannel(channel);
    setWardrobeQty(0);
    renderAccesosView();

    // Modal de comprobante / ticket
    openAccessReceiptModal(newRecord);
  }

  // --- TABS DE OPERACIONES (Ingresos Hoy, Guardarropa Activo, Eventos & Tarifas) ---

  function setAccessTab(tabName) {
    STATE.accessTab = tabName;

    $('tabBtnAccessLog').classList.toggle('active', tabName === 'log');
    $('tabBtnWardrobe').classList.toggle('active', tabName === 'wardrobe');
    $('tabBtnEvents').classList.toggle('active', tabName === 'events');

    $('panelAccessLog').classList.toggle('hidden', tabName !== 'log');
    $('panelWardrobe').classList.toggle('hidden', tabName !== 'wardrobe');
    $('panelEvents').classList.toggle('hidden', tabName !== 'events');

    renderAccessTab();
  }

  function renderAccessTab() {
    if (STATE.accessTab === 'log') {
      renderAccessLogTable();
    } else if (STATE.accessTab === 'wardrobe') {
      renderWardrobeTable();
    } else if (STATE.accessTab === 'events') {
      renderEventsTable();
    }
  }

  function renderAccessLogTable() {
    const tbody = $('accessLogTableBody');
    if (!tbody) return;

    const activeAct = STATE.activeActivity;
    const q = (STATE.accessSearch || '').toLowerCase().trim();
    const records = (STATE.recentAccessList || []).filter(r => {
      if (!isRealAccessRecord(r)) return false;
      if (q) {
        const haystack = `${r.id} ${r.customer} ${r.phone} ${r.email} ${r.entryType} ${r.method} ${r.activity || ''} ${r.ticketGuardarropa || ''}`.toLowerCase();
        return haystack.includes(q);
      }
      return !activeAct || r.activity === activeAct;
    });

    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 36px 16px;">
            <div style="font-size: 2.2rem; margin-bottom: 8px;">🎟️</div>
            <strong style="color: var(--text-primary); font-size: 1rem;">No hay ingresos registrados todavía para ${escapeHtml(activeAct || 'este evento')}</strong>
            <p style="font-size: 0.82rem; margin-top: 6px; color: var(--text-secondary);">El aforo actual es 0. Registra o valida el primer boleto usando el formulario de la izquierda.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const entryType = r.entryType || r.ticketTypeId || 'General';
      const typeBadge = `<span class="badge-entry-type ${getEntryTypeBadgeClass(entryType)}">${escapeHtml(entryType)}</span>`;
      const isReturned = !!(r.devuelto || r.wardrobeReturned);
      const guaBadge = r.ticketGuardarropa
        ? `<span class="badge-wardrobe-ticket ${isReturned ? 'returned' : ''}">🧥 ${escapeHtml(r.ticketGuardarropa)} (${r.wardrobeQty || 1})</span>`
        : '<span style="color: var(--text-muted); font-size: 0.8rem;">---</span>';

      const timeOnly = (r.date || '').split(' ')[1] || r.date || '';
      const amountPaid = (r.paid !== undefined && r.paid !== null && r.paid !== '') 
        ? Number(r.paid) 
        : ((r.amountPaidAtDoor !== undefined && r.amountPaidAtDoor !== null && r.amountPaidAtDoor !== '') 
            ? Number(r.amountPaidAtDoor) 
            : ((r.doorCollected !== undefined && r.doorCollected !== null && r.doorCollected !== '') 
                ? Number(r.doorCollected) 
                : Number(r.totalAmount || 0)));

      return `
        <tr>
          <td><strong style="color: var(--gold-primary);">${escapeHtml(r.id)}</strong></td>
          <td style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(timeOnly)}</td>
          <td>
            <strong>${escapeHtml(r.customer)}</strong>
            ${r.salesChannel === 'CORTESIA' 
              ? '<span class="badge-cortesia" style="font-size: 0.65rem; padding: 2px 6px; margin-left: 5px; border-radius: 4px;">⭐ Cortesía ($0)</span>' 
              : (r.salesChannel === 'LISTA' || r.salesChannel === 'BOLETERA_EXTERNA' 
                  ? '<span class="badge-preventa" style="font-size: 0.65rem; padding: 2px 6px; margin-left: 5px; border-radius: 4px;">📋 Lista ($150)</span>' 
                  : '')}
            ${r.courtesyAuth ? `<div style="font-size: 0.72rem; color: var(--amber-400);">⭐ Aut: ${escapeHtml(r.courtesyAuth)}</div>` : ''}
            ${r.phone ? `<div style="font-size: 0.75rem; color: var(--text-muted);">📞 ${escapeHtml(r.phone)}</div>` : ''}
          </td>
          <td>${typeBadge}</td>
          <td>${guaBadge}</td>
          <td><strong style="color: var(--emerald-400);">$${amountPaid.toFixed(2)}</strong></td>
          <td style="font-size: 0.82rem;">${escapeHtml(r.paymentMethod || r.method || 'Efectivo')}</td>
          <td style="white-space: nowrap;">
            <button type="button" class="btn-table-action" onclick="window.__domusApp.editAccessRecord('${escapeHtml(r.id)}')" title="Editar asistente / canal / cortesía" style="color: var(--amber-400); margin-right: 4px;">
              ✏️
            </button>
            <button type="button" class="btn-table-action" onclick="window.__domusApp.deleteAccessRecord('${escapeHtml(r.id)}')" title="Eliminar / descartar registro" style="color: var(--rose-400); margin-right: 4px;">
              🗑️
            </button>
            <button type="button" class="btn-table-action" onclick="window.__domusApp.reprintAccessTicket('${escapeHtml(r.id)}')" title="Reimprimir Comprobante de Entrada">
              🖨️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getEntryTypeBadgeClass(type) {
    switch (type) {
      case 'General': return 'badge-general';
      case 'Pareja': return 'badge-pareja';
      case 'Trío': return 'badge-trio';
      case 'Preventa': return 'badge-preventa';
      case 'Cortesía': return 'badge-cortesia';
      case 'Solo guardarropa': return 'badge-guardarropa';
      default: return 'badge-general';
    }
  }

  function renderWardrobeTable() {
    const tbody = $('wardrobeTableBody');
    if (!tbody) return;

    const activeAct = STATE.activeActivity;
    const q = (STATE.accessSearch || '').toLowerCase().trim();
    const records = (STATE.recentAccessList || []).filter(r => {
      if (!isRealAccessRecord(r)) return false;
      if (!r.ticketGuardarropa || Number(r.wardrobeQty) <= 0) return false;
      if (q) {
        const haystack = `${r.ticketGuardarropa} ${r.customer} ${r.wardrobeNotes || ''} ${r.activity || ''}`.toLowerCase();
        return haystack.includes(q);
      }
      return !activeAct || r.activity === activeAct;
    });

    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 36px 16px;">
            <div style="font-size: 2.2rem; margin-bottom: 8px;">🧥</div>
            <strong style="color: var(--text-primary); font-size: 1rem;">No hay prendas en guardarropa para ${escapeHtml(activeAct || 'este evento')}</strong>
            <p style="font-size: 0.82rem; margin-top: 6px; color: var(--text-secondary);">Las prendas en custodia aparecerán aquí conforme se registren con su ticket.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const timeOnly = (r.date || '').split(' ')[1] || r.date || '';
      const isReturned = !!r.devuelto;

      return `
        <tr class="${isReturned ? 'wardrobe-returned-row' : ''}">
          <td>
            <span class="badge-wardrobe-ticket ${isReturned ? 'returned' : ''}" style="font-size: 0.95rem;">
              🧥 ${escapeHtml(r.ticketGuardarropa)}
            </span>
          </td>
          <td>
            <strong>${escapeHtml(r.customer)}</strong>
            ${r.wardrobeNotes ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(r.wardrobeNotes)}</div>` : ''}
          </td>
          <td><strong>${r.wardrobeQty} prenda${r.wardrobeQty > 1 ? 's' : ''}</strong></td>
          <td style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(timeOnly)}</td>
          <td>
            ${isReturned 
              ? '<span style="color: var(--text-muted); font-size: 0.82rem;">✅ Devuelto</span>'
              : '<span style="color: var(--amber-400); font-weight: 700; font-size: 0.82rem;">⏱️ En Custodia</span>'}
          </td>
          <td>
            ${isReturned
              ? '<button type="button" class="btn-table-action" disabled title="Prendas ya entregadas">Entregado</button>'
              : `<button type="button" class="btn-return-wardrobe" onclick="window.__domusApp.returnWardrobe('${escapeHtml(r.ticketGuardarropa)}')">
                   🧥 Marcar Devuelto
                 </button>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderEventsTable() {
    const tbody = $('eventsTableBody');
    if (!tbody) return;

    if (!STATE.eventsList || STATE.eventsList.length === 0) {
      STATE.eventsList = [...DEFAULT_EVENTS];
    }

    tbody.innerHTML = STATE.eventsList.map(ev => {
      const isActive = ev.name === STATE.activeActivity;

      return `
        <tr class="${isActive ? 'active-event-row' : ''}">
          <td>
            <strong>${escapeHtml(ev.name)}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(ev.type || '')} · ${escapeHtml(ev.organizer || 'DOMUS')}</div>
          </td>
          <td style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(ev.date || '---')}</td>
          <td><strong>$${Number(ev.priceGeneral || 0).toFixed(2)}</strong></td>
          <td><strong>$${Number(ev.pricePareja || 0).toFixed(2)}</strong></td>
          <td><strong>$${Number(ev.priceTrio || 0).toFixed(2)}</strong></td>
          <td><span style="color: var(--gold-primary);">$${Number(ev.priceGuardarropa || 50).toFixed(2)}</span></td>
          <td style="font-size: 0.82rem;">${ev.capacity || 150} pers.</td>
          <td>
            ${isActive 
              ? '<span class="badge-active-event">⭐ Activo Ahora</span>'
              : `<button type="button" class="btn-set-active-event" onclick="window.__domusApp.setActiveEvent('${escapeHtml(ev.name)}')">
                   Fijar Activo
                 </button>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  function changeActiveEvent(eventName) {
    STATE.activeActivity = eventName;
    localStorage.setItem('domus_active_event', eventName);
    toast(`Evento activo de turno: ${eventName}`, 'ok');

    const ev = getActiveEvent();
    if (ev && ev.salesChannel) {
      STATE.accessSalesChannel = ev.salesChannel;
    } else if (eventName.includes('Forza')) {
      STATE.accessSalesChannel = 'BOLETERA_EXTERNA';
    }

    callBackend('accesoCambiarActividad', [{ activity: eventName }], res => {
      // Backend updated
    }, err => console.warn('Cambio de evento local:', err));

    renderAccesosView();
  }

  function returnWardrobeItems(ticketGua) {
    const rec = (STATE.recentAccessList || []).find(r => r.ticketGuardarropa === ticketGua);
    if (!rec) {
      toast('Ticket de guardarropa no encontrado.', 'error');
      return;
    }

    rec.devuelto = true;
    try {
      localStorage.setItem('domus_custom_access', JSON.stringify(STATE.recentAccessList.slice(0, 50)));
    } catch (e) {}

    toast(`Prendas devueltas para ticket: ${ticketGua}`, 'ok');
    playChime('success');

    callBackend('guardarropaDevolver', [ticketGua], res => {
      // Backend updated
    }, err => console.warn('Devolución guardarropa local:', err));

    updateAccesosKpis();
    renderAccessTab();
  }

  // --- MODAL: COMPROBANTE DE ACCESO Y GUARDARROPA ---

  function openAccessReceiptModal(record) {
    if (!record) return;
    const modal = $('accessReceiptModal');
    if (!modal) return;

    const entryType = record.entryType || record.ticketTypeId || 'General';
    const persons = record.persons || record.packages || 1;
    const entryCost = record.entryCost !== undefined ? record.entryCost : (record.doorEntryCharge || 0);
    const wardrobeCost = record.wardrobeCost !== undefined ? record.wardrobeCost : (record.wardrobeAmount || 0);
    const totalPaid = record.paid !== undefined ? record.paid : (record.doorCollected !== undefined ? record.doorCollected : (record.totalAmount || 0));

    if ($('accessTicketFolio')) $('accessTicketFolio').textContent = `TICKET: ${record.id}`;
    if ($('accessTicketEvent')) $('accessTicketEvent').textContent = `EVENTO: ${record.activity || 'DOMUS'}`;
    if ($('accessTicketCustomer')) $('accessTicketCustomer').textContent = `ASISTENTE: ${record.customer || 'General'}`;
    if ($('accessTicketDate')) $('accessTicketDate').textContent = `FECHA: ${record.date || ''}`;

    // Itemized Details
    const detailsContainer = $('accessTicketDetailsList');
    if (detailsContainer) {
      let html = `
        <div class="receipt-item-row">
          <span>Entrada: ${escapeHtml(entryType)} (${persons} pers.)</span>
          <span>$${Number(entryCost).toFixed(2)}</span>
        </div>
      `;
      if (record.wardrobeQty > 0) {
        html += `
          <div class="receipt-item-row">
            <span>Guardarropa (${record.wardrobeQty} prendas)</span>
            <span>$${Number(wardrobeCost).toFixed(2)}</span>
          </div>
        `;
      }
      if (record.externalTicketId) {
        html += `<div style="font-size: 0.72rem; color: #4b5563; padding: 2px 0;">Folio Ext: ${escapeHtml(record.externalTicketId)}</div>`;
      }
      if (record.courtesyAuth) {
        html += `<div style="font-size: 0.72rem; color: #4b5563; padding: 2px 0;">Cortesía: ${escapeHtml(record.courtesyAuth)}</div>`;
      }
      detailsContainer.innerHTML = html;
    }

    if ($('accessTicketTotalAmount')) $('accessTicketTotalAmount').textContent = `$${Number(totalPaid).toFixed(2)}`;

    const payInfo = $('accessTicketPaymentInfo');
    if (payInfo) {
      payInfo.innerHTML = `
        <div>Método: <strong>${escapeHtml(record.method || record.paymentMethod || 'Efectivo')}</strong></div>
        <div style="font-size: 0.7rem; color: #6b7280; margin-top: 4px;">DOMUS Centro Cultural &middot; Ciudad de México</div>
      `;
    }

    // Wardrobe Tear-Off Stub
    const stub = $('wardrobeTearOffStub');
    if (stub) {
      if (record.wardrobeQty > 0 && record.ticketGuardarropa) {
        stub.style.display = 'block';
        if ($('stubWardrobeTicket')) $('stubWardrobeTicket').textContent = record.ticketGuardarropa;
        if ($('stubWardrobeQty')) $('stubWardrobeQty').textContent = `${record.wardrobeQty} Prenda${record.wardrobeQty > 1 ? 's' : ''}`;
        if ($('stubWardrobeNotes')) $('stubWardrobeNotes').textContent = record.wardrobeNotes || '';
      } else {
        stub.style.display = 'none';
      }
    }

    modal.classList.add('open');
  }

  function closeAccessReceiptModal() {
    const modal = $('accessReceiptModal');
    if (modal) modal.classList.remove('open');
  }

  function reprintAccessTicket(rowId) {
    const rec = (STATE.recentAccessList || []).find(r => r.id === rowId);
    if (rec) {
      openAccessReceiptModal(rec);
    } else {
      toast('Ticket no encontrado.', 'error');
    }
  }

  // --- MODAL: ALTA Y CONFIGURACIÓN DE NUEVO EVENTO ---

  function openNewEventModal() {
    const modal = $('newEventModal');
    if (!modal) return;

    $('eventFormName').value = '';
    $('eventFormDate').value = new Date().toISOString().slice(0, 10);
    $('eventFormType').value = 'Fiesta temática';
    $('eventFormOrganizer').value = 'DOMUS';
    $('eventFormCapacity').value = '150';
    $('eventFormPriceGeneral').value = '150';
    $('eventFormPricePareja').value = '260';
    $('eventFormPriceTrio').value = '360';
    $('eventFormPriceWardrobe').value = '50';
    $('eventFormNotes').value = '';

    modal.classList.add('open');
    $('eventFormName').focus();
  }

  function closeNewEventModal() {
    const modal = $('newEventModal');
    if (modal) modal.classList.remove('open');
  }

  function saveNewEvent() {
    const name = ($('eventFormName').value || '').trim();
    const date = $('eventFormDate').value;
    const type = $('eventFormType').value;
    const organizer = ($('eventFormOrganizer').value || 'DOMUS').trim();
    const capacity = parseInt($('eventFormCapacity').value, 10) || 150;
    const priceGeneral = parseFloat($('eventFormPriceGeneral').value) || 0;
    const pricePareja = parseFloat($('eventFormPricePareja').value) || 0;
    const priceTrio = parseFloat($('eventFormPriceTrio').value) || 0;
    const priceWardrobe = parseFloat($('eventFormPriceWardrobe').value) || 50;
    const notes = ($('eventFormNotes').value || '').trim();

    if (!name) {
      toast('Ingresa el nombre del evento.', 'warn');
      $('eventFormName').focus();
      return;
    }
    if (!date) {
      toast('Selecciona la fecha del evento.', 'warn');
      $('eventFormDate').focus();
      return;
    }

    const newEv = {
      name: name,
      date: date,
      type: type,
      organizer: organizer,
      priceGeneral: priceGeneral,
      pricePareja: pricePareja,
      priceTrio: priceTrio,
      priceGuardarropa: priceWardrobe,
      capacity: capacity,
      notes: notes,
      status: 'Confirmado'
    };

    // Prepend to events list & set as active
    STATE.eventsList.unshift(newEv);
    STATE.activeActivity = name;
    localStorage.setItem('domus_active_event', name);

    try {
      localStorage.setItem('domus_custom_events', JSON.stringify(STATE.eventsList.slice(0, 30)));
    } catch (e) {}

    toast(`Evento "${name}" guardado exitosamente.`, 'ok');
    playChime('success');
    closeNewEventModal();

    callBackend('registrarNuevoEvento', [newEv], res => {
      syncBackendData();
    }, err => {
      console.warn('Evento registrado en modo local:', err);
    });

    renderAccesosView();
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Mode Switcher
    $('btnModeCaja').addEventListener('click', () => setMode('caja'));
    $('btnModeComandas').addEventListener('click', () => setMode('comandas'));

    // Bloquear Caja Button
    const btnLock = $('btnLockCaja');
    if (btnLock) {
      btnLock.addEventListener('click', lockCajaOnDevice);
    }

    // Modal de Bloqueo de Caja / PIN Keypad
    $('btnSubmitCajaPin').addEventListener('click', unlockCajaWithPin);
    $('btnCancelCajaUnlock').addEventListener('click', () => {
      closeCajaLockModal();
      setMode('comandas');
    });

    $('cajaPinInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') unlockCajaWithPin();
    });

    // Teclado numérico táctil
    document.querySelectorAll('.pin-key-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const input = $('cajaPinInput');
        if (input.value.length < 20) {
          input.value += key;
        }
      });
    });

    $('btnPinClear').addEventListener('click', () => {
      $('cajaPinInput').value = '';
      $('cajaPinError').textContent = '';
      $('cajaPinInput').focus();
    });

    $('btnPinBackspace').addEventListener('click', () => {
      const input = $('cajaPinInput');
      input.value = input.value.slice(0, -1);
      input.focus();
    });

    // Staff Selector
    $('staffSelect').addEventListener('change', e => {
      STATE.operator = e.target.value;
      sessionStorage.setItem('domus_operator', STATE.operator);
    });

    // Sound Toggle
    $('btnToggleSound').addEventListener('click', () => {
      STATE.sound = !STATE.sound;
      localStorage.setItem('domus_sound', String(STATE.sound));
      $('btnToggleSound').classList.toggle('active', STATE.sound);
      $('btnToggleSound').textContent = STATE.sound ? '🔔 Sonido: On' : '🔕 Sonido: Off';
      if (STATE.sound) playChime('alert');
    });
    if (STATE.sound) {
      $('btnToggleSound').classList.add('active');
      $('btnToggleSound').textContent = '🔔 Sonido: On';
    }

    // Phase Switcher (Solar / Lunar) — persistente y validado por servidor
    $('btnPhaseToggle').addEventListener('click', async () => {
      const stationRole = getStationRole();
      if (!['GERENCIA', 'ADMIN'].includes(stationRole)) {
        toast('Cambio Solar/Lunar reservado a Gerencia. Solicita autorización.', 'error');
        return;
      }
      const nextPhase = STATE.phase === 'Solar' ? 'Lunar' : 'Solar';
      const previousPhase = STATE.phase;
      const btn = $('btnPhaseToggle');
      if (btn) btn.disabled = true;

      try {
        const res = await gasCall('operatingProfileSet', [{
          id: 'PROFILE-' + Date.now(),
          profile: nextPhase
        }]);

        const current = res && res.current ? res.current : null;
        STATE.phase = current && current.profile ? current.profile : nextPhase;
        $('currentPhaseBadge').textContent = `Fase ${STATE.phase}`;
        toast(`Perfil operativo cambiado a ${STATE.phase}`, 'ok');

        await loadCajaData();
        renderCatalog();
        renderCart();
      } catch (err) {
        STATE.phase = previousPhase;
        $('currentPhaseBadge').textContent = `Fase ${STATE.phase}`;
        toast('No se pudo cambiar la fase: ' + (err.message || err), 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // Botón Reintentar Outbox (Issue #1 - FASE 1.G):
    // Reintentar ÚNICAMENTE LOCAL_PENDING y RETRY. NUNCA REQUIRES_REVIEW ni CONFIRMED.
    const btnRetryOutbox = $('btnOutboxRetry');
    if (btnRetryOutbox) {
      btnRetryOutbox.addEventListener('click', () => {
        let retriedCount = 0;
        const queue = getOutbox().map(it => {
          if (it.status === 'RETRY' || it.status === 'LOCAL_PENDING') {
            it.status = 'RETRY';
            it.attempts = 0;
            retriedCount++;
          }
          return it;
        });
        saveOutbox(queue);
        if (retriedCount > 0) {
          toast(`Reintentando ${retriedCount} operación(es) transitorias pendientes…`, 'ok');
          processOutbox();
        } else {
          toast('No hay operaciones transitorias pendientes para reintentar.', 'info');
        }
      });
    }

    const btnClearOutbox = $('btnOutboxClear');
    if (btnClearOutbox) {
      btnClearOutbox.addEventListener('click', () => {
        const queue = getOutbox();
        const reviewItems = queue.filter(q => q.status === 'REQUIRES_REVIEW');
        saveOutbox(reviewItems); // Issue #1: REQUIRES_REVIEW debe persistir y no ser purgado
        updateOutboxUI();
        updateSyncPill('ok');
        toast('Operaciones pendientes descartadas. Los registros en revisión manual se conservan.', 'ok');
      });
    }

    $('btnSyncNow').addEventListener('click', () => {
      toast('Sincronizando con Google…', 'ok');
      syncBackendData();
    });

    // Search Input
    $('catalogSearchInput').addEventListener('input', e => {
      STATE.searchQuery = e.target.value;
      renderCatalog();
    });

    // Account Selector
    $('openAccountsSelect').addEventListener('change', e => {
      STATE.selectedAccountTicket = e.target.value;
      if (STATE.selectedAccountTicket) {
        const acc = STATE.openAccounts.find(a => a.ticket === STATE.selectedAccountTicket);
        if (acc) {
          $('customerNameInput').value = acc.customer || '';
          $('activitySelect').value = acc.activity || 'Visita general DOMUS';
        }
      }
    });

    // Clear Cart
    $('btnClearCart').addEventListener('click', clearCart);

    // Open Payment Modal
    $('btnOpenPaymentModal').addEventListener('click', openPaymentModal);
    $('btnClosePayModal').addEventListener('click', closePaymentModal);
    $('btnCancelPayment').addEventListener('click', closePaymentModal);

    // Payment Methods Selection
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setPaymentMethod(btn.getAttribute('data-method'));
        updateChangeDisplay();
      });
    });

    // Cash Calculator inputs
    $('cashReceivedInput').addEventListener('input', updateChangeDisplay);
    $('cashTipInput').addEventListener('input', updateChangeDisplay);

    // Preset Cash Buttons ($50, $100, $200, $500, Exacto)
    document.querySelectorAll('.btn-cash-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (val === 'exact') {
          $('cashReceivedInput').value = calculateCartTotal().toFixed(2);
        } else {
          $('cashReceivedInput').value = parseFloat(val).toFixed(2);
        }
        updateChangeDisplay();
      });
    });

    // Confirm Payment
    $('btnConfirmChargeAndSend').addEventListener('click', () => confirmPaymentAndDispatch(true));
    $('btnSendPendingPayment').addEventListener('click', () => confirmPaymentAndDispatch(false));

    // Receipt Close & Print
    $('btnCloseReceipt').addEventListener('click', () => $('receiptModal').classList.remove('open'));
    $('btnPrintReceipt').addEventListener('click', () => window.print());

    // KDS Tabs
    document.querySelectorAll('.kds-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.kds-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.kdsFilterState = btn.getAttribute('data-tab');
        renderComandasBoard();
      });
    });

    // KDS Destination Filter
    $('kdsDestFilter').addEventListener('change', e => {
      STATE.kdsFilterDest = e.target.value;
      renderComandasBoard();
    });

    // KDS Search
    $('kdsSearchInput').addEventListener('input', e => {
      STATE.kdsSearch = e.target.value;
      renderComandasBoard();
    });

    // Config Modal
    $('btnOpenSettings').addEventListener('click', openConfigModal);
    $('btnCloseConfig').addEventListener('click', () => $('configModal').classList.remove('open'));
    $('btnSaveConfig').addEventListener('click', saveConfig);

    const btnSyncCarta = $('btnSyncOfficialCarta');
    if (btnSyncCarta) {
      btnSyncCarta.addEventListener('click', () => {
        toast('Iniciando sincronización con la Carta Oficial de DOMUS…', 'ok');
        callBackend('sincronizarCartaConCatalogoDOMUS', [], res => {
          toast(res.message || 'Catálogo e Inventario actualizados exitosamente en Google Sheets.', 'ok');
          playChime('success');
          syncBackendData();
        }, err => {
          toast('Error en sincronización: ' + (err.message || String(err)), 'error');
        });
      });
    }

    // Modal Alta / Registro de Nuevo Producto (Admin Caja)
    const btnOpenNewProd = $('btnOpenNewProductModal');
    if (btnOpenNewProd) {
      btnOpenNewProd.addEventListener('click', openNewProductModal);
    }
    const btnCloseNewProd = $('btnCloseNewProductModal');
    if (btnCloseNewProd) {
      btnCloseNewProd.addEventListener('click', closeNewProductModal);
    }
    const btnCancelNewProd = $('btnCancelNewProduct');
    if (btnCancelNewProd) {
      btnCancelNewProd.addEventListener('click', closeNewProductModal);
    }
    const btnSaveNewProd = $('btnSaveNewProduct');
    if (btnSaveNewProd) {
      btnSaveNewProd.addEventListener('click', saveNewProduct);
    }
    const selectNewCat = $('newProdCategory');
    if (selectNewCat) {
      selectNewCat.addEventListener('change', e => {
        const customWrapper = $('customCatWrapper');
        if (customWrapper) {
          const isNew = e.target.value === '__NEW__';
          customWrapper.classList.toggle('hidden', !isNew);
          if (isNew) {
            $('newProdCustomCategory').focus();
          }
        }
      });
    }

    // --- MODO ACCESOS, EVENTOS Y GUARDARROPA ---
    if ($('btnModeAccesos')) {
      $('btnModeAccesos').addEventListener('click', () => setMode('accesos'));
    }

    if ($('accessActivitySelect')) {
      $('accessActivitySelect').addEventListener('change', e => changeActiveEvent(e.target.value));
    }

    // Wardrobe Selector Buttons
    document.querySelectorAll('#wardrobeSelectorGroup .wardrobe-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setWardrobeQty(parseInt(btn.getAttribute('data-qty'), 10));
      });
    });

    // Payment Methods for Access
    document.querySelectorAll('.payment-method-btn[data-access-method]').forEach(btn => {
      btn.addEventListener('click', () => {
        setAccessPaymentMethod(btn.getAttribute('data-access-method'));
      });
    });

    // Cash Calculator for Access
    if ($('accessCashReceived')) {
      $('accessCashReceived').addEventListener('input', updateAccessSummary);
    }

    // Confirm Access & Register Button (gestionado dinámicamente en renderAccesosView para evitar listeners duplicados)

    // Operations Tabs
    if ($('tabBtnAccessLog')) $('tabBtnAccessLog').addEventListener('click', () => setAccessTab('log'));
    if ($('tabBtnWardrobe')) $('tabBtnWardrobe').addEventListener('click', () => setAccessTab('wardrobe'));
    if ($('tabBtnEvents')) $('tabBtnEvents').addEventListener('click', () => setAccessTab('events'));

    // Search Inputs for Tabs
    if ($('accessLogSearchInput')) {
      $('accessLogSearchInput').addEventListener('input', e => {
        STATE.accessSearch = e.target.value;
        renderAccessLogTable();
      });
    }
    if ($('wardrobeSearchInput')) {
      $('wardrobeSearchInput').addEventListener('input', e => {
        STATE.accessSearch = e.target.value;
        renderWardrobeTable();
      });
    }

    // Modals: Eventos
    if ($('btnOpenNewEventModal')) $('btnOpenNewEventModal').addEventListener('click', openNewEventModal);
    if ($('btnOpenNewEventModal2')) $('btnOpenNewEventModal2').addEventListener('click', openNewEventModal);
    if ($('btnCloseNewEventModal')) $('btnCloseNewEventModal').addEventListener('click', closeNewEventModal);
    if ($('btnCancelNewEvent')) $('btnCancelNewEvent').addEventListener('click', closeNewEventModal);
    if ($('btnSaveNewEvent')) $('btnSaveNewEvent').addEventListener('click', saveNewEvent);

    // Modals: Access Receipt
    if ($('btnCloseAccessReceipt')) $('btnCloseAccessReceipt').addEventListener('click', closeAccessReceiptModal);
    if ($('btnDismissAccessReceipt')) $('btnDismissAccessReceipt').addEventListener('click', closeAccessReceiptModal);
    if ($('btnPrintAccessReceipt')) $('btnPrintAccessReceipt').addEventListener('click', () => window.print());

    // Modals: Edit Access Record
    if ($('btnCloseEditAccessModal')) $('btnCloseEditAccessModal').addEventListener('click', closeEditAccessModal);
    if ($('btnCancelEditAccess')) $('btnCancelEditAccess').addEventListener('click', closeEditAccessModal);
    if ($('btnSaveEditAccess')) $('btnSaveEditAccess').addEventListener('click', saveEditAccessRecord);
    if ($('btnDeleteAccessFromModal')) {
      $('btnDeleteAccessFromModal').addEventListener('click', () => {
        const id = $('editAccessId').value;
        closeEditAccessModal();
        deleteAccessRecord(id);
      });
    }
    if ($('editAccessChannel')) $('editAccessChannel').addEventListener('change', updateEditAccessModalSummary);
    if ($('editAccessPersons')) $('editAccessPersons').addEventListener('change', updateEditAccessModalSummary);
  }

  // --- CONTROLADOR DE EDICIÓN Y ELIMINACIÓN DE REGISTROS DE ACCESO ---

  function openEditAccessModal(id) {
    const rec = (STATE.recentAccessList || []).find(r => r.id === id);
    if (!rec) {
      toast(`No se encontró el registro ${id}`, 'warn');
      return;
    }

    if ($('editAccessId')) $('editAccessId').value = rec.id;
    if ($('editAccessFolioLabel')) $('editAccessFolioLabel').textContent = rec.id;
    if ($('editAccessTimeLabel')) $('editAccessTimeLabel').textContent = (rec.date || '').split(' ')[1] || rec.date || '';
    if ($('editAccessCustomer')) $('editAccessCustomer').value = rec.customer || '';
    if ($('editAccessPhone')) $('editAccessPhone').value = rec.phone || '';
    if ($('editAccessPersons')) $('editAccessPersons').value = String(rec.persons || 1);

    const channel = rec.salesChannel || (rec.entryType === 'Cortesía' ? 'CORTESIA' : 'BOLETERA_EXTERNA');
    if ($('editAccessChannel')) $('editAccessChannel').value = channel;

    if ($('editAccessCourtesyAuth')) $('editAccessCourtesyAuth').value = rec.courtesyAuth || '';
    if ($('editAccessCourtesyReason')) $('editAccessCourtesyReason').value = '';

    updateEditAccessModalSummary();
    if ($('editAccessModal')) $('editAccessModal').classList.add('open');
  }

  function closeEditAccessModal() {
    if ($('editAccessModal')) $('editAccessModal').classList.remove('open');
  }

  function updateEditAccessModalSummary() {
    const ev = getActiveEvent();
    const isForza = (ev.name || '').toLowerCase().includes('forza') || (ev.organizer || '').toUpperCase() === 'FORZA';
    const channel = $('editAccessChannel') ? $('editAccessChannel').value : 'BOLETERA_EXTERNA';
    const persons = parseInt($('editAccessPersons') ? $('editAccessPersons').value : '1', 10) || 1;
    const isCourtesy = channel === 'CORTESIA';

    if ($('editAccessCourtesySection')) {
      $('editAccessCourtesySection').classList.toggle('hidden', !isCourtesy);
    }

    const summaryEl = $('editAccessSummaryText');
    if (summaryEl) {
      if (isForza) {
        if (isCourtesy) {
          summaryEl.innerHTML = `<span style="color: var(--amber-400); font-weight: 700;">⭐ Cortesía Autorizada:</span> Exenta de cuota ($0 para DOMUS) · $0 en puerta.`;
        } else {
          const totalFee = 150 * persons;
          summaryEl.innerHTML = `<span style="color: var(--emerald-400); font-weight: 700;">✓ Cuota DOMUS FORZA:</span> Genera $150 × ${persons} = <strong>$${totalFee.toFixed(2)} MXN</strong> para DOMUS (liquidación) · $0 en puerta.`;
        }
      } else {
        summaryEl.innerHTML = `Canal: <strong>${escapeHtml(channel)}</strong> (${persons} personas).`;
      }
    }
  }

  function saveEditAccessRecord() {
    const id = $('editAccessId') ? $('editAccessId').value : '';
    const idx = (STATE.recentAccessList || []).findIndex(r => r.id === id);
    if (idx === -1) {
      toast('Registro no encontrado.', 'error');
      return;
    }

    const rec = STATE.recentAccessList[idx];
    const newName = ($('editAccessCustomer') ? $('editAccessCustomer').value : '').trim();
    if (!newName) {
      toast('⚠️ Por favor ingresa el nombre o alias del asistente.', 'warn');
      if ($('editAccessCustomer')) $('editAccessCustomer').focus();
      return;
    }

    const channel = $('editAccessChannel') ? $('editAccessChannel').value : 'BOLETERA_EXTERNA';
    const persons = parseInt($('editAccessPersons') ? $('editAccessPersons').value : '1', 10) || 1;
    const phone = ($('editAccessPhone') ? $('editAccessPhone').value : '').trim();
    let courtesyAuth = ($('editAccessCourtesyAuth') ? $('editAccessCourtesyAuth').value : '').trim();
    const courtesyReason = ($('editAccessCourtesyReason') ? $('editAccessCourtesyReason').value : '').trim();

    if (channel === 'CORTESIA' && !courtesyAuth) {
      toast('⚠️ Para cortesías, debes indicar quién autorizó (ej. Steven / Dirección).', 'warn');
      if ($('editAccessCourtesyAuth')) $('editAccessCourtesyAuth').focus();
      return;
    }
    if (channel === 'CORTESIA' && courtesyReason) {
      courtesyAuth = `${courtesyAuth} · ${courtesyReason}`;
    }

    const isForza = (rec.activity || STATE.activeActivity || '').toLowerCase().includes('forza');
    let faceValue = 0;
    if (isForza) {
      faceValue = (channel === 'CORTESIA') ? 0 : (150 * persons);
    } else {
      faceValue = (rec.faceValue || 0);
    }
    const commercialTotal = faceValue + (rec.wardrobeCost || rec.wardrobeAmount || 0);

    // Actualizar campos del registro
    rec.customer = newName;
    rec.phone = phone;
    rec.salesChannel = channel;
    rec.entryType = (channel === 'CORTESIA' ? 'Cortesía' : (persons === 2 ? 'Pareja' : (persons === 3 ? 'Trío' : 'General')));
    rec.ticketTypeId = rec.entryType;
    rec.persons = persons;
    rec.packages = persons;
    rec.courtesyAuth = (channel === 'CORTESIA' ? courtesyAuth : '');
    rec.faceValue = faceValue;
    rec.commercialTotal = commercialTotal;
    rec.totalCommercial = commercialTotal;
    rec.entryCost = (channel === 'TAQUILLA_DOMUS' && !isForza ? faceValue : 0);
    rec.doorCollected = (channel === 'TAQUILLA_DOMUS' && !isForza ? faceValue : 0);
    rec.paid = rec.doorCollected;

    // Persistir override en cache local
    STATE.editedAccessMap[id] = { ...rec };
    try {
      localStorage.setItem('domus_edited_access_map', JSON.stringify(STATE.editedAccessMap));
      localStorage.setItem('domus_custom_access', JSON.stringify(STATE.recentAccessList.slice(0, 50)));
    } catch (e) {}

    closeEditAccessModal();
    updateAccesosKpis();
    updateAccesosBadge();
    renderAccessLogTable();
    toast(`✓ Registro ${id} actualizado correctamente.`, 'ok');
  }

  function deleteAccessRecord(id) {
    const rec = (STATE.recentAccessList || []).find(r => r.id === id);
    const name = rec ? rec.customer : id;
    if (!confirm(`¿Eliminar definitivamente el registro ${id} (${name})?\n\nEsta acción lo descontará del aforo y de la liquidación de accesos.`)) {
      return;
    }

    STATE.deletedAccessIds.add(id);
    try {
      localStorage.setItem('domus_deleted_access_ids', JSON.stringify(Array.from(STATE.deletedAccessIds)));
    } catch (e) {}

    STATE.recentAccessList = (STATE.recentAccessList || []).filter(r => r.id !== id);
    try {
      localStorage.setItem('domus_custom_access', JSON.stringify(STATE.recentAccessList.slice(0, 50)));
    } catch (e) {}

    updateAccesosKpis();
    updateAccesosBadge();
    renderAccessLogTable();
    toast(`🗑️ Registro ${id} (${name}) eliminado y descontado del aforo.`, 'ok');
  }

  // --- INICIALIZAR APP ---
  document.addEventListener('DOMContentLoaded', () => {
    try {
      loadInitialData();
    } catch (e) {
      console.error('[DOMUS BOOT] Error en loadInitialData:', e);
    }
    try {
      setupEventListeners();
    } catch (e) {
      console.error('[DOMUS BOOT] Error en setupEventListeners:', e);
    }
    try {
      initRouting();
    } catch (e) {
      console.error('[DOMUS BOOT] Error en initRouting:', e);
    }
  });

  // Arqueo de Caja / Cierre: Efectivo esperado = $600 + cobros reales efectivo - retiros - devoluciones - gastos autorizados
  function calculateExpectedCashArqueo(cashCollected = 0, withdrawals = 0, refunds = 0, expenses = 0) {
    const openingFloat = STATE.openingFloat || 600;
    return openingFloat + Number(cashCollected) - Number(withdrawals) - Number(refunds) - Number(expenses);
  }

  // Exportar helpers globales para llamadas inline en HTML
  window.__domusApp = {
    updateQty: updateCartQty,
    claimOrder: claimOrder,
    markOrderReady: markOrderReady,
    deliverOrder: deliverOrder,
    reportIncident: reportIncident,
    submitRestockRequest: submitRestockRequest,
    resolveRestock: resolveRestock,
    reprintAccessTicket: reprintAccessTicket,
    returnWardrobe: returnWardrobeItems,
    setActiveEvent: changeActiveEvent,
    confirmAccess: confirmAccessAndRegister,
    calculateExpectedCashArqueo: calculateExpectedCashArqueo,
    selectEntryType: setAccessEntryType,
    setSalesChannel: setAccessSalesChannel,
    setWardrobeQty: setWardrobeQty,
    setPaymentMethod: setAccessPaymentMethod,
    editAccessRecord: openEditAccessModal,
    deleteAccessRecord: deleteAccessRecord
  };

})();
