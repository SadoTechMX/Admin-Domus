/**
 * ============================================================================
 * DOMUS OS · ADMISSIONS, TICKETING & WARDROBE SYSTEM (Access.gs)
 * Fase 0.5: Modelo Comercial Integral de Accesos, Taquilla, Boleteras y Aforo (ADR-005)
 * ============================================================================
 */

'use strict';

/**
 * Canales de Venta de Boletos
 */
const ACCESS_SALES_CHANNELS = Object.freeze({
  TAQUILLA_DOMUS: 'TAQUILLA_DOMUS',
  PREVENTA_DOMUS: 'PREVENTA_DOMUS',
  BOLETERA_EXTERNA: 'BOLETERA_EXTERNA',
  TRANSFERENCIA_DIRECTA: 'TRANSFERENCIA_DIRECTA',
  LISTA: 'LISTA',
  CORTESIA: 'CORTESIA',
  MEMBRESIA: 'MEMBRESIA'
});

/**
 * Estados de Pago de la Entrada
 */
const ACCESS_PAYMENT_STATUS = Object.freeze({
  CONFIRMADA: 'CONFIRMADA',
  PAGADO_EXTERNAMENTE: 'PAGADO_EXTERNAMENTE',
  PENDIENTE_VERIFICACION: 'PENDIENTE_VERIFICACION',
  RECHAZADA: 'RECHAZADA'
});

/**
 * Consulta de eventos activos y registros de acceso en vivo
 */
function accesoSimpleDatos() {
  authRequireContext_('accesoSimpleDatos');
  const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
  const sAct = m.getSheetByName('ACTIVIDADES');
  const sAcc = m.getSheetByName('ACCESO');
  const props = PropertiesService.getScriptProperties();

  // 1. Obtener actividades / eventos y sus tipos de boletos
  const rawActs = sAct ? dataRows_(sAct, 7, 13) : [];
  const activities = [];
  rawActs.forEach(r => {
    if (r[0]) {
      const pGen = typeof r[4] === 'number' ? r[4] : (parseFloat(r[4]) || 0);
      const pPar = typeof r[5] === 'number' ? r[5] : (parseFloat(r[5]) || 0);
      const pTrio = typeof r[6] === 'number' ? r[6] : (parseFloat(r[6]) || 0);
      let pGua = 50;
      if (typeof r[7] === 'number') {
        pGua = r[7];
      } else if (r[7] !== '' && r[7] !== null && r[7] !== undefined) {
        const parsed = parseFloat(r[7]);
        pGua = isNaN(parsed) ? 50 : parsed;
      }

      // Tipos de boletos del evento (estándar + personalizados en notas col M)
      let customTicketTypes = [];
      try {
        if (r[12] && String(r[12]).trim().startsWith('[')) {
          customTicketTypes = JSON.parse(r[12]);
        }
      } catch (e) {}

      const ticketTypes = [
        { id: 'General', name: 'General (1 Asistente)', price: pGen, persons: 1 },
        { id: 'Pareja', name: 'Pareja (2 Asistentes)', price: pPar, persons: 2 },
        { id: 'Trío', name: 'Trío (3 Asistentes)', price: pTrio, persons: 3 },
        ...customTicketTypes
      ];

      activities.push({
        name: String(r[0]),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd') : String(r[1] || ''),
        type: String(r[2] || 'CLUB_NOCTURNO'),
        organizer: String(r[3] || 'DOMUS'),
        priceGeneral: pGen,
        pricePareja: pPar,
        priceTrio: pTrio,
        priceGuardarropa: pGua,
        capacity: Number(r[8]) || 150,
        status: String(r[11] || 'Confirmado'),
        ticketTypes: ticketTypes
      });
    }
  });

  // Actividad activa configurada
  const settings=m.getSheetByName('DOMUS_SETTINGS');
  let activeActivity = (settings && settings.getRange(1,2).getValue()) || props.getProperty('actividadAcceso') || '';
  if (!activeActivity && activities.length > 0) {
    activeActivity = activities[0].name;
  }

  // 2. Obtener accesos registrados con modelo comercial integral (22 campos)
  const rawAcc = sAcc ? dataRows_(sAcc, 7, 32) : [];
  const recentAccess = [];
  let totalAttendance = 0;
  let activeWardrobe = 0;
  let totalDoorRevenue = 0;
  let totalCommercialGross = 0;
  let presalesCount = 0;
  let courtesiesCount = 0;

  rawAcc.forEach((r, idx) => {
    if (r[0] && r[3] && r[1] && r[28] !== false) {
      const rowId = String(r[0] || ('A-' + String(idx + 7).padStart(4, '0')));
      const dateStr = r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Mexico_City', 'yyyy-MM-dd HH:mm') : String(r[1] || '');
      const activity = String(r[2] || activeActivity);
      const customer = String(r[3] || 'Anónimo');
      const email = String(r[4] || '');
      const phone = String(r[5] || '');
      const ticketTypeId = String(r[6] || 'General');
      const persons = Number(r[7]) || (ticketTypeId === 'Pareja' ? 2 : (ticketTypeId === 'Trío' ? 3 : 1));
      const wardrobeQty = Number(r[8]) || 0;
      const faceValue = Number(r[9]) || 0;
      const wardrobeAmount = Number(r[12]) || 0;
      const totalCommercial = Number(r[13]) || (faceValue + wardrobeAmount);
      const amountPaidAtDoor = Number(r[14]) || 0;
      const amountDueAtDoor = Number(r[15]) || 0;
      const paymentStatus = String(r[16] || 'CONFIRMADA');
      const externalTicketId = String(r[17] || '');
      const courtesyAuth = String(r[18] || '');
      let metadata={}; try { metadata=JSON.parse(r[29]); } catch(e) {}
      const salesChannel = metadata.salesChannel || (typeof r[19]==='string' && ACCESS_SALES_CHANNELS[r[19]] ? r[19] : (externalTicketId?'BOLETERA_EXTERNA':'TAQUILLA_DOMUS'));
      const ticketProvider = String(r[20] || 'DOMUS');
      const method = String(r[26] || 'Efectivo');
      const ticketGuardarropa = String(r[30] || (wardrobeQty > 0 ? ('GUA-' + rowId) : ''));
      const wardrobeReturned = String(r[31] || '').toUpperCase().includes('DEVUELTO') || r[31] === true;

      totalAttendance += persons;
      totalDoorRevenue += amountPaidAtDoor;
      totalCommercialGross += totalCommercial;
      if (salesChannel === 'BOLETERA_EXTERNA' || salesChannel === 'PREVENTA_DOMUS') presalesCount++;
      if (salesChannel === 'CORTESIA') courtesiesCount++;
      if (wardrobeQty > 0 && !wardrobeReturned) {
        activeWardrobe += wardrobeQty;
      }

      recentAccess.unshift({
        id: rowId,
        date: dateStr,
        activity: activity,
        customer: customer,
        email: email,
        phone: phone,
        ticketTypeId: ticketTypeId,
        persons: persons,
        salesChannel: salesChannel,
        ticketProvider: ticketProvider,
        externalTicketId: externalTicketId,
        faceValue: faceValue,
        wardrobeQty: wardrobeQty,
        wardrobeAmount: wardrobeAmount,
        totalCommercial: totalCommercial,
        amountPaidAtDoor: amountPaidAtDoor,
        amountDueAtDoor: amountDueAtDoor,
        paymentStatus: paymentStatus,
        paymentMethod: method,
        courtesyAuth: courtesyAuth,
        ticketGuardarropa: ticketGuardarropa,
        wardrobeReturned: wardrobeReturned
      });
    }
  });

  return {
    activeActivity: activeActivity,
    activities: activities,
    recentAccess: recentAccess,
    metrics: {
      totalAttendance: totalAttendance,
      attendanceKind: 'CUMULATIVE_ADMISSIONS_NOT_OCCUPANCY',
      activeWardrobe: activeWardrobe,
      totalDoorRevenue: totalDoorRevenue,
      totalCommercialGross: totalCommercialGross,
      presalesCount: presalesCount,
      courtesiesCount: courtesiesCount
    }
  };
}

/**
 * Registra un acceso/asistencia y su cobro en ACCESO y COBROS bajo candado estricto
 * Fase 0.5: Atribución correcta de ingresos (Boleteras vs Taquilla vs Guardarropa)
 */
function accesoSimpleRegistrar(payload) {
  authRequireContext_('accesoSimpleRegistrar');
  if (!payload) throw new Error('Datos de acceso requeridos.');
  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m=SpreadsheetApp.openById(CONFIG.mainSheetId), s=m.getSheetByName('ACCESO'), cob=m.getSheetByName('COBROS');
    const req=String(payload.requestId || payload.id || '');
    const replay=journalResume_(req,'accesoSimpleRegistrar',m); if(replay)return replay;
    schemaColumns_(s,['Folio acceso','2 · NOMBRE','ORDEN PREVENTA','DESGLOSE / ESTADO','TICKET / PRENDA']);
    const customer=String(payload.customer || '').trim(), activity=String(payload.activity || '').trim();
    if(!customer || !activity)throw new Error('Nombre y actividad obligatorios.');
    const event=dataRows_(m.getSheetByName('ACTIVIDADES'),7,13).find(r=>String(r[0])===activity);
    if(!event || String(event[11]).toLowerCase()!=='confirmado')throw new Error('EVENT_PRICING_NOT_CONFIRMED');
    const channel=String(payload.salesChannel || 'TAQUILLA_DOMUS');
    if(!Object.values(ACCESS_SALES_CHANNELS).includes(channel))throw new Error('Canal inválido.');
    const type=String(payload.ticketTypeId || payload.entryType || 'General');
    let kinds=[{id:'General',price:event[4],persons:1},{id:'Pareja',price:event[5],persons:2},{id:'Trío',price:event[6],persons:3}];
    if(event[12] && String(event[12]).trim()[0]==='[') kinds=kinds.concat(JSON.parse(event[12]));
    const kind=kinds.find(k=>k.id===type || k.name===type);
    const onlyWardrobe=['SOLO_GUARDARROPA','GUARDARROPA'].includes(type);
    if(!kind && !onlyWardrobe)throw new Error('Tipo de entrada inválido.');
    const persons=onlyWardrobe?0:Number(kind.persons);
    if(!Number.isInteger(persons) || persons<0 || persons>100)throw new Error('Personas inválidas.');
    const qty=payload.wardrobeQty==null?0:Number(payload.wardrobeQty);
    if(!Number.isInteger(qty)||qty<0||qty>100)throw new Error('Prendas inválidas.');
    const unitPrice=Number(event[7]);
    if(!Number.isFinite(unitPrice)||unitPrice<0)throw new Error('Tarifa de guardarropa no confirmada.');
    let face=onlyWardrobe?0:Number(kind.price);
    if(!Number.isFinite(face)||face<0)throw new Error('Tarifa inválida.');
    if(channel==='CORTESIA') {
      if(!['ADMIN','GERENCIA'].includes(_authContext.role))throw new Error('Acceso denegado: cortesía requiere Gerencia.');
      face=0;
    }
    const qr=String(payload.externalTicketId || payload.presaleFolio || '').trim();
    if(['PREVENTA_DOMUS','BOLETERA_EXTERNA'].includes(channel) && !qr)throw new Error('Folio de boleto obligatorio.');
    const existing=dataRows_(s,7,32);
    if(qr && existing.some(r=>r[2]===activity && String(r[17]).trim()===qr && r[3]))throw new Error('Boleto ya utilizado.');
    const method=String(payload.paymentMethod || payload.method || 'Efectivo');
    if(!['Efectivo','Terminal 1','Terminal 2','Transferencia'].includes(method))throw new Error('Medio inválido.');
    // Do not accept isTransferVerified/paymentStatus from the browser as bank verification.
    const pending=method==='Transferencia' || channel==='TRANSFERENCIA_DIRECTA';
    const doorEntry=['TAQUILLA_DOMUS','TRANSFERENCIA_DIRECTA'].includes(channel)?face:0;
    const wardrobe=qty*unitPrice, charged=doorEntry+wardrobe;
    const row=Math.max(7,s.getLastRow()+1), id='A-'+Utilities.getUuid(), gua=qty?'GUA-'+id:'';
    const status=pending?'PENDIENTE_VERIFICACION':(channel==='BOLETERA_EXTERNA'?'PAGADO_EXTERNAMENTE':'CONFIRMADA');
    const result={ok:true,id:id,rowId:id,ticket:id,customer:customer,activity:activity,ticketTypeId:type,
      persons:persons,salesChannel:channel,externalTicketId:qr,faceValue:face,wardrobeQty:qty,
      wardrobeAmount:wardrobe,ticketGuardarropa:gua,paymentStatus:status,paymentMethod:method,
      doorCollected:pending?0:charged,amountPaidAtDoor:pending?0:charged,amountDueAtDoor:pending?charged:0,
      totalCommercial:face+wardrobe,date:new Date().toISOString(),message:pending?'Transferencia pendiente de verificación.':'Acceso registrado.'};
    const fields={1:id,2:new Date(),3:activity,4:customer,5:String(payload.email||''),6:String(payload.phone||''),
      7:type,8:persons,9:qty,10:face,11:'',12:face,13:wardrobe,14:face+wardrobe,15:pending?0:charged,
      16:pending?charged:0,17:status,18:qr,19:channel==='CORTESIA'?_authContext.operator:'',
      23:'Registrado',26:persons,27:method,28:pending?0:charged,29:true,30:JSON.stringify(result),31:gua,32:false};
    const writes=Object.keys(fields).map(c=>cellWrite_(s,row,Number(c),fields[c]));
    let next=Math.max(cob.getLastRow()+1,7);
    if(doorEntry>0)writes.push(...paymentWrites_(cob,{row:next++,folio:'REC-TAQ-'+Utilities.getUuid(),origin:'Acceso',ticket:id,method:pending?'Transferencia':method,amount:doorEntry,tag:'ACCESO-WEB:'+req,operator:_authContext.operator,activity:activity}));
    if(wardrobe>0)writes.push(...paymentWrites_(cob,{row:next++,folio:'REC-GUA-'+Utilities.getUuid(),origin:'Acceso',ticket:id,method:pending?'Transferencia':method,amount:wardrobe,tag:'ACCESO-GUA:'+req,operator:_authContext.operator,activity:activity}));
    return journalCommit_(req,'accesoSimpleRegistrar',m,writes,result);
  });
}

/**
 * Devuelve una prenda de guardarropa
 */
function guardarropaDevolver(payload) {
  authRequireContext_('guardarropaDevolver');
  if (!payload || !payload.ticket) throw new Error('Ticket de guardarropa requerido.');
  const ticket = String(payload.ticket).trim();

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const m = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const sAcc = m.getSheetByName('ACCESO');
    if (!sAcc) throw new Error('Hoja ACCESO no encontrada.');

    const lastRow = Math.max(sAcc.getLastRow(), 7);
    const rows = sAcc.getRange(7, 1, lastRow - 6, 32).getValues();
    let foundRow = -1;
    let alreadyReturned = false;

    for (let i = 0; i < rows.length; i++) {
      const rowTicketGuardarropa = String(rows[i][30]).trim();
      const rowAccessId = String(rows[i][0]).trim();
      if (rowTicketGuardarropa === ticket || rowAccessId === ticket) {
        foundRow = i + 7;
        const valCol32 = rows[i][31];
        if (valCol32 === true || String(valCol32).toUpperCase().includes('DEVUELTO') || String(rows[i][28]).toUpperCase().includes('DEVUELTO')) {
          alreadyReturned = true;
        }
        break;
      }
    }

    if (foundRow === -1) {
      throw new Error(`Ticket de guardarropa "${ticket}" no encontrado.`);
    }

    if (alreadyReturned) {
      throw new Error(`Prenda del ticket "${ticket}" ya fue devuelta previamente.`);
    }

    return journalCommit_(payload.requestId,'guardarropaDevolver',m,[cellWrite_(sAcc,foundRow,32,true)],{ok:true,ticket:ticket,message:'Prendas devueltas.'});
  });
}

/**
 * Cambia la actividad / evento activo en el sistema
 */
function accesoCambiarActividad(payload) {
  authRequireContext_('accesoCambiarActividad');
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),act=String(payload && payload.activity || '');
  if(!dataRows_(m.getSheetByName('ACTIVIDADES'),7,13).some(r=>String(r[0])===act && String(r[11]).toLowerCase()==='confirmado'))throw new Error('Actividad no confirmada.');
  let settings=m.getSheetByName('DOMUS_SETTINGS');if(!settings)settings=m.insertSheet('DOMUS_SETTINGS');
  return journalCommit_(payload.requestId,'accesoCambiarActividad',m,[cellWrite_(settings,1,1,'ACTIVE_ACTIVITY'),cellWrite_(settings,1,2,act)],{ok:true,activeActivity:act});
}
