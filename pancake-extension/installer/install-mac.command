#!/bin/bash
# ============================================
#  N2Store Pancake Extension - Mac Installer
#  Double-click file nay de cai dat extension
# ============================================

clear
echo "=========================================="
echo "  N2Store Pancake Extension - Cai Dat"
echo "=========================================="
echo ""

# Detect script location (extension files should be in parent folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_SOURCE="$SCRIPT_DIR/.."

# Verify extension files exist
if [ ! -f "$EXT_SOURCE/manifest.json" ]; then
    # Try alternate: extension files in same folder as script
    if [ -f "$SCRIPT_DIR/manifest.json" ]; then
        EXT_SOURCE="$SCRIPT_DIR"
    else
        echo "LOI: Khong tim thay file manifest.json"
        echo "Dam bao file install-mac.command nam trong folder pancake-extension/"
        echo ""
        read -p "Nhan Enter de dong..."
        exit 1
    fi
fi

# Install location
INSTALL_DIR="$HOME/.n2store/pancake-extension"

echo "1. Dang copy extension vao: $INSTALL_DIR"
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"

# Copy all extension files
cp -R "$EXT_SOURCE/_locales" "$INSTALL_DIR/" 2>/dev/null
cp -R "$EXT_SOURCE/images" "$INSTALL_DIR/" 2>/dev/null
cp -R "$EXT_SOURCE/scripts" "$INSTALL_DIR/" 2>/dev/null
cp "$EXT_SOURCE/manifest.json" "$INSTALL_DIR/"
cp "$EXT_SOURCE/offscreen.html" "$INSTALL_DIR/" 2>/dev/null
cp "$EXT_SOURCE/pancext.html" "$INSTALL_DIR/" 2>/dev/null
cp "$EXT_SOURCE/sandbox.html" "$INSTALL_DIR/" 2>/dev/null

echo "   Da copy xong!"
echo ""

# Verify installation
if [ ! -f "$INSTALL_DIR/manifest.json" ]; then
    echo "LOI: Copy that bai!"
    read -p "Nhan Enter de dong..."
    exit 1
fi

VERSION=$(grep '"version"' "$INSTALL_DIR/manifest.json" | head -1 | sed 's/.*"version".*"\(.*\)".*/\1/')
echo "   Extension version: $VERSION"
echo ""

# Create Chrome launcher with --load-extension
LAUNCHER_PATH="$HOME/Desktop/N2Store Chrome.command"
cat > "$LAUNCHER_PATH" << 'LAUNCHER'
#!/bin/bash
# N2Store Chrome - Auto-load Pancake Extension
INSTALL_DIR="$HOME/.n2store/pancake-extension"
if [ -f "$INSTALL_DIR/manifest.json" ]; then
    open -a "Google Chrome" --args --load-extension="$INSTALL_DIR"
else
    echo "Extension chua cai dat. Chay install-mac.command truoc."
    open -a "Google Chrome"
fi
LAUNCHER
chmod +x "$LAUNCHER_PATH"

echo "2. Da tao shortcut: ~/Desktop/N2Store Chrome.command"
echo ""

# Check if Chrome is running
if pgrep -x "Google Chrome" > /dev/null; then
    echo "=========================================="
    echo "  HUONG DAN (Chrome dang mo):"
    echo "=========================================="
    echo ""
    echo "  Chrome dang chay nen KHONG the tu dong load extension."
    echo "  Ban can lam 1 trong 2 cach:"
    echo ""
    echo "  CACH 1 (De nhat - 30 giay):"
    echo "  1. Mo Chrome, go vao thanh dia chi: chrome://extensions"
    echo "  2. Bat 'Developer mode' (goc phai tren)"
    echo "  3. Nhan 'Load unpacked'"
    echo "  4. Chon folder: $INSTALL_DIR"
    echo "  5. Xong! Refresh trang inbox."
    echo ""
    echo "  CACH 2 (Tu dong - can tat Chrome):"
    echo "  1. Tat hoan toan Chrome (Cmd+Q)"
    echo "  2. Double-click 'N2Store Chrome' tren Desktop"
    echo ""

    # Auto-open chrome://extensions
    echo "Dang mo chrome://extensions cho ban..."
    open "chrome://extensions"
else
    echo "=========================================="
    echo "  Chrome chua mo. Dang khoi dong..."
    echo "=========================================="
    echo ""
    open -a "Google Chrome" --args --load-extension="$INSTALL_DIR"
    echo "  Da khoi dong Chrome voi extension!"
    echo "  Extension se tu dong load."
fi

echo ""
echo "=========================================="
echo "  CAI DAT HOAN TAT!"
echo "=========================================="
echo ""
echo "  Extension da luu tai: $INSTALL_DIR"
echo "  Shortcut tren Desktop: N2Store Chrome.command"
echo ""
echo "  Lan sau chi can double-click 'N2Store Chrome' tren Desktop"
echo "  de mo Chrome voi extension tu dong."
echo ""
read -p "Nhan Enter de dong..."
