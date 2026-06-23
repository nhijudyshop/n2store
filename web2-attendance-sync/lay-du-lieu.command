#!/bin/bash
# WEB2.0 — LẤY DỮ LIỆU CHẤM CÔNG 1 LẦN (bấm nút lấy). Bấm đúp khi muốn lấy.
# Phải cùng mạng LAN với máy chấm công. Tự dò IP máy.
cd "$(dirname "$0")" || exit 1

if [ ! -f config.json ]; then
  cp config.example.json config.json 2>/dev/null
  echo "Mở config.json dán secret WEB2_ATTENDANCE_SECRET rồi chạy lại."
  read -r -p "Enter để thoát…" _
  exit 1
fi
if [ ! -d node_modules/node-zklib ]; then
  echo "Cài thư viện lần đầu…"; npm install || { read -r -p "Lỗi npm. Enter…" _; exit 1; }
fi

echo "Đang lấy dữ liệu chấm công (1 lần)…"
node sync.js --once
echo ""
echo "Xong. Mở trang Chấm công để xem."
read -r -p "Enter để thoát…" _
