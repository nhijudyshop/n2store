# 🚀 Quick Installation Guide

## Prerequisites
- Node.js (v14 hoặc mới hơn) - Download: https://nodejs.org/

## Installation Steps

### 1. Kiểm tra Node.js đã cài chưa
```bash
node --version
npm --version
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Khởi động server
```bash
npm start
```

### 4. Mở trình duyệt
```
http://localhost:8080
```

---

## That's it! 🎉

Nếu gặp lỗi, xem file README.md để biết thêm chi tiết.

---

## Quick Commands

```bash
# Cài đặt
npm install

# Chạy server
npm start

# Chạy với port khác
PORT=3000 npm start

# Xem log chi tiết
DEBUG=* npm start
```

---

## Structure

```
chatomni-viewer/
├── package.json          # npm config
├── server.js            # Express server (proxy)
├── chat-viewer.html     # Frontend UI
├── README.md            # Full documentation
└── INSTALL.md           # This file
```
