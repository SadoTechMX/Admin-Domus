'use strict';

function registrarNuevoProducto(prod) {
  authRequireContext_('registrarNuevoProducto');
  if(!prod || !String(prod.name||'').trim() || !String(prod.sku||'').trim())throw new Error('Nombre y SKU obligatorios.');
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),cat=m.getSheetByName('CATALOGO'),inv=m.getSheetByName('INVENTARIO');
  schemaColumns_(cat,['Producto / variante','Clave técnica','Precio Solar','Precio Lunar']);
  schemaColumns_(inv,['Producto / variante','INICIAL REAL','Entregado por comandas','Existencia esperada']);
  const name=String(prod.name).trim(),sku=String(prod.sku).trim();
  if(dataRows_(cat,7,20).some(r=>String(r[0])===name || String(r[6])===sku || String(r[15])===sku))throw new Error('Producto o SKU ya existente.');
  const solar=Number(prod.priceSolar),lunar=Number(prod.priceLunar),stock=Number(prod.stock);
  if(![solar,lunar,stock].every(Number.isFinite)||solar<0||lunar<0||stock<0)throw new Error('Precios y stock inicial válidos obligatorios.');
  const provider=String(prod.provider || 'DOMUS'),own=provider==='DOMUS',share=own?1:Number(prod.domusShare);
  if(!Number.isFinite(share)||share<0||share>1)throw new Error('Acuerdo de reparto requerido antes de dar de alta proveedor.');
  const group=String(prod.group||'General'),dest=String(prod.destination||'Barra');
  if(!['Barra','Cocina'].includes(dest))throw new Error('Destino inválido.');
  const c=Math.max(7,cat.getLastRow()+1),i=Math.max(7,inv.getLastRow()+1);
  const values=[name,group,solar,share,provider,0,sku,dest,'Sí',own?'Propio':'Reparto',provider,'pieza',0,group,'',sku,solar,lunar,'Sí',provider];
  const inventory=[name,group,'pieza',stock,0,0,`=SUMIF('CAJA 2'!$G$7:$G,A${i},'CAJA 2'!$V$7:$V)`,`=D${i}+E${i}-F${i}-G${i}`,'',`=IF(I${i}="","",I${i}-H${i})`,'',own?'Propio':'Reparto',provider,'Alta inicial declarada','Conteo físico',_authContext.operator];
  const writes=values.map((v,j)=>cellWrite_(cat,c,j+1,v));
  inventory.forEach((v,j)=>writes.push(cellWrite_(inv,i,j+1,v,[6,7,9].includes(j))));
  return journalCommit_(prod.requestId,'registrarNuevoProducto',m,writes,{ok:true,message:'Producto registrado; inventario existente conservado.',product:{name,sku,provider}});
}

function sincronizarCartaConCatalogoDOMUS() {
  authRequireContext_('sincronizarCartaConCatalogoDOMUS');
  const m=SpreadsheetApp.openById(CONFIG.mainSheetId),cat=m.getSheetByName('CATALOGO');
  const source=SpreadsheetApp.openById('1F5PrL19pRabjbgkI035Q2bf2np5Xy3MUL1KdZgMnOHQ').getSheetByName('CARTA SOLAR LUNAR');
  schemaColumns_(source,['PRODUCTO / PRESENTACIÓN','SOLAR (MXN)','LUNAR (MXN)','CONTIENE CANNABIS?','CLAVE CARTA'],5);
  const raw=dataRows_(source,6,7).filter(r=>r[1]&&r[6]),current=dataRows_(cat,7,20),seen=new Set(),writes=[];
  let changed=0,missing=0,remaining=0;
  raw.forEach(r=>{
    const sku=String(r[6]);if(seen.has(sku))throw new Error('SKU duplicado en carta oficial.');seen.add(sku);
    const matches=current.map((c,i)=>({c,row:i+7})).filter(e=>String(e.c[15])===sku || String(e.c[0])===String(r[1]));
    if(matches.length!==1){missing++;return;}
    const e=matches[0],solar=r[2],lunar=r[3];
    if([solar,lunar].some(v=>v!=='' && (!Number.isFinite(Number(v))||Number(v)<0)))throw new Error('Precio oficial no válido.');
    if(String(e.c[16])===String(solar)&&String(e.c[17])===String(lunar))return;
    if(changed>=40){remaining++;return;}
    // Preserve name, historical lookup key, provider terms and physical stock. No SKU invention.
    writes.push(cellWrite_(cat,e.row,17,solar),cellWrite_(cat,e.row,18,lunar));changed++;
  });
  const result={ok:true,changed:changed,remaining:remaining,requiresCatalogMapping:missing,message:'Precios actualizados: '+changed+'. Pendientes: '+remaining+'. Referencias por homologar: '+missing+'. Inventario físico conservado.'};
  return journalCommit_(_authContext.requestId,'sincronizarCartaConCatalogoDOMUS',m,writes,result);
}

function sincronizarJujutsuShi() {
  authRequireContext_('sincronizarJujutsuShi');
  throw new Error('Usa la homologación de carta oficial; no se modifica el catálogo ni el reparto histórico automáticamente.');
}
