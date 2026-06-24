#!/bin/bash
# #Note: WEB2.0 - 1 NUT cai dat agent cham cong DG-600 (ADMS proxy) tren Mac/Linux. Bam dup.
cd "$(dirname "$0")" || exit 1

echo ""
echo "============================================================"
echo "  CAI DAT CHAM CONG DG-600 (Web 2.0) - tu go ban cu + tu cai"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[LOI] Chua cai Node.js. Cai tai https://nodejs.org roi chay lai."
  read -r -p "Enter de thoat..." _
  exit 1
fi

node setup.js
RC=$?

echo ""
if [ "$RC" != "0" ]; then
  echo "[!] Co loi o tren (ma loi $RC). Doc cac dong [LOI]."
else
  echo "[OK] Hoan tat."
fi
read -r -p "Enter de thoat..." _
