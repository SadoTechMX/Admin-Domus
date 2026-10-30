#!/bin/bash
set -e

HOME_DIR="$HOME"
PLIST_NAME="net.domus.printbridge.plist"
PLIST_DEST="$HOME_DIR/Library/LaunchAgents/$PLIST_NAME"

echo "Desinstalando DOMUS Print Bridge LaunchAgent..."
launchctl unload "$PLIST_DEST" 2>/dev/null || true
rm -f "$PLIST_DEST"
echo "✓ LaunchAgent detenido y eliminado de $PLIST_DEST"
