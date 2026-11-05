/**
 * ============================================================================
 * DOMUS OS · KITCHEN & BAR DISPLAY SYSTEM (KDS.gs)
 * Gestión de comandas en tiempo real, lotes de preparación y resurtido
 * ============================================================================
 */

'use strict';

/**
 * Consulta de comandas activas, historial reciente y solicitudes de resurtido
 */
function comandasSimpleDatos(token) {
  authRequireContext_('comandasSimpleDatos');
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
  const sComandas = m.getSheetByName('COMANDAS');
  const oResurtido = o ? o.getSheetByName('RESURTIDO') : null;

  // 1. Leer comandas activas + historial desde la columna M (JSON maestro).
  // La columna M es la fuente de verdad del KDS; H/N se mantienen como espejo humano.
  const masterRaw = dataRows_(sComandas, 7, 1, 13);
  const orders = [];
  const history = [];
  const now = Date.now();

  const toClientItem = item => ({
    key: 'DCS-' + item.row + '-' + (item.batch || item.id),
    version: String(item.version || '1'),
    id: item.id || ('C2-' + item.row),
    ticket: item.ticket || '',
    batch: item.batch || item.id,
    alias: item.alias || 'Cliente',
    product: item.product || '',
    notes: item.notes || '',
    destination: item.destination || 'Barra',
    state: item.state || 'Pendiente',
    responsible: item.responsible || item.preparedBy || '',
    sent: item.sent ? new Date(item.sent).getTime() : now,
    claimed: item.claimed ? new Date(item.claimed).getTime() : null,
    ready: item.ready ? new Date(item.ready).getTime() : null,
    delivered: item.delivered ? new Date(item.delivered).getTime() : null,
    deliveredBy: item.deliveredBy || '',
    cancelled: item.cancelled ? new Date(item.cancelled).getTime() : null,
    credit: !!item.credit,
    incident: item.incident || ''
  });

  masterRaw.forEach(row => {
    if (!row[0]) return;
    try {
      const item = JSON.parse(row[0]);
      if (!item) return;
      const clientItem = toClientItem(item);
      if (clientItem.state === 'Entregada') {
        history.push(clientItem);
      } else if (clientItem.state !== 'Cancelada') {
        orders.push(clientItem);
      }
    } catch (err) {
      console.warn('[KDS] JSON inválido en COMANDAS!M:', err);
    }
  });

  // Activas: las más antiguas primero. Historial: entrega/cancelación más reciente primero.
  orders.sort((a, b) => (a.sent || 0) - (b.sent || 0));
  history.sort((a, b) =>
    (b.delivered || b.cancelled || b.sent || 0) -
    (a.delivered || a.cancelled || a.sent || 0)
  );

  // 2. Leer resurtidos abiertos
  const requests = [];
  if (oResurtido) {
    const resRows = dataRows_(oResurtido, 7, 8);
    resRows.forEach(r => {
      if (r[0] && r[5] !== true && r[7] !== 'Resuelto') {
        requests.push({
          id: String(r[0]),
          product: String(r[2]),
          type: String(r[3] || 'Reposición'),
          created: r[1] instanceof Date ? r[1].getTime() : Date.now()
        });
      }
    });
  }

  return {
    version: 'Comandas Simple 2.1',
    at: Date.now(),
    mirrorSync: 'Conectado a Google Sheets',
    team: CONFIG.staff,
    orders: orders,
    history: history.slice(0, 100),
    requests: requests,
    issues: []
  };
}

/**
 * Aplica una acción sobre una comanda (TOMAR, LISTA, ENTREGAR, ALMACEN, AGOTADO)
 */
function comandasSimpleAccion(tokenOrBody, maybeBody) {
  authRequireContext_('comandasSimpleAccion');
  const body=maybeBody && typeof maybeBody==='object'?maybeBody:tokenOrBody;
  if(!body || typeof body!=='object' || !body.key || !body.action)throw new Error('Parámetros inválidos de comanda.');
  return withLock_(CONFIG.lockTimeoutMs,()=>{
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId), s=m.getSheetByName('COMANDAS');
    const req=String(body.requestId || body.id || '');
    const resumed=journalResume_(req,'comandasSimpleAccion',m);if(resumed)return resumed;
    const rows=dataRows_(s,7,1,13);
    const entries=[];
    rows.forEach((r,i)=>{if(r[0]){let it;try{it=JSON.parse(r[0]);}catch(e){return;} entries.push({row:i+7,item:it});}});
    const target=entries.find(e=>'DCS-'+e.item.row+'-'+(e.item.batch||e.item.id)===body.key);
    if(!target)throw new Error('Comanda no encontrada.');
    const item=target.item, action=String(body.action).toUpperCase(), who=_authContext.operator;
    if(_authContext.role==='COCINA' && item.destination!=='Cocina')throw new Error('Acceso denegado a otra estación.');
    if(_authContext.role==='BARRA' && item.destination!=='Barra')throw new Error('Acceso denegado a otra estación.');
    const writes=[];let state=item.state;let selected=[target];
    if(action==='TOMAR') {
      if(state==='En preparación')return {ok:true,state:state,responsible:item.responsible};
      if(state!=='Pendiente')throw new Error('INVALID_KDS_TRANSITION: TOMAR requiere estado Pendiente; actual: '+state);
      selected=entries.filter(e=>e.item.batch===item.batch && e.item.destination===item.destination && e.item.state==='Pendiente');
      state='En preparación';
    } else if(action==='LISTA') {
      if(state==='Lista')return {ok:true,state:state};
      if(state!=='En preparación')throw new Error('INVALID_KDS_TRANSITION: LISTA requiere estado En preparación; actual: '+state);state='Lista';
    } else if(action==='ENTREGAR') {
      if(state==='Entregada')return {ok:true,state:state};
      if(state!=='Lista')throw new Error('INVALID_KDS_TRANSITION: ENTREGAR requiere estado Lista; actual: '+state);
      writes.push(...deliveryInventoryWrites_(m,item)); state='Entregada';
    } else if(action==='CANCELAR') {
      if(['Entregada','Cancelada'].includes(state))throw new Error('INVALID_KDS_TRANSITION');
      state='Cancelada'; writes.push(cellWrite_(m.getSheetByName('CAJA 2'),target.row,16,'Cancelado'));
    } else if(['ALMACEN','AGOTADO'].includes(action)) {
      const o=SpreadsheetApp.openById(CONFIG.opsSheetId),res=o.getSheetByName('RESURTIDO');
      if(!res)throw new Error('Hoja RESURTIDO no encontrada.');
      item.incident=action==='ALMACEN'?'Reponer de almacén':'Agotado en DOMUS';
      const r=Math.max(res.getLastRow()+1,7),values=['RS-'+Utilities.getUuid(),new Date(),item.product,item.incident,1,false,'','Resurtido pendiente'];
      values.forEach((v,i)=>writes.push(cellWrite_(res,r,i+1,v)));
    } else throw new Error('Acción KDS no soportada.');
    selected.forEach(e=>{
      const it=e.item;it.state=state;it.version=String(Number(it.version||1)+1);
      if(action==='TOMAR'){it.responsible=who;it.claimed=new Date().toISOString();}
      if(action==='LISTA')it.ready=new Date().toISOString();
      if(action==='ENTREGAR'){it.delivered=new Date().toISOString();it.deliveredBy=who;}
      if(action==='CANCELAR')it.cancelled=new Date().toISOString();
      writes.push(cellWrite_(s,e.row,13,JSON.stringify(it)),cellWrite_(s,e.row,8,state==='En preparación'?'Preparando':state));
      writes.push(cellWrite_(s,e.row,14,state+' · '+who));
    });
    return journalCommit_(req,'comandasSimpleAccion',m,writes,{ok:true,key:body.key,state:state,product:item.product,responsible:who,message:'Comanda '+state});
  });
}

function deliveryInventoryWrites_(m,item) {
  const inv=m.getSheetByName('INVENTARIO');
  schemaColumns_(inv,['Producto / variante','INICIAL REAL','Entregado por comandas','Existencia esperada']);
  const cat=dataRows_(m.getSheetByName('CATALOGO'),7,20).find(r=>r[0]===item.product);
  if(!cat)throw new Error('PRODUCT_NOT_FOUND');
  const recipes=m.getSheetByName('RECETAS CARTA');
  const matches=recipes?dataRows_(recipes,2,10).map((r,i)=>({r:r,row:i+2})).filter(e=>String(e.r[0])===String(cat[15])):[];
  const writes=[];
  if(matches.length) {
    const stock=m.getSheetByName('INSUMOS');
    schemaColumns_(stock,['Grupo stock','Unidad control','Receta entregada','Existencia teórica']);
    const ingredients=dataRows_(stock,7,12), totals={};
    matches.forEach(e=>{
      const amount=Number(e.r[5])*Number(e.r[7])*Number(item.qty||1), group=String(e.r[6]);
      if(!group||!Number.isFinite(amount)||amount<=0)throw new Error('RECIPE_INVALID');
      totals[group]=(totals[group]||0)+amount;
      const name=String(item.product).replace(/"/g,'""');
      writes.push(cellWrite_(recipes,e.row,10,`=SUMIF('CAJA 2'!$G$7:$G,"${name}",'CAJA 2'!$V$7:$V)*F${e.row}*H${e.row}`,true));
    });
    Object.keys(totals).forEach(group=>{
      const found=ingredients.map((r,i)=>({r:r,row:i+7})).filter(e=>String(e.r[0])===group);
      if(found.length!==1)throw new Error('INGREDIENT_NOT_FOUND: '+group);
      const e=found[0];
      if(e.r[3]==='' || !Number.isFinite(Number(e.r[7])))throw new Error('STOCK_COUNT_REQUIRED: '+group);
      if(Number(e.r[7])+0.000001<totals[group])throw new Error('INSUFFICIENT_STOCK: '+group);
      writes.push(cellWrite_(stock,e.row,7,`=SUMIF('RECETAS CARTA'!$G$2:$G,A${e.row},'RECETAS CARTA'!$J$2:$J)`,true));
    });
  } else {
    const candidates=dataRows_(inv,7,16).map((r,i)=>({r:r,row:i+7})).filter(e=>String(e.r[0])===item.product || String(e.r[0]).endsWith(' · '+String(cat[6])));
    if(candidates.length!==1)throw new Error('INVENTORY_ITEM_NOT_FOUND');
    const e=candidates[0];
    if(e.r[3]==='' || !Number.isFinite(Number(e.r[7])))throw new Error('STOCK_COUNT_REQUIRED');
    if(Number(e.r[7])<Number(item.qty||1))throw new Error('INSUFFICIENT_STOCK');
    if(!inv.getRange(e.row,7).getFormula() || !inv.getRange(e.row,8).getFormula())throw new Error('INVENTORY_FORMULA_REQUIRED');
  }
  // CAJA 2 V/X and INVENTARIO G/H are calculated. Preserve them; COMANDAS A/H supplies delivery.
  return writes;
}

/**
 * Resuelve una incidencia de resurtido
 */
function comandasSimpleResolver(tokenOrBody, maybeBody) {
  authRequireContext_('comandasSimpleResolver');
  const body = (maybeBody && typeof maybeBody === 'object') ? maybeBody : tokenOrBody;
  if (!body || !body.id) throw new Error('ID de solicitud de resurtido no especificado.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const o = SpreadsheetApp.openById(CONFIG.opsSheetId);
    if (!o) throw new Error('Libro operativo no encontrado.');
    const sRes = o.getSheetByName('RESURTIDO');
    if (!sRes) throw new Error('Hoja RESURTIDO no encontrada.');

    const values = dataRows_(sRes, 7, 8);
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toUpperCase() === String(body.id).trim().toUpperCase()) {
        const row = i + 7;
        const m=SpreadsheetApp.openById(CONFIG.mainSheetId);
        return journalCommit_(body.requestId,'comandasSimpleResolver',m,[cellWrite_(sRes,row,6,true),cellWrite_(sRes,row,7,new Date()),cellWrite_(sRes,row,8,'Resuelto')],{ok:true,message:'Disponibilidad confirmada para '+body.id});
      }
    }

    throw new Error('Solicitud ' + body.id + ' no encontrada.');
  });
}

function comandasSimpleEntrar(token) {
  authRequireContext_('comandasSimpleEntrar');
  return { ok: true, team: CONFIG.staff };
}
