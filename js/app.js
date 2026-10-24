/**
 * DOMUS ADMIN & PUNTO DE VENTA - SISTEMA UNIFICADO
 * Modo Caja (POS / Cobro) y Modo Comandas (KDS Cocina y Barra)
 */

'use strict';

(function () {
  // --- CONFIGURACIÓN & ESTADO INICIAL ---
  const DEFAULT_GAS_URL = 'https://script.google.com/a/macros/domusccc.net/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec';
  const STAFF_MEMBERS = ['René', 'Miguel', 'Mike', 'Meaw', 'Wall E', 'Iván', 'Kas', 'Steven', 'Angel'];

  const STATE = {
    mode: 'caja', // 'caja' | 'comandas'
    phase: 'Solar', // 'Solar' | 'Lunar'
    apiUrl: localStorage.getItem('domus_gas_url') || DEFAULT_GAS_URL,
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
    activeActivity: 'Sensorama fetish y kinky',
    eventsList: [],
    recentAccessList: [],
    accessSelectedType: 'General',
    accessWardrobeQty: 0,
    accessPaymentMethod: 'Efectivo',
    accessSearch: '',
    accessTab: 'log', // 'log' | 'wardrobe' | 'events'
    
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
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 40.0,
        "priceSolar": 40.0,
        "priceLunar": 40.0,
        "destination": "Barra",
        "sku": "B02",
        "provider": "DOMUS"
    },
    {
        "name": "Café de la Casa · Taza 300 ml",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 40.0,
        "priceSolar": 40.0,
        "priceLunar": 40.0,
        "destination": "Barra",
        "sku": "B10",
        "provider": "DOMUS"
    },
    {
        "name": "Cáliz de Espuma · Taza 240 ml",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 60.0,
        "priceSolar": 60.0,
        "priceLunar": 60.0,
        "destination": "Barra",
        "sku": "B04",
        "provider": "DOMUS"
    },
    {
        "name": "Espresso adicional · Adicional de espresso",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 20.0,
        "priceSolar": 20.0,
        "priceLunar": 20.0,
        "destination": "Barra",
        "sku": "EX1",
        "provider": "DOMUS"
    },
    {
        "name": "Estrella Latte · Taza 300 ml",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 60.0,
        "priceSolar": 60.0,
        "priceLunar": 60.0,
        "destination": "Barra",
        "sku": "B03",
        "provider": "DOMUS"
    },
    {
        "name": "Leche de Brujo · Vaso 400 ml con hielo",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "B09",
        "provider": "DOMUS"
    },
    {
        "name": "Limonada de la Casa · Vaso 400 ml con hielo",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 40.0,
        "priceSolar": 40.0,
        "priceLunar": 40.0,
        "destination": "Barra",
        "sku": "B11",
        "provider": "DOMUS"
    },
    {
        "name": "Luna Negra · Vaso 400 ml con hielo",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 60.0,
        "priceSolar": 60.0,
        "priceLunar": 60.0,
        "destination": "Barra",
        "sku": "B05",
        "provider": "DOMUS"
    },
    {
        "name": "Oro Negro · Espresso 36–40 ml",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 40.0,
        "priceSolar": 40.0,
        "priceLunar": 40.0,
        "destination": "Barra",
        "sku": "B01",
        "provider": "DOMUS"
    },
    {
        "name": "Té Chai · Taza 300 ml",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 60.0,
        "priceSolar": 60.0,
        "priceLunar": 60.0,
        "destination": "Barra",
        "sku": "B06",
        "provider": "DOMUS"
    },
    {
        "name": "Té Herbal · Taza 300 ml",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 40.0,
        "priceSolar": 40.0,
        "priceLunar": 40.0,
        "destination": "Barra",
        "sku": "B08",
        "provider": "DOMUS"
    },
    {
        "name": "Xocolatl · Taza 300 ml",
        "group": "Cafetería",
        "officialCat": "CAFÉ / BEBIDAS DE LA CASA",
        "price": 60.0,
        "priceSolar": 60.0,
        "priceLunar": 60.0,
        "destination": "Barra",
        "sku": "B07",
        "provider": "DOMUS"
    },
    {
        "name": "Agua mineral",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-023-MINERAL",
        "provider": "DOMUS"
    },
    {
        "name": "Agua natural · Botella 500 ml",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 30.0,
        "priceSolar": 30.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "R01",
        "provider": "DOMUS"
    },
    {
        "name": "Agua quina",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-023-QUINA",
        "provider": "DOMUS"
    },
    {
        "name": "Clamato preparado · 1 litro",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 120.0,
        "destination": "Barra",
        "sku": "BAR-CLAM-SERV-L",
        "provider": "DOMUS"
    },
    {
        "name": "Clamato preparado · 500 ml",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 60.0,
        "priceSolar": 60.0,
        "priceLunar": 80.0,
        "destination": "Barra",
        "sku": "BAR-CLAM-SERV",
        "provider": "DOMUS"
    },
    {
        "name": "Coca-Cola · 355 ml",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-022-COCA",
        "provider": "DOMUS"
    },
    {
        "name": "Jugo de arándano · 1 litro",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 120.0,
        "destination": "Barra",
        "sku": "BAR-024-ARANDANO-L",
        "provider": "DOMUS"
    },
    {
        "name": "Jugo de arándano · 500 ml",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-024-ARANDANO",
        "provider": "DOMUS"
    },
    {
        "name": "Jugo de naranja · 1 litro",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 120.0,
        "destination": "Barra",
        "sku": "BAR-024-NARANJA-L",
        "provider": "DOMUS"
    },
    {
        "name": "Jugo de naranja · 500 ml",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-024-NARANJA",
        "provider": "DOMUS"
    },
    {
        "name": "Jugo de piña · 1 litro",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 120.0,
        "destination": "Barra",
        "sku": "BAR-024-PINA-L",
        "provider": "DOMUS"
    },
    {
        "name": "Jugo de piña · 500 ml",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-024-PINA",
        "provider": "DOMUS"
    },
    {
        "name": "Sidral",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-022-SIDRAL",
        "provider": "DOMUS"
    },
    {
        "name": "Sprite",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-022-SPRITE",
        "provider": "DOMUS"
    },
    {
        "name": "Squirt · Botella",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 50.0,
        "destination": "Barra",
        "sku": "BAR-022-SQUIRT",
        "provider": "DOMUS"
    },
    {
        "name": "Volt Blue · Lata",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 80.0,
        "destination": "Barra",
        "sku": "BAR-VOLT-BLUE",
        "provider": "DOMUS"
    },
    {
        "name": "Volt Yellow · Lata",
        "group": "Bebidas",
        "officialCat": "REFRESCOS / AGUAS / MEZCLADORES",
        "price": 45.0,
        "priceSolar": 45.0,
        "priceLunar": 80.0,
        "destination": "Barra",
        "sku": "BAR-VOLT-YELLOW",
        "provider": "DOMUS"
    },
    {
        "name": "Caguama Corona Mega · Botella 1.2 L",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 120.0,
        "destination": "Barra",
        "sku": "N03",
        "provider": "DOMUS"
    },
    {
        "name": "Caguama Victoria Mega · Botella 1.2 L",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 120.0,
        "destination": "Barra",
        "sku": "N02",
        "provider": "DOMUS"
    },
    {
        "name": "Carta Blanca · Lata",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 70.0,
        "destination": "Barra",
        "sku": "BAR-CB-LATA",
        "provider": "DOMUS"
    },
    {
        "name": "Alemana Black · lata",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "BAR-001",
        "provider": "Felssloschen · Mariam Reyes"
    },
    {
        "name": "Alemana Bock · lata",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "BAR-001",
        "provider": "Felssloschen · Mariam Reyes"
    },
    {
        "name": "Onírica Viena · lata",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 90.0,
        "priceSolar": 90.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "BAR-002",
        "provider": "Onírica Cervecería"
    },
    {
        "name": "Onírica IPA · lata",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 90.0,
        "priceSolar": 90.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "BAR-002",
        "provider": "Onírica Cervecería"
    },
    {
        "name": "Onírica Lager · lata",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 90.0,
        "priceSolar": 90.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "BAR-002",
        "provider": "Onírica Cervecería"
    },
    {
        "name": "Corona · Cerveza 710 ml",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 85.0,
        "priceSolar": 85.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "R02",
        "provider": "DOMUS"
    },
    {
        "name": "Corona Extra · Lata 473 ml",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 70.0,
        "destination": "Barra",
        "sku": "N04",
        "provider": "DOMUS"
    },
    {
        "name": "Modelo Especial · Cerveza 710 ml",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 85.0,
        "priceSolar": 85.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "R03",
        "provider": "DOMUS"
    },
    {
        "name": "Modelo Especial · lata 473 ml",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 70.0,
        "destination": "Barra",
        "sku": "MODELO-473",
        "provider": "DOMUS"
    },
    {
        "name": "Victoria · 473 ml",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 70.0,
        "destination": "Barra",
        "sku": "VICTORIA-473",
        "provider": "DOMUS"
    },
    {
        "name": "Victoria · Cerveza 710 ml",
        "group": "Cervezas",
        "officialCat": "CERVEZAS",
        "price": 85.0,
        "priceSolar": 85.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "R04",
        "provider": "DOMUS"
    },
    {
        "name": "Chelada LIMON/SAL · Vaso 1 L  · Corona · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "M12-CORONA",
        "provider": "DOMUS"
    },
    {
        "name": "Chelada ·LIMON/SAL  Vaso 1 L  · Modelo Especial · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "M12-MODELO",
        "provider": "DOMUS"
    },
    {
        "name": "Chelada ·LIMON/SAL  Vaso 1 L · Victoria · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "M12-VICTORIA",
        "provider": "DOMUS"
    },
    {
        "name": "Chelada ·LIMON/SAL  Vaso 500 ml · Corona · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 70.0,
        "priceSolar": 70.0,
        "priceLunar": 110.0,
        "destination": "Barra",
        "sku": "M11-CORONA",
        "provider": "DOMUS"
    },
    {
        "name": "Chelada ·LIMON/SAL  Vaso 500 ml· Modelo Especial · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 70.0,
        "priceSolar": 70.0,
        "priceLunar": 110.0,
        "destination": "Barra",
        "sku": "M11-MODELO",
        "provider": "DOMUS"
    },
    {
        "name": "Chelada ·LIMON/SAL  Vaso 500 ml · Victoria · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 70.0,
        "priceSolar": 70.0,
        "priceLunar": 110.0,
        "destination": "Barra",
        "sku": "M11-VICTORIA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada clásica · Vaso 1 L · Corona · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "M22-CORONA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada clásica · Vaso 1 L · Modelo Especial · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "M22-MODELO",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada clásica · Vaso 1 L · Victoria · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "M22-VICTORIA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada clásica · Vaso 500 ml  · Corona · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 80.0,
        "priceSolar": 80.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "M21-CORONA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada clásica · Vaso 500 ml  · Modelo Especial · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 80.0,
        "priceSolar": 80.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "M21-MODELO",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada clásica · Vaso 500 ml · Victoria · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 80.0,
        "priceSolar": 80.0,
        "priceLunar": 100.0,
        "destination": "Barra",
        "sku": "M21-VICTORIA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada con Clamato · Vaso 1 L  Corona · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "M32-CORONA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada con Clamato · Vaso 1 L · Modelo Especial · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "M32-MODELO",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada con Clamato · Vaso 1L· Victoria · Vaso 1 L; 710 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "M32-VICTORIA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada con Clamato · Vaso 500 ml  · Corona · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 90.0,
        "priceSolar": 90.0,
        "priceLunar": 110.0,
        "destination": "Barra",
        "sku": "M31-CORONA",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada con Clamato · Vaso 500 ml · Modelo Especial · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 90.0,
        "priceSolar": 90.0,
        "priceLunar": 110.0,
        "destination": "Barra",
        "sku": "M31-MODELO",
        "provider": "DOMUS"
    },
    {
        "name": "Michelada con Clamato · Vaso 500 ml  · Victoria · Vaso 500 ml; 355 ml cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 90.0,
        "priceSolar": 90.0,
        "priceLunar": 110.0,
        "destination": "Barra",
        "sku": "M31-VICTORIA",
        "provider": "DOMUS"
    },
    {
        "name": "Vaso preparado chelada · Recargo por vaso de 500 ml; sin cerveza · Vaso 500 ml sin cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 20.0,
        "priceSolar": 20.0,
        "priceLunar": 20.0,
        "destination": "Barra",
        "sku": "P1",
        "provider": "DOMUS"
    },
    {
        "name": "Vaso preparado michelada clásica · Recargo por vaso de 500 ml; sin cerveza · Vaso 500 ml sin cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 30.0,
        "priceSolar": 30.0,
        "priceLunar": 30.0,
        "destination": "Barra",
        "sku": "P2",
        "provider": "DOMUS"
    },
    {
        "name": "Vaso preparado michelada con clamato · Recargo por vaso de 500 ml; sin cerveza · Vaso 500 ml sin cerveza",
        "group": "Cheladas",
        "officialCat": "CHELADAS / MICHELADAS",
        "price": 40.0,
        "priceSolar": 40.0,
        "priceLunar": 40.0,
        "destination": "Barra",
        "sku": "P3",
        "provider": "DOMUS"
    },
    {
        "name": "Azulito · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "E22",
        "provider": "DOMUS"
    },
    {
        "name": "Azulito · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "E21",
        "provider": "DOMUS"
    },
    {
        "name": "Cuba · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "L12",
        "provider": "DOMUS"
    },
    {
        "name": "Cuba · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "L11",
        "provider": "DOMUS"
    },
    {
        "name": "Eyaculada · ron, coco y piña · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "E62",
        "provider": "DOMUS"
    },
    {
        "name": "Eyaculada · ron, coco y piña · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "E61",
        "provider": "DOMUS"
    },
    {
        "name": "Gin de pepino · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "E72",
        "provider": "DOMUS"
    },
    {
        "name": "Gin de pepino · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "E71",
        "provider": "DOMUS"
    },
    {
        "name": "Gin tonic · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 180.0,
        "destination": "Barra",
        "sku": "E42",
        "provider": "DOMUS"
    },
    {
        "name": "Gin tonic · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "E41",
        "provider": "DOMUS"
    },
    {
        "name": "Lunar · tinto dulce · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "E52",
        "provider": "DOMUS"
    },
    {
        "name": "Lunar · tinto dulce · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "E51",
        "provider": "DOMUS"
    },
    {
        "name": "Mezcal con mineral · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 180.0,
        "destination": "Barra",
        "sku": "E102",
        "provider": "DOMUS"
    },
    {
        "name": "Mezcal con mineral · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "E101",
        "provider": "DOMUS"
    },
    {
        "name": "Mojito de mezcal · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 180.0,
        "destination": "Barra",
        "sku": "E32",
        "provider": "DOMUS"
    },
    {
        "name": "Mojito de mezcal · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "E31",
        "provider": "DOMUS"
    },
    {
        "name": "Paloma · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "L22",
        "provider": "DOMUS"
    },
    {
        "name": "Paloma · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "L21",
        "provider": "DOMUS"
    },
    {
        "name": "Perla Negra · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 170.0,
        "priceSolar": 170.0,
        "priceLunar": 220.0,
        "destination": "Barra",
        "sku": "E82",
        "provider": "DOMUS"
    },
    {
        "name": "Perla Negra · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 130.0,
        "priceSolar": 130.0,
        "priceLunar": 180.0,
        "destination": "Barra",
        "sku": "E81",
        "provider": "DOMUS"
    },
    {
        "name": "Solar · vodka y frutas · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "E12",
        "provider": "DOMUS"
    },
    {
        "name": "Solar · vodka y frutas · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "E11",
        "provider": "DOMUS"
    },
    {
        "name": "Vodka limón · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "L32",
        "provider": "DOMUS"
    },
    {
        "name": "Vodka limón · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "L31",
        "provider": "DOMUS"
    },
    {
        "name": "Whisky con cola · Vaso 1 L con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 170.0,
        "destination": "Barra",
        "sku": "E92",
        "provider": "DOMUS"
    },
    {
        "name": "Whisky con cola · Vaso 500 ml con hielo",
        "group": "Coctelería",
        "officialCat": "CÓCTELES 500 ML / 1 L",
        "price": 110.0,
        "priceSolar": 110.0,
        "priceLunar": 150.0,
        "destination": "Barra",
        "sku": "E91",
        "provider": "DOMUS"
    },
    {
        "name": "SHOT MEZCAL 45ML",
        "group": "Shots",
        "officialCat": "SHOT 45ML",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "K03",
        "provider": "DOMUS"
    },
    {
        "name": "SHOT GIN 45ML",
        "group": "Shots",
        "officialCat": "SHOT 45ML",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 160.0,
        "destination": "Barra",
        "sku": "K01",
        "provider": "DOMUS"
    },
    {
        "name": "SHOT VODKA, TEQ, RON, WHISKY 45ML",
        "group": "Shots",
        "officialCat": "SHOT 45ML",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 130.0,
        "destination": "Barra",
        "sku": "K02",
        "provider": "DOMUS"
    },
    {
        "name": "Aderezo adicional",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 20.0,
        "priceSolar": 20.0,
        "priceLunar": 20.0,
        "destination": "Cocina",
        "sku": "CT10",
        "provider": "Canna Treats"
    },
    {
        "name": "Alitas sumisas — 10 piezas",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 200.0,
        "priceSolar": 200.0,
        "priceLunar": 200.0,
        "destination": "Cocina",
        "sku": "CT15b",
        "provider": "Canna Treats"
    },
    {
        "name": "Alitas sumisas — 6 piezas",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 130.0,
        "priceSolar": 130.0,
        "priceLunar": 130.0,
        "destination": "Cocina",
        "sku": "CT15a",
        "provider": "Canna Treats"
    },
    {
        "name": "Bastones de castigo",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 120.0,
        "priceSolar": 120.0,
        "priceLunar": 120.0,
        "destination": "Cocina",
        "sku": "CT04",
        "provider": "Canna Treats"
    },
    {
        "name": "Boneless",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 150.0,
        "priceSolar": 150.0,
        "priceLunar": 150.0,
        "destination": "Cocina",
        "sku": "CT14",
        "provider": "Canna Treats"
    },
    {
        "name": "Espaghetti",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 50.0,
        "destination": "Cocina",
        "sku": "CT20",
        "provider": "Canna Treats"
    },
    {
        "name": "Gajitos",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 50.0,
        "destination": "Cocina",
        "sku": "CT08",
        "provider": "Canna Treats"
    },
    {
        "name": "Guacamole regular",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 50.0,
        "destination": "Cocina",
        "sku": "CT05",
        "provider": "Canna Treats"
    },
    {
        "name": "Hamburguesa Kinki",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 150.0,
        "priceSolar": 150.0,
        "priceLunar": 150.0,
        "destination": "Cocina",
        "sku": "CT11",
        "provider": "Canna Treats"
    },
    {
        "name": "La Dominatrix",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 200.0,
        "priceSolar": 200.0,
        "priceLunar": 200.0,
        "destination": "Cocina",
        "sku": "CT12",
        "provider": "Canna Treats"
    },
    {
        "name": "Misioneritas",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 30.0,
        "priceSolar": 30.0,
        "priceLunar": 30.0,
        "destination": "Cocina",
        "sku": "CT07",
        "provider": "Canna Treats"
    },
    {
        "name": "Nachos libres",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 80.0,
        "priceSolar": 80.0,
        "priceLunar": 80.0,
        "destination": "Cocina",
        "sku": "CT16",
        "provider": "Canna Treats"
    },
    {
        "name": "Orden de pajitas",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 20.0,
        "priceSolar": 20.0,
        "priceLunar": 20.0,
        "destination": "Cocina",
        "sku": "CT06",
        "provider": "Canna Treats"
    },
    {
        "name": "Orden de queso",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 30.0,
        "priceSolar": 30.0,
        "priceLunar": 30.0,
        "destination": "Cocina",
        "sku": "CT09",
        "provider": "Canna Treats"
    },
    {
        "name": "Orgía de botanas",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 40.0,
        "priceSolar": 40.0,
        "priceLunar": 40.0,
        "destination": "Cocina",
        "sku": "CT01",
        "provider": "Canna Treats"
    },
    {
        "name": "Papas gajo",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 80.0,
        "priceSolar": 80.0,
        "priceLunar": 80.0,
        "destination": "Cocina",
        "sku": "CT03",
        "provider": "Canna Treats"
    },
    {
        "name": "Papas misioneras",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 60.0,
        "priceSolar": 60.0,
        "priceLunar": 60.0,
        "destination": "Cocina",
        "sku": "CT02",
        "provider": "Canna Treats"
    },
    {
        "name": "Ramen de abuelita",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "CT19",
        "provider": "Canna Treats"
    },
    {
        "name": "Sado nachos",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 130.0,
        "priceSolar": 130.0,
        "priceLunar": 130.0,
        "destination": "Cocina",
        "sku": "CT17",
        "provider": "Canna Treats"
    },
    {
        "name": "Sado sampler — sin infusión",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 350.0,
        "priceSolar": 350.0,
        "priceLunar": 350.0,
        "destination": "Cocina",
        "sku": "CT22",
        "provider": "Canna Treats"
    },
    {
        "name": "Tacos de la parrilla",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 50.0,
        "priceSolar": 50.0,
        "priceLunar": 50.0,
        "destination": "Cocina",
        "sku": "CT18",
        "provider": "Canna Treats"
    },
    {
        "name": "Trío de jochis",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 130.0,
        "priceSolar": 130.0,
        "priceLunar": 130.0,
        "destination": "Cocina",
        "sku": "CT13",
        "provider": "Canna Treats"
    },
    {
        "name": "Waffle vainilla",
        "group": "Canna Treats",
        "officialCat": "ALIMENTOS · CANNA TREATS",
        "price": 80.0,
        "priceSolar": 80.0,
        "priceLunar": 80.0,
        "destination": "Cocina",
        "sku": "CT21",
        "provider": "Canna Treats"
    },
    {
        "name": "MUFFINS",
        "group": "Cocina",
        "officialCat": "ALIMENTOS ANDY",
        "price": 150.0,
        "priceSolar": 150.0,
        "priceLunar": 150.0,
        "destination": "Cocina",
        "sku": "CT45",
        "provider": "ANDY"
    },
    {
        "name": "CHOCOLATES 2 DOSIS",
        "group": "Cocina",
        "officialCat": "ALIMENTOS ANDY",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "CT46",
        "provider": "ANDY"
    },
    {
        "name": "CHOCOLATES 4 DOSIS",
        "group": "Cocina",
        "officialCat": "ALIMENTOS ANDY",
        "price": 200.0,
        "priceSolar": 200.0,
        "priceLunar": 200.0,
        "destination": "Cocina",
        "sku": "CT47",
        "provider": "ANDY"
    },
    {
        "name": "CHOCOLATES VAGINA",
        "group": "Cocina",
        "officialCat": "ALIMENTOS ANDY",
        "price": 150.0,
        "priceSolar": 150.0,
        "priceLunar": 150.0,
        "destination": "Cocina",
        "sku": "CT48",
        "provider": "ANDY"
    },
    {
        "name": "Rollo Nobara",
        "desc": "Zanahoria, aguacate, queso Philadelphia, surimi",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ01",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Itadori",
        "desc": "Aguacate, Tampico, pollo",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ02",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Megumi",
        "desc": "Zanahoria, queso Philadelphia, surimi, pepino",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ03",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Maki",
        "desc": "Tampico, aguacate, queso Philadelphia, pepino",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ04",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Todo",
        "desc": "Pepino, pollo, queso Philadelphia, surimi",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ05",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Choso",
        "desc": "Zanahoria, aguacate, queso Philadelphia, surimi, Tampico por fuera",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ06",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Gojo",
        "desc": "Aguacate, pollo, zanahoria, por fuera queso Philadelphia",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ07",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Sasaki",
        "desc": "Pepino, zanahoria, aguacate, surimi, por fuera Tampico",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ08",
        "provider": "JujuTsu-shi"
    },
    {
        "name": "Rollo Rika",
        "desc": "Pollo, aguacate, surimi, Tampico",
        "group": "Sushi",
        "officialCat": "ALIMENTOS JUJUTSU-SHI",
        "price": 100.0,
        "priceSolar": 100.0,
        "priceLunar": 100.0,
        "destination": "Cocina",
        "sku": "JJ09",
        "provider": "JujuTsu-shi"
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

  // Eventos y Actividades Base (para Demo / Offline)
  const DEFAULT_EVENTS = [
    { name: 'Sensorama fetish y kinky', date: '2026-10-25', type: 'Fiesta temática', organizer: 'DOMUS', priceGeneral: 150, pricePareja: 260, priceTrio: 360, priceGuardarropa: 50, capacity: 150, status: 'Confirmado' },
    { name: 'Forza · sábado', date: '2026-10-24', type: 'Club nocturno', organizer: 'DOMUS', priceGeneral: 120, pricePareja: 200, priceTrio: 280, priceGuardarropa: 50, capacity: 200, status: 'Confirmado' },
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
    const params = new URLSearchParams(window.location.search);
    const vista = params.get('vista');
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

  function getSessionToken() {
    return sessionStorage.getItem('domus_session_token') || localStorage.getItem('domus_session_token') || '';
  }

  function setSessionToken(token) {
    if (token) {
      sessionStorage.setItem('domus_session_token', token);
      localStorage.setItem('domus_session_token', token);
    }
  }

  function getStationRole() {
    if (STATE.mode === 'caja') return 'CAJA';
    if (STATE.mode === 'comandas') return 'BARRA';
    if (STATE.mode === 'accesos') return 'ACCESOS';
    return 'CAJA';
  }

  function getOutbox() {
    try {
      const raw = localStorage.getItem('domus_outbox');
      return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveOutbox(queue) {
    try {
      localStorage.setItem('domus_outbox', JSON.stringify(queue));
    } catch (e) {
      console.warn('Error al guardar outbox en localStorage:', e);
    }
    updateOutboxUI();
  }

  function enqueueOutbox(action, args, type = 'MUTATION') {
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

  let isOutboxProcessing = false;
  function processOutbox() {
    if (isOutboxProcessing) return;
    const queue = getOutbox();
    const pendingItems = queue.filter(it => it.status === 'LOCAL_PENDING' || it.status === 'RETRY');
    if (pendingItems.length === 0) {
      updateOutboxUI();
      return;
    }

    isOutboxProcessing = true;
    updateOutboxUI();

    const item = pendingItems[0];
    item.status = 'SYNCING';
    item.attempts = (item.attempts || 0) + 1;
    item.lastAttempt = new Date().toISOString();
    saveOutbox(queue);

    const endpoint = `${STATE.apiUrl}?action=${encodeURIComponent(item.action)}`;
    const payload = {
      action: item.action,
      args: item.args,
      requestId: item.requestId,
      deviceId: item.deviceId,
      operator: item.operatorId,
      role: item.role,
      sessionToken: getSessionToken()
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(json => {
      isOutboxProcessing = false;
      if (json && json.ok) {
        item.status = 'CONFIRMED';
        item.serverReceipt = json.data;
        const currentQueue = getOutbox().filter(q => q.requestId !== item.requestId);
        saveOutbox(currentQueue);
        toast(`Operación sincronizada exitosamente con Google Sheets.`, 'ok');
        playChime('success');
        updateSyncPill('ok');
        setTimeout(processOutbox, 300);
      } else {
        const errorMsg = json.error || 'Error reportado por servidor';
        if (errorMsg.includes('Acceso denegado') || errorMsg.includes('inválido')) {
          item.status = 'REQUIRES_REVIEW';
          item.lastError = errorMsg;
          saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));
          toast(`Permiso requerido: ${errorMsg}`, 'error');
        } else {
          item.status = 'RETRY';
          item.lastError = errorMsg;
          saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));
        }
      }
    })
    .catch(err => {
      isOutboxProcessing = false;
      item.status = 'RETRY';
      item.lastError = err.message || String(err);
      saveOutbox(getOutbox().map(q => q.requestId === item.requestId ? item : q));
      updateSyncPill('error');
    });
  }

  function updateOutboxUI() {
    const banner = $('outboxBanner');
    const text = $('outboxStatusText');
    const queue = getOutbox();
    const pending = queue.filter(q => q.status !== 'CONFIRMED');

    if (!banner || !text) return;

    if (pending.length > 0) {
      banner.classList.remove('hidden');
      text.textContent = `⚠️ MODO SIN CONEXIÓN · ${pending.length} operación(es) pendiente(s) de sincronizar en Outbox`;
      updateSyncPill('warn');
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
    const endpoint = `${STATE.apiUrl}?action=${encodeURIComponent(fnName)}`;
    const payload = {
      action: fnName,
      args: args,
      requestId: reqId,
      deviceId: getDeviceId(),
      operator: STATE.operator || 'Operador',
      role: getStationRole(),
      sessionToken: getSessionToken()
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
      if (!json.ok && json.error) throw new Error(json.error);

      updateSyncPill('ok');
      const data = json.data !== undefined ? json.data : json;
      if (!isMutation) cacheQuerySnapshot(fnName, data);

      if (onSuccess) onSuccess(data);
      processOutbox();
    })
    .catch(err => {
      STATE.isSyncing = false;
      STATE.lastSyncTimestamp = Date.now();
      updateSyncPill('error');

      if (isMutation) {
        // Encolar de forma segura en Outbox
        const item = enqueueOutbox(fnName, args, 'MUTATION');
        item.lastError = err.message || String(err);
        item.status = 'RETRY';
        saveOutbox(getOutbox());

        toast(`⚠️ Sin conexión con Google Sheets. Operación guardada de forma segura en Outbox local (${reqId}).`, 'warn');
        if (onSuccess) {
          onSuccess({
            ok: true,
            localOutbox: true,
            status: 'LOCAL_PENDING',
            requestId: reqId,
            rowId: reqId,
            id: reqId,
            ticket: reqId,
            message: `Guardado en Outbox local (${reqId}). Se sincronizará automáticamente al volver la señal.`
          });
        }
      } else {
        // Consulta de lectura que falló por red: recuperar de caché local si existe
        console.warn(`Consulta '${fnName}' falló por falta de red. Intentando leer desde caché local.`);
        const cached = getCachedQuerySnapshot(fnName);
        if (cached && onSuccess) {
          toast('Mostrando datos de respaldo en caché local.', 'warn');
          onSuccess(cached);
        } else if (onError) {
          onError(err);
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
    } else if (state === 'warn' || STATE.isDemoMode) {
      dot.className = 'status-dot warn';
      label.textContent = 'Simulador DOMUS';
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
    try {
      const custom = JSON.parse(localStorage.getItem('domus_custom_products') || '[]');
      if (Array.isArray(custom) && custom.length) {
        const existingKeys = new Set(STATE.products.map(p => (p.sku || p.name).toLowerCase()));
        const toAdd = custom.filter(c => !existingKeys.has((c.sku || c.name).toLowerCase()));
        STATE.products = [...toAdd, ...STATE.products];
      }
    } catch (e) {}

    STATE.comandas = [...DEFAULT_ORDERS];

    // Inicializar eventos y accesos
    STATE.eventsList = [...DEFAULT_EVENTS];
    STATE.recentAccessList = [...DEFAULT_ACCESS_RECORDS];
    STATE.activeActivity = STATE.eventsList[0] ? STATE.eventsList[0].name : 'Sensorama fetish y kinky';

    try {
      const savedEvents = JSON.parse(localStorage.getItem('domus_custom_events') || '[]');
      if (Array.isArray(savedEvents) && savedEvents.length) {
        STATE.eventsList = [...savedEvents, ...STATE.eventsList];
      }
      const savedAccess = JSON.parse(localStorage.getItem('domus_custom_access') || '[]');
      if (Array.isArray(savedAccess) && savedAccess.length) {
        STATE.recentAccessList = [...savedAccess, ...STATE.recentAccessList];
      }
      const savedActiveAct = localStorage.getItem('domus_active_event');
      if (savedActiveAct) {
        STATE.activeActivity = savedActiveAct;
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
    callBackend('cajaSimpleDatos', [], data => {
      if (data.phase) {
        STATE.phase = data.phase;
        $('currentPhaseBadge').textContent = `Fase ${data.phase}`;
      }
      if (data.products && data.products.length) {
        STATE.products = data.products;
        // Fusionar productos personalizados creados en el cliente
        try {
          const custom = JSON.parse(localStorage.getItem('domus_custom_products') || '[]');
          if (Array.isArray(custom) && custom.length) {
            const existingKeys = new Set(STATE.products.map(p => (p.sku || p.name).toLowerCase()));
            const toAdd = custom.filter(c => !existingKeys.has((c.sku || c.name).toLowerCase()));
            STATE.products = [...toAdd, ...STATE.products];
          }
        } catch (e) {}
        renderCategoryChips();
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
      if (STATE.mode === 'caja') {
        renderCatalog();
      }
    }, err => {
      console.warn('No se pudo leer datos de Caja desde el servidor:', err);
    });

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

    callBackend('accesoSimpleDatos', [], data => {
      if (data.activities && data.activities.length) {
        STATE.eventsList = data.activities;
      }
      if (data.activeActivity) {
        STATE.activeActivity = data.activeActivity;
      }
      if (data.recentAccess && data.recentAccess.length) {
        STATE.recentAccessList = data.recentAccess;
      }
      updateAccesosBadge();
      if (STATE.mode === 'accesos') {
        renderAccesosView();
      }
    }, err => {
      console.warn('Accesos: enlace de Google notificó:', err);
    });
  }

  function updateAccesosBadge() {
    const badge = $('accessActiveCountBadge');
    if (!badge) return;
    const activeCount = STATE.recentAccessList.reduce((acc, r) => acc + (r.packages || 1), 0);
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

  function renderCategoryChips() {
    const container = $('categoryChips');
    if (!container) return;
    const groups = ['Todas', ...new Set(STATE.products.map(p => p.group))];
    container.innerHTML = groups.map(g => `
      <button type="button" class="chip-btn ${STATE.catalogCategory === g ? 'active' : ''}" data-cat="${g}">
        ${g}
      </button>
    `).join('');

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
    const filtered = STATE.products.filter(p => {
      const matchCat = STATE.catalogCategory === 'Todas' ||
                       p.group === STATE.catalogCategory ||
                       (STATE.catalogCategory === 'Cocina' && (p.destination === 'Cocina' || p.group === 'Sushi')) ||
                       (STATE.catalogCategory === 'Sushi' && (p.group === 'Sushi' || (p.provider && p.provider.toLowerCase().includes('jujutsu'))));

      const matchQuery = !query ||
                         p.name.toLowerCase().includes(query) ||
                         p.group.toLowerCase().includes(query) ||
                         (p.desc && p.desc.toLowerCase().includes(query)) ||
                         (p.provider && p.provider.toLowerCase().includes(query)) ||
                         (p.sku && p.sku.toLowerCase().includes(query));
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
      return `
        <article class="product-card" data-product="${encodeURIComponent(JSON.stringify(p))}">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span class="card-cat-badge">${p.group}</span>
              ${p.provider && p.provider !== 'DOMUS' ? `<span style="font-size: 0.68rem; color: var(--gold-primary); opacity: 0.9; font-weight: 500;">${p.provider}</span>` : ''}
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
    if (existing) {
      if (existing.qty < 20) existing.qty += 1;
    } else {
      STATE.cart.push({
        name: product.name,
        desc: product.desc || '',
        group: product.group,
        destination: product.destination || (product.group === 'Alimentos' || product.group === 'Sushi' ? 'Cocina' : 'Barra'),
        price: price,
        qty: 1,
        courtesy: false
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
    const customer = $('customerNameInput').value.trim() || 'Cliente Mostrador';
    const total = calculateCartTotal();
    const received = parseFloat($('cashReceivedInput').value) || 0;
    const tip = parseFloat($('cashTipInput').value) || 0;

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
      credit: isPaid ? '' : STATE.accountType,
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
                    ${hasResponsible && item.state !== 'Lista' && !item.incident ? `
                      <button type="button" class="btn-action-small btn-ready" onclick="window.__domusApp.markOrderReady('${item.key}')">
                        ✓ Marcar Lista
                      </button>
                    ` : ''}
                    
                    ${hasResponsible && !item.incident ? `
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
    const prodName = ord ? ord.product : '1 unidad';
    
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
    const url = $('gasApiUrlInput').value.trim();
    if (url) {
      STATE.apiUrl = url;
      localStorage.setItem('domus_gas_url', url);
      STATE.isDemoMode = false;
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
    if (!ev && STATE.eventsList && STATE.eventsList.length > 0) {
      ev = STATE.eventsList[0];
    }
    if (!ev) {
      ev = {
        name: STATE.activeActivity || 'Sensorama fetish y kinky',
        date: new Date().toISOString().slice(0, 10),
        type: 'Fiesta temática',
        organizer: 'DOMUS',
        priceGeneral: 150,
        pricePareja: 260,
        priceTrio: 360,
        priceGuardarropa: 50,
        capacity: 150,
        status: 'Confirmado'
      };
    }
    return ev;
  }

  function renderAccesosView() {
    renderAccessActivitySelector();
    renderEntryTypesGrid();
    updateAccesosKpis();
    updateAccessSummary();
    renderAccessTab();
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
  }

  function renderEntryTypesGrid() {
    const container = $('entryTypesContainer');
    if (!container) return;

    const ev = getActiveEvent();
    const pGen = ev.priceGeneral !== undefined ? Number(ev.priceGeneral) : 150;
    const pPar = ev.pricePareja !== undefined ? Number(ev.pricePareja) : 260;
    const pTrio = ev.priceTrio !== undefined ? Number(ev.priceTrio) : 360;

    const types = [
      { id: 'General', label: 'General (1 Pers)', price: pGen, icon: '👤', desc: 'Acceso individual' },
      { id: 'Pareja', label: 'Pareja (2 Pers)', price: pPar, icon: '👥', desc: 'Acceso 2 personas' },
      { id: 'Trío', label: 'Trío (3 Pers)', price: pTrio, icon: '🧑‍🤝‍🧑', desc: 'Acceso 3 personas' },
      { id: 'Preventa', label: 'Preventa (Boletera)', price: 0, icon: '🎟️', desc: 'Boleto ya pagado' },
      { id: 'Cortesía', label: 'Cortesía (VIP/Staff)', price: 0, icon: '⭐', desc: 'Autorización requerida' },
      { id: 'Solo guardarropa', label: 'Solo Guardarropa', price: 0, icon: '🧥', desc: 'Sin costo de acceso' }
    ];

    container.innerHTML = types.map(t => {
      const isSelected = STATE.accessSelectedType === t.id;
      const priceText = t.price > 0 ? `$${t.price.toFixed(2)}` : (t.id === 'Solo guardarropa' ? '$0.00' : 'Gratis / Validar');
      return `
        <div class="entry-type-card ${isSelected ? 'selected' : ''}" data-entry-type="${t.id}">
          <div class="entry-type-icon">${t.icon}</div>
          <div class="entry-type-title">${t.label}</div>
          <div class="entry-type-price">${priceText}</div>
        </div>
      `;
    }).join('');

    // Reattach click listeners on cards
    container.querySelectorAll('.entry-type-card').forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-entry-type');
        setAccessEntryType(type);
      });
    });

    // Update wardrobe unit price text
    const pGua = ev.priceGuardarropa !== undefined ? Number(ev.priceGuardarropa) : 50;
    if ($('wardrobeUnitPriceText')) {
      $('wardrobeUnitPriceText').textContent = `$${pGua.toFixed(2)} c/u`;
    }
  }

  function setAccessEntryType(type) {
    STATE.accessSelectedType = type;

    // Toggle specific inputs
    const presaleGroup = $('presaleInputGroup');
    if (presaleGroup) presaleGroup.classList.toggle('hidden', type !== 'Preventa');

    const courtesyGroup = $('courtesyInputGroup');
    if (courtesyGroup) courtesyGroup.classList.toggle('hidden', type !== 'Cortesía');

    // Update card selection styles
    const container = $('entryTypesContainer');
    if (container) {
      container.querySelectorAll('.entry-type-card').forEach(card => {
        card.classList.toggle('selected', card.getAttribute('data-entry-type') === type);
      });
    }

    updateAccessSummary();
  }

  function setWardrobeQty(qty) {
    STATE.accessWardrobeQty = qty;
    const group = $('wardrobeSelectorGroup');
    if (group) {
      group.querySelectorAll('.wardrobe-btn').forEach(btn => {
        const bQty = parseInt(btn.getAttribute('data-qty'), 10);
        btn.classList.toggle('active', bQty === qty);
      });
    }

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
      cashSec.classList.toggle('hidden', method !== 'Efectivo');
    }

    updateAccessSummary();
  }

  function calculateAccessSubtotal() {
    const ev = getActiveEvent();
    let entryCost = 0;
    if (STATE.accessSelectedType === 'General') entryCost = Number(ev.priceGeneral) || 0;
    else if (STATE.accessSelectedType === 'Pareja') entryCost = Number(ev.pricePareja) || 0;
    else if (STATE.accessSelectedType === 'Trío') entryCost = Number(ev.priceTrio) || 0;
    else entryCost = 0;

    const pGua = Number(ev.priceGuardarropa) || 50;
    const wardrobeCost = (STATE.accessWardrobeQty || 0) * pGua;
    const total = entryCost + wardrobeCost;

    return { entryCost, wardrobeCost, total };
  }

  function updateAccessSummary() {
    const { entryCost, wardrobeCost, total } = calculateAccessSubtotal();

    if ($('summaryEntryType')) $('summaryEntryType').textContent = STATE.accessSelectedType;
    if ($('summaryEntryAmount')) $('summaryEntryAmount').textContent = `$${entryCost.toFixed(2)}`;
    if ($('summaryWardrobeQty')) $('summaryWardrobeQty').textContent = STATE.accessWardrobeQty;
    if ($('summaryWardrobeAmount')) $('summaryWardrobeAmount').textContent = `$${wardrobeCost.toFixed(2)}`;
    if ($('summaryTotalAdmission')) $('summaryTotalAdmission').textContent = `$${total.toFixed(2)}`;

    // Update Change Display
    const cashInput = $('accessCashReceived');
    const changeDisplay = $('accessCashChangeText');
    if (cashInput && changeDisplay) {
      const received = parseFloat(cashInput.value) || 0;
      if (received > 0 && received >= total) {
        changeDisplay.textContent = `$${(received - total).toFixed(2)}`;
        changeDisplay.style.color = 'var(--emerald-400)';
      } else if (received > 0 && received < total) {
        changeDisplay.textContent = `Faltan $${(total - received).toFixed(2)}`;
        changeDisplay.style.color = 'var(--rose-400)';
      } else {
        changeDisplay.textContent = '$0.00';
        changeDisplay.style.color = 'var(--emerald-400)';
      }
    }
  }

  function updateAccesosKpis() {
    const records = STATE.recentAccessList || [];
    
    // 1. Total Attendance (sum of packages)
    const totalAttendance = records.reduce((sum, r) => sum + (Number(r.packages) || 1), 0);
    if ($('kpiTotalAttendance')) $('kpiTotalAttendance').textContent = totalAttendance;

    // 2. Active Wardrobe (items currently in custody, devuelto !== true)
    const activeWardrobe = records.reduce((sum, r) => {
      if (!r.devuelto && Number(r.wardrobeQty) > 0) {
        return sum + Number(r.wardrobeQty);
      }
      return sum;
    }, 0);
    if ($('kpiActiveWardrobe')) $('kpiActiveWardrobe').textContent = activeWardrobe;
    if ($('wardrobeBadgeCount')) $('wardrobeBadgeCount').textContent = activeWardrobe;

    // 3. Validated Presales
    const validatedPresales = records.filter(r => r.entryType === 'Preventa').length;
    if ($('kpiValidatedPresales')) $('kpiValidatedPresales').textContent = validatedPresales;

    // 4. Total Admission Revenue
    const totalRev = records.reduce((sum, r) => sum + (Number(r.paid !== undefined ? r.paid : r.totalAmount) || 0), 0);
    if ($('kpiTotalAdmissionRevenue')) $('kpiTotalAdmissionRevenue').textContent = `$${totalRev.toFixed(2)}`;

    updateAccesosBadge();
  }

  function confirmAccessAndRegister() {
    const customer = ($('accessCustomerName').value || '').trim();
    if (!customer) {
      toast('Por favor ingresa el nombre o alias del asistente.', 'warn');
      $('accessCustomerName').focus();
      return;
    }

    const phone = ($('accessCustomerPhone').value || '').trim();
    const email = ($('accessCustomerEmail').value || '').trim();
    const entryType = STATE.accessSelectedType;
    const wardrobeQty = STATE.accessWardrobeQty || 0;
    const wardrobeNotes = ($('accessWardrobeNotes') ? $('accessWardrobeNotes').value : '').trim();
    const method = STATE.accessPaymentMethod || 'Efectivo';
    const presaleFolio = ($('accessPresaleFolio') ? $('accessPresaleFolio').value : '').trim();
    const courtesyAuth = ($('accessCourtesyAuth') ? $('accessCourtesyAuth').value : '').trim();

    if (entryType === 'Preventa' && !presaleFolio) {
      toast('Ingresa el folio del boleto de preventa.', 'warn');
      if ($('accessPresaleFolio')) $('accessPresaleFolio').focus();
      return;
    }

    if (entryType === 'Cortesía' && !courtesyAuth) {
      toast('Ingresa quién autoriza la cortesía.', 'warn');
      if ($('accessCourtesyAuth')) $('accessCourtesyAuth').focus();
      return;
    }

    const { entryCost, wardrobeCost, total } = calculateAccessSubtotal();

    let packages = 1;
    if (entryType === 'Pareja') packages = 2;
    if (entryType === 'Trío') packages = 3;

    // Generate rowId & wardrobe ticket
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const rowId = `A-${randNum}`;
    const ticketGuardarropa = wardrobeQty > 0 ? `GUA-${rowId}` : '';

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newRecord = {
      id: rowId,
      date: dateStr,
      activity: STATE.activeActivity,
      customer: customer,
      email: email,
      phone: phone,
      entryType: entryType,
      packages: packages,
      wardrobeQty: wardrobeQty,
      wardrobeNotes: wardrobeNotes,
      entryCost: entryCost,
      wardrobeCost: wardrobeCost,
      totalAmount: total,
      paid: total,
      due: 0,
      presaleFolio: presaleFolio,
      courtesyAuth: courtesyAuth,
      method: method,
      ticketGuardarropa: ticketGuardarropa,
      devuelto: false
    };

    // Prepend to local state
    STATE.recentAccessList.unshift(newRecord);

    // Save locally
    try {
      localStorage.setItem('domus_custom_access', JSON.stringify(STATE.recentAccessList.slice(0, 50)));
    } catch (e) {}

    // Backend call
    callBackend('accesoSimpleRegistrar', [newRecord], res => {
      if (res && res.rowId) {
        newRecord.id = res.rowId;
        if (res.ticketGuardarropa) newRecord.ticketGuardarropa = res.ticketGuardarropa;
      }
      toast(`Acceso registrado exitosamente: Folio ${newRecord.id}`, 'ok');
      playChime('success');
      syncBackendData();
    }, err => {
      console.warn('Registro local de acceso (modo offline o sincronización diferida):', err);
      toast(`Acceso registrado localmente: Folio ${newRecord.id}`, 'ok');
      playChime('success');
    });

    // Reset Form
    $('accessCustomerName').value = '';
    $('accessCustomerPhone').value = '';
    $('accessCustomerEmail').value = '';
    if ($('accessPresaleFolio')) $('accessPresaleFolio').value = '';
    if ($('accessCourtesyAuth')) $('accessCourtesyAuth').value = '';
    if ($('accessWardrobeNotes')) $('accessWardrobeNotes').value = '';
    if ($('accessCashReceived')) $('accessCashReceived').value = '';

    setAccessEntryType('General');
    setWardrobeQty(0);
    renderAccesosView();

    // Open Printable Ticket Modal
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

    const q = (STATE.accessSearch || '').toLowerCase().trim();
    const records = (STATE.recentAccessList || []).filter(r => {
      if (!q) return true;
      const haystack = `${r.id} ${r.customer} ${r.phone} ${r.email} ${r.entryType} ${r.method} ${r.ticketGuardarropa || ''}`.toLowerCase();
      return haystack.includes(q);
    });

    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px 16px;">
            <div style="font-size: 2rem; margin-bottom: 8px;">📋</div>
            No se encontraron registros de acceso hoy.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const typeBadge = `<span class="badge-entry-type ${getEntryTypeBadgeClass(r.entryType)}">${escapeHtml(r.entryType)}</span>`;
      const guaBadge = r.ticketGuardarropa
        ? `<span class="badge-wardrobe-ticket ${r.devuelto ? 'returned' : ''}">🧥 ${escapeHtml(r.ticketGuardarropa)} (${r.wardrobeQty})</span>`
        : '<span style="color: var(--text-muted); font-size: 0.8rem;">---</span>';

      const timeOnly = (r.date || '').split(' ')[1] || r.date || '';

      return `
        <tr>
          <td><strong style="color: var(--gold-primary);">${escapeHtml(r.id)}</strong></td>
          <td style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(timeOnly)}</td>
          <td>
            <strong>${escapeHtml(r.customer)}</strong>
            ${r.phone ? `<div style="font-size: 0.75rem; color: var(--text-muted);">📞 ${escapeHtml(r.phone)}</div>` : ''}
          </td>
          <td>${typeBadge}</td>
          <td>${guaBadge}</td>
          <td><strong style="color: var(--emerald-400);">$${Number(r.paid !== undefined ? r.paid : r.totalAmount).toFixed(2)}</strong></td>
          <td style="font-size: 0.82rem;">${escapeHtml(r.method || 'Efectivo')}</td>
          <td>
            <button type="button" class="btn-table-action" onclick="window.__domusApp.reprintAccessTicket('${r.id}')" title="Reimprimir Comprobante de Entrada">
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

    const q = (STATE.accessSearch || '').toLowerCase().trim();
    const records = (STATE.recentAccessList || []).filter(r => {
      if (!r.ticketGuardarropa || Number(r.wardrobeQty) <= 0) return false;
      if (!q) return true;
      const haystack = `${r.ticketGuardarropa} ${r.customer} ${r.wardrobeNotes || ''}`.toLowerCase();
      return haystack.includes(q);
    });

    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px 16px;">
            <div style="font-size: 2rem; margin-bottom: 8px;">🧥</div>
            No hay prendas registradas en el guardarropa actualmente.
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

    callBackend('accesoCambiarActividad', [eventName], res => {
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

    $('accessTicketFolio').textContent = `TICKET: ${record.id}`;
    $('accessTicketEvent').textContent = `EVENTO: ${record.activity || 'DOMUS'}`;
    $('accessTicketCustomer').textContent = `ASISTENTE: ${record.customer}`;
    $('accessTicketDate').textContent = `FECHA: ${record.date}`;

    // Itemized Details
    const detailsContainer = $('accessTicketDetailsList');
    if (detailsContainer) {
      let html = `
        <div class="receipt-item-row">
          <span>Entrada: ${escapeHtml(record.entryType)} (${record.packages} pers.)</span>
          <span>$${Number(record.entryCost || 0).toFixed(2)}</span>
        </div>
      `;
      if (record.wardrobeQty > 0) {
        html += `
          <div class="receipt-item-row">
            <span>Guardarropa (${record.wardrobeQty} prendas)</span>
            <span>$${Number(record.wardrobeCost || 0).toFixed(2)}</span>
          </div>
        `;
      }
      if (record.presaleFolio) {
        html += `<div style="font-size: 0.72rem; color: #4b5563; padding: 2px 0;">Preventa: ${escapeHtml(record.presaleFolio)}</div>`;
      }
      if (record.courtesyAuth) {
        html += `<div style="font-size: 0.72rem; color: #4b5563; padding: 2px 0;">Cortesía: ${escapeHtml(record.courtesyAuth)}</div>`;
      }
      detailsContainer.innerHTML = html;
    }

    $('accessTicketTotalAmount').textContent = `$${Number(record.paid !== undefined ? record.paid : record.totalAmount).toFixed(2)}`;

    const payInfo = $('accessTicketPaymentInfo');
    if (payInfo) {
      payInfo.innerHTML = `
        <div>Método: <strong>${escapeHtml(record.method || 'Efectivo')}</strong></div>
        <div style="font-size: 0.7rem; color: #6b7280; margin-top: 4px;">DOMUS Centro Cultural &middot; Ciudad de México</div>
      `;
    }

    // Wardrobe Tear-Off Stub
    const stub = $('wardrobeTearOffStub');
    if (stub) {
      if (record.wardrobeQty > 0 && record.ticketGuardarropa) {
        stub.style.display = 'block';
        $('stubWardrobeTicket').textContent = record.ticketGuardarropa;
        $('stubWardrobeQty').textContent = `${record.wardrobeQty} Prenda${record.wardrobeQty > 1 ? 's' : ''}`;
        $('stubWardrobeNotes').textContent = record.wardrobeNotes || '';
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

    // Phase Switcher (Solar / Lunar)
    $('btnPhaseToggle').addEventListener('click', () => {
      STATE.phase = STATE.phase === 'Solar' ? 'Lunar' : 'Solar';
      $('currentPhaseBadge').textContent = `Fase ${STATE.phase}`;
      toast(`Carta cambiada a Fase ${STATE.phase}`, 'ok');
      renderCatalog();
      renderCart();
    });

    // Refresh Button
    const btnRetryOutbox = $('btnOutboxRetry');
    if (btnRetryOutbox) {
      btnRetryOutbox.addEventListener('click', () => {
        toast('Reintentando sincronización de Outbox…', 'ok');
        processOutbox();
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

    // Confirm Access & Register Button
    if ($('btnConfirmAccess')) {
      $('btnConfirmAccess').addEventListener('click', confirmAccessAndRegister);
    }

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
  }


  // --- INICIALIZAR APP ---
  document.addEventListener('DOMContentLoaded', () => {
    initRouting();
    setupEventListeners();
    loadInitialData();
  });

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
    setActiveEvent: changeActiveEvent
  };

})();
