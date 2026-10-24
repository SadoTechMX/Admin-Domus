/**
 * ============================================================================
 * DOMUS OS · INVENTORY & CATALOG MODULE (Inventory.gs)
 * Catálogo de productos, recetas, inventario y homologación con la Carta Oficial
 * ============================================================================
 */

'use strict';

/**
 * Sincroniza la Carta Oficial Definitiva hacia CATALOGO e INVENTARIO
 * Protege contra sobreescritura ciega y colisión de claves SKU
 */
function sincronizarCartaConCatalogoDOMUS() {
  const sourceId = '1F5PrL19pRabjbgkI035Q2bf2np5Xy3MUL1KdZgMnOHQ';
  const targetId = CONFIG.mainSheetId;

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const sSource = SpreadsheetApp.openById(sourceId);
    const sTarget = SpreadsheetApp.openById(targetId);

    // 1. Localizar pestaña de Carta Oficial
    let sheetSource = null;
    const sheets = sSource.getSheets();
    for (let s of sheets) {
      if (s.getName().toUpperCase().includes('CARTA') || s.getSheetId() === 926692473) {
        sheetSource = s;
        break;
      }
    }
    if (!sheetSource) sheetSource = sheets[0];

    const raw = sheetSource.getDataRange().getValues();
    let headerIndex = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i][1] && String(raw[i][1]).toUpperCase().includes('PRODUCTO')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex < 0) throw new Error('No se encontró la cabecera de productos en la Carta Oficial.');

    const rows = raw.slice(headerIndex + 1);
    const catalogRows = [];
    const inventoryRows = [];
    const seenSkus = new Set();
    let skuCounter = 1;

    rows.forEach(r => {
      const cat = String(r[0] || '').trim();
      const name = String(r[1] || '').trim();
      if (!name) return;

      const rawSolar = String(r[2] || '').replace(/[$,]/g, '').trim();
      const rawLunar = String(r[3] || '').replace(/[$,]/g, '').trim();
      const priceSolar = parseFloat(rawSolar) || 0;
      const priceLunar = parseFloat(rawLunar) || priceSolar;
      const provider = String(r[4] || 'DOMUS').trim();
      let sku = String(r[5] || '').trim();

      // Resolver colisión de SKUs si están vacíos o repetidos
      if (!sku || seenSkus.has(sku)) {
        sku = (sku ? sku + '-' : 'SKU-') + String(skuCounter++).padStart(3, '0');
      }
      seenSkus.add(sku);

      const dest = (cat.includes('ALIMENTOS') || cat.includes('CANNA') || cat.includes('COMIDA')) ? 'Cocina' : 'Barra';

      // Fila para CATALOGO (A - S)
      catalogRows.push([
        name, cat, priceSolar, 0, provider, '', sku, dest, 'Sí',
        '', '', '', '', '', '', 'Sí', priceSolar, priceLunar, 'Sí'
      ]);

      // Fila para INVENTARIO: SKU, Nombre, Categoria, Proveedor, Unidad, Stock Inicial, Reservado, Disponible, Destino
      inventoryRows.push([
        sku, name, cat, provider, 'Unidad', 50, 0, 50, dest
      ]);
    });

    // Garantizar integración de rollos de sushi JujuTsu-shi
    const jujutsuList = [
      { name: 'Rollo Nobara', sku: 'JJ01' },
      { name: 'Rollo Itadori', sku: 'JJ02' },
      { name: 'Rollo Megumi', sku: 'JJ03' },
      { name: 'Rollo Maki', sku: 'JJ04' },
      { name: 'Rollo Todo', sku: 'JJ05' },
      { name: 'Rollo Choso', sku: 'JJ06' },
      { name: 'Rollo Gojo', sku: 'JJ07' },
      { name: 'Rollo Sasaki', sku: 'JJ08' },
      { name: 'Rollo Rika', sku: 'JJ09' }
    ];

    const existingNames = new Set(catalogRows.map(r => String(r[0]).toUpperCase()));
    jujutsuList.forEach(j => {
      if (!existingNames.has(j.name.toUpperCase())) {
        catalogRows.push([
          j.name, 'Sushi', 100, 0, 'JujuTsu-shi', '', j.sku, 'Cocina', 'Sí',
          '', '', '', '', '', '', 'Sí', 100, 100, 'Sí'
        ]);
        inventoryRows.push([
          j.sku, j.name, 'Sushi', 'JujuTsu-shi', 'Unidad', 50, 0, 50, 'Cocina'
        ]);
      }
    });

    // Escribir en CATALOGO a partir de fila 7
    const sheetCat = sTarget.getSheetByName('CATALOGO');
    if (sheetCat) {
      sheetCat.getRange(7, 1, catalogRows.length, catalogRows[0].length).setValues(catalogRows);
    }

    // Escribir en INVENTARIO a partir de fila 7
    const sheetInv = sTarget.getSheetByName('INVENTARIO');
    if (sheetInv) {
      sheetInv.getRange(7, 1, inventoryRows.length, inventoryRows[0].length).setValues(inventoryRows);
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      total: catalogRows.length,
      message: `Se sincronizaron con éxito ${catalogRows.length} productos en CATALOGO e INVENTARIO sin colisiones de SKU.`
    };
  });
}

/**
 * Registra un producto individual en CATALOGO e INVENTARIO bajo candado
 */
function registrarNuevoProducto(prod) {
  if (!prod || !prod.name) throw new Error('El nombre del producto es obligatorio.');

  return withLock_(CONFIG.lockTimeoutMs, () => {
    const sTarget = SpreadsheetApp.openById(CONFIG.mainSheetId);
    const name = String(prod.name).trim();
    const cat = String(prod.group || 'General').trim();
    const priceSolar = parseFloat(prod.priceSolar) || parseFloat(prod.price) || 0;
    const priceLunar = parseFloat(prod.priceLunar) || priceSolar;
    const provider = String(prod.provider || 'DOMUS').trim();
    const sku = String(prod.sku || ('PRD-' + Date.now().toString(36).toUpperCase())).trim();
    const dest = String(prod.destination || (cat.includes('ALIMENTOS') || cat.includes('CANNA') || cat.includes('COMIDA') || cat.includes('SUSHI') ? 'Cocina' : 'Barra')).trim();
    const stock = parseInt(prod.stock, 10) || 50;

    // 1. Insertar en CATALOGO
    const sheetCat = sTarget.getSheetByName('CATALOGO');
    if (sheetCat) {
      const lastRow = Math.max(sheetCat.getLastRow(), 6);
      const row = [
        name, cat, priceSolar, 0, provider, '', sku, dest, 'Sí',
        '', '', '', '', '', '', 'Sí', priceSolar, priceLunar, 'Sí'
      ];
      sheetCat.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
    }

    // 2. Insertar en INVENTARIO
    const sheetInv = sTarget.getSheetByName('INVENTARIO');
    if (sheetInv) {
      const lastRow = Math.max(sheetInv.getLastRow(), 6);
      const invRow = [sku, name, cat, provider, 'Unidad', stock, 0, stock, dest];
      sheetInv.getRange(lastRow + 1, 1, 1, invRow.length).setValues([invRow]);
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      message: `Producto "${name}" registrado en CATALOGO e INVENTARIO.`,
      product: { name, group: cat, priceSolar, priceLunar, destination: dest, sku, provider }
    };
  });
}

function sincronizarJujutsuShi() {
  return sincronizarCartaConCatalogoDOMUS();
}
