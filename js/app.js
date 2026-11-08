/**
 * DOMUS ADMIN & PUNTO DE VENTA - SISTEMA UNIFICADO
 * Modo Caja (POS / Cobro) y Modo Comandas (KDS Cocina y Barra)
 */

'use strict';

(function () {
  const OFFICIAL_PRODUCTION_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL/exec';
  const STAGING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyIHDox7F7DpyS5ag-5vdoffn01qnX99IqkxB9olhQAbePvU9JZCbF6u8HeubS7RVgZ/exec';
  // This gate runs before sessions, migrations, polling, printing or any transport.
  // The original queue/pending/receipts are never rewritten by review mode.
  function outboxReviewRequired_(includeOrphan) {
    if (window.DOMUS_OUTBOX_REVIEW_REQUESTED || localStorage.getItem('domus_outbox_review_hold_v1') !== null) return true;
    const raw=localStorage.getItem('domus_outbox'),queue=raw===null?[]:JSON.parse(raw);
    if(!Array.isArray(queue) || queue.some(q=>!q || q.clientContract!=='domus-outbox-v2' || !q.requestId))return true;
    if(includeOrphan && localStorage.getItem('domus_pending_sale')!==null) {
      const p=JSON.parse(localStorage.getItem('domus_pending_sale'));
      if(!p || !queue.some(q=>q.requestId===(p.requestId || p.id)))return true;
    }
    return false;
  }

  function assertOutboxTraffic_() {
    if(outboxReviewRequired_(false)) {
      const err=new Error('OUTBOX_REVIEW_REQUIRED: cola conservada; revisar sin reenviar.');
      err.code='OUTBOX_REVIEW_REQUIRED';err.status=409;throw err;
    }
  }

  function assertOutboxStoreWritable_() {
    const raw=localStorage.getItem('domus_outbox_review_hold_v1');
    if(raw!==null) {
      const hold=JSON.parse(raw);
      // Only operations already in flight may finish while the exclusive review
      // lock is pending, and only after their initial evidence is durable.
      if(!hold || hold.state!=='DRAINING' || localStorage.getItem('domus_outbox_review_initial_v1')===null) {
        throw new Error('OUTBOX_REVIEW_REQUIRED: conservar la evidencia original.');
      }
      validateReviewSnapshot_(localStorage.getItem('domus_outbox_review_initial_v1'));
    }
  }

  async function withOutboxTraffic_(fn) {
    assertOutboxTraffic_();
    if(!window.navigator?.locks?.request)throw new Error('OUTBOX_LOCK_REQUIRED');
    return window.navigator.locks.request('domus-outbox-traffic',{mode:'shared'},async()=>{
      assertOutboxTraffic_();return fn();
    });
  }

  function captureOutboxEvidence_() {
    const keys=new Set(['domus_outbox','domus_pending_sale','domus_device_id','domus_last_sale_confirmation']);
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if(key && key.startsWith('domus_confirmation_'))keys.add(key);
    }
    const values={};Array.from(keys).sort().forEach(k=>{values[k]=localStorage.getItem(k);});
    return {version:1,capturedAt:new Date().toISOString(),origin:window.location.origin,values:values};
  }

  function validateReviewSnapshot_(raw) {
    const snapshot=JSON.parse(raw);
    if(!snapshot || snapshot.version!==1 || !snapshot.values || Array.isArray(snapshot.values) ||
        !Object.prototype.hasOwnProperty.call(snapshot.values,'domus_outbox'))throw new Error('Copia de revisión incompleta; conservar sin sustituir.');
    return snapshot;
  }

  function reviewEvidence_() {
    const holdRaw=localStorage.getItem('domus_outbox_review_hold_v1'),hold=JSON.parse(holdRaw);
    if(!hold || hold.version!==1)throw new Error('Marca de revisión inválida.');
    if(hold.state==='RELEASE_READY') {
      const archived=JSON.parse(localStorage.getItem(hold.archiveKey));
      if(!archived || archived.format!=='DOMUS_OUTBOX_REVIEW_RELEASE_V1')throw new Error('Archivo de revisión incompleto.');
      validateReviewSnapshot_(archived.initialRaw);validateReviewSnapshot_(archived.settledRaw);
      return {hold,holdRaw,initialRaw:archived.initialRaw,settledRaw:archived.settledRaw,archiveKey:hold.archiveKey};
    }
    return {hold,holdRaw,initialRaw:localStorage.getItem('domus_outbox_review_initial_v1'),settledRaw:localStorage.getItem('domus_outbox_review_settled_v1')};
  }

  function reviewReleaseDecision_() {
    try {
      const evidence=reviewEvidence_();
      if(!['REQUIRES_REVIEW','RELEASE_READY'].includes(evidence.hold.state))throw new Error('La preservación aún no termina.');
      const initial=validateReviewSnapshot_(evidence.initialRaw).values,settled=validateReviewSnapshot_(evidence.settledRaw).values;
      const observed=captureOutboxEvidence_().values;
      const queue=values=>{
        if(!Object.prototype.hasOwnProperty.call(values,'domus_pending_sale'))throw new Error('Copia sin intención pendiente acreditada.');
        const q=values.domus_outbox===null?[]:JSON.parse(values.domus_outbox);
        if(!Array.isArray(q))throw new Error('Cola ilegible.');return q;
      };
      const before=queue(initial),after=queue(settled),current=queue(observed);
      if(after.length || current.length || settled.domus_pending_sale!==null || observed.domus_pending_sale!==null)
        throw new Error('Hay '+current.length+' entrada(s) en la cola actual'+(observed.domus_pending_sale!==null?' y una intención de venta pendiente':'')+'. Conservar y conciliar sus IDs; no se habilita reenvío.');
      if(JSON.stringify(observed)!==JSON.stringify(settled))throw new Error('La evidencia cambió después de la pausa; requiere revisión.');
      const seen=new Set();
      for(const item of before) {
        if(!item || item.clientContract!=='domus-outbox-v2' || !item.requestId || seen.has(item.requestId))throw new Error('Historia anterior o duplicada sin resolver.');
        seen.add(item.requestId);
        const ack=JSON.parse(settled['domus_confirmation_'+item.requestId] || 'null');
        if(!ack || ack.requestId!==item.requestId || ack.action!==item.action || JSON.stringify(ack.args)!==JSON.stringify(item.args))throw new Error('Falta comprobante de la misma intención.');
        const body=item.args && item.args[0];
        if(!body || !((item.action==='cajaSimpleRegistrar' && validSaleResult_(ack.data,body)) ||
          (item.action==='confirmarTransferencia' && validTransferResult_(ack.data,body)) ||
          (item.action==='cancelarTransferenciaNoRecibida' && validTransferCancellationResult_(ack.data,body)) ||
          (item.action==='vincularPagoExistente' && validExistingPaymentResult_(ack.data,body))))throw new Error('Comprobante incompleto o acción sin contrato de cierre.');
      }
      if(initial.domus_pending_sale!==null) {
        const pending=JSON.parse(initial.domus_pending_sale),id=pending && (pending.requestId || pending.id);
        if(!id || !before.some(q=>q.action==='cajaSimpleRegistrar' && q.requestId===id && JSON.stringify(q.args[0])===JSON.stringify(pending)))
          throw new Error('La intención inicial no tiene vínculo completo; requiere conciliación.');
      }
      return {allowed:true,reason:before.length?'CONFIRMED_DURING_PAUSE':'EMPTY_REVIEW',evidence,
        message:before.length?'La cola terminó vacía y conserva los comprobantes completos de sus intenciones.':'No hay intenciones en la cola ni en las copias de revisión.'};
    } catch(err) {return {allowed:false,message:err.message};}
  }

  async function releaseReviewedOutbox_() {
    if(!window.navigator?.locks?.request)throw new Error('OUTBOX_LOCK_REQUIRED');
    return window.navigator.locks.request('domus-outbox-traffic',()=>window.navigator.locks.request('domus-outbox-store',()=>{
      const decision=reviewReleaseDecision_();if(!decision.allowed)throw new Error(decision.message);
      const e=decision.evidence;
      if(e.hold.state!=='RELEASE_READY') {
        const key='domus_outbox_review_archive_'+crypto.randomUUID();
        const raw=JSON.stringify({format:'DOMUS_OUTBOX_REVIEW_RELEASE_V1',closedAt:new Date().toISOString(),reason:decision.reason,
          holdRaw:e.holdRaw,initialRaw:e.initialRaw,settledRaw:e.settledRaw,observed:captureOutboxEvidence_()});
        localStorage.setItem(key,raw);
        if(localStorage.getItem(key)!==raw)throw new Error('No se pudo conservar el archivo de revisión.');
        localStorage.setItem('domus_outbox_review_hold_v1',JSON.stringify({version:1,state:'RELEASE_READY',archiveKey:key}));
      }
      // Remove only the active review keys, after a durable archive. Original
      // Outbox/pending/receipts remain untouched. A failed cleanup stays held.
      localStorage.removeItem('domus_outbox_review_initial_v1');
      localStorage.removeItem('domus_outbox_review_settled_v1');
      localStorage.removeItem('domus_outbox_review_hold_v1');
      return decision.reason;
    }));
  }

  function reviewReturnUrl_() {
    const native=window.DOMUS_NATIVE_BOOT;
    if(native && !['STAGING','PRODUCTION'].includes(native.environment))throw new Error('Entorno nativo sin acreditar; conservar revisión.');
    const url=new URL(native?(native.environment==='STAGING'?STAGING_ENDPOINT:OFFICIAL_PRODUCTION_ENDPOINT):window.location.href);
    url.searchParams.delete('revision');
    if(native)url.searchParams.set('vista',native.view || 'caja');
    return url.href;
  }

  async function preserveOutboxForReview_() {
    window.DOMUS_OUTBOX_REVIEW_REQUESTED=true;
    if(!window.navigator?.locks?.request)throw new Error('Faltan Web Locks. No se inició la app; conserva el almacenamiento.');
    // Persist a small stop marker first. If the snapshot hits quota, the original
    // remains untouched and every subsequent store writer fails closed.
    await window.navigator.locks.request('domus-outbox-store',()=>{
      const raw=localStorage.getItem('domus_outbox_review_hold_v1');
      if(raw===null)localStorage.setItem('domus_outbox_review_hold_v1',JSON.stringify({version:1,state:'DRAINING',requestedAt:new Date().toISOString()}));
      else {
        const hold=JSON.parse(raw);
        if(!hold || hold.version!==1 || !['DRAINING','REQUIRES_REVIEW','RELEASE_READY'].includes(hold.state))throw new Error('Marca de revisión ilegible; se conserva sin sustituirla.');
        if(hold.state==='RELEASE_READY'){reviewEvidence_();return;}
        if(hold.state==='REQUIRES_REVIEW') {
          validateReviewSnapshot_(localStorage.getItem('domus_outbox_review_initial_v1'));
          validateReviewSnapshot_(localStorage.getItem('domus_outbox_review_settled_v1'));
        }
      }
      if(localStorage.getItem('domus_outbox_review_initial_v1')===null) {
        localStorage.setItem('domus_outbox_review_initial_v1',JSON.stringify(captureOutboxEvidence_()));
      }
      validateReviewSnapshot_(localStorage.getItem('domus_outbox_review_initial_v1'));
    });
    // Shared traffic includes enqueue, response/ACK and failure persistence.
    // A request already sent cannot be undone; wait for it, then capture its end.
    return window.navigator.locks.request('domus-outbox-traffic',()=>window.navigator.locks.request('domus-outbox-store',()=>{
      const hold=JSON.parse(localStorage.getItem('domus_outbox_review_hold_v1'));
      if(['REQUIRES_REVIEW','RELEASE_READY'].includes(hold.state))return hold;
      localStorage.setItem('domus_outbox_review_settled_v1',JSON.stringify(captureOutboxEvidence_()));
      const result={...hold,state:'REQUIRES_REVIEW',settledAt:new Date().toISOString()};
      localStorage.setItem('domus_outbox_review_hold_v1',JSON.stringify(result));return result;
    }));
  }

  function downloadOutboxEvidence_() {
    const evidence={format:'DOMUS_OUTBOX_REVIEW_V1',exportedAt:new Date().toISOString(),
      holdRaw:localStorage.getItem('domus_outbox_review_hold_v1'),
      initialRaw:localStorage.getItem('domus_outbox_review_initial_v1'),
      settledRaw:localStorage.getItem('domus_outbox_review_settled_v1'),observed:captureOutboxEvidence_()};
    evidence.archives={};
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(key && key.startsWith('domus_outbox_review_archive_'))evidence.archives[key]=localStorage.getItem(key);
    }
    const url=URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='DOMUS-cola-revision-'+Date.now()+'.json';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function enterOutboxReview_() {
    window.DOMUS_OUTBOX_REVIEW_REQUESTED=true;
    if(window.DOMUS_QUEUE_REVIEW_UI_STARTED)return;
    window.DOMUS_QUEUE_REVIEW_UI_STARTED=true;
    if(window.DOMUS_PAUSE_FOR_REVIEW)window.DOMUS_PAUSE_FOR_REVIEW();
    // Works before normal app initialization and from an already-open new client.
    const render=()=>{
      document.body.innerHTML='<main style="max-width:760px;margin:40px auto;padding:24px;color:#eee;background:#151820;font:16px system-ui">'+
        '<h1>Cola en revisión</h1><p>La app operativa está detenida. No se reenvía, descarta ni confirma ningún ID desde esta pantalla.</p>'+
        '<p id="queueReviewStatus" role="status">Preservando evidencia y esperando solicitudes que ya estaban en curso…</p>'+
        '<button id="queueReviewDownload" type="button">Descargar evidencia privada</button>'+
        '<p id="queueReviewDecision"></p><button id="queueReviewRelease" type="button" disabled>Cerrar revisión sin pendientes</button><p id="queueReviewContinue"></p>'+
        '<p>Guarda el archivo de forma privada. Incluye los cuerpos originales y recibos disponibles, sin verificar cobros contra el servidor.</p>'+
        '<p>Cierra clientes de versiones anteriores: no conocen este bloqueo. Una solicitud ya enviada puede haber tenido efectos.</p>'+
        '<p>Las intenciones inciertas permanecen bloqueadas. Cerrar una revisión resuelta conserva su archivo y no reenvía operaciones.</p></main>';
      const status=document.getElementById('queueReviewStatus');
      document.getElementById('queueReviewDownload').onclick=()=>{
        try{downloadOutboxEvidence_();}catch(err){status.textContent='No se pudo descargar: '+err.message+'. Conserva este perfil; no borres la cola.';}
      };
      const release=document.getElementById('queueReviewRelease');
      release.onclick=async()=>{
        release.disabled=true;
        try {
          const returnUrl=reviewReturnUrl_();
          await releaseReviewedOutbox_();
          status.textContent='Revisión cerrada y archivada. No se envió ninguna operación.';
          const link=document.createElement('a');link.href=returnUrl;link.target='_top';link.textContent='Abrir la app';
          document.getElementById('queueReviewContinue').appendChild(link);
        } catch(err) {status.textContent='No se cerró la revisión: '+err.message;release.disabled=!reviewReleaseDecision_().allowed;}
      };
      preserveOutboxForReview_().then(()=>{
        status.textContent='Revisión persistida. Cola original y copias conservadas. Esta versión no iniciará nuevos envíos; revisa los efectos de solicitudes anteriores.';
        const decision=reviewReleaseDecision_();document.getElementById('queueReviewDecision').textContent=decision.message;release.disabled=!decision.allowed;
      },err=>{
        status.textContent='Bloqueo local sin completar: '+err.message+'. No operar ni cerrar sin preservar la evidencia. Descargar no libera la cola.';
      });
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
  }

  let startInReview;
  try {
    startInReview=new URLSearchParams(window.location.search).get('revision')==='cola' ||
      window.DOMUS_NATIVE_BOOT?.queueReview===true || outboxReviewRequired_(true);
  } catch(_) {startInReview=true;}
  if(startInReview){enterOutboxReview_();return;}

  // --- CONFIGURACIÓN & ESTADO INICIAL ---
  const STAFF_MEMBERS = ['René', 'Miguel', 'Mike', 'Taichi Mike', 'Meaw', 'Wall E', 'Iván', 'Kas', 'Steven', 'Angel'];

  // Determinar entorno de ejecución (Issue #1: Bloqueo estricto del endpoint productivo)
  const _urlParams = new URLSearchParams(window.location.search);
  const nativeBoot=window.DOMUS_NATIVE_BOOT || {};
  if(nativeBoot.view)_urlParams.set('vista',nativeBoot.view);
  const _isStagingExplicit = nativeBoot.environment==='STAGING' || _urlParams.get('env') === 'staging';
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

  // Metadatos canónicos del build de frontend
  window.DOMUS_BUILD = {
    baseCommit: '2b7ba1f4030b1013555b93cb96cfcb594141fdcb',
    buildId: 'repair-reconcile-20261105',
    ui: '20261108-existing-payment-17',
    environment: isProductionLocked ? 'PRODUCTION' : 'STAGING'
  };

  const STATE = {
    mode: 'caja', // 'caja' | 'comandas'
    phase: 'Solar', // Valor inicial no autoritativo; la fuente de verdad siempre es CAJA 2!F2
    phaseSyncedFromServer: false,
    operatingPeriod: {allowed:false,message:'Verificando periodo operativo antes de cobrar…'},
    apiUrl: validApiUrl,
    isProductionLocked: isProductionLocked,
    backendEnvironment: isProductionLocked ? 'PRODUCTION' : 'STAGING',
    endpointDeploymentId: 'AKfycbzy7wZZ55zPnzZ6h9iRKXNAvitP5EZMCPyjsxPtLIpdtuv4_3Zt9SYqQS65I1WRGJGL',
    operator: sessionStorage.getItem('domus_operator') || '',
    sound: localStorage.getItem('domus_sound') === 'true',
    catalogCategory: 'Todas',
    searchQuery: '',
    cart: [], // [{ name, group, price, qty, courtesy, destination }]
    selectedAccountTicket: '',
    customerName: '',
    activity: localStorage.getItem('domus_pos_activity') || 'Visita general DOMUS',
    accountType: '', // '' | 'Amigo' | 'Creador de proyecto'
    
    // DOMUS Print Bridge
    printerStatus: 'offline', // 'ready' | 'busy' | 'offline'
    lastReceiptData: null,
    lastAccessRecord: null,

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
    eventChangePending: false,
    eventChangeRevision: 0,
    eventsList: [],
    activityPolicyPending: false,
    recentAccessList: [],
    accessSelectedType: 'General',
    accessWardrobeQty: 0,
    accessPaymentMethod: 'Efectivo',
    accessSearch: '',
    accessTab: 'log', // 'log' | 'wardrobe' | 'events'
    openingFloat: 600,
    openingFloatProvider: 'Steven',
    openingFloatConcept: 'Fondo inicial / fondo de cambio',
    deletedAccessIds: new Set(),
    editedAccessMap: {},
    
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

  async function unlockCajaWithPin() {
    const input=$('cajaPinInput');const secret=input.value;input.value='';
    try {
      const res=await transport_({action:'authCrearSesion',args:['CAJA',STATE.operator || 'Caja',getDeviceId(),secret],role:'CAJA',deviceId:getDeviceId()});
      if(!res.ok || !res.data || !res.data.token)throw new Error('Credencial no válida en el servidor.');
      setSessionToken(res.data.token,'CAJA');
      sessionStorage.setItem('domus_caja_session','true');
      closeCajaLockModal();setMode('caja');syncBackendData();
    }catch(err){$('cajaPinError').textContent=err.message;}
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
    let vista = nativeBoot.view || params.get('vista') || '';
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
    'turnoAbrir',
    'corteZCerrar',
    'cajaSimpleRegistrar',
    'confirmarTransferencia',
    'cancelarTransferenciaNoRecibida',
    'vincularPagoExistente',
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

  function isSessionExpiredError(error) {
    if (!error) return false;
    const msg = (typeof error === 'string' ? error : (error.message || error.error || '')).toLowerCase();
    return (
      msg.includes('sesión de la estación ha caducado') ||
      msg.includes('sesion de la estacion ha caducado') ||
      msg.includes('token de sesión inválido') ||
      msg.includes('token de sesion invalido') ||
      msg.includes('token no válido') ||
      msg.includes('token no valido') ||
      msg.includes('sesión caducada') ||
      msg.includes('sesion caducada') ||
      msg.includes('sesión inválida') ||
      msg.includes('sesion invalida') ||
      msg.includes('expirada') ||
      msg.includes('autentica nuevamente') ||
      msg.includes('session expired') ||
      msg.includes('vuelve a iniciar sesión') ||
      msg.includes('vuelve a iniciar sesion')
    );
  }

  function getSessionToken(targetRole) {
    const role=(targetRole || getStationRole()).toUpperCase();
    return sessionStorage.getItem('domus_session_token_'+role) || '';
  }

  function setSessionToken(token, role) {
    const cleanRole = (role || getStationRole()).toUpperCase();
    if (token) sessionStorage.setItem('domus_session_token_' + cleanRole, token);
  }

  function clearSessionToken(targetRole) {
    const role = (targetRole || getStationRole()).toUpperCase();
    for (const storage of [sessionStorage, localStorage]) {
      storage.removeItem('domus_session_token_' + role);
      storage.removeItem('domus_session_role_' + role);
      if ((storage.getItem('domus_session_role') || '').toUpperCase() === role) {
        storage.removeItem('domus_session_token');
        storage.removeItem('domus_session_role');
      }
    }
  }

  function getStationRole() {
    if (STATE.mode === 'caja') return 'CAJA';
    if (STATE.mode === 'comandas') return STATE.kdsFilterDest === 'Cocina' ? 'COCINA' : 'BARRA';
    if (STATE.mode === 'accesos') return 'ACCESOS';
    return 'CAJA';
  }

  const sessionRequests = new Map();
  ['cambiarFase','solicitarResurtido','editarAcceso','anularAcceso'].forEach(a=>MUTATION_ACTIONS.add(a));
  function validSaleResult_(result, intention) {
    if (!result || typeof result !== 'object' || Array.isArray(result) || result.ok !== true ||
        typeof result.ticket !== 'string' || !result.ticket.trim() ||
        (intention.ticket && result.ticket !== intention.ticket) ||
        typeof result.total !== 'number' || !Number.isFinite(result.total) || result.total < 0 ||
        (intention.paid === true && intention.expectedTotal != null &&
          (!Number.isFinite(Number(intention.expectedTotal)) || Math.abs(result.total - Number(intention.expectedTotal)) > 0.01))) return false;
    const receipt = typeof result.receipt === 'string' && result.receipt.trim().length > 0;
    if (result.paymentStatus === 'CORTESIA_AUTORIZADA') {
      return !intention.ticket && Array.isArray(intention.items) && intention.items.length > 0 && intention.items.every(i => i && i.courtesy === true) &&
        result.total === 0 && result.paid === false && result.verified === false && result.receipt === '' && result.method === 'Cortesía';
    }
    if (intention.paid === false) {
      return result.paymentStatus === 'CUENTA_ABIERTA' && result.paid === false && result.verified === false && result.receipt === '' && result.method === '';
    }
    if (intention.paid !== true || !receipt || result.total <= 0.01 || result.method !== intention.method) return false;
    if (intention.method === 'Transferencia') {
      return result.paymentStatus === 'PENDIENTE_VERIFICACION' && result.paid === false && result.verified === false;
    }
    if(intention.method==='Mixto') {
      const cents=v=>typeof v==='number' && Number.isFinite(v) && v>=0 && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100))<0.00001?Math.round(v*100):null;
      const parts=result.payments,expected=intention.payments;
      return result.paymentStatus==='CONFIRMADA' && result.paid===true && result.verified===true &&
        result.sourceRequestId===(intention.requestId || intention.id) && intention.terminalConfirmed===true && result.terminalConfirmed===true &&
        typeof intention.terminalReference==='string' && !!intention.terminalReference.trim() && result.terminalReference===intention.terminalReference.trim() &&
        Array.isArray(parts) && parts.length===2 && Array.isArray(expected) && expected.length===2 &&
        parts.every((p,i)=>p && expected[i] && p.receipt===result.receipt+(i===0?'-E':'-T') && p.method===expected[i].method && p.amount===expected[i].amount && cents(p.amount)>0) &&
        parts[0].method==='Efectivo' && ['Terminal 1','Terminal 2'].includes(parts[1].method) &&
        cents(result.total)!==null && cents(parts[0].amount)+cents(parts[1].amount)===cents(result.total) &&
        cents(result.received)!==null && cents(result.tip)!==null && cents(result.change)!==null &&
        result.received===intention.received && result.tip===intention.tip &&
        cents(result.received)-cents(parts[0].amount)-cents(result.tip)===cents(result.change);
    }
    return ['Efectivo','Terminal 1','Terminal 2'].includes(intention.method) &&
      result.paymentStatus === 'CONFIRMADA' && result.paid === true && result.verified === true;
  }

  function validTransferResult_(result, intention) {
    return !!result && typeof result==='object' && !Array.isArray(result) && result.ok===true && result.kind==='TRANSFER_CONFIRMATION' &&
      ['sourceRequestId','sourceReceipt','ticket','receiver'].every(k=>typeof result[k]==='string' && !!result[k].trim()) && intention.currency==='MXN' &&
      result.sourceRequestId===intention.sourceRequestId && result.sourceReceipt===intention.sourceReceipt && result.ticket===intention.ticket &&
      typeof result.receipt==='string' && !!result.receipt.trim() && result.receipt!==result.sourceReceipt && typeof result.confirmationRequestId==='string' && !!result.confirmationRequestId.trim() &&
      typeof result.total==='number' && Number.isFinite(result.total) && result.total>0 && result.total===intention.amount && result.amountApplied===intention.amount && result.currency==='MXN' &&
      result.method==='Transferencia' && result.paymentStatus==='CONFIRMADA' && result.paid===true && result.verified===true && result.verificationMode==='MANUAL_BANK_REVIEW' &&
      ['ADMIN','GERENCIA'].includes(result.verifiedRole) && typeof result.verifiedBy==='string' && !!result.verifiedBy.trim() && typeof result.verifiedAt==='string' && Number.isFinite(Date.parse(result.verifiedAt)) &&
      typeof result.verifiedPrincipal==='string' && !!result.verifiedPrincipal.trim() &&
      result.receiver===intention.receiver && result.receivedDate===intention.receivedDate && result.evidenceReference===String(intention.evidenceReference || '').trim() &&
      result.bankTransactionId===String(intention.bankTransactionId || '').trim().toUpperCase().replace(/\s+/g,'');
  }

  function validJourneyContext_(c) {
    return !!c && typeof c==='object' && !Array.isArray(c) && c.version===1 &&
      typeof c.openingRequestId==='string' && !!c.openingRequestId && c.journeyId==='JOR-'+c.openingRequestId &&
      typeof c.shiftId==='string' && !!c.shiftId && c.status==='OPEN' && c.allowed===true &&
      ['openedAt','occurredAt'].every(k=>typeof c[k]==='string' && Number.isFinite(Date.parse(c[k]))) &&
      !!c.scope && ['projectId','projectName'].every(k=>typeof c.scope[k]==='string' && !!c.scope[k].trim()) &&
      ((c.scope.eventId===null && c.scope.eventName==='') || ['eventId','eventName'].every(k=>typeof c.scope[k]==='string' && !!c.scope[k].trim()));
  }

  function validTransferCancellationResult_(r,p) {
    if(!r || typeof r!=='object' || Array.isArray(r) || !p || r.ok!==true || r.kind!=='TRANSFER_CANCELLATION' || r.version!==1 ||
      r.status!=='CANCELLED_NO_RECEIPT' || r.cancellationRequestId!==(p.requestId || p.id) || r.sourceRequestId!==p.sourceRequestId || r.sourceReceipt!==p.sourceReceipt ||
      r.ticket!==p.ticket || r.snapshotHash!==p.snapshotHash || r.cancelledAmount!==p.expectedAmount || typeof r.cancelledAmount!=='number' || !Number.isFinite(r.cancelledAmount) || r.cancelledAmount<=0 ||
      r.currency!=='MXN' || r.amountApplied!==0 || r.refund!==0 || r.inventoryMovement!==0 || r.paid===true || r.verified===true ||
      !validJourneyContext_(r.journey) || r.journey.openingRequestId!==p.openingRequestId || r.reason!==String(p.reason || '').trim() ||
      !['ADMIN','GERENCIA'].includes(r.authorizedRole) || !['authorizedPrincipal','authorizedBy','sourceEvidenceHash'].every(k=>typeof r[k]==='string' && !!r[k]) ||
      typeof r.cancelledAt!=='string' || !Number.isFinite(Date.parse(r.cancelledAt)) || !r.review || r.review.noDeliveryConfirmed!==true || r.review.noBankReceiptConfirmed!==true ||
      !p.review || r.review.evidenceReference!==String(p.review.evidenceReference || '').trim() || !r.wasteReview || !p.wasteReview ||
      !['NO_WASTE_OBSERVED','WASTE_OBSERVED','PENDING_REVIEW'].includes(r.wasteReview.status) || r.wasteReview.status!==p.wasteReview.status ||
      r.wasteReview.note!==String(p.wasteReview.note || '').trim() || r.wasteReview.inventoryApplied!==false || r.closureBlocked!==(r.wasteReview.status!=='NO_WASTE_OBSERVED') ||
      !Array.isArray(r.units) || !r.units.length || !Array.isArray(p.expectedUnitIds))return false;
    const ids=r.units.map(u=>u && u.id);
    return ids.every(id=>typeof id==='string' && !!id) && new Set(ids).size===ids.length && JSON.stringify(ids.slice().sort())===JSON.stringify(p.expectedUnitIds.slice().sort());
  }

  function validExistingPaymentResult_(r,p) {
    if(!r || typeof r!=='object' || Array.isArray(r) || !p || r.ok!==true || r.kind!=='TRANSFER_EXISTING_PAYMENT_LINK' || r.version!==1 ||
      r.status!=='LINKED_EXISTING_PAYMENT' || r.linkRequestId!==(p.requestId || p.id) || r.sourceRequestId!==p.sourceRequestId || r.sourceReceipt!==p.sourceReceipt ||
      r.ticket!==p.ticket || r.existingPaymentRequestId!==p.existingPaymentRequestId || r.existingPaymentReceipt!==p.existingPaymentReceipt ||
      r.existingPaymentMethod!==p.expectedPaymentMethod || !['Efectivo','Terminal 1','Terminal 2','Mixto'].includes(r.existingPaymentMethod) ||
      r.linkedAmount!==p.expectedAmount || typeof r.linkedAmount!=='number' || !Number.isFinite(r.linkedAmount) || r.linkedAmount<=0 || r.currency!=='MXN' ||
      r.newCharge!==0 || r.amountApplied!==0 || r.refund!==0 || r.inventoryMovement!==0 || r.paid===true || r.verified===true ||
      r.confirmExistingPayment!==true || p.confirmExistingPayment!==true || p.newCharge!==0 || r.snapshotHash!==p.snapshotHash || !/^[a-f0-9]{64}$/.test(r.sourceEvidenceHash || '') ||
      !validJourneyContext_(r.journey) || r.journey.openingRequestId!==p.openingRequestId ||
      !['GERENCIA','ADMIN'].includes(r.authorizedRole) || !['authorizedPrincipal','authorizedBy'].every(k=>typeof r[k]==='string' && !!r[k]) ||
      typeof r.linkedAt!=='string' || !Number.isFinite(Date.parse(r.linkedAt)) || r.reason!==String(p.reason || '').trim() || r.evidenceReference!==String(p.evidenceReference || '').trim() ||
      !Array.isArray(r.units) || !r.units.length || !Array.isArray(p.expectedUnitIds) || !Array.isArray(r.paymentParts) || !r.paymentParts.length || !Array.isArray(p.expectedPaymentParts))return false;
    const ids=r.units.map(u=>u && u.id),parts=x=>x.map(a=>[a?.receipt,a?.method,a?.amount]);
    return ids.every(id=>typeof id==='string' && !!id) && new Set(ids).size===ids.length && JSON.stringify(ids.slice().sort())===JSON.stringify(p.expectedUnitIds.slice().sort()) &&
      JSON.stringify(parts(r.paymentParts))===JSON.stringify(parts(p.expectedPaymentParts));
  }

  function validMovementJourney_(r,body) {
    return !!r && validJourneyContext_(r.journey) && validJourneyContext_(r.originJourney) &&
      r.journey.openingRequestId===body.openingRequestId && r.originJourney.scope.projectId===r.journey.scope.projectId;
  }

  function validJourneyResult_(r,payload) {
    const body=payload.args?.[0] || {},id=payload.requestId;
    if(!r || typeof r!=='object' || Array.isArray(r) || r.ok!==true || r.journeyContract!=='domus-journey-v1' || !id)return false;
    if(payload.action==='turnoAbrir')return r.openingRequestId===id && r.journeyId==='JOR-'+id && r.shiftId==='TURNO-'+id && r.status==='OPEN' &&
      r.scopeId===body.scopeId && typeof r.openingFloat==='number' && r.openingFloat===body.openingFloat &&
      ['stationId','registerId','openedAt','activity'].every(k=>typeof r[k]==='string' && !!r[k]) && Number.isFinite(Date.parse(r.openedAt)) &&
      validJourneyContext_({version:1,openingRequestId:id,journeyId:r.journeyId,shiftId:r.shiftId,status:'OPEN',allowed:true,openedAt:r.openedAt,occurredAt:r.openedAt,scope:r.scope});
    return r.closingRequestId===id && r.openingRequestId===body.openingRequestId && r.journeyId==='JOR-'+body.openingRequestId &&
      r.shiftId==='TURNO-'+body.openingRequestId && r.cutId==='CORTE-JOR-'+id && r.status==='CLOSED' &&
      typeof r.closedAt==='string' && Number.isFinite(Date.parse(r.closedAt)) && r.countedCash===body.countedCash &&
      r.financialFinal===false && r.coverage==='JOURNEY_POS_RECEIPTS' && !!r.snapshot && r.snapshot.financialFinal===false &&
      r.snapshot.coverage===r.coverage && Array.isArray(r.snapshot.movements) && Array.isArray(r.snapshot.openAccounts) &&
      Array.isArray(r.snapshot.pendingTransfers) && r.snapshot.pendingTransfers.length===0 &&
      Array.isArray(r.snapshot.pendingDeliveries) && r.snapshot.pendingDeliveries.length===0 &&
      (r.closurePolicy===undefined || r.closurePolicy==='RESOLVE_PENDING_TRANSFERS_AND_DELIVERIES') && !!r.snapshot.totals &&
      ['Efectivo','Terminal 1','Terminal 2','Transferencia'].every(k=>typeof r.snapshot.totals[k]==='number' && Number.isFinite(r.snapshot.totals[k]) && r.snapshot.totals[k]>=0);
  }

  function validateBackendResponse_(response, payload) {
    if (!response || typeof response !== 'object' || Array.isArray(response) || typeof response.ok !== 'boolean' ||
        (response.ok && payload && payload.action==='vincularPagoExistente' &&
          (!payload.requestId || response.requestId!==payload.requestId || !validExistingPaymentResult_(response.data,payload.args?.[0]))) ||
        (response.ok && payload && payload.action==='cancelarTransferenciaNoRecibida' &&
          (!payload.requestId || response.requestId!==payload.requestId || !validTransferCancellationResult_(response.data,payload.args?.[0]))) ||
        (response.ok && payload && ['turnoAbrir','corteZCerrar'].includes(payload.action) &&
          (response.requestId!==payload.requestId || !validJourneyResult_(response.data,payload))) ||
        (response.ok && payload && ['cajaSimpleRegistrar','confirmarTransferencia'].includes(payload.action) && payload.args?.[0]?.openingRequestId &&
          (!validMovementJourney_(response.data,payload.args[0]) || (payload.action==='cajaSimpleRegistrar' && response.data.sourceRequestId!==payload.requestId))) ||
        (response.ok && (response.data === undefined || response.data === null)) ||
        (response.ok && payload && payload.action === 'cajaSimpleRegistrar' &&
          (!payload.requestId || response.requestId !== payload.requestId || !validSaleResult_(response.data, payload.args && payload.args[0] || {}))) ||
        (response.ok && payload && payload.action==='confirmarTransferencia' &&
          (!payload.requestId || response.requestId!==payload.requestId || !validTransferResult_(response.data,payload.args && payload.args[0] || {})))) {
      // Missing acknowledgement is uncertainty, including after a committed payment.
      // Keep its original ID/body for recovery; never clear the draft or invent success.
      const err = new Error('Respuesta incompleta del servidor. La operación sigue sin confirmar; recupera el mismo ID.');
      err.code = 'TRANSPORT_INVALID_RESPONSE'; err.status = 502; throw err;
    }
    return response;
  }

  async function transport_(payload) {
    assertOutboxTraffic_();
    if(MUTATION_ACTIONS.has(payload.action)) {
      const health=await transport_({action:'health',args:[],role:payload.role,deviceId:payload.deviceId});
      const d=health && health.data || {};
      const expected=STATE.isProductionLocked
        ? ['PRODUCTION','1KQz8oJ4VaWFsqS2-sg25HMCm60SdSoQpIDlCDSV5J1U','1DiwPa1cVe33xCYkIiYoHhP015RsEOjHXBFe2iU2RVCc']
        : ['STAGING','114VSwo3bXyn_audh1LHr4qqjW5aSDSTP_bR_-Iz5dkg','1NDpuyx6EfCHcoKW9CZ6pwR0oe2JS0aKpTTMa7RdqmlE'];
      if(!health.ok || JSON.stringify([d.environment,d.mainSheetId,d.opsSheetId])!==JSON.stringify(expected)) {
        const err=new Error('ENVIRONMENT_MISMATCH: no se envió la operación; entorno/libros no coinciden.');err.status=400;throw err;
      }
    }
    assertOutboxTraffic_();
    if (STATE.isNativeGas && window.google && google.script && google.script.run) {
      const result = await new Promise((resolve, reject) => google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).dispatchNativeAction(payload));
      return validateBackendResponse_(result, payload);
    }
    const response = await fetch(STATE.apiUrl, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload)});
    let result;
    try { result = await response.json(); }
    catch (_) { return validateBackendResponse_(null, payload); }
    return validateBackendResponse_(result, payload);
  }

  function requestStationSecret_(role) {
    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div'); overlay.className = 'modal-overlay open';
      const form = document.createElement('form'); form.className = 'modal-card'; form.style.padding = '24px';
      const label = document.createElement('label'); label.textContent = 'Credencial de estación ' + role + ' (validada por el servidor)';
      const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'current-password'; input.required = true;
      const ok = document.createElement('button'); ok.type = 'submit'; ok.textContent = 'Autenticar';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
      label.appendChild(input); form.append(label,ok,cancel); overlay.appendChild(form); document.body.appendChild(overlay);
      form.onsubmit = e => {e.preventDefault(); const secret=input.value; input.value=''; overlay.remove(); resolve(secret);};
      cancel.onclick = () => {input.value=''; overlay.remove(); reject(new Error('Autenticación cancelada.'));}; input.focus();
    });
  }

  function ensureSessionToken(onDone, targetRole, forceRefresh = false) {
    const role = (targetRole || getStationRole()).toUpperCase();
    // Join the existing login before considering a cached token or another refresh.
    if (!sessionRequests.has(role)) {
      if (forceRefresh) clearSessionToken(role);
      const current = getSessionToken(role);
      if (current) {
        if (onDone) onDone(null, current);
        return Promise.resolve(current);
      }
      const deviceId = getDeviceId();
      const operator = STATE.operator || 'Operador ' + role;
      const login = credential => transport_({action:'authCrearSesion',args:[role,operator,deviceId,credential],role,deviceId});
      sessionRequests.set(role, (async () => {
        let res = await login('');
        if (res && !res.ok) res = await login(await requestStationSecret_(role));
        if (!res || !res.ok || !res.data || !res.data.token) throw new Error('Acceso denegado: credencial de estación no válida.');
        setSessionToken(res.data.token, role);
        return res.data.token;
      })().finally(() => sessionRequests.delete(role)));
    }
    return sessionRequests.get(role).then(token => {
      if (onDone) onDone(null, token);
      return token;
    }, err => {
      updateSyncPill('error');
      if (onDone) { onDone(err); return; }
      throw err;
    });
  }

  async function authenticatedTransport_(payload) {
    const role = payload.role;
    await ensureSessionToken(null, role);
    const sentToken = getSessionToken(role);
    let result = await transport_({...payload, sessionToken:sentToken});
    // Only explicit session rejection permits one retry. Network uncertainty does not.
    if (result && result.ok === false && isSessionExpiredError(result.error || result.message)) {
      if (getSessionToken(role) === sentToken) await ensureSessionToken(null, role, true);
      else await ensureSessionToken(null, role);
      result = await transport_({...payload, sessionToken:getSessionToken(role)});
    }
    return result;
  }

  function retainConfirmation_(item, data) {
    // Persist evidence before clearing either the intent or the Outbox entry.
    // One key per request avoids one confirmation overwriting another's receipt.
    localStorage.setItem('domus_confirmation_' + item.requestId, JSON.stringify({
      requestId:item.requestId, action:item.action, args:item.args,
      operator:item.operatorId, confirmedAt:new Date().toISOString(), data
    }));
    if (['cajaSimpleRegistrar','confirmarTransferencia'].includes(item.action)) {
      localStorage.setItem('domus_last_sale_confirmation', item.requestId);
    }
    if (item.action === 'cajaSimpleRegistrar') {
      const pending = JSON.parse(localStorage.getItem('domus_pending_sale') || 'null');
      if (pending && (pending.requestId || pending.id) === item.requestId) {
        localStorage.removeItem('domus_pending_sale');
      }
    }
  }

  function saleDraftSnapshot_() {
    return JSON.stringify({cart:STATE.cart, ticket:STATE.selectedAccountTicket || '', phase:STATE.phase,
      openingRequestId:STATE.journey?.active?.openingRequestId || '',
      customer:$('customerNameInput')?.value || '', activity:$('activitySelect')?.value || ''});
  }

  function settleConfirmedBasket_(requestId) {
    if (STATE.pendingSaleId === requestId && STATE.pendingSaleDraft === saleDraftSnapshot_()) {
      STATE.pendingSaleId = null;
      STATE.selectedAccountTicket = '';
      clearCart();
      if ($('customerNameInput')) $('customerNameInput').value = '';
      STATE.activity = localStorage.getItem('domus_pos_activity') || 'Visita general DOMUS';
      renderActivityDropdown();
      STATE.accountType = '';
      if ($('creditAuthorizationSelect')) $('creditAuthorizationSelect').value = '';
    }
  }

  function recoverReceipt_() {
    const id = prompt('ID de la operación a recuperar:', localStorage.getItem('domus_last_sale_confirmation') || '');
    if (!id) return;
    try {
      const record = JSON.parse(localStorage.getItem('domus_confirmation_' + id));
      if (!record || !['cajaSimpleRegistrar','confirmarTransferencia'].includes(record.action)) throw new Error('No hay comprobante confirmado para este ID en el equipo.');
      const res = record.data, body = record.args[0];
      showReceiptModal({
        ...res, customer:res.customer || body.customer, operator:record.operator,
        date:new Date(record.confirmedAt).toLocaleString('es-MX'),
        items:res.items && res.items.length ? res.items : [{name:'Saldo de cuenta',qty:1,price:res.total}],
        paid:res.paid === true, verified:res.verified === true, method:res.method || body.method
      });
    } catch (err) { toast(err.message, 'error'); }
  }

  function getOutbox() {
    try {
      const raw = localStorage.getItem('domus_outbox');
      const queue = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(queue) || queue.some(q => !q || typeof q !== 'object' || Array.isArray(q))) {
        throw new Error('Formato de Outbox inválido.');
      }
      return queue.map(q => {
        const attemptTime = Date.parse(q.lastAttempt);
        if (['SENDING', 'SYNCING'].includes(q.status) &&
            (!Number.isFinite(attemptTime) || Date.now() - attemptTime > 90000)) {
          q.status = 'RETRY';
        }
        return q;
      });
    } catch (e) {
      throw new Error('Outbox no legible: conserva los datos y solicita recuperación antes de operar.');
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

  let outboxStoreHeld_ = false;
  async function withOutboxStore_(fn) {
    if (!window.navigator || !window.navigator.locks || typeof window.navigator.locks.request !== 'function') throw new Error('OUTBOX_LOCK_REQUIRED: usa un navegador con Web Locks antes de enviar operaciones.');
    return window.navigator.locks.request('domus-outbox-store', () => {
      assertOutboxStoreWritable_();
      outboxStoreHeld_ = true;
      try {
        const result = fn();
        if (result && typeof result.then === 'function') throw new Error('OUTBOX_TRANSACTION_MUST_BE_SYNCHRONOUS');
        return result;
      } finally { outboxStoreHeld_ = false; }
    });
  }

  function saveOutbox(queue) {
    if (!outboxStoreHeld_) throw new Error('OUTBOX_LOCK_REQUIRED');
    try {
      localStorage.setItem('domus_outbox', JSON.stringify(queue));
    } catch (e) {
      throw new Error('No se pudo conservar la intención en este equipo. No se envió el cobro.');
    }
    updateOutboxUI();
    notifyOutboxTabs();
  }

  async function enqueueOutbox(action, args, explicitRequestId = null, type = 'MUTATION', targetRole = null) {
    return withOutboxStore_(() => {
      // Si se pasa como 3er argumento 'MUTATION' en lugar de explicitRequestId (llamada legacy)
      if (typeof explicitRequestId === 'string' && (explicitRequestId === 'MUTATION' || explicitRequestId === 'QUERY')) {
        type = explicitRequestId;
        explicitRequestId = null;
      }
      // Protección estricta (Issue #1): nunca encolar una orden de caja sin productos
      if (action === 'cajaSimpleRegistrar' && (!args || !args[0] || ((!args[0].items || !args[0].items.length) && !(args[0].ticket && args[0].paid)))) {
        console.warn('[OUTBOX] Rechazado intento de encolar orden de caja vacía sin productos.');
        return null;
      }
      const queue = getOutbox();
      const existingReq = explicitRequestId
        || (args && args[0] && (args[0].requestId || args[0].id))
        || (args && args[1] && (args[1].requestId || args[1].id))
        || null;
      const reqId = existingReq || ('REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase());

      if (args && args[0] && typeof args[0] === 'object') {
        args[0].requestId = reqId;
        if (!args[0].id) args[0].id = reqId;
      } else if (args && args[1] && typeof args[1] === 'object') {
        args[1].requestId = reqId;
        if (!args[1].id) args[1].id = reqId;
      }

      const item = {
        clientContract: 'domus-outbox-v2',
        requestId: reqId,
        deviceId: getDeviceId(),
        operatorId: STATE.operator || 'Operador',
        role: (targetRole || getStationRole()).toUpperCase(),
        createdAt: new Date().toISOString(),
        type: type,
        action: action,
        args: args,
        status: 'SENDING',
        attempts: 1,
        lastAttempt: new Date().toISOString(),
        serverReceipt: null,
        lastError: null
      };

      const existing = queue.find(q => q.requestId === reqId);
      if (existing) {
        if (existing.action !== action || JSON.stringify(existing.args) !== JSON.stringify(args)) throw new Error('IDEMPOTENCY_KEY_REUSED');
        if (!['LOCAL_PENDING','RETRY'].includes(existing.status)) throw new Error('Operación pendiente o en revisión. Recupera el resultado original antes de reenviar.');
        existing.status='SENDING'; existing.lastAttempt=new Date().toISOString();
        saveOutbox(queue); return existing;
      }
      queue.push(item);
      saveOutbox(queue);
      return item;
    });
  }

  function isSaleRejectionWithoutEffects_(action, error) {
    // Only explicit server validation outcomes authorize a replacement intention.
    // Neither Spanish error text nor a generic 4xx/5xx proves absence of effects.
    return Number(error.status)===422 && ((action==='cajaSimpleRegistrar' &&
      ['SALE_PHASE_CHANGED_NO_EFFECTS','SALE_VALIDATION_REJECTED_NO_EFFECTS'].includes(error.code)) ||
      (['turnoAbrir','corteZCerrar','cajaSimpleRegistrar','confirmarTransferencia'].includes(action) && error.code==='JOURNEY_VALIDATION_NO_EFFECTS') ||
      (action==='confirmarTransferencia' && ['TRANSFER_POLICY_REQUIRED_NO_EFFECTS','TRANSFER_REVIEW_INCOMPLETE_NO_EFFECTS'].includes(error.code)) ||
      (action==='cancelarTransferenciaNoRecibida' && error.code==='TRANSFER_CANCELLATION_VALIDATION_NO_EFFECTS') ||
      (action==='vincularPagoExistente' && error.code==='EXISTING_PAYMENT_VALIDATION_NO_EFFECTS'));
  }

  /**
   * Clasificador centralizado de fallos de mutación (Issue #1):
   * - 'REQUIRES_REVIEW': Errores deterministas, validación, negocio, permisos, 409 idempotencia, datos incorrectos.
   *   JAMÁS deben reintentarse automáticamente ni por el botón de reintento.
   * - 'RETRY': Errores estrictamente transitorios (red, timeout, 5xx).
   */
  function classifyMutationFailure(error) {
    if (!error) return 'RETRY';
    const msg = (typeof error === 'string' ? error : (error.message || error.error || '')).toLowerCase();
    const code = error.code;
    const status = Number(error.status) || (typeof code === 'number' ? code : 0);

    // 1. Errores Deterministas / Validación / Negocio -> REQUIRES_REVIEW
    if (
      code === 409 ||
      code === 'IDEMPOTENCY_KEY_REUSED' ||
      isSessionExpiredError(msg) ||
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
      (status >= 400 && status < 500 && status !== 408 && status !== 429)
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
      status === 408 ||
      status === 429 ||
      (status >= 500 && status <= 599)
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
  async function migrateLegacyOutbox_() {
    try {
      if(outboxReviewRequired_(true))return;
      await withOutboxStore_(() => {
        const queue = getOutbox();
        let modified = false;
        const saved = JSON.parse(localStorage.getItem('domus_pending_sale') || 'null');
        const id = saved && (saved.requestId || saved.id);
        if (id && !queue.some(q=>q.requestId===id) && !localStorage.getItem('domus_confirmation_'+id)) {
          queue.push({requestId:id,action:'cajaSimpleRegistrar',args:[{...saved,requestId:id}],role:'CAJA',deviceId:getDeviceId(),operatorId:STATE.operator,
            status:'LOCAL_PENDING',attempts:0,lastAttempt:null});
          modified = true;
        }
        const updatedQueue = queue.map(item => {
          if (item.status === 'LOCAL_PENDING' || item.status === 'RETRY') {
            const err = {message:item.lastError || '', code:item.errorCode, status:item.errorStatus};
            const body = item.args && item.args[0];
            const hasEmptyItems = item.action === 'cajaSimpleRegistrar' && (!body || ((!body.items || !body.items.length) && !(body.ticket && body.paid)));
            const hasRecordedError = String(err.message).trim().length > 0 || !!err.code || !!err.status;
            const isDeterministic = hasEmptyItems || (hasRecordedError && classifyMutationFailure(err) === 'REQUIRES_REVIEW');

            if (isDeterministic) {
              console.warn(`[OUTBOX MIGRATION v13] Migrando item determinista a REQUIRES_REVIEW: ${item.requestId} (${err.message || 'Empty items'})`);
              item.status = 'REQUIRES_REVIEW';
              item.quarantineReason = err.message || 'v13: Operación previa vacía o con error determinista';
              item.quarantinedAt = new Date().toISOString();
              modified = true;
            }
          }
          return item;
        });

        if (modified) {
          saveOutbox(updatedQueue);
        }
      });
    } catch (e) {
      console.warn('[OUTBOX] Error al migrar outbox histórico:', e);
    }
  }

  // Background senders serialize; foreground claims and every store update use a short lock.
  async function sincronizarOutbox() {
    if (!window.navigator || !window.navigator.locks || typeof window.navigator.locks.request !== 'function') {
      updateSyncPill('error'); return;
    }
    await window.navigator.locks.request('domus-outbox-sync', { ifAvailable: true }, async lock => {
      if (lock) await sincronizarOutboxCore_();
    });
  }

  let isOutboxCoreRunning = false;
  async function sincronizarOutboxCore_() {
    return withOutboxTraffic_(async()=>{
    if (isOutboxCoreRunning) return;
    isOutboxCoreRunning = true;

    try {
      while (true) {
        assertOutboxTraffic_();
        const item = await withOutboxStore_(() => {
          const queue = getOutbox();
          const selected = queue.find(it => it.status === 'LOCAL_PENDING' || it.status === 'RETRY');
          if (!selected) return null;
          const body=selected.args && selected.args[0];
          if (selected.action==='cajaSimpleRegistrar' && (!body || ((!body.items || !body.items.length) && !(body.ticket && body.paid)))) {
            selected.status='REQUIRES_REVIEW'; selected.lastError='Operación de caja sin productos en el pedido.';
          } else {
            selected.status='SYNCING'; selected.attempts=(selected.attempts || 0)+1; selected.lastAttempt=new Date().toISOString();
          }
          saveOutbox(queue); return selected;
        });
        if (!item) break;
        if (item.status==='REQUIRES_REVIEW') continue;

        const payload = {
          action:item.action, args:item.args, requestId:item.requestId,
          deviceId:item.deviceId, operator:item.operatorId,
          role:(item.role || getStationRole()).toUpperCase()
        };
        try {
          const json = await authenticatedTransport_(payload);
          if (!json || !json.ok) {
            const err = new Error(json && (json.error || json.message) || 'Error en servidor');
            err.code = json && json.code; err.status = json && json.status;
            throw err;
          }
          await withOutboxStore_(() => {
            retainConfirmation_(item, json.data);
            saveOutbox(getOutbox().filter(q => q.requestId !== item.requestId));
          });
          // Presentation failures cannot reclassify a confirmed operation as failed.
          try {
            settleConfirmedBasket_(item.requestId);
            toast('Operación sincronizada. Comprobante conservado en este equipo.', 'ok');
            playChime('success'); updateSyncPill('ok'); syncBackendData();
          } catch (err) { console.error('Operación confirmada; error de presentación.', err); }
        } catch (err) {
          await recordOutboxFailure_(item,err);
          updateSyncPill('error');
          break;
        }
      }
    } finally {
      isOutboxCoreRunning = false;
      updateOutboxUI();
    }
    });
  }

  function processOutbox() {
    sincronizarOutbox().catch(err=>{updateSyncPill('error');console.warn('[OUTBOX]',err.message);});
  }

  // Sincronización entre pestañas y reactividad a conexión de red
  window.addEventListener('storage', e => {
    if(e.key==='domus_print_token' && e.newValue===null){clearPrintTokenView_();return;}
    if(e.key==='domus_outbox_review_hold_v1' && e.newValue!==null){enterOutboxReview_();return;}
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
    const pending = queue.filter(q => ['LOCAL_PENDING','RETRY','SYNCING','SENDING'].includes(q.status));
    const inReview = queue.filter(q => q.status === 'REQUIRES_REVIEW');
    const rejected = queue.filter(q => q.status === 'REJECTED');

    if (!banner || !text) return;

    if (pending.length > 0 || inReview.length > 0 || rejected.length > 0) {
      banner.classList.remove('hidden');
      const messages = [];
      if (pending.length > 0) {
        messages.push(`⚠️ MODO LOCAL · ${pending.length} operación(es) pendiente(s) de sincronizar`);
      }
      if (inReview.length > 0) {
        messages.push(`🛑 ${inReview.length} operación(es) en revisión manual / cuarentena`);
      }
      if (rejected.length) messages.push(`${rejected.length} rechazo(s) confirmado(s) sin efectos; conserva sus IDs para consulta.`);
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
    let role = (['corteZCerrar','cambiarFase','anularAcceso','sincronizarCartaConCatalogoDOMUS','registrarNuevoProducto','registrarNuevoEvento','transferenciasPendientes','prepararResolucionTransferencia','cancelarTransferenciaNoRecibida','prepararVinculoPagoExistente','vincularPagoExistente','confirmarTransferencia'].includes(fnName) ? 'GERENCIA' : getStationRole()).toUpperCase();
    let deviceId = getDeviceId(), operator = STATE.operator;
    try { args = JSON.parse(JSON.stringify(args || [])); }
    catch (err) { if (onError) onError(err); return; }
    const isMutation = MUTATION_ACTIONS.has(fnName);
    const body = args && args.find(a => a && typeof a === 'object');
    const reqId = body && (body.requestId || body.id) || ('REQ-'+crypto.randomUUID());
    if (body && isMutation) {body.requestId=reqId; if(!body.id)body.id=reqId;}
    let item;
    STATE.isSyncing=true; updateSyncPill();
    const run=async()=>{
      if (isMutation) {
        item = await enqueueOutbox(fnName,args,reqId,'MUTATION',role);
        if (!item) throw new Error('Operación inválida.');
        role=item.role; deviceId=item.deviceId; operator=item.operatorId;
      }
      const json=await authenticatedTransport_({action:fnName,args,requestId:reqId,deviceId,operator,role});
      if(!json || !json.ok) {
        const err=new Error(json && json.error || 'Error en servidor'); err.code=json && json.code; err.status=json && json.status; throw err;
      }
      const data=json.data!==undefined?json.data:json;
      if(isMutation) await withOutboxStore_(() => {
        retainConfirmation_(item,data);
        saveOutbox(getOutbox().filter(q=>q.requestId!==reqId));
      });
      else cacheQuerySnapshot(fnName,data);
      STATE.isSyncing=false; STATE.lastSyncTimestamp=Date.now();updateSyncPill('ok');
      try {if(isMutation)settleConfirmedBasket_(reqId);if(onSuccess)onSuccess(data);} catch(err){console.error('Operación confirmada; error de presentación. Recupera el recibo original.',err);}
    };
    const failed=async err=>{
      STATE.isSyncing=false;updateSyncPill('error');
      try {
        if(isMutation && item){
          await recordOutboxFailure_(item,err);
          if(item.status==='RETRY' && onSuccess) {onSuccess({localOutbox:true,requestId:reqId,status:'RETRY',paid:false,message:'Intención guardada; cobro sin confirmar.'});return;}
        }
      } catch(storageErr) { err=storageErr; }
      try {if (onError) onError(err); else toast(err.message,'error');}
      catch(renderError) {console.error('Error de presentación; evidencia conservada.',renderError);}
    };
    withOutboxTraffic_(()=>run().catch(failed)).catch(failed);
  }

  async function recordOutboxFailure_(item, err) {
    await withOutboxStore_(() => {
      item.status = isSaleRejectionWithoutEffects_(item.action, err)
        ? 'REJECTED' : item.action === 'accesoCambiarActividad' ? 'REQUIRES_REVIEW' : classifyMutationFailure(err);
      item.lastError=err.message || String(err); item.errorCode=err.code || ''; item.errorStatus=err.status || 0;
      saveOutbox(getOutbox().map(q=>q.requestId===item.requestId?{...q,status:item.status,lastError:item.lastError,errorCode:item.errorCode,errorStatus:item.errorStatus}:q));
    });
  }

  function updateSyncPill(state = 'ok') {
    const pill = $('connectionPill');
    if (pill) pill.title = `Backend: ${STATE.backendEnvironment} (${STATE.apiUrl})`;
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

  // --- DOMUS LOCAL PRINT BRIDGE (127.0.0.1:17321) ---
  const PRINT_BRIDGE_URL = 'http://127.0.0.1:17321';

  function getPrintToken() {
    return (localStorage.getItem('domus_print_token') || '').trim();
  }

  function setPrintToken(token) {
    if (token) {
      localStorage.setItem('domus_print_token', token.trim());
    }
  }

  function clearPrintTokenView_() {
    const input=$('printBridgeTokenInput');
    if(input){input.value='';input.placeholder='Sin token guardado';}
    STATE.printerStatus='offline';
    updatePrinterPill('offline','🖨️ Sin token','Acceso de impresión retirado de este navegador.');
    const message=$('printerStatusMsg');
    if(message){message.textContent='Token retirado de este navegador. Colas y comprobantes conservados.';message.style.color='var(--text-muted)';}
  }

  function removePrintToken_() {
    try {
      // Do not clear the profile, Outbox, receipts, sessions or bridge credentials.
      localStorage.removeItem('domus_print_token');
      if(localStorage.getItem('domus_print_token')!==null)throw new Error('Removal not confirmed');
    } catch(_) {
      toast('No se pudo confirmar la retirada del token. Conserva este perfil y vuelve a intentarlo.','error');
      return false;
    }
    clearPrintTokenView_();
    toast('Token de impresión retirado de este navegador.','ok');
    return true;
  }

  function updatePrinterPill(state = 'offline', text = null, title = null) {
    const pill = $('printerPill');
    const dot = $('printerDot');
    const label = $('printerLabel');
    if (!dot || !label) return;

    if (state === 'ready') {
      dot.className = 'status-dot';
      label.textContent = text || '🖨️ Conectada';
      if (pill) pill.title = title || 'DOMUS Print Bridge: DOMUS_TICKETS lista para imprimir';
    } else if (state === 'busy') {
      dot.className = 'status-dot warn';
      label.textContent = text || '🖨️ Imprimiendo…';
      if (pill) pill.title = title || 'DOMUS Print Bridge: Enviando datos a impresora térmica...';
    } else {
      dot.className = 'status-dot error';
      label.textContent = text || '🖨️ Desconectada';
      if (pill) pill.title = title || 'DOMUS Print Bridge: Desconectado o impresora apagada (127.0.0.1:17321)';
    }
  }

  function checkPrinterStatus(callback) {
    try {assertOutboxTraffic_();} catch(_) {return;}
    fetch(`${PRINT_BRIDGE_URL}/health`, {
      method: 'GET',
      headers: {
        'X-Domus-Print-Token': getPrintToken()
      }
    })
    .then(r => r.json())
    .then(data => {
      if(!getPrintToken()) {
        STATE.printerStatus='offline';updatePrinterPill('offline','🖨️ Sin token','Configura el acceso de impresión en este navegador.');
        if(callback)callback(false,{status:'TOKEN_REQUIRED'});return;
      }
      if (data && data.ok && data.status === 'READY') {
        STATE.printerStatus = 'ready';
        updatePrinterPill('ready', '🖨️ Conectada', `DOMUS_TICKETS: Lista (${data.printer})`);
        if (callback) callback(true, data);
      } else {
        STATE.printerStatus = 'offline';
        updatePrinterPill('offline', '🖨️ No disponible', `DOMUS_TICKETS: ${data ? data.status : 'Inactiva'}`);
        if (callback) callback(false, data);
      }
    })
    .catch(err => {
      STATE.printerStatus = 'offline';
      updatePrinterPill('offline', '🖨️ Desconectada', 'DOMUS Print Bridge no responde en 127.0.0.1:17321');
      if (callback) callback(false, err);
    });
  }

  function openCashDrawer_(receipt) {
    assertOutboxTraffic_();
    if(!receipt || receipt.paid!==true || !receipt.receipt || !(receipt.method==='Efectivo' ||
        (receipt.method==='Mixto' && receipt.verified===true && Array.isArray(receipt.payments) && receipt.payments.some(p=>p.method==='Efectivo' && p.amount>0))))return;
    fetch(PRINT_BRIDGE_URL+'/drawer/open',{method:'POST',headers:{'Content-Type':'application/json','X-Domus-Print-Token':getPrintToken()},
      body:JSON.stringify({requestId:'DRAWER-'+receipt.receipt,reason:'CASH_PAYMENT',receipt:receipt.receipt,method:'Efectivo',paid:true,operator:receipt.operator,reprint:false})})
      .then(r=>r.json()).then(r=>{if(!r.ok)toast('Cobro confirmado; cajón pendiente.','warn');})
      .catch(()=>toast('Cobro confirmado; cajón sin conexión.','warn'));
  }

  function printReceiptDirect(receiptData, isReprint = false) {
    assertOutboxTraffic_();
    if (!receiptData) {
      toast('No hay datos de comprobante para imprimir.', 'warn');
      return Promise.reject(new Error('Sin datos de ticket'));
    }

    const folio = receiptData.receipt || receiptData.ticket || `REC-${Date.now()}`;
    const printId = isReprint ? 'COPY-'+folio+'-'+crypto.randomUUID() : `PRINT-${folio}`;

    const payload = {
      printId: printId,
      receipt: receiptData.receipt || folio,
      ticket: receiptData.ticket || '',
      customer: receiptData.customer || 'Cliente',
      date: receiptData.date || new Date().toLocaleString('es-MX'),
      operator: receiptData.operator || (STATE.staffList && STATE.staffList.find(s => s.id === STATE.operator))?.name || STATE.operator || 'Caja DOMUS',
      items: Array.isArray(receiptData.items) ? receiptData.items.map(it => ({
        qty: it.qty || 1,
        name: it.name || 'Producto',
        price: it.price || 0
      })) : [],
      total: receiptData.total || 0,
      method: receiptData.method || 'Efectivo',
      received: receiptData.received !== undefined ? receiptData.received : null,
      tip: receiptData.tip || 0,
      change: receiptData.change !== undefined ? receiptData.change : null,
      paid: receiptData.paid === true,
      verified: receiptData.verified === true,
      paymentStatus: receiptData.paymentStatus || '',
      payments: receiptData.payments,
      terminalReference: receiptData.terminalReference,
      reprint: Boolean(isReprint)
    };

    updatePrinterPill('busy');

    return fetch(`${PRINT_BRIDGE_URL}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Domus-Print-Token': getPrintToken()
      },
      body: JSON.stringify(payload)
    })
    .then(r => r.json().then(body => ({ status: r.status, ok: r.ok, body })))
    .then(res => {
      if (res.ok && res.body.ok) {
        updatePrinterPill('ready');
        if (res.body.alreadyPrinted) {
          toast('✓ Comprobante previamente impreso (usa Reimprimir si requieres otra copia)', 'info');
        } else {
          toast(isReprint ? 'Copia encolada.' : 'Ticket encolado; verificar salida física.', 'ok');
        }
        return res.body;
      } else {
        const errMsg = (res.body && res.body.error) || 'Fallo de impresora';
        updatePrinterPill('offline', '🖨️ Error térmico', errMsg);
        if (!isReprint) {
          toast('⚠ Cobro confirmado. Ticket pendiente de impresión.', 'warn');
        } else {
          toast(`⚠ Error al imprimir: ${errMsg}`, 'error');
        }
        throw new Error(errMsg);
      }
    })
    .catch(err => {
      updatePrinterPill('offline');
      if (!isReprint) {
        toast('⚠ Cobro confirmado. Ticket pendiente de impresión.', 'warn');
      } else {
        toast('⚠ Print Bridge no disponible. Abriendo diálogo del navegador…', 'warn');
        window.print();
      }
      throw err;
    });
  }

  // --- CARGA INICIAL DE DATOS ---
  function loadInitialData() {
    // En producción, no mostrar productos hasta recibir el catálogo autorizado del backend.
    // Evita vender entradas obsoletas del catálogo local que Google Sheets rechazará.
    STATE.products = STATE.isProductionLocked ? [] : [...DEFAULT_CATALOG];

    const buildEl = $('domusBuildLabel');
    if (buildEl && window.DOMUS_BUILD) {
      buildEl.textContent = `DOMUS OS · UI ${window.DOMUS_BUILD.ui} · ${window.DOMUS_BUILD.environment}`;
    }
    const pill = $('connectionPill');
    if (pill && window.DOMUS_BUILD) {
      pill.setAttribute('title', `DOMUS OS · UI ${window.DOMUS_BUILD.ui} · ${window.DOMUS_BUILD.environment} (${window.DOMUS_BUILD.buildId} · base ${window.DOMUS_BUILD.baseCommit})`);
    }
    // Migración segura de operaciones Outbox a v13 (conservando historial en cuarentena)
    migrateLegacyOutbox_();

    STATE.comandas = [...DEFAULT_ORDERS];

    // Inicializar eventos y accesos (preservando evento nocturno activo de jornada en vivo)
    STATE.eventsList = [...DEFAULT_EVENTS];
    STATE.recentAccessList = [];
    const savedActiveAct = localStorage.getItem('domus_active_event');
    STATE.activeActivity = savedActiveAct || 'Forza · sábado';

    try {
      const savedEvents = JSON.parse(localStorage.getItem('domus_custom_events') || '[]');
      if (Array.isArray(savedEvents) && savedEvents.length) {
        STATE.eventsList = [...savedEvents, ...STATE.eventsList];
      }
      // Server records are authoritative. Legacy local-only entries remain in storage for reconciliation.

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

  function renderJourney_() {
    const panel=$('journeyControls'),state=STATE.journey;
    if(!panel)return;
    panel.classList.toggle('hidden',!state?.enabled);if(!state?.enabled)return;
    const active=state.active,scope=$('journeyScopeSelect'),previous=scope.value;
    scope.innerHTML='<option value="">Selecciona evento / proyecto</option>'+(state.scopes || []).map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.eventName || s.projectName)} · ${escapeHtml(s.projectName)}</option>`).join('');
    scope.value=active?.scopeId || previous;scope.disabled=!!active || !!STATE.journeySending;
    $('journeyStatus').textContent=active?`Jornada abierta · ${active.scope.eventName || active.scope.projectName} · ${active.openedAt}`:'Sin jornada abierta en esta estación.';
    $('btnJourneyOpen').disabled=!!active || !!STATE.journeySending;
    $('btnJourneyClose').disabled=!active || !!STATE.journeySending;
    const cut=state.lastCut;
    $('journeyCutSummary').textContent=cut?`Último corte ${cut.cutId} · efectivo declarado ${money(cut.countedCash)} · ventas en efectivo ${money(cut.snapshot.totals.Efectivo)} · terminales ${money(cut.snapshot.totals['Terminal 1']+cut.snapshot.totals['Terminal 2'])} · transferencias confirmadas ${money(cut.snapshot.totals.Transferencia)} · cuentas abiertas ${cut.snapshot.openAccounts.length}. Alcance: recibos de esta jornada; liquidación pendiente de revisión.`:'';
  }

  function submitJourney_(closing) {
    if(STATE.journeySending)return;
    try {
      if(!STATE.journey?.enabled)throw new Error('Jornadas sin configuración acreditada.');
      if(getOutbox().some(q=>q.status!=='REJECTED'))throw new Error('Resuelve las intenciones pendientes antes de abrir o cortar. No se reenviaron.');
      if(closing && STATE.cart?.length)throw new Error('Resuelve el pedido del carrito antes del corte.');
      const input=$(closing?'journeyCountedCash':'journeyOpeningFloat'),amount=Number(input.value);
      if(!input.value.trim() || !Number.isFinite(amount) || amount<0 || Math.abs(amount*100-Math.round(amount*100))>0.00001)throw new Error('Indica el efectivo contado con máximo dos decimales.');
      if(closing && !STATE.journey.active?.openingRequestId)throw new Error('No hay jornada abierta.');
      const body=closing?{openingRequestId:STATE.journey.active.openingRequestId,countedCash:amount}:{scopeId:$('journeyScopeSelect').value,openingFloat:amount};
      if(!closing && !body.scopeId)throw new Error('Selecciona evento / proyecto para abrir.');
      body.requestId='JOR-REQ-'+crypto.randomUUID();STATE.journeySending=true;renderJourney_();
      callBackend(closing?'corteZCerrar':'turnoAbrir',[body],res=>{
        STATE.journeySending=false;renderJourney_();
        if(res.localOutbox){toast('Intención sin confirmar. Recupera el mismo ID: '+res.requestId,'warn');return;}
        toast(closing?'Jornada cerrada; conciliación y reparto se revisan por separado.':'Jornada abierta. Conserva su evento/proyecto al registrar.','ok');syncBackendData();
      },err=>{STATE.journeySending=false;renderJourney_();toast(err.message || String(err),'warn');});
    } catch(err) {toast(err.message || String(err),'warn');}
  }

  function syncBackendData() {
    // 1. Catálogo y cuentas de Caja en modo Caja (y lectura inicial autoritativa de fase de CAJA 2!F2)
    if (STATE.mode === 'caja' || !STATE.phaseSyncedFromServer) {
      callBackend('cajaSimpleDatos', [], data => {
        STATE.journey=data.journey || {enabled:false,active:null};
        renderJourney_();
        STATE.operatingPeriod=data.operatingPeriod && typeof data.operatingPeriod.allowed==='boolean' ? data.operatingPeriod :
          {allowed:false,message:'El servidor no acreditó el periodo operativo. Revisar la versión instalada antes de cobrar.'};
        const periodStatus=$('cashPeriodStatus');
        if(periodStatus){periodStatus.textContent=STATE.operatingPeriod.message;periodStatus.style.color=STATE.operatingPeriod.allowed?'var(--text-muted)':'var(--rose-400)';}
        if (data.phase) {
          STATE.phase = data.phase;
          STATE.phaseSyncedFromServer = true;
          const badge = $('currentPhaseBadge');
          if (badge) badge.textContent = `Fase ${data.phase}`;
        }
        if (data.products && data.products.length) {
          // FUENTE DE VERDAD: sólo el catálogo que el backend confirma como vendible.
          // DEFAULT_CATALOG se usa únicamente para enriquecer presentación; nunca para
          // introducir productos que Google Sheets no reconozca por nombre exacto.
          const canonMapByName = new Map(DEFAULT_CATALOG.map(c => [c.name.trim().toLowerCase(), c]));
          const catalogMap = new Map();

          data.products.forEach(bp => {
            const serverName = String(bp.name || '').trim();
            const bName = serverName.toLowerCase();
            if (!serverName || bName.includes('— staff')) return;

            const canon = canonMapByName.get(bName);
            const group = (canon && canon.group) || bp.group || '';
            const routeHint = (group + ' ' + serverName).toLowerCase();
            const destination = (canon && canon.destination) || bp.destination ||
              (/sushi|comida|alimento|cocina|cannab|jujutsu/.test(routeHint) ? 'Cocina' : 'Barra');

            catalogMap.set(bName, {
              ...(canon || {}),
              ...bp,
              // Conservar SIEMPRE el nombre y precio exactos entregados por el servidor.
              name: serverName,
              price: Number(bp.price),
              priceSolar: Number(bp.price),
              priceLunar: Number(bp.price),
              group: group,
              destination: destination
            });
          });

          // En producción no se mezclan productos guardados sólo en localStorage:
          // primero deben existir y ser devueltos por CATALOGO en Google Sheets.
          if (!STATE.isProductionLocked) {
            try {
              const custom = JSON.parse(localStorage.getItem('domus_custom_products') || '[]');
              if (Array.isArray(custom) && custom.length) {
                custom.forEach(p => {
                  const key = String(p.name || '').trim().toLowerCase();
                  if (key && !catalogMap.has(key)) catalogMap.set(key, p);
                });
              }
            } catch (e) {}
          }

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
      callBackend('comandasSimpleDatos', [], d => {
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
      const eventReadRevision = STATE.eventChangeRevision;
      callBackend('accesoSimpleDatos', [], data => {
        if (STATE.eventChangePending || eventReadRevision !== STATE.eventChangeRevision) return;
        STATE.activityPolicyPending = data.activityPolicyPending === true;
        if (Array.isArray(data.activities) && (data.activities.length || STATE.activityPolicyPending)) {
          STATE.eventsList = data.activities;
        }
        // REGLA DE ORO DE GOBERNANZA:
        // Si el backend devuelve activeActivity válido, USARLO incondicionalmente
        // aunque su fecha sea el día calendario anterior (evento nocturno sobre medianoche).
        if (data.activeActivity) {
          STATE.activeActivity = data.activeActivity;
          localStorage.setItem('domus_active_event', data.activeActivity);
        } else if (STATE.activityPolicyPending) {
          STATE.activeActivity = '';
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
          STATE.recentAccessList=backendRecords;
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
    const account = (STATE.openAccounts || []).find(a => a.ticket === STATE.selectedAccountTicket);
    const chosen = (account && account.activity) || STATE.activity || localStorage.getItem('domus_pos_activity');
    const options = [...STATE.activities];
    if (account && account.activity && !options.includes(account.activity)) options.push(account.activity);
    select.innerHTML = options.map(act => `<option value="${escapeHtml(act)}">${escapeHtml(act)}</option>`).join('');
    select.value = options.includes(chosen) ? chosen : '';
    select.disabled = !!account;
    STATE.activity = select.value;
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
      if (btnPay) btnPay.disabled = !STATE.selectedAccountTicket;
      if (totalEl && STATE.selectedAccountTicket) totalEl.textContent = money(calculateCartTotal());
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
    if(!STATE.operatingPeriod || STATE.operatingPeriod.allowed!==true){toast(STATE.operatingPeriod?.message || 'Periodo operativo sin verificar.','warn');return;}
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
    $('mixedTerminalAmount').value = '';
    $('mixedTerminalReference').value = '';
    $('mixedTerminalConfirmed').checked = false;
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

    $('cashCalculatorSection').classList.toggle('hidden', !['Efectivo','Mixto'].includes(method));
    $('mixedPaymentSection').classList.toggle('hidden', method !== 'Mixto');
    updateChangeDisplay();
  }

  function calculateCartTotal() {
    const acc = STATE.openAccounts.find(a => a.ticket === STATE.selectedAccountTicket);
    return (Number(acc && acc.due) || 0) + STATE.cart.reduce((sum,item)=>sum+(item.courtesy?0:item.price*item.qty),0);
  }

  function updateChangeDisplay() {
    let due = calculateCartTotal();
    if(activePaymentMethod==='Mixto') {
      const terminal=Number($('mixedTerminalAmount').value);
      due=Math.round((due-terminal)*100)/100;
      $('mixedCashAmount').textContent=terminal>0 && due>0?'Parte de la cuenta en efectivo: '+money(due):'Indica un importe de terminal mayor que cero y menor al total.';
    }
    const received = parseFloat($('cashReceivedInput').value) || 0;
    const tip = parseFloat($('cashTipInput').value) || 0;

    const changeBox = $('changeDisplayBox');
    const changeAmt = $('changeAmountText');

    if (!['Efectivo','Mixto'].includes(activePaymentMethod)) {
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

  function mixedPaymentInput_(total,received,tip) {
    const terminal=Number($('mixedTerminalAmount').value),cash=Math.round((total-terminal)*100)/100;
    const valid=v=>Number.isFinite(v) && v>=0 && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100))<0.00001;
    if(![total,terminal,cash,received,tip].every(valid) || terminal<=0 || cash<=0 || Math.round(received*100)<Math.round(cash*100)+Math.round(tip*100)) {
      throw new Error('Revisa los importes de terminal y efectivo: deben cubrir el total y la propina en efectivo, con máximo dos decimales.');
    }
    const method=$('mixedTerminalSelect').value,reference=$('mixedTerminalReference').value.trim();
    if(!['Terminal 1','Terminal 2'].includes(method) || !$('mixedTerminalConfirmed').checked || !reference || reference.length>120 || /[\x00-\x1f\x7f]/.test(reference)) {
      throw new Error('Confirma la aprobación de la terminal e indica la referencia de su comprobante.');
    }
    return {payments:[{method:'Efectivo',amount:cash},{method:method,amount:terminal}],terminalConfirmed:true,terminalReference:reference};
  }

  let paymentInFlight = false;
  async function confirmPaymentAndDispatch(isPaid) {
    if(paymentInFlight)return;
    if(!STATE.operatingPeriod || STATE.operatingPeriod.allowed!==true){toast(STATE.operatingPeriod?.message || 'Periodo operativo sin verificar.','warn');return;}
    if(STATE.journey?.enabled && !STATE.journey.active?.openingRequestId){toast('Abre una jornada antes de registrar la venta.','warn');return;}
    if (STATE.pendingSaleId && localStorage.getItem('domus_confirmation_' + STATE.pendingSaleId)) settleConfirmedBasket_(STATE.pendingSaleId);
    if ((!$('activitySelect') || !$('activitySelect').value)) {
      toast('Selecciona el proyecto antes de registrar el pedido.', 'warn');
      return;
    }
    if ((!STATE.cart || !STATE.cart.length) && !(STATE.selectedAccountTicket && isPaid)) {
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

    let mixed;
    if(isPaid && activePaymentMethod==='Mixto') {
      try {mixed=mixedPaymentInput_(total,received,tip);} catch(err) {toast(err.message,'error');return;}
    }
    const payload = {
      id: 'POS-'+crypto.randomUUID(),
      phase: STATE.phase,
      customer: customer,
      ticket: STATE.selectedAccountTicket || '',
      activity: $('activitySelect').value || 'Visita general DOMUS',
      expectedTotal: total,
      paid: isPaid,
      method: isPaid ? activePaymentMethod : '',
      received: isPaid && ['Efectivo','Mixto'].includes(activePaymentMethod) ? received : null,
      tip: isPaid && ['Efectivo','Mixto'].includes(activePaymentMethod) ? tip : 0,
      credit: isPaid ? '' : explicitCredit,
      items: STATE.cart.map(i => ({
        name: i.name,
        sku: i.sku || '',
        notes: i.notes || '',
        price: i.price,
        qty: i.qty,
        courtesy: !!i.courtesy,
        destination: i.destination
      }))
    };
    if(mixed)Object.assign(payload,mixed);
    if(STATE.journey?.enabled)payload.openingRequestId=STATE.journey.active.openingRequestId;

    payload.requestId = payload.id;
    const submittedDraft = saleDraftSnapshot_();
    paymentInFlight = true;
    if($('btnConfirmChargeAndSend'))$('btnConfirmChargeAndSend').disabled=true;
    if($('btnSendPendingPayment'))$('btnSendPendingPayment').disabled=true;
    try {
      await withOutboxStore_(() => {
        if(getOutbox().some(q=>['turnoAbrir','corteZCerrar'].includes(q.action) && q.status!=='REJECTED'))throw new Error('Recupera la apertura/corte pendiente antes de crear otra venta.');
        const saved = JSON.parse(localStorage.getItem('domus_pending_sale') || 'null');
        if (saved) {
          const id = saved.requestId || saved.id;
          const prior = getOutbox().find(q => q.requestId === id);
          const rejected = prior && prior.status === 'REJECTED' &&
            isSaleRejectionWithoutEffects_(prior.action, {code:prior.errorCode, status:prior.errorStatus});
          if (!rejected && !localStorage.getItem('domus_confirmation_' + id)) {
            throw new Error('Hay una operación sin resolver. Usa Reintentar Outbox o revisa su ID antes de crear otra venta. El pedido actual se conserva.');
          }
        }
        localStorage.setItem('domus_pending_sale', JSON.stringify(payload));
      });
    } catch(err) {
      paymentInFlight=false;
      if($('btnConfirmChargeAndSend'))$('btnConfirmChargeAndSend').disabled=false;
      if($('btnSendPendingPayment'))$('btnSendPendingPayment').disabled=false;
      toast(err.message,'error');return;
    }
    // Bind only the new intention to the draft captured when it was created.
    STATE.pendingSaleId = payload.id;
    STATE.pendingSaleDraft = submittedDraft;
    closePaymentModal();
    toast('Registrando operación en DOMUS…', 'ok');

    callBackend('cajaSimpleRegistrar', [payload], res => {
      paymentInFlight=false;
      if($('btnConfirmChargeAndSend'))$('btnConfirmChargeAndSend').disabled=false;
      if($('btnSendPendingPayment'))$('btnSendPendingPayment').disabled=false;
      if(res.localOutbox){toast('Cobro SIN CONFIRMAR. Conservado con el mismo ID para recuperación.','warn');return;}
      playChime('success');
      toast(res.message || 'Pedido guardado y enviado.', 'ok');
      const operatorName = (STATE.staffList && STATE.staffList.find(s => s.id === STATE.operator))?.name || STATE.operator || 'Caja DOMUS';
      const receiptData = {
        ticket: res.ticket,
        receipt: res.receipt,
        customer: payload.customer,
        date: new Date().toLocaleString('es-MX'),
        operator: operatorName,
        items: res.items && res.items.length ? res.items : [{name:'Saldo de cuenta',qty:1,price:res.total}],
        total: res.total,
        paid: res.paid === true,
        verified: res.verified === true,
        paymentStatus: res.paymentStatus,
        method: res.method || payload.method,
        received: res.received,
        tip: res.tip,
        change: res.change
      };
      if(res.payments)Object.assign(receiptData,{payments:res.payments,terminalReference:res.terminalReference});
      STATE.lastReceiptData = receiptData;
      showReceiptModal(receiptData);

      // Auto-imprimir ticket con DOMUS Print Bridge si es cobro confirmado
      if (res.paid === true && res.receipt && ['Efectivo','Mixto'].includes(res.method)) {
        openCashDrawer_(receiptData);
      }
      if (res.receipt) {
        printReceiptDirect(receiptData, false).catch(e => {
          console.warn('[DOMUS PRINT] Fallo al imprimir comprobante automático:', e);
        });
      }

      // The shared confirmation path clears only the original, unchanged draft.
      syncBackendData();
    }, err => {
      paymentInFlight=false;
      if($('btnConfirmChargeAndSend'))$('btnConfirmChargeAndSend').disabled=false;
      if($('btnSendPendingPayment'))$('btnSendPendingPayment').disabled=false;
      toast(`Error al registrar: ${err.message || String(err)}`, 'error');
    });
  }

  // Standalone customer copy from a server-confirmed result. Downloading is not
  // delivery confirmation and must never start another payment or contact a vendor.
  function receiptDocument_(data) {
    if (!data || !data.ticket || !Array.isArray(data.items) || !Number.isFinite(data.total)) throw new Error('Comprobante no disponible.');
    const confirmed = data.paid === true && data.verified === true && data.paymentStatus === 'CONFIRMADA' && !!data.receipt;
    const state = confirmed ? 'COBRO CONFIRMADO' : data.paymentStatus === 'CORTESIA_AUTORIZADA' ? 'CORTESÍA AUTORIZADA · SIN COBRO' : data.method === 'Transferencia' ? 'TRANSFERENCIA PENDIENTE DE VERIFICACIÓN' : 'CUENTA ABIERTA · PENDIENTE DE COBRO';
    const esc = value => escapeHtml(String(value == null ? '' : value));
    const items = data.items.map(i => `<tr><td>${esc(i.qty)} × ${esc(i.name)}</td><td>${esc(money(i.price * i.qty))}</td></tr>`).join('');
    const breakdown = data.method==='Mixto' && Array.isArray(data.payments)?`<p>${data.payments.map(p=>esc(p.method)+': '+esc(money(p.amount))).join('<br>')}<br>Referencia terminal: ${esc(data.terminalReference)}</p>`:'';
    const cash = confirmed && ['Efectivo','Mixto'].includes(data.method) ? `${breakdown}<p>Recibido: ${esc(money(data.received))}<br>Propina: ${esc(money(data.tip || 0))}<br>Cambio: ${esc(money(data.change))}</p>` : '';
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ticket DOMUS</title><style>body{font:16px sans-serif;max-width:32rem;margin:2rem auto;padding:1rem}td{padding:.4rem}td:last-child{text-align:right}table{width:100%}</style></head><body><h1>DOMUS</h1><p>${esc(state)}</p><p>Recibo: ${esc(data.receipt || 'Sin cobro')}<br>Cuenta: ${esc(data.ticket)}<br>Cliente: ${esc(data.customer)}<br>Fecha: ${esc(data.date)}<br>Medio: ${esc(data.method)}</p><table>${items}</table><p>Total de la cuenta: <strong>${esc(money(data.total))}</strong></p>${cash}</body></html>`;
  }

  function downloadReceipt_() {
    let url;
    try {
      const data = STATE.lastReceiptData;
      const html = receiptDocument_(data);
      url = URL.createObjectURL(new Blob([html], {type:'text/html;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'DOMUS-' + String(data.receipt || data.ticket).replace(/[^a-zA-Z0-9_-]/g,'_') + '.html';
      document.body.appendChild(link); link.click(); link.remove();
      toast('Descarga solicitada. Entrega el archivo al cliente y comprueba que pueda abrirlo.', 'ok');
    } catch(err) {
      toast('No se pudo descargar el ticket. Recupera el comprobante; no repitas el cobro.', 'warn');
    } finally {
      if(url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function openTransferReview_() {
    if(STATE.transferReviewSending)return;
    resetTransferCancellation_();
    STATE.transferPending=[];
    $('transferReviewModal').classList.add('open');$('btnConfirmTransferReview').disabled=true;
    $('transferReviewStatus').textContent='Consultando pendientes con sesión de Gerencia…';
    $('transferPendingSelect').innerHTML='';$('transferReceiverSelect').innerHTML='';
    ['transferReviewAmount','transferReceivedDate','transferBankReference','transferEvidenceReference'].forEach(id=>$(id).value='');
    $('transferBankReviewed').checked=false;
    callBackend('transferenciasPendientes',[],data=>{
      if(!data || data.verificationMode!=='MANUAL_BANK_REVIEW' || data.currency!=='MXN' || !Array.isArray(data.pending) || !Array.isArray(data.receivers)) {
        $('transferReviewStatus').textContent='Respuesta incompleta. No aplicar pagos.';return;
      }
      STATE.transferPending=data.pending;
      $('transferPendingSelect').innerHTML='<option value="">Selecciona el recibo original</option>'+data.pending.map(p=>`<option value="${escapeHtml(p.sourceRequestId)}" ${p.requiresReview?'disabled':''}>${escapeHtml(p.sourceReceipt)} · ${escapeHtml(p.ticket)} · ${escapeHtml(money(p.amount))}${p.requiresReview?' · Requiere revisión':''}</option>`).join('');
      $('transferReceiverSelect').innerHTML='<option value="">Selecciona cuenta receptora</option>'+data.receivers.map(r=>`<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
      $('btnConfirmTransferReview').disabled=!data.receivers.length || !data.pending.some(p=>!p.requiresReview);
      $('btnPrepareTransferCancellation').disabled=!data.pending.some(p=>!p.requiresReview);
      $('btnPrepareExistingPayment').disabled=!data.pending.some(p=>!p.requiresReview);
      $('existingPaymentHistory').textContent=(data.linked || []).map(p=>`Cuenta ${p.ticket} · pendiente ${p.sourceReceipt} resuelto con folio ${p.existingPaymentReceipt} · ${money(p.linkedAmount)} · nuevo cobro $0`).join(' | ');
      $('transferCancellationHistory').textContent=(data.cancelled || []).map(c=>`${c.sourceReceipt}: cancelación ${c.requestId} · sin ingreso · ${c.closureBlocked?'merma por conciliar, corte bloqueado':'sin merma observada'}`).join(' | ');
      $('transferReviewStatus').textContent=data.pending.length?'La confirmación registra tu revisión bancaria; no consulta al banco automáticamente.':'No hay transferencias pendientes de Caja.';
    },err=>{$('transferReviewStatus').textContent=err.message || 'No se pudo consultar. No aplicar pagos.';});
  }

  function submitTransferReview_() {
    if(STATE.transferReviewSending)return;
    try {
      if(STATE.existingPaymentReviewOpen)throw new Error('Cierra la revisión de pago existente antes de confirmar banco.');
      if(!$('transferCancellationPanel').hidden)throw new Error('Cierra la revisión de cancelación antes de revisar un ingreso bancario.');
      const pending=(STATE.transferPending || []).find(p=>p.sourceRequestId===$('transferPendingSelect').value && !p.requiresReview);
      const amount=Number($('transferReviewAmount').value),receiver=$('transferReceiverSelect').value;
      const bankTransactionId=$('transferBankReference').value.trim(),receivedDate=$('transferReceivedDate').value,evidenceReference=$('transferEvidenceReference').value.trim();
      if(!pending || !$('transferBankReviewed').checked || !receiver || !bankTransactionId || !receivedDate || !evidenceReference || !Number.isFinite(amount) || amount<=0 || amount!==pending.amount) {
        toast('Revisa el recibo, importe recibido completo, cuenta, referencia, fecha y evidencia bancaria antes de confirmar.','warn');return;
      }
      const unresolved=getOutbox().find(q=>['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente'].includes(q.action) && q.status!=='REJECTED' && q.args && q.args[0] && q.args[0].sourceReceipt===pending.sourceReceipt);
      if(unresolved) {toast('Confirmación sin resolver. Conserva la operación '+unresolved.requestId+' y recupera su resultado; no crees otro cobro.','warn');return;}
      const id='TRF-'+crypto.randomUUID();
      const body={id:id,requestId:id,sourceRequestId:pending.sourceRequestId,sourceReceipt:pending.sourceReceipt,ticket:pending.ticket,receiver:receiver,
        bankTransactionId:bankTransactionId,receivedDate:receivedDate,evidenceReference:evidenceReference,amount:amount,currency:'MXN'};
      if(STATE.journey?.enabled) {
        if(!STATE.journey.active?.openingRequestId)throw new Error('Abre una jornada antes de aplicar el ingreso.');
        body.openingRequestId=STATE.journey.active.openingRequestId;
      }
      STATE.transferReviewSending=true;$('btnConfirmTransferReview').disabled=true;
      callBackend('confirmarTransferencia',[body],res=>{
        STATE.transferReviewSending=false;
        if(res.localOutbox) {$('transferReviewStatus').textContent='Sin confirmar. Recupera el mismo ID: '+res.requestId;return;}
        $('transferReviewModal').classList.remove('open');
        const receipt={...res,date:res.verifiedAt,operator:res.verifiedBy};showReceiptModal(receipt);
        printReceiptDirect(receipt,false).catch(()=>toast('Pago aplicado. Ticket pendiente; no repitas la confirmación.','warn'));
        toast('Transferencia aplicada una sola vez. Entrega el comprobante confirmado.','ok');syncBackendData();
      },err=>{
        STATE.transferReviewSending=false;
        const noEffects=isSaleRejectionWithoutEffects_('confirmarTransferencia',err);
        $('btnConfirmTransferReview').disabled=!noEffects;
        $('transferReviewStatus').textContent=(noEffects?'Rechazo sin efectos. Corrige los datos antes de crear otra intención: ':'Confirmación requiere revisión: ')+(err.message || String(err));
      });
    } catch(err) {toast(err.message || String(err),'warn');}
  }

  function resetTransferCancellation_() {
    STATE.existingPaymentReviewOpen=false;STATE.existingPaymentPlan=null;
    $('existingPaymentPanel').hidden=true;$('btnLinkExistingPayment').disabled=true;$('confirmExistingPayment').checked=false;
    ['existingPaymentReason','existingPaymentEvidence'].forEach(id=>$(id).value='');
    STATE.transferCancellationRevision=(STATE.transferCancellationRevision || 0)+1;STATE.transferCancellationPlan=null;
    $('transferCancellationPanel').hidden=true;$('btnCancelUnreceivedTransfer').disabled=true;
    ['transferCancellationReason','transferCancellationEvidence','transferWasteNote','transferWasteStatus'].forEach(id=>$(id).value='');
    $('transferNoBankReceipt').checked=false;$('transferNoDelivery').checked=false;
    $('btnConfirmTransferReview').disabled=STATE.transferReviewSending || $('transferReceiverSelect').options.length<2 || !(STATE.transferPending || []).some(p=>!p.requiresReview);
  }

  function prepareTransferCancellation_() {
    if(STATE.transferReviewSending)return;
    const pending=(STATE.transferPending || []).find(p=>p.sourceRequestId===$('transferPendingSelect').value && !p.requiresReview);
    if(!pending){toast('Selecciona el recibo pendiente original.','warn');return;}
    if(getOutbox().some(q=>['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente'].includes(q.action) && q.status!=='REJECTED' && q.args?.[0]?.sourceReceipt===pending.sourceReceipt)) {
      toast('Existe una intención sin resolver. Recupera su mismo ID; no confirmes ni canceles otra vez.','warn');return;
    }
    resetTransferCancellation_();const revision=STATE.transferCancellationRevision;
    $('btnConfirmTransferReview').disabled=true;
    $('transferCancellationPanel').hidden=false;$('transferCancellationSummary').textContent='Revisando cuenta, pago y entrega…';
    callBackend('prepararResolucionTransferencia',[{sourceRequestId:pending.sourceRequestId,sourceReceipt:pending.sourceReceipt,ticket:pending.ticket}],p=>{
      if(revision!==STATE.transferCancellationRevision || $('transferPendingSelect').value!==pending.sourceRequestId)return;
      if(!p || p.kind!=='TRANSFER_RESOLUTION_PROPOSAL' || p.readOnly!==true || p.executable!==false || p.sourceRequestId!==pending.sourceRequestId ||
        p.sourceReceipt!==pending.sourceReceipt || p.ticket!==pending.ticket || p.amount!==pending.amount || !/^[a-f0-9]{64}$/.test(p.snapshotHash || '') ||
        !p.account || !p.fulfillment || !Array.isArray(p.fulfillment.units) || !p.fulfillment.units.length ||
        p.fulfillment.units.some(u=>!u || typeof u.id!=='string' || !u.id) || new Set(p.fulfillment.units.map(u=>u.id)).size!==p.fulfillment.units.length) {
        $('transferCancellationSummary').textContent='Propuesta incompleta; conservar el pendiente.';return;
      }
      $('transferCancellationSummary').textContent=`Cuenta ${p.ticket} · pendiente ${p.sourceReceipt} · importe ${money(p.amount)} · aplicado ${money(p.account.paid)} · saldo ${money(p.account.due)} · ${p.fulfillment.total} unidad(es), ${p.fulfillment.deliveryEvidence} con señal de entrega. Cancelar no registra ingreso ni devolución.`;
      if(p.account.paid!==0 || p.fulfillment.deliveryEvidence!==0 || !p.sourceJourney?.openingRequestId ||
        !['NO_RECORDED_DELIVERY_DECISION','CANCELLED_ORDER_RECONCILIATION'].includes(p.decision)) {
        $('transferCancellationSummary').textContent+=' Requiere conciliación: no cancelar ni cobrar otra vez. Si hay un recibo confirmado, usa Revisar pago existente.';return;
      }
      STATE.transferCancellationPlan=p;$('btnCancelUnreceivedTransfer').disabled=false;
    },err=>{
      if(revision===STATE.transferCancellationRevision)$('transferCancellationSummary').textContent='No se preparó cancelación: '+(err.message || String(err));
    });
  }

  function submitTransferCancellation_() {
    if(STATE.transferReviewSending)return;
    try {
      const p=STATE.transferCancellationPlan,reason=$('transferCancellationReason').value.trim(),evidence=$('transferCancellationEvidence').value.trim();
      const wasteStatus=$('transferWasteStatus').value,wasteNote=$('transferWasteNote').value.trim();
      if(!p || p.sourceRequestId!==$('transferPendingSelect').value || !reason || !evidence || !$('transferNoBankReceipt').checked || !$('transferNoDelivery').checked ||
        !['NO_WASTE_OBSERVED','WASTE_OBSERVED','PENDING_REVIEW'].includes(wasteStatus) || !wasteNote)throw new Error('Completa motivo, revisión de banco, ausencia de entrega y observación física de merma.');
      if(getOutbox().some(q=>['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente'].includes(q.action) && q.status!=='REJECTED' && q.args?.[0]?.sourceReceipt===p.sourceReceipt))throw new Error('Intención sin resolver. Recupera el mismo ID; no repitas el trámite.');
      if(!confirm(`Cancelar ${p.sourceReceipt} de ${p.ticket}, por ${money(p.amount)}, sin ingreso ni devolución. ¿Confirmas que no se entregó ninguna unidad?`))return;
      const id='CANCEL-TRF-'+crypto.randomUUID(),body={id,requestId:id,sourceRequestId:p.sourceRequestId,sourceReceipt:p.sourceReceipt,ticket:p.ticket,
        openingRequestId:p.sourceJourney.openingRequestId,snapshotHash:p.snapshotHash,expectedAmount:p.amount,expectedUnitIds:p.fulfillment.units.map(u=>u.id),reason,
        review:{noDeliveryConfirmed:true,noBankReceiptConfirmed:true,evidenceReference:evidence},wasteReview:{status:wasteStatus,note:wasteNote}};
      STATE.transferReviewSending=true;$('btnCancelUnreceivedTransfer').disabled=true;$('btnConfirmTransferReview').disabled=true;
      callBackend('cancelarTransferenciaNoRecibida',[body],res=>{
        STATE.transferReviewSending=false;
        if(res.localOutbox){$('transferCancellationSummary').textContent='Cancelación sin confirmar. Conserva y recupera el mismo ID: '+res.requestId;return;}
        toast(res.closureBlocked?'Cancelación registrada sin ingreso. Merma por conciliar; corte bloqueado.':'Cancelación registrada sin ingreso ni devolución.','ok');
        openTransferReview_();syncBackendData();
      },err=>{
        STATE.transferReviewSending=false;STATE.transferCancellationPlan=null;
        $('transferCancellationSummary').textContent=(isSaleRejectionWithoutEffects_('cancelarTransferenciaNoRecibida',err)?'Rechazo sin efectos. Consulta de nuevo la cuenta: ':'Cancelación incierta. Conserva el mismo ID: ')+(err.message || String(err));
      });
    }catch(err){toast(err.message || String(err),'warn');}
  }

  function prepareExistingPayment_() {
    if(STATE.transferReviewSending)return;
    const pending=(STATE.transferPending || []).find(p=>p.sourceRequestId===$('transferPendingSelect').value && !p.requiresReview);
    if(!pending){toast('Selecciona el recibo pendiente original.','warn');return;}
    if(getOutbox().some(q=>['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente'].includes(q.action) && q.status!=='REJECTED' && q.args?.[0]?.sourceReceipt===pending.sourceReceipt)) {
      toast('Hay una intención sin resolver. Recupera su mismo ID antes de usar otro pago.','warn');return;
    }
    resetTransferCancellation_();const revision=STATE.transferCancellationRevision;
    STATE.existingPaymentReviewOpen=true;$('existingPaymentPanel').hidden=false;$('btnConfirmTransferReview').disabled=true;
    $('existingPaymentSummary').textContent='Cotejando cuenta y recibo existente…';
    callBackend('prepararVinculoPagoExistente',[{sourceRequestId:pending.sourceRequestId,sourceReceipt:pending.sourceReceipt,ticket:pending.ticket}],p=>{
      if(revision!==STATE.transferCancellationRevision || $('transferPendingSelect').value!==pending.sourceRequestId)return;
      const e=p && p.existingPayment;
      if(!p || p.kind!=='TRANSFER_EXISTING_PAYMENT_PROPOSAL' || p.version!==1 || p.readOnly!==true || p.newCharge!==0 || p.currency!=='MXN' ||
        p.sourceRequestId!==pending.sourceRequestId || p.sourceReceipt!==pending.sourceReceipt || p.ticket!==pending.ticket || p.amount!==pending.amount ||
        !/^[a-f0-9]{64}$/.test(p.snapshotHash || '') || !validJourneyContext_(p.sourceJourney) || !Array.isArray(p.unitIds) || !p.unitIds.length ||
        p.unitIds.some(id=>typeof id!=='string' || !id) || new Set(p.unitIds).size!==p.unitIds.length || !e || !e.requestId || !e.receipt ||
        e.ticket!==p.ticket || e.amount!==p.amount || e.paymentStatus!=='CONFIRMADA' || !['Efectivo','Terminal 1','Terminal 2','Mixto'].includes(e.method) ||
        !Array.isArray(e.parts) || !e.parts.length || e.parts.some(a=>!a || typeof a.receipt!=='string' || !a.receipt || typeof a.amount!=='number' || !Number.isFinite(a.amount) || a.amount<=0) ||
        Math.abs(e.parts.reduce((n,a)=>n+a.amount,0)-p.amount)>0.001 || !Number.isFinite(Date.parse(e.recordedAt)) || !e.recordedBy) {
        $('existingPaymentSummary').textContent='Propuesta incompleta. Conserva el pendiente; no cobres otra vez.';return;
      }
      STATE.existingPaymentPlan=p;
      $('existingPaymentSummary').textContent=`Cuenta: ${p.ticket}\nPendiente: ${p.sourceReceipt}\nPago existente: ${e.receipt}\nImporte: ${money(e.amount)} · ${e.method}\nRegistrado: ${e.recordedAt} · ${e.recordedBy}\nProyecto: ${p.sourceJourney.scope.projectName} · Evento: ${p.sourceJourney.scope.eventName || 'Sin evento'}\nNuevo cobro: $0. La entrega conserva su estado actual.`;
      $('btnLinkExistingPayment').disabled=false;
    },err=>{if(revision===STATE.transferCancellationRevision)$('existingPaymentSummary').textContent='No se puede vincular: '+(err.message || String(err));});
  }

  function submitExistingPayment_() {
    if(STATE.transferReviewSending)return;
    try {
      const p=STATE.existingPaymentPlan,reason=$('existingPaymentReason').value.trim(),evidenceReference=$('existingPaymentEvidence').value.trim();
      if(!p || p.sourceRequestId!==$('transferPendingSelect').value || !$('confirmExistingPayment').checked || !reason || !evidenceReference)throw new Error('Revisa cuenta, importe y folio; confirma usar el pago existente con nuevo cobro $0 y registra la evidencia.');
      if(getOutbox().some(q=>['confirmarTransferencia','cancelarTransferenciaNoRecibida','vincularPagoExistente'].includes(q.action) && q.status!=='REJECTED' && q.args?.[0]?.sourceReceipt===p.sourceReceipt))throw new Error('Intención sin resolver. Conserva y recupera su mismo ID.');
      const e=p.existingPayment;
      if(!confirm(`Cuenta: ${p.ticket}\nFolio existente: ${e.receipt}\nImporte ya registrado: ${money(e.amount)}\nUsar pago existente. Nuevo cobro: $0. ¿Confirmas?`))return;
      const id='LINK-PAY-'+crypto.randomUUID(),body={id,requestId:id,sourceRequestId:p.sourceRequestId,sourceReceipt:p.sourceReceipt,ticket:p.ticket,
        existingPaymentRequestId:e.requestId,existingPaymentReceipt:e.receipt,expectedAmount:p.amount,expectedPaymentMethod:e.method,expectedPaymentParts:e.parts,
        expectedUnitIds:p.unitIds,openingRequestId:p.sourceJourney.openingRequestId,snapshotHash:p.snapshotHash,confirmExistingPayment:true,newCharge:0,reason,evidenceReference};
      STATE.transferReviewSending=true;$('btnLinkExistingPayment').disabled=true;$('btnConfirmTransferReview').disabled=true;
      callBackend('vincularPagoExistente',[body],res=>{
        STATE.transferReviewSending=false;
        if(res.localOutbox){$('existingPaymentSummary').textContent='Vínculo sin confirmar. Recupera el mismo ID: '+res.requestId;return;}
        toast('Pago existente vinculado. Nuevo cobro: $0. Conserva el recibo '+res.existingPaymentReceipt+'.','ok');openTransferReview_();syncBackendData();
      },err=>{
        STATE.transferReviewSending=false;STATE.existingPaymentPlan=null;
        $('existingPaymentSummary').textContent=(isSaleRejectionWithoutEffects_('vincularPagoExistente',err)?'Rechazo sin efectos. Consulta de nuevo: ':'Vínculo incierto. Recupera el mismo ID: ')+(err.message || String(err));
      });
    }catch(err){toast(err.message || String(err),'warn');}
  }

  // --- MODAL DE RECIBO DE PAGO ---
  function showReceiptModal(data) {
    if (data) {
      STATE.lastReceiptData = data;
    }
    const modal = $('receiptModal');
    $('receiptFolio').textContent = data.receipt ? `RECIBO: ${data.receipt}` : data.paymentStatus === 'CORTESIA_AUTORIZADA' ? 'CORTESÍA AUTORIZADA · SIN COBRO' : 'VENTA PENDIENTE DE COBRO';
    $('receiptTicket').textContent = `CUENTA: ${data.ticket}`;
    $('receiptCustomer').textContent = `CLIENTE: ${data.customer}`;
    $('receiptDate').textContent = `FECHA: ${data.date || new Date().toLocaleString('es-MX')}`;

    const itemsContainer = $('receiptItemsList');
    itemsContainer.innerHTML = data.items.map(i => `
      <div class="receipt-line">
        <span>${i.qty}x ${escapeHtml(i.name)}</span>
        <span>${money(i.price * i.qty)}</span>
      </div>
    `).join('');

    $('receiptTotal').textContent = money(data.total);

    const paymentInfo = $('receiptPaymentDetails');
    if (data.paymentStatus === 'CORTESIA_AUTORIZADA') {
      paymentInfo.textContent = 'CORTESÍA AUTORIZADA · SIN COBRO';
    } else if (data.paid && ['Efectivo','Mixto'].includes(data.method)) {
      paymentInfo.innerHTML = `
        <div class="receipt-line"><span>Método:</span><span>${escapeHtml(data.method)}</span></div>
        ${data.method==='Mixto' && Array.isArray(data.payments)?data.payments.map(p=>`<div class="receipt-line"><span>${escapeHtml(p.method)}:</span><span>${money(p.amount)}</span></div>`).join('')+`<div>Referencia terminal: ${escapeHtml(data.terminalReference || '')}</div>`:''}
        <div class="receipt-line"><span>Recibido:</span><span>${money(data.received)}</span></div>
        ${data.tip > 0 ? `<div class="receipt-line"><span>Propina:</span><span>${money(data.tip)}</span></div>` : ''}
        <div class="receipt-line"><span>Cambio:</span><span>${money(data.change)}</span></div>
      `;
    } else if (data.method === 'Transferencia' && data.verified !== true) {
      paymentInfo.textContent = 'PAGO POR TRANSFERENCIA PENDIENTE DE VERIFICACIÓN';
    } else if (data.paid && data.receipt) {
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
                    ${!hasResponsible && item.state === 'Pendiente' ? `
                      <button type="button" class="btn-action-small btn-ready" onclick="window.__domusApp.claimOrder('${item.key}')">
                        ✋ Tomar comanda
                      </button>
                    ` : ''}

                    ${hasResponsible && item.state === 'En preparación' ? `
                      <button type="button" class="btn-action-small btn-ready" onclick="window.__domusApp.markOrderReady('${item.key}')">
                        ✓ Marcar Lista
                      </button>
                    ` : ''}
                    
                    ${hasResponsible && item.state === 'Lista' ? `
                      <button type="button" class="btn-action-small btn-deliver" ${item.deliveryAllowed===true?'':'disabled'} title="${escapeHtml(item.deliveryBlockReason || '')}" onclick="window.__domusApp.deliverOrder('${item.key}')">
                        📦 Entregar
                      </button>
                      ${item.deliveryAllowed===true?'':`<small>${escapeHtml(item.deliveryBlockReason || 'Entrega pendiente de autorización financiera.')}</small>`}
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
    const reqId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const body = {
      key: orderKey,
      action: 'TOMAR',
      operator: STATE.operator,
      requestId: reqId
    };

    callBackend('comandasSimpleAccion', [body], res => {
      if(res.localOutbox){toast('Acción de comanda sin confirmar. Conservada para recuperación.','warn');return;}
      toast('Comanda tomada para preparación.', 'ok');
      syncBackendData();
    }, err => {
      toast(err.message || String(err), 'warn');
      syncBackendData();
    });
  }

  function markOrderReady(orderKey) {
    if (!ensureOperator()) return;
    const ord = STATE.comandas.find(o => o.key === orderKey);
    if (!ord || ord.state !== 'En preparación') {
      toast('Sólo una comanda En preparación puede marcarse como Lista.', 'warn');
      syncBackendData();
      return;
    }
    const reqId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const body = {
      key: orderKey,
      action: 'LISTA',
      operator: STATE.operator,
      requestId: reqId
    };

    callBackend('comandasSimpleAccion', [body], res => {
      if(res.localOutbox){toast('Acción de comanda sin confirmar. Conservada para recuperación.','warn');return;}
      toast('Producto marcado como Listo para entrega.', 'ok');
      syncBackendData();
    }, err => {
      toast(err.message || String(err), 'warn');
      syncBackendData();
    });
  }

  function deliverOrder(orderKey) {
    if (!ensureOperator()) return;
    const ord = STATE.comandas.find(o => o.key === orderKey);
    if (!ord || ord.state !== 'Lista') {
      toast('Sólo una comanda marcada como Lista puede registrarse como Entregada.', 'warn');
      syncBackendData();
      return;
    }
    if(ord.deliveryAllowed!==true) {
      toast(ord.deliveryBlockReason || 'Entrega sin autorización financiera acreditada. Actualiza el estado.', 'warn');
      syncBackendData();return;
    }
    const prodName = ord.product || '1 unidad';
    
    if (!confirm(`¿Confirmas la entrega FÍSICA de:\n${prodName} para ${ord ? ord.alias : 'el cliente'}?`)) {
      return;
    }

    const reqId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const body = {
      key: orderKey,
      action: 'ENTREGAR',
      operator: STATE.operator,
      requestId: reqId
    };

    callBackend('comandasSimpleAccion', [body], res => {
      if(res.localOutbox){toast('Entrega sin confirmar. Verifica el estado antes de repetirla.','warn');return;}
      toast('Entrega registrada exitosamente.', 'ok');
      playChime('success');
      syncBackendData();
    }, err => {
      toast(err.message || String(err), 'warn');
      syncBackendData();
    });
  }

  function reportIncident(orderKey) {
    if (!ensureOperator()) return;
    const opcion = prompt('Elige el motivo de indisponibilidad:\n1 = Reponer de almacén\n2 = Agotado en DOMUS', '1');
    if (!opcion) return;

    const action = opcion.trim() === '2' ? 'AGOTADO' : 'ALMACEN';
    const reqId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const body = {
      key: orderKey,
      action: action,
      operator: STATE.operator,
      requestId: reqId
    };

    callBackend('comandasSimpleAccion', [body], res => {
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

    callBackend('solicitarResurtido',[{product:prod,type:type}],res=>{
      if(res.localOutbox){toast('Resurtido pendiente de confirmar.','warn');return;}
      toast('Solicitud guardada en servidor.','ok');syncBackendData();
    },err=>toast(err.message,'error'));
  }

  function resolveRestock(id) {
    if (!ensureOperator()) return;
    const reqId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const body = { id, operator: STATE.operator, requestId: reqId };
    callBackend('comandasSimpleResolver', [body], res => {
      toast('Disponibilidad confirmada.', 'ok');
      syncBackendData();
    }, err => toast(err.message || String(err), 'error'));
  }

  function ensureOperator() {
    if (!STATE.operator) {
      const defaultOp = STATE.mode === 'comandas' ? 'Barra / Cocina' : 'Operador';
      const chosen = prompt('¿Quién atiende o toma esta orden? (Escribe tu nombre o apodo):', defaultOp);
      if (chosen && chosen.trim()) {
        STATE.operator = chosen.trim();
        sessionStorage.setItem('domus_operator', STATE.operator);
        localStorage.setItem('domus_operator', STATE.operator);
        if ($('staffSelect')) {
          let found = false;
          for (let i = 0; i < $('staffSelect').options.length; i++) {
            if ($('staffSelect').options[i].value === STATE.operator) {
              $('staffSelect').value = STATE.operator;
              found = true;
              break;
            }
          }
          if (!found) {
            $('staffSelect').add(new Option(STATE.operator, STATE.operator, true, true));
          }
        }
        return true;
      }
      toast('Selecciona al operador antes de continuar.','warn');
      return false;
    }
    return true;
  }

  // --- CONFIGURACIÓN & MODAL API ---
  function openConfigModal() {
    if ($('gasApiUrlInput')) $('gasApiUrlInput').value = STATE.apiUrl;
    if ($('printBridgeTokenInput')) {
      $('printBridgeTokenInput').value = '';
      $('printBridgeTokenInput').placeholder = getPrintToken() ? 'Token guardado; escribe sólo para reemplazarlo' : 'Sin token guardado';
    }
    if ($('printerStatusMsg')) {
      $('printerStatusMsg').textContent = STATE.printerStatus === 'ready'
        ? '✓ Conexión establecida con DOMUS Print Bridge (127.0.0.1:17321).'
        : 'Estado: Desconectado o pendiente de verificación.';
    }
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
      toast('Las credenciales se gestionan en el servidor; no se cambió la contraseña desde este equipo.','warn');
      $('newCajaPasswordInput').value = '';
    }
    const printToken = $('printBridgeTokenInput') ? $('printBridgeTokenInput').value.trim() : '';
    if (printToken) {
      setPrintToken(printToken);
    }
    if($('printBridgeTokenInput'))$('printBridgeTokenInput').value='';
    $('configModal').classList.remove('open');
    toast('Configuración guardada.', 'ok');
    syncBackendData();
    checkPrinterStatus();
  }

  // --- ALTA / REGISTRO DE NUEVOS PRODUCTOS (ADMIN CAJA) ---
  function openNewProductModal() {
    const nameEl = $('newProdName');
    if (nameEl) nameEl.value = '';
    if ($('newProdPriceSolar')) $('newProdPriceSolar').value = '';
    if ($('newProdPriceLunar')) $('newProdPriceLunar').value = '';
    if ($('newProdSku')) $('newProdSku').value = '';
    if ($('newProdCustomCategory')) $('newProdCustomCategory').value = '';
    if ($('customCatWrapper')) $('customCatWrapper').classList.add('hidden');
    if ($('newProdStock')) $('newProdStock').value = '50';

    // Poblar categorías existentes de forma tolerante y segura
    const select = $('newProdCategory');
    if (select) {
      const defaultCats = ['Menú Cannábico', 'Bebidas', 'Cervezas', 'Cheladas', 'Coctelería', 'Comida público', 'Sushi', 'Cocina', 'Cafetería', 'Shots'];
      const prodCats = Array.isArray(STATE.products) 
        ? STATE.products.map(p => p && p.group).filter(Boolean) 
        : [];
      const allGroups = [...new Set([...defaultCats, ...prodCats])];
      select.innerHTML = allGroups.map(g => `<option value="${g}">${g}</option>`).join('') +
        '<option value="__NEW__">+ Otra Categoría…</option>';
    }

    const modal = $('newProductModal');
    if (modal) {
      modal.classList.add('open');
    }
    setTimeout(() => {
      if (nameEl) nameEl.focus();
    }, 150);
  }

  function closeNewProductModal() {
    const modal = $('newProductModal');
    if (modal) modal.classList.remove('open');
  }

  function saveNewProduct() {
    const nameEl = $('newProdName');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      toast('Escribe el nombre del producto.', 'warn');
      if (nameEl) nameEl.focus();
      return;
    }

    const catEl = $('newProdCategory');
    let category = catEl ? catEl.value : 'General';
    if (category === '__NEW__') {
      const customCatEl = $('newProdCustomCategory');
      category = customCatEl ? customCatEl.value.trim() : '';
      if (!category) {
        toast('Escribe el nombre de la nueva categoría.', 'warn');
        if (customCatEl) customCatEl.focus();
        return;
      }
    }

    const priceSolarEl = $('newProdPriceSolar');
    const priceLunarEl = $('newProdPriceLunar');
    const priceSolar = priceSolarEl ? parseFloat(priceSolarEl.value) : 0;
    const priceLunar = priceLunarEl ? parseFloat(priceLunarEl.value) : priceSolar;

    if (isNaN(priceSolar) || priceSolar < 0) {
      toast('Introduce un precio válido para Fase Solar.', 'warn');
      if (priceSolarEl) priceSolarEl.focus();
      return;
    }

    const destination = ($('newProdDestination') && $('newProdDestination').value) || 'Barra';
    const provider = ($('newProdProvider') && $('newProdProvider').value.trim()) || 'DOMUS';
    const sku = ($('newProdSku') && $('newProdSku').value.trim()) || `PRD-${Date.now().toString(36).toUpperCase()}`;
    const stock = $('newProdStock') ? Number($('newProdStock').value) : 0;

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

    callBackend('registrarNuevoProducto', [newProduct], res => {
      if(res.localOutbox){toast('Alta pendiente; el producto aún no está disponible.','warn');return;}
      closeNewProductModal();toast(res.message || 'Producto guardado.','ok');syncBackendData();
    },err=>toast('No se confirmó el alta: '+err.message,'error'));
  }


  // --- INTERFAZ: MODO ACCESOS, EVENTOS Y GUARDARROPA ---

  function getActiveEvent() {
    let ev = (STATE.eventsList || []).find(e => e.name === STATE.activeActivity);
    if (!ev && STATE.activityPolicyPending) return {name:'',capacity:null,status:'',ticketTypes:[],policyPending:true};
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
      btnConfirm.disabled = isRegisteringAccess || STATE.activityPolicyPending === true;
      btnConfirm.title = STATE.activityPolicyPending ? 'Contrato operativo de eventos pendiente de definición.' : '';
      btnConfirm.onclick = () => confirmAccessAndRegister();
    }
  }

  function renderAccessActivitySelector() {
    const select = $('accessActivitySelect');
    if (!select) return;
    select.disabled = STATE.activityPolicyPending === true;

    if (!STATE.eventsList || STATE.eventsList.length === 0) {
      if(STATE.activityPolicyPending){select.innerHTML='<option value="">Sin eventos disponibles</option>';return;}
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
    if (!STATE.accessSalesChannel || STATE.accessChannelEvent !== ev.name) {
      STATE.accessSalesChannel = ev.salesChannel || (ev.name.includes('Forza') ? 'BOLETERA_EXTERNA' : 'TAQUILLA_DOMUS');
      STATE.accessChannelEvent = ev.name;
      STATE.accessSelectedType = 'General';
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
      $('bannerBoleteraText').textContent = 'Pago externo reportado · Sin verificación automática · Entrada $0 en puerta';
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
    if (STATE.activityPolicyPending) {
      toast('Contrato operativo de eventos pendiente de definición por Dirección.', 'warn');
      return;
    }
    if (STATE.eventChangePending) {
      toast('Espera la confirmación del evento antes de registrar accesos.', 'warn');
      return;
    }
    if(STATE.accessPaymentMethod==='Transferencia' || STATE.accessSalesChannel==='TRANSFERENCIA_DIRECTA') {
      toast('La confirmación bancaria de Accesos sigue pendiente de habilitar. No registrar una admisión contra ese pago.','warn');return;
    }
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

    // Keep submission locked until the dispatcher settles; no timed re-enable during a slow write.

    // Generar folio atómico previo para fallbacks
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const rowId = 'ACCESS-'+crypto.randomUUID();

    const channel = STATE.accessSalesChannel || 'BOLETERA_EXTERNA';
    const phone = ($('accessCustomerPhone') ? $('accessCustomerPhone').value : '').trim();
    const email = ($('accessCustomerEmail') ? $('accessCustomerEmail').value : '').trim();
    const ticketTypeId = STATE.accessSelectedType || 'General';
    const wardrobeQty = STATE.accessWardrobeQty || 0;
    const wardrobeNotes = ($('accessWardrobeNotes') ? $('accessWardrobeNotes').value : '').trim();
    const method = STATE.accessPaymentMethod || 'Efectivo';

    let externalTicketId = '';
    let ticketProvider = 'DOMUS';
    let externalReportedAmount = null, externalPaymentRecipient = '', externalPaymentMethod = '';
    let courtesyAuth = '';
    let paymentStatus = 'CONFIRMADA';
    let paymentReference = '';

    if (channel === 'BOLETERA_EXTERNA') {
      externalTicketId = ($('accessExternalTicketId') ? $('accessExternalTicketId').value : '').trim();
      ticketProvider = ($('accessTicketProvider') ? $('accessTicketProvider').value : '').trim();
      const amountText = ($('accessExternalAmount') ? $('accessExternalAmount').value : '').trim();
      externalReportedAmount = amountText === '' ? null : Number(amountText);
      externalPaymentRecipient = ($('accessExternalRecipient') ? $('accessExternalRecipient').value : '').trim();
      externalPaymentMethod = ($('accessExternalMethod') ? $('accessExternalMethod').value : '').trim();
      if (!externalTicketId || externalTicketId.startsWith('=') || !ticketProvider || !externalPaymentRecipient || !externalPaymentMethod || externalReportedAmount === null || !Number.isFinite(externalReportedAmount) || externalReportedAmount < 0) {
        unlockBtn();
        toast('Completa proveedor, referencia real, importe, receptor y medio del pago externo. No se verifica automáticamente.', 'warn');
        return;
      }
      paymentStatus = 'PAGADO_EXTERNAMENTE';
    } else if (channel === 'PREVENTA_DOMUS') {
      externalTicketId = ($('accessPresaleDomusFolio') ? $('accessPresaleDomusFolio').value : '').trim();
      if (!externalTicketId) {
        unlockBtn();
        toast('Indica la referencia real de preventa; no se genera un folio sustituto.', 'warn');
        return;
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
      externalReportedAmount: externalReportedAmount,
      externalPaymentRecipient: externalPaymentRecipient,
      externalPaymentMethod: externalPaymentMethod,
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
      paymentMethod: method,
      method: method,
      paymentStatus: paymentStatus,
      paymentReference: paymentReference,
      courtesyAuth: courtesyAuth,
      ticketGuardarropa: ticketGuardarropa,
      wardrobeReturned: false
    };

    callBackend('accesoSimpleRegistrar', [newRecord], res => {
      unlockBtn();
      if(res.localOutbox){toast('Acceso SIN CONFIRMAR. Recupera la intención original de Outbox.','warn');return;}
      if(!res.rowId){toast('Respuesta sin folio de acceso. No registrar otra intención.','error');return;}
      const confirmed={...newRecord,...res,id:res.rowId,paid:res.doorCollected};
      STATE.recentAccessList.unshift(confirmed);
      openAccessReceiptModal(confirmed);
      toast(res.message || 'Acceso confirmado por servidor.','ok');
      syncBackendData();
    }, err => {unlockBtn();toast('Acceso sin confirmar: '+err.message,'error');});

    // Reset Form
    if ($('accessCustomerName')) $('accessCustomerName').value = '';
    if ($('accessCustomerPhone')) $('accessCustomerPhone').value = '';
    if ($('accessCustomerEmail')) $('accessCustomerEmail').value = '';
    if ($('accessExternalTicketId')) $('accessExternalTicketId').value = '';
    if ($('accessExternalAmount')) $('accessExternalAmount').value = '';
    if ($('accessExternalRecipient')) $('accessExternalRecipient').value = '';
    if ($('accessExternalMethod')) $('accessExternalMethod').value = '';
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
    // Receipt opens only in the server-confirmed callback.
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
            <p style="font-size: 0.82rem; margin-top: 6px; color: var(--text-secondary);">Los ingresos acumulados de esta vista son 0. Registra o valida el primer boleto usando el formulario de la izquierda.</p>
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
      if(STATE.activityPolicyPending){tbody.innerHTML='<tr><td colspan="8">Sin eventos disponibles. Contrato operativo pendiente.</td></tr>';return;}
      STATE.eventsList = [...DEFAULT_EVENTS];
    }

    tbody.innerHTML = STATE.eventsList.map(ev => {
      const isActive = ev.name === STATE.activeActivity;
      const canonical=ev.schemaKind==='canonical35';
      const description=canonical ? `Área: ${ev.area || 'Sin dato'} · Proyecto: ${ev.project || 'Sin dato'}` : `${ev.type || ''} · ${ev.organizer || 'DOMUS'}`;
      const amount=(value,fallback=0)=>canonical && (typeof value!=='number' || !Number.isFinite(value) || value<0)
        ? 'Tarifa sin confirmar' : '$'+Number(value ?? fallback).toFixed(2);

      return `
        <tr class="${isActive ? 'active-event-row' : ''}">
          <td>
            <strong>${escapeHtml(ev.name)}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(description)}</div>
          </td>
          <td style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(ev.date || '---')}</td>
          <td><strong>${amount(ev.priceGeneral)}</strong></td>
          <td><strong>${amount(ev.pricePareja)}</strong></td>
          <td><strong>${amount(ev.priceTrio)}</strong></td>
          <td><span style="color: var(--gold-primary);">${amount(ev.priceGuardarropa,50)}</span></td>
          <td style="font-size: 0.82rem;">${Number.isInteger(ev.capacity) && ev.capacity > 0 ? ev.capacity + ' pers.' : 'Sin aforo confirmado'}</td>
          <td>
            ${ev.policyPending ? '<span>Contrato operativo pendiente</span>' : isActive
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
    if (STATE.activityPolicyPending) {
      toast('Contrato operativo de eventos pendiente de definición por Dirección.', 'warn');
      return;
    }
    if (STATE.eventChangePending) {
      toast('Cambio de evento pendiente de confirmación del servidor.', 'warn');
      return;
    }
    if (!(STATE.eventsList || []).some(ev => ev.name === eventName)) {
      toast('El evento no está en el catálogo confirmado.', 'error');
      return;
    }
    STATE.eventChangePending = true;
    STATE.eventChangeRevision += 1;
    const fail = err => {
      STATE.eventChangePending = false;
      STATE.eventChangeRevision += 1;
      toast('Evento NO confirmado. Verifica conexión y servidor antes de cobrar.', 'error');
      console.warn('Cambio de evento no confirmado:', err);
    };
    callBackend('accesoCambiarActividad', [{ activity: eventName }], res => {
      if (!res || res.localOutbox || res.ok === false || res.activeActivity !== eventName) {
        fail(new Error('Falta confirmación del evento en servidor'));
        return;
      }
      STATE.activeActivity = res.activeActivity;
      localStorage.setItem('domus_active_event', res.activeActivity);
      STATE.eventChangePending = false;
      STATE.eventChangeRevision += 1;
      const ev = getActiveEvent();
      STATE.accessSalesChannel = (ev && ev.salesChannel) || 'TAQUILLA_DOMUS';
      toast(`Evento confirmado por servidor: ${res.activeActivity}`, 'ok');
      renderAccesosView();
    }, fail);
  }

  function returnWardrobeItems(ticketGua) {
    callBackend('guardarropaDevolver',[{ticket:ticketGua}],res=>{
      if(res.localOutbox){toast('Devolución de prendas sin confirmar.','warn');return;}
      toast(res.message || 'Prendas devueltas.','ok');syncBackendData();
    },err=>toast(err.message,'error'));
  }

  // --- MODAL: COMPROBANTE DE ACCESO Y GUARDARROPA ---

  function openAccessReceiptModal(record) {
    if (!record) return;
    STATE.lastAccessRecord = record;
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
        html += `<div>Proveedor: ${escapeHtml(record.ticketProvider || 'Sin informar')}<br>Importe externo reportado: ${record.externalReportedAmount == null ? 'Sin informar' : escapeHtml(money(record.externalReportedAmount))}<br>Receptor reportado: ${escapeHtml(record.externalPaymentRecipient || 'Sin informar')}<br>Medio externo: ${escapeHtml(record.externalPaymentMethod || 'Sin informar')}<br>Sin verificación automática. No es un cobro nuevo de DOMUS.</div>`;
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
        <div>Cobro en puerta: <strong>${totalPaid > 0 ? escapeHtml(record.paymentMethod || record.method || '') : Number(record.amountDueAtDoor) > 0 ? 'PENDIENTE DE VERIFICACIÓN' : 'SIN COBRO'}</strong></div>
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
    if (STATE.activityPolicyPending) {
      toast('Contrato operativo de eventos pendiente de definición por Dirección.', 'warn');
      return;
    }
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
    if (STATE.activityPolicyPending) {
      toast('Contrato operativo de eventos pendiente de definición por Dirección.', 'warn');
      return;
    }
    const name = ($('eventFormName').value || '').trim();
    const date = $('eventFormDate').value;
    const type = $('eventFormType').value;
    const organizer = ($('eventFormOrganizer').value || 'DOMUS').trim();
    const capacity = parseInt($('eventFormCapacity').value, 10) || 150;
    const priceGeneral = parseFloat($('eventFormPriceGeneral').value) || 0;
    const pricePareja = parseFloat($('eventFormPricePareja').value) || 0;
    const priceTrio = parseFloat($('eventFormPriceTrio').value) || 0;
    const priceWardrobe = parseFloat($('eventFormPriceWardrobe').value);
    const notes = ($('eventFormNotes').value || '').trim();

    if (!Number.isFinite(priceWardrobe) || priceWardrobe < 0) {
      toast('Confirma una tarifa de guardarropa válida; cero debe ser explícito.', 'warn');
      $('eventFormPriceWardrobe').focus();
      return;
    }

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

    // The server may reject an unknown schema. A local draft or queued request
    // cannot create/select an event or announce that it was saved.
    callBackend('registrarNuevoEvento', [newEv], res => {
      if (res && res.localOutbox) {
        toast('Evento pendiente de confirmación. Conserva la intención en la cola.', 'warn');
        return;
      }
      if (!res || res.ok !== true) {
        toast('El servidor no confirmó el evento. Conserva el formulario y revisa la intención.', 'error');
        return;
      }
      toast(`Evento "${name}" registrado. Selecciónalo cuando esté disponible.`, 'ok');
      playChime('success');
      closeNewEventModal();
      syncBackendData();
    }, err => {
      toast(err.message || 'No se pudo confirmar el evento.', 'error');
    });
  }

  // --- EVENT LISTENERS CON VINCULACIÓN SEGURA (bindEvent) ---
  function bindEvent(idOrEl, eventName, handler) {
    const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
    if (!el) {
      console.warn(`[DOMUS UI] Elemento no encontrado para evento '${eventName}': #${typeof idOrEl === 'string' ? idOrEl : (idOrEl && idOrEl.id)}`);
      return false;
    }
    el.addEventListener(eventName, handler);
    return true;
  }

  function setupEventListeners() {
    // Mode Switcher
    bindEvent('btnModeCaja', 'click', () => setMode('caja'));
    bindEvent('btnModeComandas', 'click', () => setMode('comandas'));

    // Bloquear Caja Button
    bindEvent('btnLockCaja', 'click', lockCajaOnDevice);

    // Modal de Bloqueo de Caja / PIN Keypad
    bindEvent('btnSubmitCajaPin', 'click', unlockCajaWithPin);
    bindEvent('btnCancelCajaUnlock', 'click', () => {
      closeCajaLockModal();
      setMode('comandas');
    });

    bindEvent('cajaPinInput', 'keydown', e => {
      if (e.key === 'Enter') unlockCajaWithPin();
    });

    // Teclado numérico táctil
    document.querySelectorAll('.pin-key-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const input = $('cajaPinInput');
        if (input && input.value.length < 20) {
          input.value += key;
        }
      });
    });

    bindEvent('btnPinClear', 'click', () => {
      const input = $('cajaPinInput');
      if (input) {
        input.value = '';
        const err = $('cajaPinError');
        if (err) err.textContent = '';
        input.focus();
      }
    });

    bindEvent('btnPinBackspace', 'click', () => {
      const input = $('cajaPinInput');
      if (input) {
        input.value = input.value.slice(0, -1);
        input.focus();
      }
    });

    // Staff Selector
    bindEvent('staffSelect', 'change', e => {
      STATE.operator = e.target.value;
      sessionStorage.setItem('domus_operator', STATE.operator);
    });

    // Sound Toggle
    bindEvent('btnToggleSound', 'click', () => {
      STATE.sound = !STATE.sound;
      localStorage.setItem('domus_sound', String(STATE.sound));
      const btn = $('btnToggleSound');
      if (btn) {
        btn.classList.toggle('active', STATE.sound);
        btn.textContent = STATE.sound ? '🔔 Sonido: On' : '🔕 Sonido: Off';
      }
      if (STATE.sound) playChime('alert');
    });
    if (STATE.sound) {
      const btn = $('btnToggleSound');
      if (btn) {
        btn.classList.add('active');
        btn.textContent = '🔔 Sonido: On';
      }
    }

    // Phase Switcher (Solar / Lunar)
    bindEvent('btnPhaseToggle', 'click', () => {
      if(STATE.cart.length){toast('Termina el pedido actual antes de cambiar la fase.','warn');return;}
      const next=STATE.phase==='Solar'?'Lunar':'Solar';
      callBackend('cambiarFase',[{phase:next,expectedPhase:STATE.phase}],res=>{
        if(res.localOutbox){toast('Cambio de fase sin confirmar.','warn');return;}
        toast('Fase guardada en servidor.','ok');syncBackendData();
      },err=>toast(err.message,'error'));
    });

    // Botón Reintentar Outbox
    bindEvent('btnOutboxReview', 'click', enterOutboxReview_);
    bindEvent('btnOutboxRetry', 'click', () => {
      toast('Recuperando operaciones pendientes con sus IDs originales…', 'info');
      processOutbox();
    });

    bindEvent('btnOutboxClear', 'click', () => {
      const queue = getOutbox();
      if(queue.length){toast('No se descartan intenciones financieras. Resuelve cada requestId con el servidor.','warn');return;}
      updateOutboxUI();
      updateSyncPill('ok');
      toast('Operaciones pendientes descartadas. Los registros en revisión manual se conservan.', 'ok');
    });

    bindEvent('btnSyncNow', 'click', () => {
      toast('Sincronizando con Google…', 'ok');
      syncBackendData();
    });

    // Search Input
    bindEvent('catalogSearchInput', 'input', e => {
      STATE.searchQuery = e.target.value;
      renderCatalog();
    });

    // Account Selector
    bindEvent('openAccountsSelect', 'change', e => {
      STATE.selectedAccountTicket = e.target.value;
      if (!STATE.selectedAccountTicket) {
        STATE.activity = localStorage.getItem('domus_pos_activity') || 'Visita general DOMUS';
        renderActivityDropdown();
      }
      if (STATE.selectedAccountTicket) {
        const acc = STATE.openAccounts.find(a => a.ticket === STATE.selectedAccountTicket);
        if (acc) {
          const cust = $('customerNameInput');
          if (cust) cust.value = acc.customer || '';
          const act = $('activitySelect');
          STATE.activity = acc.activity || 'Visita general DOMUS';
          renderActivityDropdown();
        }
      }
    });

    bindEvent('activitySelect', 'change', e => {
      STATE.activity = e.target.value;
      localStorage.setItem('domus_pos_activity', e.target.value);
    });

    // Clear Cart
    bindEvent('btnClearCart', 'click', clearCart);

    // Payment Modal
    bindEvent('btnOpenPaymentModal', 'click', openPaymentModal);
    bindEvent('btnJourneyOpen', 'click', () => submitJourney_(false));
    bindEvent('btnJourneyClose', 'click', () => submitJourney_(true));
    bindEvent('btnClosePayModal', 'click', closePaymentModal);
    bindEvent('btnCancelPayment', 'click', closePaymentModal);

    // Payment Methods Selection
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setPaymentMethod(btn.getAttribute('data-method'));
        updateChangeDisplay();
      });
    });

    // Cash Calculator inputs
    bindEvent('cashReceivedInput', 'input', updateChangeDisplay);
    bindEvent('cashTipInput', 'input', updateChangeDisplay);
    ['mixedTerminalAmount','mixedTerminalReference'].forEach(id=>bindEvent(id,'input',()=>{
      $('mixedTerminalConfirmed').checked=false;updateChangeDisplay();
    }));
    bindEvent('mixedTerminalSelect','change',()=>{$('mixedTerminalConfirmed').checked=false;});

    // Preset Cash Buttons ($50, $100, $200, $500, Exacto)
    document.querySelectorAll('.btn-cash-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        const cashInput = $('cashReceivedInput');
        if (cashInput) {
          if (val === 'exact') {
            const terminal=activePaymentMethod==='Mixto'?Number($('mixedTerminalAmount').value)||0:0;
            const tip=Number($('cashTipInput').value)||0;
            cashInput.value = Math.max(0,calculateCartTotal()-terminal+tip).toFixed(2);
          } else {
            cashInput.value = parseFloat(val).toFixed(2);
          }
        }
        updateChangeDisplay();
      });
    });

    // Confirm Payment
    bindEvent('btnConfirmChargeAndSend', 'click', () => confirmPaymentAndDispatch(true));
    bindEvent('btnSendPendingPayment', 'click', () => confirmPaymentAndDispatch(false));
    bindEvent('btnRecoverReceipt', 'click', recoverReceipt_);
    bindEvent('btnTransferReview', 'click', openTransferReview_);
    bindEvent('btnPrepareTransferCancellation', 'click', prepareTransferCancellation_);
    bindEvent('btnCancelUnreceivedTransfer', 'click', submitTransferCancellation_);
    bindEvent('btnBackToTransferReview', 'click', resetTransferCancellation_);
    bindEvent('btnPrepareExistingPayment', 'click', prepareExistingPayment_);
    bindEvent('btnLinkExistingPayment', 'click', submitExistingPayment_);
    bindEvent('btnCloseExistingPayment', 'click', resetTransferCancellation_);
    bindEvent('transferPendingSelect', 'change', resetTransferCancellation_);
    bindEvent('btnConfirmTransferReview', 'click', submitTransferReview_);
    bindEvent('btnCloseTransferReview', 'click', ()=>$('transferReviewModal').classList.remove('open'));

    // Receipt Close & Print
    bindEvent('btnCloseReceipt', 'click', () => {
      const m = $('receiptModal');
      if (m) m.classList.remove('open');
    });
    bindEvent('btnAcceptReceipt', 'click', () => {
      const m = $('receiptModal');
      if (m) m.classList.remove('open');
    });
    bindEvent('btnDownloadReceipt', 'click', downloadReceipt_);
    bindEvent('btnPrintReceipt', 'click', () => {
      if (STATE.lastReceiptData) {
        printReceiptDirect(STATE.lastReceiptData, true).catch(() => {});
      } else {
        window.print();
      }
    });

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
    bindEvent('kdsDestFilter', 'change', e => {
      STATE.kdsFilterDest = e.target.value;
      renderComandasBoard();
    });

    // KDS Search
    bindEvent('kdsSearchInput', 'input', e => {
      STATE.kdsSearch = e.target.value;
      renderComandasBoard();
    });

    // Config Modal
    bindEvent('btnOpenSettings', 'click', openConfigModal);
    bindEvent('btnCloseConfig', 'click', () => {
      if($('printBridgeTokenInput'))$('printBridgeTokenInput').value='';
      const m = $('configModal');
      if (m) m.classList.remove('open');
    });
    bindEvent('btnCancelConfig', 'click', () => {
      if($('printBridgeTokenInput'))$('printBridgeTokenInput').value='';
      const m = $('configModal');
      if (m) m.classList.remove('open');
    });
    bindEvent('btnSaveConfig', 'click', saveConfig);

    bindEvent('btnSyncOfficialCarta', 'click', () => {
      toast('Iniciando sincronización con la Carta Oficial de DOMUS…', 'ok');
      callBackend('sincronizarCartaConCatalogoDOMUS', [], res => {
        toast(res.message || 'Catálogo e Inventario actualizados exitosamente en Google Sheets.', 'ok');
        playChime('success');
        syncBackendData();
      }, err => {
        toast('Error en sincronización: ' + (err.message || String(err)), 'error');
      });
    });

    // Modal Alta / Registro de Nuevo Producto (Admin Caja)
    bindEvent('btnOpenNewProductModal', 'click', openNewProductModal);
    bindEvent('btnCloseNewProductModal', 'click', closeNewProductModal);
    bindEvent('btnCancelNewProduct', 'click', closeNewProductModal);
    bindEvent('btnSaveNewProduct', 'click', saveNewProduct);

    bindEvent('newProdCategory', 'change', e => {
      const customWrapper = $('customCatWrapper');
      if (customWrapper) {
        const isNew = e.target.value === '__NEW__';
        customWrapper.classList.toggle('hidden', !isNew);
        if (isNew && $('newProdCustomCategory')) {
          $('newProdCustomCategory').focus();
        }
      }
    });

    // --- MODO ACCESOS, EVENTOS Y GUARDARROPA ---
    bindEvent('btnModeAccesos', 'click', () => setMode('accesos'));
    bindEvent('accessActivitySelect', 'change', e => changeActiveEvent(e.target.value));

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
    bindEvent('accessCashReceived', 'input', updateAccessSummary);

    // Operations Tabs
    bindEvent('tabBtnAccessLog', 'click', () => setAccessTab('log'));
    bindEvent('tabBtnWardrobe', 'click', () => setAccessTab('wardrobe'));
    bindEvent('tabBtnEvents', 'click', () => setAccessTab('events'));

    // Search Inputs for Tabs
    bindEvent('accessLogSearchInput', 'input', e => {
      STATE.accessSearch = e.target.value;
      renderAccessLogTable();
    });
    bindEvent('wardrobeSearchInput', 'input', e => {
      STATE.accessSearch = e.target.value;
      renderWardrobeTable();
    });

    // Modals: Eventos
    bindEvent('btnOpenNewEventModal', 'click', openNewEventModal);
    bindEvent('btnOpenNewEventModal2', 'click', openNewEventModal);
    bindEvent('btnCloseNewEventModal', 'click', closeNewEventModal);
    bindEvent('btnCancelNewEvent', 'click', closeNewEventModal);
    bindEvent('btnSaveNewEvent', 'click', saveNewEvent);

    // Modals: Access Receipt
    bindEvent('btnCloseAccessReceipt', 'click', closeAccessReceiptModal);
    bindEvent('btnDismissAccessReceipt', 'click', closeAccessReceiptModal);
    bindEvent('btnPrintAccessReceipt', 'click', () => {
      if (STATE.lastAccessRecord) {
        const rec = STATE.lastAccessRecord;
        const entryType = rec.entryType || rec.ticketTypeId || 'General';
        const persons = rec.persons || rec.packages || 1;
        const entryCost = rec.entryCost !== undefined ? rec.entryCost : (rec.doorEntryCharge || 0);
        const wardrobeCost = rec.wardrobeCost !== undefined ? rec.wardrobeCost : (rec.wardrobeAmount || 0);
        const totalPaid = rec.paid !== undefined ? rec.paid : (rec.doorCollected !== undefined ? rec.doorCollected : (rec.totalAmount || 0));
        const items = [
          { qty: persons, name: `Entrada: ${entryType}`, price: Number(entryCost) / Math.max(1, Number(persons)) }
        ];
        if (rec.wardrobeQty > 0) {
          items.push({
            qty: rec.wardrobeQty,
            name: `Guardarropa (${rec.ticketGuardarropa || 'Prendas'})`,
            price: Number(wardrobeCost) / Math.max(1, Number(rec.wardrobeQty))
          });
        }
        const accessReceiptData = {
          receipt: rec.id || rec.externalTicketId || 'ACCESO',
          ticket: rec.ticketGuardarropa || rec.activity || 'DOMUS',
          customer: rec.customer || 'General',
          date: rec.date || new Date().toLocaleString('es-MX'),
          operator: (STATE.staffList && STATE.staffList.find(s => s.id === STATE.operator))?.name || STATE.operator || 'Taquilla DOMUS',
          items: items,
          total: totalPaid,
          method: rec.method || rec.paymentMethod || 'Efectivo',
          received: null,
          tip: 0,
          change: null
        };
        printReceiptDirect(accessReceiptData, true).catch(() => {});
      } else {
        window.print();
      }
    });

    // Printer Pill click & Config buttons
    bindEvent('btnRemovePrintToken','click',removePrintToken_);
    bindEvent('printerPill', 'click', () => {
      checkPrinterStatus((ok, data) => {
        if (ok) {
          toast(`🖨️ Impresora lista: ${data.printer || 'DOMUS_TICKETS'}`, 'ok');
        } else {
          toast('🖨️ Print Bridge desconectado (127.0.0.1:17321). Revisa que el servicio esté activo.', 'warn');
        }
      });
    });

    bindEvent('btnCheckPrinterStatus', 'click', () => {
      const msg = $('printerStatusMsg');
      if (msg) {
        msg.textContent = 'Consultando estado de impresora...';
        msg.style.color = 'var(--text-muted)';
      }
      checkPrinterStatus((ok, data) => {
        if (msg) {
          msg.textContent = ok
            ? `✓ Impresora conectada (${data.printer || 'DOMUS_TICKETS'}). Estado: ${data.status || 'READY'}`
            : '⚠️ Error: No se pudo contactar con DOMUS Print Bridge en 127.0.0.1:17321';
          msg.style.color = ok ? 'var(--emerald-500)' : 'var(--rose-500)';
        }
      });
    });

    bindEvent('btnTestPrinter', 'click', () => {
      try {assertOutboxTraffic_();} catch(_) {return;}
      const msg = $('printerStatusMsg');
      if (msg) {
        msg.textContent = 'Enviando ticket de prueba a DOMUS_TICKETS...';
        msg.style.color = 'var(--amber-400)';
      }
      fetch(`${PRINT_BRIDGE_URL}/test-print`, {
        method: 'GET',
        headers: { 'X-Domus-Print-Token': getPrintToken() }
      })
      .then(r => r.json().then(b => ({ ok: r.ok, body: b })))
      .then(res => {
        if (res.ok && res.body.ok) {
          toast('✓ Ticket de prueba impreso', 'ok');
          if (msg) {
            msg.textContent = '✓ Ticket de prueba impreso correctamente en DOMUS_TICKETS.';
            msg.style.color = 'var(--emerald-500)';
          }
          updatePrinterPill('ready');
        } else {
          const err = (res.body && res.body.error) || 'Error al imprimir prueba';
          toast(`⚠ Error: ${err}`, 'error');
          if (msg) {
            msg.textContent = `⚠️ Error: ${err}`;
            msg.style.color = 'var(--rose-500)';
          }
        }
      })
      .catch(e => {
        toast('⚠ Error al conectar con Print Bridge', 'error');
        if (msg) {
          msg.textContent = '⚠️ Fallo de conexión con 127.0.0.1:17321';
          msg.style.color = 'var(--rose-500)';
        }
      });
    });

    // Modals: Edit Access Record
    bindEvent('btnCloseEditAccessModal', 'click', closeEditAccessModal);
    bindEvent('btnCancelEditAccess', 'click', closeEditAccessModal);
    bindEvent('btnSaveEditAccess', 'click', saveEditAccessRecord);
    bindEvent('btnDeleteAccessFromModal', 'click', () => {
      const input = $('editAccessId');
      const id = input ? input.value : '';
      closeEditAccessModal();
      deleteAccessRecord(id);
    });
    bindEvent('editAccessChannel', 'change', updateEditAccessModalSummary);
    bindEvent('editAccessPersons', 'change', updateEditAccessModalSummary);
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

    callBackend('editarAcceso',[{accessId:id,customer:newName,phone:phone,persons:persons,salesChannel:channel}],res=>{
      if(res.localOutbox){toast('Edición sin confirmar.','warn');return;}
      closeEditAccessModal();toast('Cambio guardado en servidor.','ok');syncBackendData();
    },err=>toast(err.message,'error'));
  }

  function deleteAccessRecord(id) {
    const reason=prompt('Motivo de anulación (se conserva el historial; no devuelve dinero):');
    if(!reason)return;
    callBackend('anularAcceso',[{accessId:id,reason:reason}],res=>{
      if(res.localOutbox){toast('Anulación sin confirmar.','warn');return;}
      toast(res.message,'ok');syncBackendData();
    },err=>toast(err.message,'error'));
  }

  // --- INICIALIZAR APP ---
  window.DOMUS_PAUSE_FOR_REVIEW=()=>{
    clearInterval(STATE.pollTimer);clearInterval(STATE.printerPollTimer);
  };
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
    try {
      checkPrinterStatus();
      STATE.printerPollTimer=setInterval(checkPrinterStatus, 30000);
    } catch (e) {
      console.warn('[DOMUS BOOT] Error iniciando monitor de DOMUS Print Bridge:', e);
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
    deleteAccessRecord: deleteAccessRecord,
    openNewProductModal: openNewProductModal,
    closeNewProductModal: closeNewProductModal,
    saveNewProduct: saveNewProduct,
    printReceiptDirect: printReceiptDirect,
    checkPrinterStatus: checkPrinterStatus
  };

})();
