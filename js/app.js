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
    { name: 'Carta Blanca · BAR-004', group: 'Cerveza', price: 50, priceSolar: 50, priceLunar: 50, destination: 'Barra' },
    { name: 'Modelo Especial - lata 473 ml', group: 'Cerveza', price: 70, priceSolar: 70, priceLunar: 75, destination: 'Barra' },
    { name: 'Negra Modelo - lata 473 ml', group: 'Cerveza', price: 70, priceSolar: 70, priceLunar: 75, destination: 'Barra' },
    { name: 'Onírica IPA - lata artesanal', group: 'Cerveza', price: 95, priceSolar: 95, priceLunar: 100, destination: 'Barra' },
    { name: 'Jujutsu-shi - Nobara', group: 'Alimentos', price: 140, priceSolar: 140, priceLunar: 150, destination: 'Cocina' },
    { name: 'Roll Tempura DOMUS Especial', group: 'Alimentos', price: 160, priceSolar: 160, priceLunar: 170, destination: 'Cocina' },
    { name: 'Edamames Sal Marina', group: 'Alimentos', price: 75, priceSolar: 75, priceLunar: 80, destination: 'Cocina' },
    { name: 'Mezcalina Frutos Rojos', group: 'Cócteles', price: 120, priceSolar: 120, priceLunar: 130, destination: 'Barra' },
    { name: 'Gin Tonic Botánico', group: 'Cócteles', price: 110, priceSolar: 110, priceLunar: 120, destination: 'Barra' },
    { name: 'Flor de Colección · Indica 1g', group: 'Cannábicos', price: 150, priceSolar: 150, priceLunar: 150, destination: 'Barra' },
    { name: 'Gummies Infundidos 25mg (Pack 4)', group: 'Cannábicos', price: 180, priceSolar: 180, priceLunar: 180, destination: 'Barra' },
    { name: 'Pre-roll Artesanal DOMUS Blend', group: 'Cannábicos', price: 100, priceSolar: 100, priceLunar: 100, destination: 'Barra' },
    { name: 'Agua Mineral Topo Chico 355 ml', group: 'Bebidas', price: 40, priceSolar: 40, priceLunar: 45, destination: 'Barra' },
    { name: 'Kombucha de la Casa 330 ml', group: 'Bebidas', price: 65, priceSolar: 65, priceLunar: 70, destination: 'Barra' }
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

  // --- RUTA Y NAVEGACIÓN ---
  function initRouting() {
    const params = new URLSearchParams(window.location.search);
    const vista = params.get('vista');
    if (vista === 'comandas') {
      setMode('comandas', false);
    } else if (vista === 'caja') {
      setMode('caja', false);
    } else {
      const saved = localStorage.getItem('domus_view');
      setMode(saved || 'caja', false);
    }
  }

  function setMode(newMode, updateUrl = true) {
    STATE.mode = newMode;
    localStorage.setItem('domus_view', newMode);

    if (updateUrl) {
      const url = new URL(window.location);
      url.searchParams.set('vista', newMode);
      window.history.replaceState({}, '', url);
    }

    $('btnModeCaja').classList.toggle('active', newMode === 'caja');
    $('btnModeComandas').classList.toggle('active', newMode === 'comandas');

    $('viewCaja').classList.toggle('hidden', newMode !== 'caja');
    $('viewComandas').classList.toggle('hidden', newMode !== 'comandas');

    if (newMode === 'comandas') {
      renderComandasBoard();
    } else {
      renderCatalog();
    }
  }

  // --- COMUNICACIÓN CON BACKEND (GAS / REST / SIMULADOR) ---
  function callBackend(fnName, args, onSuccess, onError) {
    STATE.isSyncing = true;
    updateSyncPill();

    // 1. Modo nativo dentro de Google Apps Script Web App
    if (STATE.isNativeGas && window.google && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(res => {
          STATE.isSyncing = false;
          STATE.lastSyncTimestamp = Date.now();
          updateSyncPill();
          onSuccess(res);
        })
        .withFailureHandler(err => {
          STATE.isSyncing = false;
          updateSyncPill('error');
          onError(err);
        })[fnName](...args);
      return;
    }

    // 2. Modo externo (GitHub Pages con API fetch al Web App de Apps Script)
    if (STATE.apiUrl && !STATE.isDemoMode) {
      const endpoint = `${STATE.apiUrl}?action=${encodeURIComponent(fnName)}`;
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: fnName, args: args })
      })
      .then(res => res.json())
      .then(json => {
        STATE.isSyncing = false;
        STATE.lastSyncTimestamp = Date.now();
        updateSyncPill();
        if (json.error) throw new Error(json.error);
        onSuccess(json.data || json);
      })
      .catch(err => {
        // Fallback a Demo si la API de Google falla (por CORS o sin auth de Workspace)
        console.warn('Fallo de conexión en vivo con Apps Script, operando en simulador DOMUS:', err);
        STATE.isDemoMode = true;
        STATE.isSyncing = false;
        updateSyncPill('warn');
        runSimulatedCall(fnName, args, onSuccess, onError);
      });
      return;
    }

    // 3. Modo Simulador DOMUS (offline o demo)
    runSimulatedCall(fnName, args, onSuccess, onError);
  }

  function runSimulatedCall(fnName, args, onSuccess, onError) {
    setTimeout(() => {
      STATE.isSyncing = false;
      STATE.lastSyncTimestamp = Date.now();
      updateSyncPill('warn');

      if (fnName === 'cajaSimpleDatos') {
        onSuccess({
          phase: STATE.phase,
          products: STATE.products.map(p => ({
            name: p.name,
            group: p.group,
            price: STATE.phase === 'Solar' ? (p.priceSolar || p.price) : (p.priceLunar || p.price)
          })),
          accounts: STATE.openAccounts,
          activities: STATE.activities,
          lastReceipt: STATE.lastReceiptInfo || 'Simulación activa · Listo para registrar ventas',
          canCourtesy: true
        });
      } else if (fnName === 'cajaSimpleRegistrar') {
        const p = args[0];
        const ticket = p.ticket || `CTA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const folio = `R-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        
        // Agregar comanda a la lista de comandas
        const batchId = `B-${Date.now().toString(36)}`;
        p.items.forEach((item, idx) => {
          for (let i = 0; i < item.qty; i++) {
            STATE.comandas.unshift({
              key: `DCS-SIM-${Date.now()}-${idx}-${i}`,
              version: '1',
              id: `C2-${String(Math.floor(Math.random() * 8000) + 1000)}`,
              ticket: ticket,
              batch: batchId,
              alias: p.customer,
              product: item.name,
              notes: item.courtesy ? 'CORTESÍA AUTORIZADA' : '',
              destination: item.destination || (item.group === 'Alimentos' ? 'Cocina' : 'Barra'),
              state: 'Pendiente',
              responsible: '',
              sent: Date.now(),
              credit: p.credit === 'Amigo' || p.credit === 'Creador de proyecto',
              incident: ''
            });
          }
        });

        // Actualizar o crear cuenta abierta
        if (!p.paid) {
          STATE.openAccounts.unshift({
            ticket: ticket,
            customer: p.customer,
            activity: p.activity || 'Visita general DOMUS',
            due: p.expectedTotal,
            credit: p.credit,
            closed: false
          });
        }

        STATE.lastReceiptInfo = `Último cobro: ${p.customer} · ${money(p.expectedTotal)} · ${p.method || 'Pendiente'}`;
        playChime('success');
        updateKdsBadgeCount();

        onSuccess({
          ticket: ticket,
          receipt: p.paid ? folio : '',
          paid: !!p.paid,
          message: `${p.customer} · ${p.paid ? 'PAGO REGISTRADO ' + folio : 'Pedido enviado a comanda (pago pendiente)'}\nCuenta: ${ticket}\nPendiente: ${money(p.paid ? 0 : p.expectedTotal)}`
        });
      } else if (fnName === 'comandasSimpleDatos') {
        onSuccess({
          version: 'Comandas Simple 2.0',
          at: Date.now(),
          mirrorSync: STATE.isDemoMode ? 'Modo Demostración / Simulador Local' : 'Conectado a Google Sheets',
          team: STAFF_MEMBERS,
          orders: STATE.comandas,
          history: STATE.historyComandas,
          requests: STATE.restockRequests,
          issues: []
        });
      } else if (fnName === 'comandasSimpleAccion') {
        const body = args[1];
        const ord = STATE.comandas.find(o => o.key === body.key);
        if (!ord) {
          onError(new Error('Comanda no encontrada en el tablero.'));
          return;
        }

        if (body.action === 'TOMAR') {
          // Asigna el lote completo
          STATE.comandas.filter(o => o.batch === ord.batch).forEach(o => {
            o.state = 'En preparación';
            o.responsible = body.operator;
            o.version = String(Number(o.version) + 1);
          });
        } else if (body.action === 'LISTA') {
          ord.state = 'Lista';
          ord.version = String(Number(ord.version) + 1);
        } else if (body.action === 'ENTREGAR') {
          ord.state = 'Entregada';
          ord.delivered = Date.now();
          STATE.historyComandas.unshift(ord);
          STATE.comandas = STATE.comandas.filter(o => o.key !== ord.key);
        } else if (body.action === 'ALMACEN' || body.action === 'AGOTADO') {
          ord.incident = body.action === 'ALMACEN' ? 'Reponer de almacén' : 'Agotado en DOMUS';
          const reqId = `RES-${Date.now().toString(36).toUpperCase()}`;
          STATE.restockRequests.unshift({
            id: reqId,
            product: ord.product,
            type: ord.incident,
            created: Date.now()
          });
        }
        playChime('success');
        updateKdsBadgeCount();
        onSuccess({ ok: true, message: `Acción ${body.action} aplicada correctamente.` });
      } else if (fnName === 'comandasSimpleResolver') {
        const body = args[1];
        STATE.restockRequests = STATE.restockRequests.filter(r => r.id !== body.id);
        STATE.comandas.forEach(o => {
          if (o.incident) o.incident = '';
        });
        onSuccess({ ok: true, message: 'Disponibilidad confirmada.' });
      } else {
        onSuccess({ ok: true });
      }
    }, 150);
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
    STATE.products = DEFAULT_CATALOG;
    STATE.comandas = [...DEFAULT_ORDERS];
    renderStaffDropdown();
    renderCategoryChips();
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

    callBackend('comandasSimpleDatos', [sessionStorage.getItem('domus_token') || ''], d => {
      if (d.orders) {
        // Detectar si llegaron órdenes nuevas para sonar beep
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
      const matchCat = STATE.catalogCategory === 'Todas' || p.group === STATE.catalogCategory;
      const matchQuery = !query || p.name.toLowerCase().includes(query) || p.group.toLowerCase().includes(query);
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
            <span class="card-cat-badge">${p.group}</span>
            <h3 class="card-title">${p.name}</h3>
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
        group: product.group,
        destination: product.destination || (product.group === 'Alimentos' ? 'Cocina' : 'Barra'),
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
    STATE.apiUrl = url;
    localStorage.setItem('domus_gas_url', url);
    STATE.isDemoMode = false;
    $('configModal').classList.remove('open');
    toast('Configuración guardada. Probando conexión…', 'ok');
    syncBackendData();
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Mode Switcher
    $('btnModeCaja').addEventListener('click', () => setMode('caja'));
    $('btnModeComandas').addEventListener('click', () => setMode('comandas'));

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
    resolveRestock: resolveRestock
  };

})();
