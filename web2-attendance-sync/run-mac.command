#!/bin/bash
# WEB2.0 — chạy ADMS proxy chấm công (Mac/Linux). Bấm đúp để chạy.
cd "$(dirname "$0")" || exit 1
if [ ! -f config.json ]; then
  echo "Chưa có config.json — copy từ config.example.json rồi sửa secret + IP máy."
  cp config.example.json config.json 2>/dev/null
  echo "Đã tạo config.json mẫu. Mở sửa rồi chạy lại."
  read -r -p "Enter để thoát…" _
  exit 1
fi
echo "Chạy ADMS proxy chấm công… (Ctrl+C để dừng)"
node adms-proxy.js
read -r -p "Đã dừng. Enter để thoát…" _
