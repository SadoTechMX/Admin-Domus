/**
 * DOMUS / ALQUIMIA -> archivo XLSX de intercambio de Mercado Pago.
 * Estado: implementación local; no acredita importación ni publicación en terminales.
 * Añadir como archivo independiente a un proyecto Apps Script existente verificado.
 * IDs privados: ScriptProperties DOMUS_MP_SOURCE_ID y DOMUS_MP_TARGET_ID.
 * Nunca llama al sincronizador legado del POS ni modifica inventario, proveedores o cobros.
 */
var DMP = Object.freeze({
  schema: 1, sourceSheet: 'Menú & Precios', controlSheet: 'MP_SYNC_CONTROL',
  firstSourceRow: 4, firstProductRow: 5, lastProductRow: 997,
  firstCategoryRow: 6, lastCategoryRow: 205,
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  relNs: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  productPart: 'xl/worksheets/sheet1.xml', categoryPart: 'xl/worksheets/sheet3.xml',
  maxBytes: 5 * 1024 * 1024, chunkSize: 7500, maxJournalRows: 45000,
  phases: [{ id: 'SOLAR', suffix: ' - Solar/Eclipse', col: 9 },
           { id: 'LUNAR', suffix: ' - Lunar', col: 12 }],
  parts: ['xl/worksheets/sheet3.xml','xl/worksheets/sheet2.xml','xl/worksheets/sheet1.xml',
    'xl/worksheets/_rels/sheet3.xml.rels','xl/worksheets/_rels/sheet2.xml.rels',
    'xl/worksheets/_rels/sheet1.xml.rels','xl/workbook.xml','xl/theme/theme1.xml',
    'xl/tables/table1.xml','xl/styles.xml','xl/sharedStrings.xml','xl/metadata',
    'xl/media/image1.png','xl/drawings/drawing3.xml','xl/drawings/drawing2.xml',
    'xl/drawings/drawing1.xml','xl/drawings/_rels/drawing1.xml.rels',
    'xl/_rels/workbook.xml.rels','_rels/.rels','[Content_Types].xml']
});

/** Solo lectura. Valida origen, plantilla, correspondencias y cambios propuestos. */
function DOMUS_MP_Simular() {
  return DMP_withLock_(function () {
    var c = DMP_config_(), s = DMP_readState_(c), source = DMP_readSource_(c);
    var target = DMP_readTarget_(c), recovery = DMP_recovery_(s.pending, target.hash);
    if (s.pending) return DMP_report_('RECUPERACION_PENDIENTE', {
      recovery: recovery, transaction: s.pending.id, writes: 0
    });
    var plan = DMP_plan_(source, DMP_unpack_(target.blob), s.manifest);
    return DMP_report_('SIMULADO', DMP_summary_(plan));
  }, true);
}

/**
 * Preflight completo antes de escribir control o crear disparadores.
 * No cambia el XLSX. La primera instalación queda PAUSADA.
 * Ejecutar manualmente DOMUS_MP_Ejecutar para verificar y activar la automatización.
 */
function DOMUS_MP_Instalar() {
  return DMP_withLock_(function () {
    var c = DMP_config_(), props = PropertiesService.getScriptProperties();
    var email = Session.getEffectiveUser().getEmail();
    DMP_assert_(email, 'INSTALLER_ID_UNAVAILABLE');
    var owner = DMP_hashText_(email.trim().toLowerCase());
    var previousOwner = props.getProperty('DOMUS_MP_INSTALLER_HASH');
    DMP_assert_(!previousOwner || previousOwner === owner, 'DIFFERENT_TRIGGER_OWNER');
    var state = DMP_readState_(c);
    DMP_assert_(!state.pending, 'RECOVERY_REQUIRED');
    var previouslyInstalled = previousOwner || props.getProperty('DOMUS_MP_TRIGGER_IDS') ||
      props.getProperty('DOMUS_MP_ENABLED') === '1';
    DMP_assert_(state.manifest || !previouslyInstalled, 'CONTROL_LOST_REVIEW_REQUIRED');
    var source = DMP_readSource_(c), target = DMP_readTarget_(c);
    var plan = DMP_plan_(source, DMP_unpack_(target.blob), state.manifest);
    DMP_assert_(DMP_readSource_(c).hash === source.hash, 'SOURCE_CHANGED_RETRY');
    DMP_assert_(DMP_readTarget_(c).hash === target.hash, 'DEST_CHANGED_RETRY');
    if (!state.manifest) {
      if (!state.exists) DMP_createControl_(c);
      DMP_appendRecord_(c, 'STATE', DMP_id_(), {
        schema: DMP.schema, manifest: plan.baseline, targetHash: target.hash
      });
    }
    props.setProperty('DOMUS_MP_INSTALLER_HASH', owner);
    if (props.getProperty('DOMUS_MP_ENABLED') === null) props.setProperty('DOMUS_MP_ENABLED', '0');
    DMP_ensureTriggers_(c, props);
    return DMP_status_('INSTALADO', {
      enabled: props.getProperty('DOMUS_MP_ENABLED') === '1',
      pendingChanges: plan.changes.length, xlsxWrites: 0
    });
  });
}

/** Ejecuta, verifica lectura posterior y habilita los disparadores solo al terminar bien. */
function DOMUS_MP_Ejecutar() { return DMP_run_(true); }

/** Pausa únicamente este módulo; no elimina otros disparadores ni evidencia. */
function DOMUS_MP_Pausar() {
  return DMP_withLock_(function () {
    PropertiesService.getScriptProperties().setProperty('DOMUS_MP_ENABLED', '0');
    return DMP_status_('PAUSADO', { xlsxWrites: 0 });
  });
}

function DOMUS_MP_AlEditar(e) {
  if (!e || !e.source || e.source.getId() !== DMP_config_().sourceId) return;
  if (e.range && e.range.getSheet().getName() === DMP.controlSheet) return;
  return DMP_run_(false);
}
function DOMUS_MP_AlCambiar(e) {
  if (!e || !e.source || e.source.getId() !== DMP_config_().sourceId) return;
  return DMP_run_(false);
}
function DOMUS_MP_Recuperar() { return DMP_run_(false); }

function DMP_run_(manual) {
  if (!manual && PropertiesService.getScriptProperties().getProperty('DOMUS_MP_ENABLED') !== '1') return;
  return DMP_withLock_(function () {
    if (!manual && PropertiesService.getScriptProperties().getProperty('DOMUS_MP_ENABLED') !== '1') return DMP_report_('PAUSADO', { xlsxWrites: 0 });
    var c = DMP_config_(), state = DMP_readState_(c);
    DMP_assert_(state.exists && state.manifest, 'INSTALL_FIRST');
    var target = DMP_readTarget_(c);
    if (state.pending) {
      var decision = DMP_recovery_(state.pending, target.hash);
      DMP_assert_(decision !== 'CONFLICTO_INCIERTO', 'UNCERTAIN_WRITE_REVIEW_REQUIRED');
      DMP_appendRecord_(c, decision === 'CONFIRMAR' ? 'COMMIT' : 'ABORT', state.pending.id,
        { targetHash: target.hash, reason: decision });
      state = DMP_readState_(c);
    }
    DMP_assertInstalled_(c);
    var source = DMP_readSource_(c), workbook = DMP_unpack_(target.blob);
    var plan = DMP_plan_(source, workbook, state.manifest);
    var nextBlob = plan.changes.length ? DMP_build_(workbook, plan.changes) : target.blob;
    var afterHash = DMP_hashBytes_(nextBlob.getBytes());
    var manifestChanged = JSON.stringify(plan.manifest) !== JSON.stringify(state.manifest);
    if (plan.changes.length || manifestChanged) {
      var transaction = {
        schema: DMP.schema, id: DMP_id_(), sourceHash: source.hash,
        beforeHash: target.hash, afterHash: afterHash,
        manifest: plan.manifest, summary: DMP_summary_(plan)
      };
      // Diario duradero y lectura exacta ANTES de cualquier PATCH del XLSX.
      DMP_appendRecord_(c, 'PREPARE', transaction.id, transaction);
      // Esta relectura limita carreras. NO es compare-and-swap atómico entre servicios.
      if (DMP_readSource_(c).hash !== source.hash) {
        DMP_appendRecord_(c, 'ABORT', transaction.id, { reason: 'SOURCE_CHANGED_RETRY' });
        DMP_fail_('SOURCE_CHANGED_RETRY');
      }
      var immediateTarget = DMP_readTarget_(c);
      if (immediateTarget.hash !== target.hash) {
        DMP_appendRecord_(c, 'ABORT', transaction.id, { reason: 'DEST_CHANGED_RETRY' });
        DMP_fail_('DEST_CHANGED_RETRY');
      }
      // No se reintenta PATCH a ciegas. Errores/timeouts dejan PREPARE sin resolver.
      if (plan.changes.length) DMP_writeTarget_(c, nextBlob);
      var verified = DMP_readTarget_(c);
      DMP_assert_(verified.hash === afterHash, 'READBACK_MISMATCH_REVIEW_REQUIRED');
      DMP_appendRecord_(c, 'COMMIT', transaction.id, { targetHash: verified.hash });
    }
    if (manual) {
      DMP_assertInstalled_(c);
      PropertiesService.getScriptProperties().setProperty('DOMUS_MP_ENABLED', '1');
    }
    return DMP_status_(plan.changes.length ? 'ARCHIVO_VERIFICADO' : 'SIN_CAMBIOS', DMP_summary_(plan));
  });
}

function DMP_config_() {
  var p = PropertiesService.getScriptProperties();
  var sourceId = p.getProperty('DOMUS_MP_SOURCE_ID'), targetId = p.getProperty('DOMUS_MP_TARGET_ID');
  DMP_assert_(sourceId && targetId && /^[A-Za-z0-9_-]{20,}$/.test(sourceId) &&
    /^[A-Za-z0-9_-]{20,}$/.test(targetId) && sourceId !== targetId, 'CONFIG_REQUIRED');
  return { sourceId: sourceId, targetId: targetId };
}

function DMP_readSource_(c) {
  var ss = SpreadsheetApp.openById(c.sourceId), sheet = ss.getSheetByName(DMP.sourceSheet);
  DMP_assert_(sheet, 'SOURCE_SHEET_MISSING');
  var headers = sheet.getRange(3, 1, 1, 17).getValues()[0];
  var expected = { 0:'Código', 1:'Producto', 3:'Categoría', 9:'Precio Solar/Eclipse ($)', 12:'Precio Lunar ($)', 16:'Estado de Revisión' };
  Object.keys(expected).forEach(function (column) {
    DMP_assert_(headers[Number(column)] === expected[column], 'SOURCE_HEADERS_CHANGED', 3);
  });
  var count = Math.max(0, sheet.getLastRow() - DMP.firstSourceRow + 1);
  DMP_assert_(count <= 20000, 'SOURCE_TOO_LARGE');
  var rows = count ? sheet.getRange(DMP.firstSourceRow, 1, count, 17).getValues() : [];
  // Solo identidad, nombre, categoría, precios y aprobación. No se guardan proveedores.
  var selected = rows.map(function (r) { return [r[0], r[1], r[3], r[9], r[12], r[16]]; });
  while (selected.length && selected[selected.length - 1].every(DMP_blank_)) selected.pop();
  var result = DMP_source_(selected);
  result.hash = DMP_hashText_(JSON.stringify(selected));
  return result;
}

/** Entrada pura: filas A, B, D, J, M, Q, ya proyectadas. */
function DMP_source_(rows) {
  var ids = Object.create(null), names = Object.create(null), variants = [], present = Object.create(null), pending = 0;
  rows.forEach(function (r, i) {
    if (r.every(DMP_blank_)) return;
    var id = DMP_text_(r[0]), status = DMP_text_(r[5]);
    var approved = status.toLocaleUpperCase('es-MX') === 'APROBADO';
    if (id) {
      DMP_assert_(/^PROD-[0-9]{3,12}$/.test(id), 'SOURCE_ID_INVALID', i + 4);
      DMP_assert_(!ids[id], 'SOURCE_ID_DUPLICATE', i + 4);
      ids[id] = true; present[id] = approved ? 'APPROVED' : 'NOT_APPROVED';
    }
    if (!approved) { pending++; return; }
    DMP_assert_(id, 'SOURCE_ID_REQUIRED', i + 4);
    var name = DMP_text_(r[1]), category = DMP_text_(r[2]);
    DMP_validText_(name, 1, 60, 'SOURCE_NAME_INVALID');
    DMP_validText_(category, 1, 32767, 'SOURCE_CATEGORY_REQUIRED');
    DMP.phases.forEach(function (p, j) {
      var fullName = name + p.suffix, key = id + '|' + p.id;
      DMP_validText_(fullName, 3, 60, 'EXPORTED_NAME_TOO_LONG');
      var canonical = DMP_nameKey_(fullName);
      DMP_assert_(!names[canonical], 'SOURCE_NAME_DUPLICATE', i + 4);
      names[canonical] = true;
      variants.push({ key: key, id: id, phase: p.id, name: fullName,
        price: DMP_price_(r[j + 3], 'SOURCE_PRICE_INVALID'), category: category });
    });
  });
  DMP_assert_(variants.length <= 993, 'PRODUCT_CAPACITY_EXCEEDED');
  return { variants: variants, present: present, pending: pending };
}

/** Calcula cambios; nunca borra productos, filas o categorías. */
function DMP_plan_(source, wb, manifest) {
  var rows = wb.products, categories = wb.categories, byName = Object.create(null), used = Object.create(null), changes = [];
  var initial = !manifest, baseline = manifest ? DMP_clone_(manifest) : { products: [], categories: [] };
  var old = Object.create(null), categoryRows = Object.create(null), categoryNames = Object.create(null), desiredNames = Object.create(null);
  Object.keys(rows).forEach(function (n) {
    var r = rows[n];
    if (!DMP_blank_(r.name)) {
      DMP_validText_(r.name, 3, 60, 'DEST_NAME_INVALID');
      DMP_price_(r.price, 'DEST_PRICE_INVALID');
      var key = DMP_nameKey_(r.name);
      DMP_assert_(!byName[key], 'DEST_NAME_DUPLICATE', Number(n));
      byName[key] = r;
    } else DMP_assert_(r.empty, 'DEST_PARTIAL_ROW', Number(n));
  });
  Object.keys(categories).forEach(function (n) {
    var value = categories[n];
    if (DMP_blank_(value)) return;
    DMP_validText_(value, 1, 32767, 'DEST_CATEGORY_INVALID');
    var key = DMP_nameKey_(value);
    DMP_assert_(!categoryNames[key], 'DEST_CATEGORY_DUPLICATE', Number(n));
    categoryNames[key] = { row: Number(n), value: value };
  });
  baseline.products.forEach(function (m) {
    DMP_validateManifestProduct_(m);
    DMP_assert_(!old[m.key] && !used[m.row], 'MANIFEST_DUPLICATE');
    DMP_assert_(rows[m.row] && DMP_equalTriple_(rows[m.row], m), 'DEST_MANUAL_CONFLICT', m.row);
    old[m.key] = m; used[m.row] = m.key;
  });
  baseline.categories.forEach(function (m) {
    DMP_assert_(Number.isInteger(m.row) && m.row >= 6 && m.row <= 205 && !categoryRows[m.row], 'MANIFEST_CATEGORY_INVALID');
    DMP_assert_(categories[m.row] === m.value, 'CATEGORY_MANUAL_CONFLICT', m.row);
    categoryRows[m.row] = true;
  });
  // Bootstrap adopta solo coincidencias exactas. Un nombre igual con otro precio/categoría aborta.
  if (initial) {
    source.variants.forEach(function (v) {
      var row = byName[DMP_nameKey_(v.name)];
      if (!row) return;
      DMP_assert_(DMP_equalTriple_(row, v), 'BOOTSTRAP_MISMATCH', row.row);
      var m = Object.assign({}, v, { row: row.row, status: 'ACTIVE' });
      baseline.products.push(m); old[v.key] = m; used[row.row] = v.key;
    });
  }
  Object.keys(categoryNames).forEach(function (k) {
    var m = categoryNames[k];
    if (!categoryRows[m.row]) { baseline.categories.push(m); categoryRows[m.row] = true; }
  });
  baseline.products.sort(DMP_keySort_); baseline.categories.sort(DMP_rowSort_);
  var next = DMP_clone_(baseline), nextByKey = Object.create(null);
  next.products.forEach(function (m) {
    m.status = source.present[m.id] === 'APPROVED' ? 'ACTIVE' :
      (source.present[m.id] ? 'HOLD_NOT_APPROVED' : 'HOLD_MISSING');
    nextByKey[m.key] = m;
  });
  source.variants.forEach(function (v) {
    var existing = nextByKey[v.key], row;
    if (existing) row = existing.row;
    else {
      DMP_assert_(!byName[DMP_nameKey_(v.name)], 'UNMAPPED_DEST_NAME_CONFLICT');
      for (var n = 5; n <= 997; n++) if (!used[n] && rows[n] && rows[n].empty) { row = n; break; }
      DMP_assert_(row, 'PRODUCT_CAPACITY_EXCEEDED');
      existing = Object.assign({}, v, { row: row, status: 'ACTIVE' });
      next.products.push(existing); nextByKey[v.key] = existing; used[row] = v.key;
    }
    var observed = rows[row];
    [['B','name'],['C','price'],['I','category']].forEach(function (pair) {
      if (observed[pair[1]] !== v[pair[1]]) changes.push({ part: DMP.productPart, cell: pair[0] + row, value: v[pair[1]] });
    });
    Object.assign(existing, v, { row: row, status: 'ACTIVE' });
  });
  // Comprueba unicidad final también frente a productos manuales y retenidos.
  Object.keys(rows).forEach(function (n) {
    var tracked = used[n] && nextByKey[used[n]], name = tracked ? tracked.name : rows[n].name;
    if (!name) return;
    var key = DMP_nameKey_(name);
    DMP_assert_(!desiredNames[key], 'FINAL_NAME_COLLISION', Number(n));
    desiredNames[key] = true;
  });
  next.products.forEach(function (m) {
    if (!m.category) return;
    var key = DMP_nameKey_(m.category), found = categoryNames[key];
    if (found) { DMP_assert_(found.value === m.category, 'CATEGORY_SPELLING_CONFLICT'); return; }
    var row;
    for (var n = 6; n <= 205; n++) if (!categoryRows[n] && DMP_blank_(categories[n])) { row = n; break; }
    DMP_assert_(row, 'CATEGORY_CAPACITY_EXCEEDED');
    var c = { row: row, value: m.category };
    categoryRows[row] = true; categoryNames[key] = c; next.categories.push(c);
    changes.push({ part: DMP.categoryPart, cell: 'B' + row, value: m.category });
  });
  next.products.sort(DMP_keySort_); next.categories.sort(DMP_rowSort_);
  return { baseline: baseline, manifest: next, changes: changes,
    approved: source.variants.length / 2, pending: source.pending,
    held: next.products.filter(function (m) { return m.status !== 'ACTIVE'; }).length,
    added: next.products.length - baseline.products.length };
}

function DMP_unpack_(blob) {
  var zipInput = Utilities.newBlob(blob.getBytes(), 'application/zip', 'catalogo.zip');
  var blobs = Utilities.unzip(zipInput), parts = {}, texts = {};
  DMP_assert_(blobs.length === DMP.parts.length, 'XLSX_PART_COUNT_CHANGED');
  blobs.forEach(function (b) { var n = b.getName(); DMP_assert_(!parts[n], 'XLSX_DUPLICATE_PART'); parts[n] = b; });
  DMP_assert_(Object.keys(parts).sort().join('|') === DMP.parts.slice().sort().join('|'), 'XLSX_PARTS_CHANGED');
  ['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml','xl/worksheets/sheet2.xml',DMP.productPart,DMP.categoryPart].forEach(function (n) {
    texts[n] = parts[n].getDataAsString('UTF-8');
    DMP_assert_(!/<!DOCTYPE|<!ENTITY/i.test(texts[n]), 'XML_UNSUPPORTED_DECLARATION');
  });
  DMP_verifyWorkbook_(texts);
  var stringsRoot = XmlService.parse(texts['xl/sharedStrings.xml']).getRootElement();
  var shared = stringsRoot.getChildren().map(DMP_xmlText_);
  var productCells = DMP_cells_(texts[DMP.productPart], shared);
  var categoryCells = DMP_cells_(texts[DMP.categoryPart], shared);
  var extraCells = DMP_cells_(texts['xl/worksheets/sheet2.xml'], shared);
  var expectedExtra = { A1:'template_id', B1:'MLM_DEFAULT_DOCUMENT', A2:'doc_version', B2:'1.0.6' };
  var expectedHeaders = { B3:'Nombre del producto', C3:'Precio de venta', F3:'Código del producto (SKU)', I3:'Categorías' };
  Object.keys(expectedExtra).forEach(function (k) { DMP_assert_(extraCells[k] && extraCells[k].value === expectedExtra[k], 'XLSX_TEMPLATE_VERSION_CHANGED'); });
  Object.keys(expectedHeaders).forEach(function (k) { DMP_assert_(productCells[k] && productCells[k].value === expectedHeaders[k], 'XLSX_HEADERS_CHANGED'); });
  DMP_assert_(categoryCells.B5 && categoryCells.B5.value === 'Tus categorías', 'XLSX_CATEGORY_HEADER_CHANGED');
  var products = {}, categories = {}, skus = Object.create(null);
  for (var r = 5; r <= 997; r++) {
    ['B','C','I'].forEach(function (col) { DMP_assert_(productCells[col + r], 'XLSX_PRODUCT_CELL_MISSING'); });
    var names = ['B','C','D','E','F','G','H','I','J'];
    var empty = names.every(function (col) { var v = productCells[col + r]; return !v || (!v.formula && DMP_blank_(v.value)); });
    ['B','C','I'].forEach(function (col) { DMP_assert_(!productCells[col + r].formula, 'MANAGED_CELL_HAS_FORMULA'); });
    // F se conserva íntegro. Si ya contiene SKU manuales, no se admiten duplicados.
    var skuCell = productCells['F' + r], sku = skuCell ? DMP_text_(skuCell.value) : '';
    if (sku) {
      DMP_assert_(!skus[sku], 'DEST_SKU_DUPLICATE', r);
      skus[sku] = true;
    }
    products[r] = { row: r, name: productCells['B' + r].value, price: productCells['C' + r].value,
      category: productCells['I' + r].value, empty: empty };
  }
  for (var c = 6; c <= 205; c++) {
    DMP_assert_(categoryCells['B' + c] && !categoryCells['B' + c].formula, 'XLSX_CATEGORY_CELL_INVALID');
    categories[c] = categoryCells['B' + c].value;
  }
  return { blobs: blobs, parts: parts, texts: texts, products: products, categories: categories };
}

function DMP_verifyWorkbook_(texts) {
  var root = XmlService.parse(texts['xl/workbook.xml']).getRootElement(), ns = XmlService.getNamespace(DMP.ns);
  var sheets = root.getChild('sheets', ns).getChildren('sheet', ns), rels = {};
  XmlService.parse(texts['xl/_rels/workbook.xml.rels']).getRootElement().getChildren().forEach(function (r) {
    rels[r.getAttribute('Id').getValue()] = r.getAttribute('Target').getValue();
  });
  var map = {};
  sheets.forEach(function (s) { map[s.getAttribute('name').getValue()] = {
    path: 'xl/' + rels[s.getAttribute('id', XmlService.getNamespace('r', DMP.relNs)).getValue()],
    state: s.getAttribute('state') ? s.getAttribute('state').getValue() : 'visible'
  }; });
  DMP_assert_(sheets.length === 3 && map['Tus productos'] && map['Tus productos'].path === DMP.productPart &&
    map['Tus categorías'] && map['Tus categorías'].path === DMP.categoryPart &&
    map.extra_data && map.extra_data.path === 'xl/worksheets/sheet2.xml' && map.extra_data.state === 'hidden', 'XLSX_LAYOUT_CHANGED');
}

function DMP_cells_(xml, shared) {
  var root = XmlService.parse(xml).getRootElement(), ns = XmlService.getNamespace(DMP.ns), cells = {};
  DMP_assert_(root.getName() === 'worksheet' && root.getNamespace().getURI() === DMP.ns, 'XLSX_NAMESPACE_CHANGED');
  root.getChild('sheetData', ns).getChildren('row', ns).forEach(function (row) {
    row.getChildren('c', ns).forEach(function (cell) {
      var address = cell.getAttribute('r').getValue();
      DMP_assert_(!cells[address], 'XLSX_DUPLICATE_CELL');
      var type = cell.getAttribute('t'), t = type ? type.getValue() : 'n';
      var v = cell.getChild('v', ns), value = v ? v.getText() : '';
      if (t === 's' && v) {
        DMP_assert_(/^\d+$/.test(value) && shared[Number(value)] !== undefined, 'XLSX_SHARED_STRING_INVALID');
        value = shared[Number(value)];
      } else if (t === 'inlineStr') value = DMP_xmlText_(cell.getChild('is', ns));
      else if (t === 'n' && value !== '') { value = Number(value); DMP_assert_(Number.isFinite(value), 'XLSX_NUMBER_INVALID'); }
      else if (t === 'b') value = value === '1';
      cells[address] = { value: value, formula: !!cell.getChild('f', ns) };
    });
  });
  return cells;
}

function DMP_xmlText_(element) {
  if (!element) return '';
  if (element.getName() === 't') return element.getText();
  return element.getChildren().map(DMP_xmlText_).join('');
}

function DMP_build_(wb, changes) {
  var byPart = {}, changedParts = {};
  changes.forEach(function (c) {
    var valid = c.part === DMP.productPart ? /^[BCI](?:[5-9]|[1-9]\d{1,2})$/.test(c.cell) && Number(c.cell.slice(1)) <= 997 :
      c.part === DMP.categoryPart && /^B\d+$/.test(c.cell) && Number(c.cell.slice(1)) >= 6 && Number(c.cell.slice(1)) <= 205;
    DMP_assert_(valid, 'WRITE_OUTSIDE_ALLOWLIST');
    if (!byPart[c.part]) byPart[c.part] = {};
    DMP_assert_(!Object.prototype.hasOwnProperty.call(byPart[c.part], c.cell), 'DUPLICATE_PATCH');
    byPart[c.part][c.cell] = c.value;
  });
  Object.keys(byPart).forEach(function (part) { changedParts[part] = DMP_patchXml_(wb.texts[part], byPart[part]); });
  var output = wb.blobs.map(function (b) {
    return Object.prototype.hasOwnProperty.call(changedParts, b.getName()) ?
      Utilities.newBlob(changedParts[b.getName()], 'application/xml', b.getName()) : b;
  });
  var zip = Utilities.zip(output, 'catalogo.xlsx').setContentType(DMP.mime);
  DMP_assert_(zip.getBytes().length <= DMP.maxBytes, 'XLSX_TOO_LARGE');
  var check = DMP_unpack_(zip);
  DMP.parts.forEach(function (part) {
    if (!byPart[part]) DMP_assert_(DMP_hashBytes_(wb.parts[part].getBytes()) === DMP_hashBytes_(check.parts[part].getBytes()), 'UNTOUCHED_PART_CHANGED');
  });
  changes.forEach(function (c) {
    var n = Number(c.cell.slice(1)), col = c.cell.charAt(0);
    var value = c.part === DMP.categoryPart ? check.categories[n] : check.products[n][{ B:'name', C:'price', I:'category' }[col]];
    DMP_assert_(value === c.value, 'PATCH_VALUE_MISMATCH');
  });
  return zip;
}

/** Sustituye solo elementos <c> permitidos, preservando literalmente el resto del XML. */
function DMP_patchXml_(xml, patches) {
  var found = {};
  var output = xml.replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, function (original) {
    var address = /\br=(['"])([A-Z]+[1-9]\d*)\1/.exec(original);
    if (!address || !Object.prototype.hasOwnProperty.call(patches, address[2])) return original;
    var key = address[2], value = patches[key];
    DMP_assert_(!found[key] && !/<f\b/.test(original), 'PATCH_CELL_AMBIGUOUS'); found[key] = true;
    var opening = original.slice(0, original.indexOf('>') + 1).replace(/\/>$/, '>');
    opening = opening.replace(/\s+t=(['"])[^'"]*\1/, '');
    var type = typeof value === 'number' ? 'n' : 'inlineStr';
    opening = opening.slice(0, -1) + ' t="' + type + '">';
    var inner = type === 'n' ? '<v>' + value + '</v>' : '<is><t xml:space="preserve">' + DMP_escape_(String(value)) + '</t></is>';
    return opening + inner + '</c>';
  });
  DMP_assert_(Object.keys(found).length === Object.keys(patches).length, 'PATCH_CELL_MISSING');
  XmlService.parse(output);
  // La sustitución lexical anterior no reserializa estilos, fórmulas ni validaciones.
  return output;
}

function DMP_readTarget_(c) {
  var base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(c.targetId);
  var fields = 'id,mimeType,trashed,size,version,md5Checksum,capabilities(canEdit)';
  var before = DMP_fetchJson_(base + '?supportsAllDrives=true&fields=' + encodeURIComponent(fields));
  DMP_assert_(before.id === c.targetId && before.mimeType === DMP.mime && !before.trashed, 'TARGET_TYPE_INVALID');
  DMP_assert_(before.capabilities && before.capabilities.canEdit, 'TARGET_NOT_EDITABLE');
  DMP_assert_(Number(before.size) > 0 && Number(before.size) <= DMP.maxBytes, 'TARGET_SIZE_INVALID');
  var response = DMP_fetch_(base + '?alt=media&supportsAllDrives=true', { method: 'get' });
  var blob = response.getBlob().setName('catalogo.xlsx'), bytes = blob.getBytes();
  var after = DMP_fetchJson_(base + '?supportsAllDrives=true&fields=' + encodeURIComponent(fields));
  DMP_assert_(String(before.version) === String(after.version) && before.md5Checksum === after.md5Checksum &&
    bytes.length === Number(after.size) && DMP_digest_(Utilities.DigestAlgorithm.MD5, bytes) === after.md5Checksum,
    'DEST_CHANGED_DURING_READ');
  return { blob: blob, hash: DMP_hashBytes_(bytes), version: after.version };
}

function DMP_writeTarget_(c, blob) {
  var url = 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(c.targetId) +
    '?uploadType=media&supportsAllDrives=true&fields=id';
  var result = DMP_fetchJson_(url, { method: 'patch', contentType: DMP.mime, payload: blob.getBytes() });
  DMP_assert_(result.id === c.targetId, 'UPLOAD_ID_MISMATCH');
}

function DMP_fetch_(url, options) {
  options = Object.assign({ muteHttpExceptions: true }, options || {});
  options.headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  var response = UrlFetchApp.fetch(url, options), code = response.getResponseCode();
  DMP_assert_(code >= 200 && code < 300, 'DRIVE_HTTP_' + code);
  return response;
}
function DMP_fetchJson_(url, options) { return JSON.parse(DMP_fetch_(url, options).getContentText()); }

/** Diario append-only, con SHA de payload y secuencia completa. Nunca se borra automáticamente. */
function DMP_readState_(c) {
  var sheet = SpreadsheetApp.openById(c.sourceId).getSheetByName(DMP.controlSheet);
  if (!sheet) return { exists: false, manifest: null, pending: null };
  var header = sheet.getRange(1, 1, 1, 6).getValues()[0];
  DMP_assert_(header[0] === 'DOMUS_MP_SYNC_V1' && header[1] === c.sourceId && header[2] === c.targetId,
    'CONTROL_IDENTITY_MISMATCH');
  var count = Math.max(0, sheet.getLastRow() - 2), records = [];
  DMP_assert_(count <= DMP.maxJournalRows, 'JOURNAL_ARCHIVE_REQUIRED');
  var rows = count ? sheet.getRange(3, 1, count, 6).getValues() : [];
  for (var i = 0; i < rows.length;) {
    var row = rows[i], index = /^(\d+)\/(\d+)$/.exec(String(row[3]));
    DMP_assert_(index && index[1] === '1', 'JOURNAL_INCOMPLETE_REVIEW_REQUIRED');
    var n = Number(index[2]), chunks = [];
    DMP_assert_(n > 0 && n <= 1000 && i + n <= rows.length, 'JOURNAL_INCOMPLETE_REVIEW_REQUIRED');
    for (var j = 0; j < n; j++) {
      var piece = rows[i + j];
      DMP_assert_(piece[0] === row[0] && piece[1] === row[1] && piece[2] === row[2] &&
        piece[3] === (j + 1) + '/' + n && piece[4] === row[4], 'JOURNAL_INCOMPLETE_REVIEW_REQUIRED');
      DMP_assert_(String(piece[5]).slice(0, 5) === 'JSON:', 'JOURNAL_PREFIX_INVALID');
      chunks.push(String(piece[5]).slice(5));
    }
    var serialized = chunks.join('');
    DMP_assert_(DMP_hashText_(serialized) === row[4], 'JOURNAL_HASH_MISMATCH');
    records.push({ id: row[1], type: row[2], payload: JSON.parse(serialized) }); i += n;
  }
  var state = records.length ? DMP_reduceJournal_(records) : { manifest: null, pending: null };
  state.exists = true;
  return state;
}

function DMP_reduceJournal_(records) {
  var state = { manifest: null, pending: null };
  records.forEach(function (r) {
    if (r.type === 'STATE') {
      DMP_assert_(!state.manifest && !state.pending && r.payload.schema === DMP.schema, 'JOURNAL_STATE_INVALID');
      state.manifest = r.payload.manifest;
    } else if (r.type === 'PREPARE') {
      DMP_assert_(state.manifest && !state.pending && r.payload.id === r.id && r.payload.schema === DMP.schema, 'JOURNAL_SEQUENCE_INVALID');
      state.pending = r.payload;
    } else if (r.type === 'COMMIT' || r.type === 'ABORT') {
      DMP_assert_(state.pending && state.pending.id === r.id, 'JOURNAL_SEQUENCE_INVALID');
      if (r.type === 'COMMIT') {
        DMP_assert_(r.payload.targetHash === state.pending.afterHash, 'JOURNAL_COMMIT_HASH_INVALID');
        state.manifest = state.pending.manifest;
      }
      state.pending = null;
    } else DMP_fail_('JOURNAL_RECORD_UNKNOWN');
  });
  DMP_assert_(state.manifest, 'JOURNAL_BASELINE_MISSING');
  return state;
}

function DMP_createControl_(c) {
  var ss = SpreadsheetApp.openById(c.sourceId);
  DMP_assert_(!ss.getSheetByName(DMP.controlSheet), 'CONTROL_CREATED_CONCURRENTLY');
  var sheet = ss.insertSheet(DMP.controlSheet);
  sheet.getRange(1, 1, 2, 6).setValues([
    ['DOMUS_MP_SYNC_V1', c.sourceId, c.targetId, 'No editar: manifiesto y recuperación', '', ''],
    ['UTC', 'Ejecución', 'Registro', 'Parte', 'SHA256', 'JSON: identidad y valores anteriores']
  ]);
  sheet.setFrozenRows(2);
  sheet.getRange(1, 1, 2, 6).setFontWeight('bold');
  sheet.setColumnWidth(6, 500);
  SpreadsheetApp.flush();
}

function DMP_appendRecord_(c, type, id, payload) {
  var sheet = SpreadsheetApp.openById(c.sourceId).getSheetByName(DMP.controlSheet);
  DMP_assert_(sheet, 'CONTROL_SHEET_MISSING');
  var json = JSON.stringify(payload), digest = DMP_hashText_(json), chunks = DMP_chunks_(json);
  var stamp = new Date().toISOString(), rows = chunks.map(function (chunk, i) {
    return [stamp, id, type, (i + 1) + '/' + chunks.length, digest, 'JSON:' + chunk];
  });
  var start = sheet.getLastRow() + 1;
  DMP_assert_(start + rows.length - 1 <= DMP.maxJournalRows + 2, 'JOURNAL_ARCHIVE_REQUIRED');
  if (sheet.getMaxRows() < start + rows.length - 1) sheet.insertRowsAfter(sheet.getMaxRows(), start + rows.length - 1 - sheet.getMaxRows());
  var range = sheet.getRange(start, 1, rows.length, 6);
  range.setNumberFormat('@'); // Evita interpretación como fórmula y conserva JSON/IDs literal.
  range.setValues(rows); SpreadsheetApp.flush();
  DMP_assert_(JSON.stringify(range.getValues()) === JSON.stringify(rows), 'JOURNAL_READBACK_MISMATCH');
}

function DMP_recovery_(pending, observedHash) {
  if (!pending) return 'NINGUNA';
  if (observedHash === pending.afterHash) return 'CONFIRMAR';
  if (observedHash === pending.beforeHash) return 'NO_APLICADO';
  return 'CONFLICTO_INCIERTO';
}

function DMP_triggerDefinitions_(c) {
  return [
    { handler: 'DOMUS_MP_AlEditar', event: ScriptApp.EventType.ON_EDIT, source: c.sourceId },
    { handler: 'DOMUS_MP_AlCambiar', event: ScriptApp.EventType.ON_CHANGE, source: c.sourceId },
    { handler: 'DOMUS_MP_Recuperar', event: ScriptApp.EventType.CLOCK, source: null }
  ];
}

function DMP_assertInstalled_(c) {
  var props = PropertiesService.getScriptProperties(), owner = props.getProperty('DOMUS_MP_INSTALLER_HASH');
  var email = Session.getEffectiveUser().getEmail();
  DMP_assert_(owner && email && DMP_hashText_(email.trim().toLowerCase()) === owner, 'INSTALLER_ACCOUNT_REQUIRED');
  var ids;
  try { ids = JSON.parse(props.getProperty('DOMUS_MP_TRIGGER_IDS') || '{}'); }
  catch (e) { ids = {}; }
  var triggers = ScriptApp.getProjectTriggers(), definitions = DMP_triggerDefinitions_(c);
  var complete = ids && Object.keys(ids).length === 3 && definitions.every(function (d) {
    return typeof ids[d.handler] === 'string' && triggers.filter(function (t) {
      return t.getUniqueId() === ids[d.handler] && t.getHandlerFunction() === d.handler &&
        t.getEventType() === d.event && (d.source === null || t.getTriggerSourceId() === d.source);
    }).length === 1;
  });
  if (!complete) {
    props.setProperty('DOMUS_MP_ENABLED', '0');
    DMP_fail_('INSTALL_INCOMPLETE_REPEAT_INSTALL');
  }
}

function DMP_ensureTriggers_(c, props) {
  var definitions = DMP_triggerDefinitions_(c);
  var saved = JSON.parse(props.getProperty('DOMUS_MP_TRIGGER_IDS') || '{}'), ids = {};
  definitions.forEach(function (d) {
    var matches = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === d.handler; });
    var keep = matches.filter(function (t) { return t.getUniqueId() === saved[d.handler] && t.getEventType() === d.event &&
      (d.source === null || t.getTriggerSourceId() === d.source); })[0];
    matches.forEach(function (t) { if (!keep || t.getUniqueId() !== keep.getUniqueId()) ScriptApp.deleteTrigger(t); });
    if (!keep) {
      var builder = ScriptApp.newTrigger(d.handler);
      keep = d.source === null ? builder.timeBased().everyMinutes(5).create() :
        (d.event === ScriptApp.EventType.ON_EDIT ? builder.forSpreadsheet(c.sourceId).onEdit().create() : builder.forSpreadsheet(c.sourceId).onChange().create());
    }
    ids[d.handler] = keep.getUniqueId();
  });
  props.setProperty('DOMUS_MP_TRIGGER_IDS', JSON.stringify(ids));
}

function DMP_withLock_(fn, readOnly) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return DMP_report_('OCUPADO', { xlsxWrites: 0 });
  try { return fn(); }
  catch (error) {
    var code = error && error.dmpCode ? error.dmpCode : 'UNEXPECTED_ERROR_REVIEW_REQUIRED';
    var details = { code: code };
    if (error && error.dmpRow) details.row = error.dmpRow;
    if (readOnly) DMP_report_('BLOQUEADO', details); else DMP_status_('BLOQUEADO', details);
    throw new Error('DOMUS_MP: ' + code + (details.row ? ' (fila ' + details.row + ')' : ''));
  } finally { lock.releaseLock(); }
}

function DMP_status_(status, details) {
  var result = DMP_report_(status, details);
  PropertiesService.getScriptProperties().setProperty('DOMUS_MP_LAST_STATUS', JSON.stringify(result));
  return result;
}
function DMP_report_(status, details) {
  var now = new Date();
  var result = Object.assign({ status: status, utc: now.toISOString(),
    mexicoCity: Utilities.formatDate(now, 'America/Mexico_City', 'yyyy-MM-dd HH:mm:ss'),
    filePublication: 'SOLO_ARCHIVO', mercadoPagoImport: 'NO_VERIFICADO', terminal: 'NO_VERIFICADO' }, details || {});
  console.log(JSON.stringify(result)); return result;
}
function DMP_summary_(p) { return { approvedProducts: p.approved, managedVariants: p.manifest.products.length,
  addedVariants: p.added, heldVariants: p.held, pendingSourceRows: p.pending,
  cellsToWrite: p.changes.length, categories: p.manifest.categories.length }; }
function DMP_validateManifestProduct_(m) {
  DMP_assert_(m && /^PROD-[0-9]{3,12}$/.test(m.id) && /^(SOLAR|LUNAR)$/.test(m.phase) &&
    m.key === m.id + '|' + m.phase && Number.isInteger(m.row) && m.row >= 5 && m.row <= 997, 'MANIFEST_PRODUCT_INVALID');
  DMP_validText_(m.name, 3, 60, 'MANIFEST_NAME_INVALID'); DMP_price_(m.price, 'MANIFEST_PRICE_INVALID');
}
function DMP_equalTriple_(a, b) { return a.name === b.name && a.price === b.price && a.category === b.category; }
function DMP_price_(v, code) {
  DMP_assert_(typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 999999999 &&
    Math.abs(v * 100 - Math.round(v * 100)) < 0.00002, code);
  return v;
}
function DMP_validText_(s, min, max, code) {
  DMP_assert_(typeof s === 'string' && s.length >= min && s.length <= max && s.trim() === s &&
    !/[\u0000-\u001F\u007F]/.test(s) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s), code);
}
function DMP_blank_(v) { return v === '' || v === null || v === undefined; }
function DMP_text_(v) { return DMP_blank_(v) ? '' : String(v).trim().normalize('NFC'); }
function DMP_nameKey_(s) { return String(s).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX'); }
function DMP_escape_(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
function DMP_clone_(v) { return JSON.parse(JSON.stringify(v)); }
function DMP_keySort_(a,b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }
function DMP_rowSort_(a,b) { return a.row - b.row; }
function DMP_hashText_(s) { return DMP_digest_(Utilities.DigestAlgorithm.SHA_256, Utilities.newBlob(s).getBytes()); }
function DMP_hashBytes_(b) { return DMP_digest_(Utilities.DigestAlgorithm.SHA_256, b); }
function DMP_digest_(algorithm, bytes) { return Utilities.computeDigest(algorithm, bytes).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function DMP_id_() { return Utilities.getUuid(); }
function DMP_chunks_(s) {
  var chunks = [];
  for (var i = 0; i < s.length;) {
    var end = Math.min(i + DMP.chunkSize, s.length);
    if (end < s.length && /[\uD800-\uDBFF]/.test(s.charAt(end - 1))) end--;
    chunks.push(s.slice(i, end)); i = end;
  }
  return chunks;
}
function DMP_assert_(condition, code, row) { if (!condition) DMP_fail_(code, row); }
function DMP_fail_(code, row) { var error = new Error(code + (row ? ' (fila ' + row + ')' : '')); error.dmpCode = code; if (row) error.dmpRow = row; throw error; }
