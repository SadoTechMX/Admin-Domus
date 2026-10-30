#!/bin/bash
set -e

# =============================================================================
# DOMUS OS · Instalador de Print Bridge (macOS LaunchAgent)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$HOME"
DOMUS_DIR="$HOME_DIR/.domus"
TOKEN_FILE="$DOMUS_DIR/print_bridge_token.txt"
PLIST_NAME="net.domus.printbridge.plist"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DEST="$HOME_DIR/Library/LaunchAgents/$PLIST_NAME"

echo "============================================================"
echo "🖨️  DOMUS OS · INSTALADOR DE LOCAL PRINT BRIDGE"
echo "============================================================"

# 1. Crear carpeta .domus con permisos restringidos
mkdir -p "$DOMUS_DIR"
chmod 700 "$DOMUS_DIR"
mkdir -p "$HOME_DIR/Library/LaunchAgents"

# 2. Generar token de seguridad si no existe
if [ ! -f "$TOKEN_FILE" ] || [ ! -s "$TOKEN_FILE" ]; then
    NEW_TOKEN="domus_prn_$(python3 -c "import secrets; print(secrets.token_hex(16))")"
    echo "$NEW_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "✓ Token generado en $TOKEN_FILE"
else
    chmod 600 "$TOKEN_FILE"
    echo "✓ Token existente conservado en $TOKEN_FILE"
fi

# 3. Copiar script de servidor a ~/.domus/
cp "$SCRIPT_DIR/server.py" "$DOMUS_DIR/server.py"
chmod +x "$DOMUS_DIR/server.py"
echo "✓ server.py copiado a $DOMUS_DIR/server.py"

# 4. Copiar archivo plist
cp "$PLIST_SRC" "$PLIST_DEST"
echo "✓ LaunchAgent copiado a $PLIST_DEST"

# 5. Detener instancia previa si estaba cargada
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# 6. Cargar LaunchAgent persistente
launchctl load -w "$PLIST_DEST"
echo "✓ LaunchAgent cargado en launchd"

# 7. Esperar a que el servicio responda en 127.0.0.1:17321
echo "Esperando inicio de DOMUS Print Bridge..."
ATTEMPTS=0
MAX_ATTEMPTS=10
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:17321/health || true)
    if [ "$HTTP_CODE" = "200" ]; then
        break
    fi
    sleep 1
    ATTEMPTS=$((ATTEMPTS + 1))
done

if [ "$HTTP_CODE" = "200" ]; then
    echo "============================================================"
    echo "🎉 DOMUS Print Bridge está ACTIVO y CORRIENDO en segundo plano"
    echo "URL de Servicio:  http://127.0.0.1:17321"
    echo "Impresora CUPS:   DOMUS_TICKETS"
    echo "Token file:       $TOKEN_FILE (0o600)"
    echo "Log:              $DOMUS_DIR/print_bridge.log"
    echo "============================================================"
    echo ""
    echo "Para emparejar DOMUS OS en Chrome:"
    echo "Copia el token desde $TOKEN_FILE y pégalo en Configuración de DOMUS OS."
    echo "============================================================"
else
    echo "⚠️ El servicio tardó más de lo esperado en arrancar."
    echo "Revisa el log en $DOMUS_DIR/print_bridge_error.log"
fi
