'use strict';

function cambiarFase(payload) {
  authRequireContext_('cambiarFase');
  if (!payload || !['Solar','Lunar'].includes(payload.phase)) throw new Error('Fase inválida.');
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),s=m.getSheetByName('CAJA 2');
  if (s.getRange('F2').getValue() !== payload.expectedPhase) throw new Error('La fase cambió en otra estación. Actualiza antes de continuar.');
  return journalCommit_(payload.requestId,'cambiarFase',m,[cellWrite_(s,2,6,payload.phase)],{ok:true,phase:payload.phase});
}

function solicitarResurtido(payload) {
  authRequireContext_('solicitarResurtido');
  const product=String(payload && payload.product || '').trim();
  if (!product) throw new Error('Producto requerido.');
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),o=SpreadsheetApp.openById(CONFIG.opsSheetId),s=o.getSheetByName('RESURTIDO');
  if (!s) throw new Error('Hoja RESURTIDO no encontrada.');
  const row=Math.max(7,s.getLastRow()+1),id='RS-'+Utilities.getUuid();
  const values=[id,new Date(),product,String(payload.type || 'Reposición'),1,false,'','Resurtido pendiente'];
  return journalCommit_(payload.requestId,'solicitarResurtido',m,values.map((v,i)=>cellWrite_(s,row,i+1,v)),{ok:true,id:id,product:product});
}

function editarAcceso(payload) {
  authRequireContext_('editarAcceso');
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),s=m.getSheetByName('ACCESO');
  const rows=dataRows_(s,7,32),index=rows.findIndex(r=>String(r[0])===String(payload.accessId));
  if(index<0)throw new Error('Acceso no encontrado.');
  const original=rows[index],name=String(payload.customer || '').trim();
  if(!name)throw new Error('Nombre obligatorio.');
  let meta={};try{meta=JSON.parse(original[29]);}catch(e){}
  // A descriptive edit may not rewrite the historical commercial agreement or attendance.
  if(Number(payload.persons)!==Number(original[7]) || String(payload.salesChannel)!==String(meta.salesChannel || original[19])) {
    throw new Error('Cambios de canal o personas requieren conciliación de Gerencia; no se alterará el ingreso histórico.');
  }
  meta.customer=name;meta.phone=String(payload.phone || '');meta.editedBy=_authContext.operator;
  const row=index+7,writes=[cellWrite_(s,row,4,name),cellWrite_(s,row,6,meta.phone),cellWrite_(s,row,30,JSON.stringify(meta))];
  return journalCommit_(payload.requestId,'editarAcceso',m,writes,{ok:true,id:payload.accessId});
}

function anularAcceso(payload) {
  authRequireContext_('anularAcceso');
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),s=m.getSheetByName('ACCESO');
  const rows=dataRows_(s,7,32),index=rows.findIndex(r=>String(r[0])===String(payload.accessId));
  if(index<0)throw new Error('Acceso no encontrado.');
  const r=rows[index];
  if(Number(r[14])>0)throw new Error('Acceso con dinero cobrado: requiere devolución/conciliación independiente.');
  if(!String(payload.reason || '').trim())throw new Error('Motivo obligatorio.');
  let meta={};try{meta=JSON.parse(r[29]);}catch(e){}
  meta.voided=true;meta.voidReason=String(payload.reason);meta.voidedBy=_authContext.operator;
  return journalCommit_(payload.requestId,'anularAcceso',m,[cellWrite_(s,index+7,29,false),cellWrite_(s,index+7,30,JSON.stringify(meta))],{ok:true,id:payload.accessId,message:'Acceso anulado con historial conservado. No se devolvió dinero.'});
}
