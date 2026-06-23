#!/bin/bash
# WEB2.0 — Đồng bộ máy chấm công DG-600 → trang Chấm công (Mac/Linux).
# Chế độ ZK pull (kéo dữ liệu qua LAN cổng 4370) — ĐÃ TEST CHẠY ĐƯỢC. Bấm đúp để chạy.
cd "$(dirname "$0")" || exit 1

if [ ! -f config.json ]; then
  cp config.example.json config.json 2>/dev/null
  echo "Đã tạo config.json mẫu. MỞ sửa: attendanceSecret + device.ip (IP máy chấm công LAN) rồi chạy lại."
  read -r -p "Enter để thoát…" _
  exit 1
fi

if [ ! -d node_modules/node-zklib ]; then
  echo "Cài thư viện lần đầu (cần internet)…"
  npm install || { echo "Lỗi npm. Cài Node.js: https://nodejs.org"; read -r -p "Enter…" _; exit 1; }
fi

echo "Đang đồng bộ máy chấm công DG-600 (kéo dữ liệu cổng 4370). Đồng bộ mỗi 5 phút. Ctrl+C để dừng."
node sync.js
read -r -p "Đã dừng. Enter để thoát…" _
