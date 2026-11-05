#!/usr/bin/env python3
"""
DOMUS OS · Local Print & Cash Drawer Bridge
=============================================================================
Servicio local ligero para impresión térmica directa ESC/POS y control
del cajón de dinero (DK port) vía CUPS RAW.
Escucha exclusivamente en 127.0.0.1:17321
Impresora fija: DOMUS_TICKETS
=============================================================================
"""

import http.server
import threading
import hashlib
import json
import os
import pathlib
import re
import secrets
import subprocess
import sys
import time
import urllib.parse
from http import HTTPStatus

HOST = '127.0.0.1'
PORT = 17321
PRINTER_NAME = 'DOMUS_TICKETS'
LP_PATH = '/usr/bin/lp'
LPSTAT_PATH = '/usr/bin/lpstat'
MAX_PAYLOAD_BYTES = 64 * 1024  # 64 KB (P0-10)
LINE_WIDTH = 42

DOMUS_DIR = pathlib.Path.home() / '.domus'
TOKEN_FILE = DOMUS_DIR / 'print_bridge_token.txt'
HISTORY_FILE = DOMUS_DIR / 'print_history.json'
DRAWER_HISTORY_FILE = DOMUS_DIR / 'drawer_history.json'
CONFIG_FILE = DOMUS_DIR / 'config.json'
BRIDGE_LOCK = threading.RLock()

# P0-2: CORS estrictamente restringido a producción oficial y desarrollo local
ALLOWED_ORIGIN_PATTERNS = [
    re.compile(r'^https://sadotechmx\.github\.io/?$'),
    re.compile(r'^http://127\.0\.0\.1(:\d+)?/?$'),
    re.compile(r'^http://localhost(:\d+)?/?$'),
]

# ESC/POS Drawer Kick pulses (P0-7)
# Pin 2 (m=0): ESC p m t1 t2 -> \x1b\x70\x00\x19\xfa
# Pin 5 (m=1): ESC p m t1 t2 -> \x1b\x70\x01\x19\xfa
DRAWER_PULSE_CH0 = b'\x1b\x70\x00\x19\xfa'
DRAWER_PULSE_CH1 = b'\x1b\x70\x01\x19\xfa'


def ensure_secure_permissions():
    try:
        DOMUS_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(DOMUS_DIR, 0o700)
    except Exception:
        pass


def ensure_token():
    ensure_secure_permissions()
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding='utf-8').strip()
        if token:
            try:
                os.chmod(TOKEN_FILE, 0o600)
            except Exception:
                pass
            return token
    new_token = 'domus_prn_' + secrets.token_hex(16)
    TOKEN_FILE.write_text(new_token, encoding='utf-8')
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except Exception:
        pass
    return new_token


def load_config():
    if not CONFIG_FILE.exists():
        return {"drawer_channel": 0, "drawer_configured": False}
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {"drawer_channel": 0, "drawer_configured": False}


def save_config(cfg):
    try:
        ensure_secure_permissions()
        tmp = CONFIG_FILE.with_suffix('.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2)
        os.replace(tmp, CONFIG_FILE)
        os.chmod(CONFIG_FILE, 0o600)
    except Exception as e:
        sys.stderr.write(f"[DOMUS-PRINT] Error al guardar config: {e}\n")


def load_history():
    if not HISTORY_FILE.exists():
        return {}
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as exc:
        raise RuntimeError('Print history corrupt; manual recovery required') from exc


def save_history(history):
    try:
        ensure_secure_permissions()
        tmp_file = HISTORY_FILE.with_suffix('.tmp')
        with open(tmp_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, HISTORY_FILE)
        os.chmod(HISTORY_FILE, 0o600)
    except Exception as e:
        raise RuntimeError("Cannot persist print history; no safe automatic retry") from e


def load_drawer_history():
    if not DRAWER_HISTORY_FILE.exists():
        return {}
    try:
        with open(DRAWER_HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as exc:
        raise RuntimeError('Drawer history corrupt; manual recovery required') from exc


def save_drawer_history(history):
    try:
        ensure_secure_permissions()
        tmp_file = DRAWER_HISTORY_FILE.with_suffix('.tmp')
        with open(tmp_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, DRAWER_HISTORY_FILE)
        os.chmod(DRAWER_HISTORY_FILE, 0o600)
    except Exception as e:
        raise RuntimeError("Cannot persist drawer history; no safe automatic retry") from e


def get_cups_status():
    installed = False
    enabled = False
    details = ""
    queue_state = "UNKNOWN"
    try:
        res = subprocess.run(
            [LPSTAT_PATH, '-p', PRINTER_NAME],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
            check=False
        )
        if res.returncode == 0:
            installed = True
            details = res.stdout.strip()
            if 'inactiva' in details.lower() or 'idle' in details.lower() or 'activada' in details.lower():
                enabled = True
                queue_state = "READY"
            elif 'imprimiendo' in details.lower() or 'processing' in details.lower() or 'busy' in details.lower():
                enabled = True
                queue_state = "PROCESSING"
            else:
                queue_state = "STOPPED"
        else:
            details = res.stderr.strip() or f"lpstat exited with {res.returncode}"
            queue_state = "NOT_FOUND"
    except Exception as e:
        details = str(e)
        queue_state = "ERROR"

    return {
        "ok": installed,
        "printer": PRINTER_NAME,
        "cups": "AVAILABLE" if installed else "UNAVAILABLE",
        "queue": queue_state,
        "enabled": enabled,
        "details": details
    }


# =============================================================================
# FORMATO ESC/POS 80mm
# =============================================================================

def escpos_init():
    return b'\x1b@' + b'\x1bt\x02'  # ESC @ (init) + ESC t 2 (CP850)


def escpos_align(align='left'):
    if align == 'center':
        return b'\x1ba\x01'
    elif align == 'right':
        return b'\x1ba\x02'
    return b'\x1ba\x00'


def escpos_bold(enabled=True):
    return b'\x1bE\x01' if enabled else b'\x1bE\x00'


def escpos_text_size(double_height=False, double_width=False):
    byte_val = 0
    if double_height:
        byte_val |= 0x01
    if double_width:
        byte_val |= 0x10
    return bytes([0x1d, 0x21, byte_val])


def escpos_cut():
    return b'\n\n\n\n\x1dV\x00'


def encode_cp850(text):
    safe = ''.join(ch for ch in str(text) if ch == '\n' or (ord(ch) >= 32 and ord(ch) != 127))
    return safe.encode('cp850', errors='replace')


def fmt_two_columns(left, right, width=LINE_WIDTH):
    left = str(left)
    right = str(right)
    total_len = len(left) + len(right)
    if total_len >= width:
        available_left = max(1, width - len(right) - 1)
        left = left[:available_left]
    spaces = max(1, width - len(left) - len(right))
    return left + (' ' * spaces) + right


def build_receipt_escpos(data, is_reprint=False):
    buf = bytearray()
    buf.extend(escpos_init())

    # Encabezado centrado
    buf.extend(escpos_align('center'))
    buf.extend(escpos_bold(True))
    buf.extend(escpos_text_size(double_height=True, double_width=True))
    buf.extend(encode_cp850("DOMUS\n"))
    buf.extend(escpos_text_size(False, False))
    buf.extend(encode_cp850("CENTRO CONTRACULTURAL\n"))
    buf.extend(escpos_bold(False))
    buf.extend(encode_cp850("Caja · Barra · Cocina · Accesos\n"))
    buf.extend(encode_cp850("==========================================\n"))

    if is_reprint:
        buf.extend(escpos_bold(True))
        buf.extend(encode_cp850("*** COPIA / REIMPRESIÓN AUTORIZADA ***\n"))
        buf.extend(escpos_bold(False))
        buf.extend(encode_cp850("------------------------------------------\n"))

    method = str(data.get('method') or 'Efectivo')
    payment_status = str(data.get('paymentStatus') or data.get('status') or '').upper()
    is_transfer = (method.lower() == 'transferencia') or ('transferencia' in method.lower())
    is_pending_transfer = is_transfer and (payment_status != 'CONFIRMADO')

    # P0-4: Advertencia destacada para pagos por transferencia pendientes de verificación
    if is_pending_transfer or (is_transfer and not data.get('verified')):
        buf.extend(escpos_bold(True))
        buf.extend(encode_cp850("*** PAGO POR TRANSFERENCIA PENDIENTE DE VERIFICACIÓN ***\n"))
        buf.extend(escpos_bold(False))
        buf.extend(encode_cp850("------------------------------------------\n"))

    # Metadatos alineados a la izquierda
    buf.extend(escpos_align('left'))
    folio = str(data.get('receipt') or data.get('ticket') or 'S/F')
    cuenta = str(data.get('ticket') or '')
    cliente = str(data.get('customer') or 'Público general')
    fecha = str(data.get('date') or time.strftime('%d/%m/%Y %H:%M'))
    operador = str(data.get('operator') or 'Caja DOMUS')

    buf.extend(encode_cp850(fmt_two_columns("FOLIO:", folio) + "\n"))
    if cuenta and cuenta != folio:
        buf.extend(encode_cp850(fmt_two_columns("CUENTA:", cuenta) + "\n"))
    buf.extend(encode_cp850(fmt_two_columns("CLIENTE:", cliente) + "\n"))
    buf.extend(encode_cp850(fmt_two_columns("FECHA:", fecha) + "\n"))
    buf.extend(encode_cp850(fmt_two_columns("ATENDIÓ:", operador) + "\n"))
    buf.extend(encode_cp850("------------------------------------------\n"))

    # Tabla de productos
    buf.extend(escpos_bold(True))
    buf.extend(encode_cp850(fmt_two_columns("CANT  DESCRIPCIÓN", "TOTAL") + "\n"))
    buf.extend(escpos_bold(False))
    buf.extend(encode_cp850("------------------------------------------\n"))

    items = data.get('items') or []
    for it in items:
        qty = it.get('qty', 1)
        name = str(it.get('name') or 'Producto')
        price = float(it.get('price', 0))
        subtotal = price * qty
        left_desc = f"{qty}x {name}"
        right_sub = f"${subtotal:,.2f}"
        buf.extend(encode_cp850(fmt_two_columns(left_desc, right_sub) + "\n"))

    buf.extend(encode_cp850("------------------------------------------\n"))

    # Totales y Pago
    total = float(data.get('total') or data.get('expectedTotal') or 0)
    received = data.get('received')
    tip = float(data.get('tip') or 0)
    change = data.get('change')

    buf.extend(escpos_bold(True))
    buf.extend(escpos_text_size(double_height=True, double_width=False))
    buf.extend(encode_cp850(fmt_two_columns("TOTAL:", f"${total:,.2f}") + "\n"))
    buf.extend(escpos_text_size(False, False))
    buf.extend(escpos_bold(False))

    buf.extend(encode_cp850(fmt_two_columns("MÉTODO:", method) + "\n"))
    if method == 'Efectivo' and received is not None:
        try:
            rec_val = float(received)
            buf.extend(encode_cp850(fmt_two_columns("RECIBIDO:", f"${rec_val:,.2f}") + "\n"))
            if tip > 0:
                buf.extend(encode_cp850(fmt_two_columns("PROPINA:", f"${tip:,.2f}") + "\n"))
            if change is not None:
                chg_val = float(change)
                buf.extend(encode_cp850(fmt_two_columns("CAMBIO:", f"${chg_val:,.2f}") + "\n"))
        except ValueError:
            pass

    # Pie de ticket
    buf.extend(encode_cp850("==========================================\n"))
    buf.extend(escpos_align('center'))
    buf.extend(encode_cp850("Gracias por habitar DOMUS.\n"))
    buf.extend(encode_cp850("cultura · comunidad · encuentro\n"))
    buf.extend(escpos_cut())

    return bytes(buf)


def build_test_escpos():
    buf = bytearray()
    buf.extend(escpos_init())
    buf.extend(escpos_align('center'))
    buf.extend(escpos_bold(True))
    buf.extend(escpos_text_size(double_height=True, double_width=True))
    buf.extend(encode_cp850("DOMUS\n"))
    buf.extend(escpos_text_size(False, False))
    buf.extend(encode_cp850("CENTRO CONTRACULTURAL\n"))
    buf.extend(escpos_bold(False))
    buf.extend(encode_cp850("==========================================\n"))
    buf.extend(escpos_bold(True))
    buf.extend(encode_cp850("PRUEBA DE IMPRESIÓN DIRECTA\n"))
    buf.extend(escpos_bold(False))
    buf.extend(encode_cp850("DOMUS Print Bridge · macOS CUPS RAW\n"))
    buf.extend(encode_cp850(f"Fecha: {time.strftime('%d/%m/%Y %H:%M:%S')}\n"))
    buf.extend(encode_cp850("------------------------------------------\n"))
    buf.extend(escpos_align('left'))
    buf.extend(encode_cp850("Prueba de caracteres especiales en español:\n"))
    buf.extend(encode_cp850("á é í ó ú ñ Ñ ¿ ¡ Café Piña Jalapeño\n"))
    buf.extend(encode_cp850("------------------------------------------\n"))
    buf.extend(escpos_align('center'))
    buf.extend(encode_cp850("✓ Impresora térmica funcionando al 100%\n"))
    buf.extend(encode_cp850("==========================================\n"))
    buf.extend(escpos_cut())
    return bytes(buf)


# =============================================================================
# MANEJADOR HTTP CON CORS & PRIVATE NETWORK ACCESS
# =============================================================================

class DomusPrintHandler(http.server.BaseHTTPRequestHandler):
    server_version = "DOMUSPrintBridge/1.1.0"

    def is_origin_allowed(self, origin):
        if not origin:
            return True
        for pat in ALLOWED_ORIGIN_PATTERNS:
            if pat.match(origin):
                return True
        return False

    def send_cors_headers(self):
        origin = self.headers.get('Origin', '')
        if origin and self.is_origin_allowed(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Domus-Print-Token, Authorization')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Vary', 'Origin')

    def do_OPTIONS(self):
        origin = self.headers.get('Origin', '')
        # P0-2: OPTIONS debe validar origen antes de responder permisos PNA
        if origin and not self.is_origin_allowed(origin):
            self.send_error(HTTPStatus.FORBIDDEN, f"Origen no autorizado: {origin}")
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    def check_origin(self):
        origin = self.headers.get('Origin', '')
        if origin and not self.is_origin_allowed(origin):
            self.send_json(HTTPStatus.FORBIDDEN, {
                "ok": False,
                "error": f"Origen no autorizado: {origin}"
            })
            return False
        return True

    def check_auth(self):
        token = self.headers.get('X-Domus-Print-Token', '').strip()
        if not token:
            auth_h = self.headers.get('Authorization', '').strip()
            if auth_h.startswith('Bearer '):
                token = auth_h[7:].strip()

        if not token:
            return False

        current_token = ensure_token()
        return secrets.compare_digest(token, current_token)

    def send_json(self, status_code, data):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json_body(self):
        try:
            content_len = int(self.headers.get('Content-Length', 0))
        except ValueError:
            content_len = 0

        if content_len <= 0 or content_len > MAX_PAYLOAD_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {
                "ok": False,
                "error": f"El tamaño del payload ({content_len} B) excede el límite permitido de {MAX_PAYLOAD_BYTES} B."
            })
            return None

        body_raw = self.rfile.read(content_len)
        try:
            parsed = json.loads(body_raw.decode('utf-8'))
            if not isinstance(parsed, dict):
                raise ValueError('JSON object required')
            return parsed
        except Exception as e:
            self.send_json(HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": f"Payload JSON inválido: {e}"
            })
            return None

    def do_GET(self):
        if not self.check_origin():
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/health':
            status = get_cups_status()
            cfg = load_config()
            self.send_json(HTTPStatus.OK, {
                "ok": True,
                "bridge": "ONLINE",
                "printer": PRINTER_NAME,
                "cups": status.get("cups", "UNAVAILABLE"),
                "queue": status.get("queue", "UNKNOWN"),
                "drawerConfigured": bool(cfg.get("drawer_configured", False)),
                "drawerChannel": int(cfg.get("drawer_channel", 0)),
                "version": "1.1.0",
                "authenticated": self.check_auth()
            })
            return

        elif path == '/printers/status':
            status = get_cups_status()
            self.send_json(HTTPStatus.OK, status)
            return

        elif path == '/test-print':
            if not self.check_auth():
                self.send_json(HTTPStatus.UNAUTHORIZED, {
                    "ok": False,
                    "error": "Token de impresión no autorizado o no especificado."
                })
                return
            try:
                raw_bytes = build_test_escpos()
                proc = subprocess.run(
                    [LP_PATH, '-d', PRINTER_NAME, '-o', 'raw'],
                    input=raw_bytes,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=5,
                    check=False
                )
                if proc.returncode == 0:
                    self.send_json(HTTPStatus.OK, {
                        "ok": True,
                        "queued": True,
                        "message": "Ticket de prueba encolado en CUPS para DOMUS_TICKETS.",
                        "printer": PRINTER_NAME
                    })
                else:
                    err_msg = proc.stderr.decode('utf-8', errors='replace').strip()
                    self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                        "ok": False,
                        "error": f"Error CUPS al imprimir: {err_msg}"
                    })
            except Exception as e:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": str(e)
                })
            return

        else:
            self.send_json(HTTPStatus.NOT_FOUND, {
                "ok": False,
                "error": f"Ruta no encontrada: {path}"
            })

    def do_POST(self):
        with BRIDGE_LOCK:
            self._do_POST_locked()

    def _do_POST_locked(self):
        if not self.check_origin():
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # ---------------------------------------------------------------------
        # POST /print (Impresión Térmica)
        # ---------------------------------------------------------------------
        if path == '/print':
            if not self.check_auth():
                self.send_json(HTTPStatus.UNAUTHORIZED, {
                    "ok": False,
                    "error": "Token de impresión no autorizado o no especificado."
                })
                return

            data = self.read_json_body()
            if data is None:
                return

            print_id = str(data.get('printId') or '').strip()
            if not print_id:
                self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "printId requerido; no se imprime sin intención durable."})
                return

            is_reprint = bool(data.get('reprint'))
            history = load_history()

            if print_id in history:
                if history[print_id].get('status') != 'QUEUED':
                    self.send_json(HTTPStatus.CONFLICT, {"ok": False, "error": "PRINT_REQUIRES_REVIEW: envío previo sin confirmación; no repetir automáticamente."})
                    return
                # Idempotencia: no volver a encolar trabajo duplicado
                self.send_json(HTTPStatus.OK, {
                    "ok": True,
                    "alreadyPrinted": True,
                    "printId": print_id,
                    "message": "Comprobante previamente encolado. Enviar reprint=true para copia."
                })
                return

            try:
                history[print_id] = {"status": "SENDING", "receipt": data.get('receipt'), "queuedAt": time.time()}
                save_history(history)
                raw_bytes = build_receipt_escpos(data, is_reprint=is_reprint)
                proc = subprocess.run(
                    [LP_PATH, '-d', PRINTER_NAME, '-o', 'raw'],
                    input=raw_bytes,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=5,
                    check=False
                )

                if proc.returncode == 0:
                    history[print_id] = {
                        "status": "QUEUED",
                        "queuedAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                        "receipt": data.get('receipt'),
                        "ticket": data.get('ticket'),
                        "customer": data.get('customer'),
                        "reprints": history.get(print_id, {}).get("reprints", 0) + (1 if is_reprint else 0)
                    }
                    save_history(history)

                    # P0-3: Semántica real: QUEUED (no afirmar impresión física certificada)
                    self.send_json(HTTPStatus.OK, {
                        "ok": True,
                        "queued": True,
                        "printId": print_id,
                        "reprint": is_reprint,
                        "printer": PRINTER_NAME
                    })
                else:
                    err_msg = proc.stderr.decode('utf-8', errors='replace').strip()
                    self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                        "ok": False,
                        "error": f"Error de impresión CUPS: {err_msg}"
                    })

            except subprocess.TimeoutExpired:
                self.send_json(HTTPStatus.GATEWAY_TIMEOUT, {
                    "ok": False,
                    "error": "Timeout esperando respuesta de CUPS."
                })
            except Exception as e:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": f"Fallo al procesar ticket: {e}"
                })
            return

        # ---------------------------------------------------------------------
        # POST /drawer/open (Apertura de Cajón)
        # ---------------------------------------------------------------------
        elif path == '/drawer/open':
            if not self.check_auth():
                self.send_json(HTTPStatus.UNAUTHORIZED, {
                    "ok": False,
                    "error": "Token de Print Bridge no autorizado o no especificado."
                })
                return

            data = self.read_json_body()
            if data is None:
                return

            req_id = str(data.get('requestId') or '').strip()
            if not req_id:
                self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "requestId requerido."})
                return

            reason = str(data.get('reason') or 'MANUAL').strip().upper()
            receipt = str(data.get('receipt') or '').strip()
            operator = str(data.get('operator') or '').strip()
            if not operator or reason not in ('MANUAL', 'CASH_PAYMENT'):
                self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Operador y motivo válidos requeridos."})
                return
            if reason == 'CASH_PAYMENT' and (data.get('method') != 'Efectivo' or data.get('paid') is not True or not receipt or data.get('reprint')):
                self.send_json(HTTPStatus.CONFLICT, {"ok": False, "error": "Solo efectivo confirmado con recibo real abre automáticamente."})
                return
            if reason == 'MANUAL' and data.get('confirmed') is not True:
                self.send_json(HTTPStatus.CONFLICT, {"ok": False, "error": "Confirmación manual requerida."})
                return

            drawer_history = load_drawer_history()
            if req_id in drawer_history:
                if drawer_history[req_id].get('result') != 'PULSE_QUEUED':
                    self.send_json(HTTPStatus.CONFLICT, {"ok": False, "error": "DRAWER_REQUIRES_REVIEW: no repetir pulso incierto."})
                    return
                # Idempotencia: pulso ya emitido previamente
                self.send_json(HTTPStatus.OK, {
                    "ok": True,
                    "alreadyTriggered": True,
                    "requestId": req_id,
                    "message": "Apertura de cajón previamente procesada para este requestId."
                })
                return

            last_trigger = max((float(x.get('monotonicEpoch', 0)) for x in drawer_history.values()), default=0)
            if time.time() - last_trigger < 3:
                self.send_json(HTTPStatus.TOO_MANY_REQUESTS, {"ok": False, "error": "Cooldown de cajón activo."})
                return
            cfg = load_config()
            if reason == 'CASH_PAYMENT' and not cfg.get('drawer_configured', False):
                self.send_json(HTTPStatus.CONFLICT, {
                    "ok": False,
                    "drawerConfigured": False,
                    "error": "El cajón no ha sido verificado físicamente (drawer_configured: false). Auto-apertura en venta omitida."
                })
                return

            ch = int(cfg.get('drawer_channel', 0))
            pulse = DRAWER_PULSE_CH1 if ch == 1 else DRAWER_PULSE_CH0

            try:
                drawer_history[req_id] = {"result": "SENDING", "receipt": receipt, "operator": operator, "reason": reason, "monotonicEpoch": time.time()}
                save_drawer_history(drawer_history)
                proc = subprocess.run(
                    [LP_PATH, '-d', PRINTER_NAME, '-o', 'raw'],
                    input=pulse,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=5,
                    check=False
                )

                if proc.returncode == 0:
                    drawer_history[req_id] = {
                        "requestId": req_id,
                        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                        "reason": reason,
                        "receipt": receipt,
                        "operator": operator,
                        "result": "PULSE_QUEUED",
                        "monotonicEpoch": time.time(),
                        "channel": ch
                    }
                    save_drawer_history(drawer_history)

                    self.send_json(HTTPStatus.OK, {
                        "ok": True,
                        "pulseSent": True,
                        "requestId": req_id,
                        "channel": ch,
                        "reason": reason,
                        "printer": PRINTER_NAME
                    })
                else:
                    err_msg = proc.stderr.decode('utf-8', errors='replace').strip()
                    self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                        "ok": False,
                        "error": f"Fallo al enviar pulso a cajón vía CUPS: {err_msg}"
                    })
            except subprocess.TimeoutExpired:
                self.send_json(HTTPStatus.GATEWAY_TIMEOUT, {
                    "ok": False,
                    "error": "Timeout esperando respuesta de CUPS al abrir cajón."
                })
            except Exception as e:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": f"Error al procesar apertura de cajón: {e}"
                })
            return

        # ---------------------------------------------------------------------
        # POST /drawer/test (Pulso de prueba de canal específico)
        # ---------------------------------------------------------------------
        elif path == '/drawer/test':
            if not self.check_auth():
                self.send_json(HTTPStatus.UNAUTHORIZED, {
                    "ok": False,
                    "error": "Token no autorizado."
                })
                return

            data = self.read_json_body() or {}
            ch = int(data.get('channel', 0))
            pulse = DRAWER_PULSE_CH1 if ch == 1 else DRAWER_PULSE_CH0

            try:
                proc = subprocess.run(
                    [LP_PATH, '-d', PRINTER_NAME, '-o', 'raw'],
                    input=pulse,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=5,
                    check=False
                )
                if proc.returncode == 0:
                    self.send_json(HTTPStatus.OK, {
                        "ok": True,
                        "pulseSent": True,
                        "channel": ch,
                        "message": f"Pulso enviado al canal m={ch}. Requiere verificación física."
                    })
                else:
                    err_msg = proc.stderr.decode('utf-8', errors='replace').strip()
                    self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                        "ok": False,
                        "error": f"Error CUPS: {err_msg}"
                    })
            except Exception as e:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": str(e)
                })
            return

        # ---------------------------------------------------------------------
        # POST /drawer/confirm (Confirmación física de canal funcional)
        # ---------------------------------------------------------------------
        elif path == '/drawer/confirm':
            if not self.check_auth():
                self.send_json(HTTPStatus.UNAUTHORIZED, {
                    "ok": False,
                    "error": "Token no autorizado."
                })
                return

            data = self.read_json_body() or {}
            ch = int(data.get('channel', 0))
            confirmed = bool(data.get('confirmed', False))

            cfg = load_config()
            cfg['drawer_channel'] = ch
            if confirmed:
                cfg['drawer_configured'] = True
                cfg['physical_confirmed_at'] = data.get('operator_timestamp') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                cfg['physical_confirmed_by'] = data.get('operator') or 'Operador DOMUS'
            else:
                cfg['drawer_configured'] = False
                cfg['physical_confirmed_at'] = None
                cfg['physical_confirmed_by'] = None

            save_config(cfg)

            self.send_json(HTTPStatus.OK, {
                "ok": True,
                "drawerConfigured": cfg['drawer_configured'],
                "drawerChannel": ch,
                "physicalConfirmedAt": cfg.get('physical_confirmed_at'),
                "physicalConfirmedBy": cfg.get('physical_confirmed_by'),
                "message": (
                    f"Cajón confirmado físicamente en canal {ch} por {cfg['physical_confirmed_by']}."
                    if cfg['drawer_configured']
                    else f"Canal {ch} NO confirmado físicamente (drawer_configured: false)."
                )
            })
            return

        else:
            self.send_json(HTTPStatus.NOT_FOUND, {
                "ok": False,
                "error": f"Ruta POST no encontrada: {path}"
            })

    def log_message(self, format, *args):
        sys.stderr.write("[DOMUS-PRINT] %s %s\n" % (self.command, urllib.parse.urlparse(self.path).path))


def run():
    ensure_secure_permissions()
    cfg = load_config()
    print(f"============================================================")
    print(f"🖨️  DOMUS OS · Local Print & Cash Drawer Bridge v1.1.0")
    print(f"Host:           {HOST}:{PORT}")
    print(f"Impresora:      {PRINTER_NAME}")
    print(f"Token file:     {TOKEN_FILE} (0o600)")
    print(f"Cajón canal:    m={cfg.get('drawer_channel', 0)} (Verificado: {cfg.get('drawer_configured', False)})")
    print(f"============================================================")

    server = http.server.ThreadingHTTPServer((HOST, PORT), DomusPrintHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PRINT-BRIDGE] Deteniendo servidor...")
        server.server_close()


if __name__ == '__main__':
    run()
