#!/usr/bin/env python3
"""
DOMUS OS · Local Print Bridge
=============================================================================
Servicio local ligero para impresión térmica directa ESC/POS vía CUPS RAW
Escucha exclusivamente en 127.0.0.1:17321
Impresora fija: DOMUS_TICKETS
=============================================================================
"""

import http.server
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
MAX_PAYLOAD_BYTES = 1024 * 1024  # 1 MB
LINE_WIDTH = 42

DOMUS_DIR = pathlib.Path.home() / '.domus'
TOKEN_FILE = DOMUS_DIR / 'print_bridge_token.txt'
HISTORY_FILE = DOMUS_DIR / 'print_history.json'
MAX_HISTORY_ITEMS = 500

ALLOWED_ORIGIN_PATTERNS = [
    re.compile(r'^https://sadotechmx\.github\.io/?$'),
    re.compile(r'^https://script\.google\.com/?$'),
    re.compile(r'^https://[a-zA-Z0-9-]+\.script\.googleusercontent\.com/?$'),
    re.compile(r'^http://127\.0\.0\.1(:\d+)?/?$'),
    re.compile(r'^http://localhost(:\d+)?/?$'),
]


def ensure_token():
    DOMUS_DIR.mkdir(parents=True, exist_ok=True)
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding='utf-8').strip()
        if token:
            return token
    new_token = 'domus_prn_' + secrets.token_hex(16)
    TOKEN_FILE.write_text(new_token, encoding='utf-8')
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except Exception:
        pass
    return new_token


AUTH_TOKEN = ensure_token()


def load_history():
    if not HISTORY_FILE.exists():
        return {}
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_history(history):
    try:
        DOMUS_DIR.mkdir(parents=True, exist_ok=True)
        # Limitar a los MAX_HISTORY_ITEMS más recientes
        if len(history) > MAX_HISTORY_ITEMS:
            keys = list(history.keys())[-MAX_HISTORY_ITEMS:]
            history = {k: history[k] for k in keys}
        tmp_file = HISTORY_FILE.with_suffix('.tmp')
        with open(tmp_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, HISTORY_FILE)
    except Exception as e:
        print(f"[PRINT-BRIDGE] Error al guardar historial: {e}", file=sys.stderr)


def get_cups_status():
    installed = False
    enabled = False
    details = ""
    try:
        res = subprocess.run(
            [LPSTAT_PATH, '-p', PRINTER_NAME],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        if res.returncode == 0:
            installed = True
            details = res.stdout.strip()
            # En macOS CUPS en español: "está inactiva" = lista / esperando trabajo
            if 'inactiva' in details or 'idle' in details.lower() or 'activada' in details:
                enabled = True
        else:
            details = res.stderr.strip() or f"lpstat exited with {res.returncode}"
    except Exception as e:
        details = str(e)

    return {
        "ok": installed,
        "printer": PRINTER_NAME,
        "installed": installed,
        "enabled": enabled,
        "status": "READY" if (installed and enabled) else ("DISABLED" if installed else "NOT_FOUND"),
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
    return text.encode('cp850', errors='replace')


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
    method = str(data.get('method') or 'Efectivo')
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
    server_version = "DOMUSPrintBridge/1.0"

    def is_origin_allowed(self, origin):
        if not origin:
            return True
        for pat in ALLOWED_ORIGIN_PATTERNS:
            if pat.match(origin):
                return True
        return False

    def send_cors_headers(self):
        origin = self.headers.get('Origin', '')
        if self.is_origin_allowed(origin):
            self.send_header('Access-Control-Allow-Origin', origin if origin else '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Domus-Print-Token, Authorization')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Vary', 'Origin')

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    def check_auth(self):
        token = self.headers.get('X-Domus-Print-Token', '').strip()
        if not token:
            auth_h = self.headers.get('Authorization', '').strip()
            if auth_h.startswith('Bearer '):
                token = auth_h[7:].strip()
        if not token:
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            token = params.get('token', [''])[0].strip()

        return secrets.compare_digest(token, AUTH_TOKEN)

    def send_json(self, status_code, data):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/health':
            status = get_cups_status()
            self.send_json(HTTPStatus.OK, {
                "ok": True,
                "printer": PRINTER_NAME,
                "status": status.get("status", "READY"),
                "cups": "ONLINE" if status.get("installed") else "OFFLINE",
                "version": "1.0.0",
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
                    timeout=10,
                    check=False
                )
                if proc.returncode == 0:
                    self.send_json(HTTPStatus.OK, {
                        "ok": True,
                        "message": "Ticket de prueba enviado correctamente a DOMUS_TICKETS.",
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
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/print':
            if not self.check_auth():
                self.send_json(HTTPStatus.UNAUTHORIZED, {
                    "ok": False,
                    "error": "Token de impresión no autorizado o no especificado."
                })
                return

            try:
                content_len = int(self.headers.get('Content-Length', 0))
            except ValueError:
                content_len = 0

            if content_len > MAX_PAYLOAD_BYTES:
                self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {
                    "ok": False,
                    "error": "El tamaño del ticket excede el límite permitido de 1 MB."
                })
                return

            body_raw = self.rfile.read(content_len)
            try:
                data = json.loads(body_raw.decode('utf-8'))
            except Exception as e:
                self.send_json(HTTPStatus.BAD_REQUEST, {
                    "ok": False,
                    "error": f"Payload JSON inválido: {e}"
                })
                return

            print_id = str(data.get('printId') or '').strip()
            if not print_id:
                folio = str(data.get('receipt') or data.get('ticket') or '')
                print_id = f"PRINT-{folio}" if folio else f"PRINT-{int(time.time())}"

            is_reprint = bool(data.get('reprint'))
            history = load_history()

            if print_id in history and not is_reprint:
                # Idempotencia: no volver a imprimir
                self.send_json(HTTPStatus.OK, {
                    "ok": True,
                    "alreadyPrinted": True,
                    "printId": print_id,
                    "message": "Comprobante previamente impreso. Enviar reprint=true para copia."
                })
                return

            try:
                raw_bytes = build_receipt_escpos(data, is_reprint=is_reprint)
                proc = subprocess.run(
                    [LP_PATH, '-d', PRINTER_NAME, '-o', 'raw'],
                    input=raw_bytes,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=10,
                    check=False
                )

                if proc.returncode == 0:
                    history[print_id] = {
                        "printedAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                        "receipt": data.get('receipt'),
                        "ticket": data.get('ticket'),
                        "customer": data.get('customer'),
                        "reprints": history.get(print_id, {}).get("reprints", 0) + (1 if is_reprint else 0)
                    }
                    save_history(history)

                    self.send_json(HTTPStatus.OK, {
                        "ok": True,
                        "printed": True,
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

        else:
            self.send_json(HTTPStatus.NOT_FOUND, {
                "ok": False,
                "error": f"Ruta POST no encontrada: {path}"
            })

    def log_message(self, format, *args):
        # Log conciso y limpio sin datos sensibles
        sys.stderr.write(f"[DOMUS-PRINT] {self.address_string()} - {format % args}\n")


def run():
    print(f"============================================================")
    print(f"🖨️  DOMUS OS · Local Print Bridge v1.0.0")
    print(f"Host:       {HOST}:{PORT}")
    print(f"Impresora:  {PRINTER_NAME}")
    print(f"Token:      {AUTH_TOKEN}")
    print(f"Token file: {TOKEN_FILE}")
    print(f"============================================================")

    server = http.server.ThreadingHTTPServer((HOST, PORT), DomusPrintHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PRINT-BRIDGE] Deteniendo servidor...")
        server.server_close()


if __name__ == '__main__':
    run()
