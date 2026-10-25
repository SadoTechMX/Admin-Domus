/**
 * ============================================================================
 * DOMUS OS · STAGING ALIGNMENT & FORMULA LEDGER AUDIT (StagingAlignment.gs)
 * Sincroniza la estructura de STAGING con PRODUCCIÓN (>= 324 filas)
 * y audita la preservación reactiva de fórmulas sin mutación directa en KDS.
 * ============================================================================
 */

'use strict';

/**
 * Función ejecutable en Apps Script (DOMUS - Caja simple) para alinear
 * la hoja INVENTARIO de STAGING con el esquema real de PRODUCCIÓN.
 */
function stagingAlignInventoryToProduction() {
  const env = getActiveEnvironment_();
  if (env.name !== 'STAGING') {
    throw new Error('Esta función solo debe ejecutarse en el entorno STAGING. Entorno actual: ' + env.name);
  }

  const ss = SpreadsheetApp.openById(env.mainSheetId);
  const sInv = ss.getSheetByName('INVENTARIO');
  if (!sInv) throw new Error('Hoja INVENTARIO no encontrada en STAGING');

  const sCaja = ss.getSheetByName('CAJA 2');
  if (!sCaja) throw new Error('Hoja CAJA 2 no encontrada en STAGING');

  const lastRow = sInv.getLastRow();
  const targetRows = 324;

  // 1. Expandir filas si tiene menos de 324
  if (lastRow < targetRows) {
    const diff = targetRows - lastRow;
    sInv.insertRowsAfter(lastRow, diff);
  }

  // 2. Datos sintéticos canónicos para filas 307 a 324 (Canna Treats y comida extendida)
  const syntheticItems = [
    { row: 307, name: 'Mini hotdogs', cat: 'Alimentos', unit: 'Orden', init: 20 },
    { row: 308, name: 'Salchipapas', cat: 'Alimentos', unit: 'Orden', init: 25 },
    { row: 309, name: 'Tacos dorados', cat: 'Alimentos', unit: 'Orden', init: 15 },
    { row: 310, name: 'Tacos de la parrilla', cat: 'Alimentos', unit: 'Orden', init: 15 },
    { row: 311, name: 'Hamburguesa clásica', cat: 'Alimentos', unit: 'Pieza', init: 20 },
    { row: 312, name: 'Hamburguesa doble', cat: 'Alimentos', unit: 'Pieza', init: 15 },
    { row: 313, name: 'Hot dog especial', cat: 'Alimentos', unit: 'Pieza', init: 20 },
    { row: 314, name: 'Papas a la francesa', cat: 'Alimentos', unit: 'Orden', init: 30 },
    { row: 315, name: 'Papas misioneras', cat: 'Alimentos', unit: 'Orden', init: 30 },
    { row: 316, name: 'Papas gajo', cat: 'Alimentos', unit: 'Orden', init: 25 },
    { row: 317, name: 'Hamburguesa kinki', cat: 'Alimentos', unit: 'Pieza', init: 20 },
    { row: 318, name: 'La dominatrix', cat: 'Alimentos', unit: 'Pieza', init: 15 },
    { row: 319, name: 'Trío de jochis', cat: 'Alimentos', unit: 'Orden', init: 18 },
    { row: 320, name: 'Boneless', cat: 'Alimentos', unit: 'Orden', init: 22 },
    { row: 321, name: 'Alitas sumisas — 10 piezas', cat: 'Alimentos', unit: 'Orden', init: 16 },
    { row: 322, name: 'Nachos libres', cat: 'Alimentos', unit: 'Orden', init: 20 },
    { row: 323, name: 'Ramen de abuelita', cat: 'Alimentos', unit: 'Orden', init: 12 },
    { row: 324, name: 'Waffle vainilla', cat: 'Alimentos', unit: 'Pieza', init: 14 }
  ];

  // Escribir datos sintéticos en filas 307:324
  syntheticItems.forEach(item => {
    const r = item.row;
    // A: Producto, B: Familia, C: Unidad, D: Inicial, E: Entradas, F: Merma
    sInv.getRange(r, 1).setValue(item.name);
    sInv.getRange(r, 2).setValue(item.cat);
    sInv.getRange(r, 3).setValue(item.unit);
    sInv.getRange(r, 4).setValue(item.init);
    sInv.getRange(r, 5).setValue(0);
    sInv.getRange(r, 6).setValue(0);
  });

  // 3. Aplicar fórmulas idénticas a PRODUCCIÓN para filas 7 a 324
  // Col G: =IF(A{r}="","",SUMIF('CAJA 2'!$G$7:$G,A{r},'CAJA 2'!$V$7:$V))
  // Col H: =IF(A{r}="","",D{r}+E{r}-F{r}-G{r})
  const totalRowsToFormulate = targetRows - 6; // 318 filas (7 a 324)
  const formulasG = [];
  const formulasH = [];

  for (let r = 7; r <= targetRows; r++) {
    formulasG.push([`=IF(A${r}="","",SUMIF('CAJA 2'!$G$7:$G,A${r},'CAJA 2'!$V$7:$V))`]);
    formulasH.push([`=IF(A${r}="","",D${r}+E${r}-F${r}-G${r})`]);
  }

  sInv.getRange(7, 7, totalRowsToFormulate, 1).setFormulas(formulasG);
  sInv.getRange(7, 8, totalRowsToFormulate, 1).setFormulas(formulasH);

  SpreadsheetApp.flush();

  return {
    ok: true,
    message: 'STAGING INVENTARIO alineado exitosamente a 324 filas con fórmulas canónicas de PRODUCCIÓN.',
    rowCount: sInv.getLastRow(),
    sampleG310: sInv.getRange(310, 7).getFormula(),
    sampleH310: sInv.getRange(310, 8).getFormula(),
    sampleG322: sInv.getRange(322, 7).getFormula(),
    sampleH322: sInv.getRange(322, 8).getFormula()
  };
}

/**
 * Función de diagnóstico y auditoría viva en STAGING
 */
function stagingAuditFormulaLedgerLive() {
  const env = getActiveEnvironment_();
  const ss = SpreadsheetApp.openById(env.mainSheetId);
  const sInv = ss.getSheetByName('INVENTARIO');
  const sCaja = ss.getSheetByName('CAJA 2');
  const sComandas = ss.getSheetByName('COMANDAS');

  const rowCount = sInv.getLastRow();
  const formulaG_322_antes = sInv.getRange(322, 7).getFormula();
  const formulaH_322_antes = sInv.getRange(322, 8).getFormula();
  const valG_322_antes = sInv.getRange(322, 7).getValue();
  const valH_322_antes = sInv.getRange(322, 8).getValue();

  return {
    environment: env.name,
    mainSheetId: env.mainSheetId,
    inventoryRowCount: rowCount,
    row322: {
      product: sInv.getRange(322, 1).getValue(),
      initialStock: sInv.getRange(322, 4).getValue(),
      formulaG_antes: formulaG_322_antes,
      valG_antes: valG_322_antes,
      formulaH_antes: formulaH_322_antes,
      valH_antes: valH_322_antes
    }
  };
}
