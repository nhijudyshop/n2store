#!/bin/bash
# #Note: WEB2.0 - 1 NUT go bo agent cham cong DG-600 (dung + xoa autostart) tren Mac/Linux. Bam dup.
cd "$(dirname "$0")" || exit 1

echo ""
echo "============================================================"
echo "  GO BO CHAM CONG DG-600 (dung tien trinh + xoa autostart)"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[LOI] Chua cai Node.js."
  read -r -p "Enter de thoat..." _
  exit 1
fi

node setup.js --uninstall
echo ""
read -r -p "Enter de thoat..." _
