# N2Store — AI Agent Instructions

## Quick Start

Khi bắt đầu session mới, đọc theo thứ tự:

1. **File này** — tổng quan project & conventions
2. **`docs/plans/plan-implementation-tracker.md`** — plan chi tiết 5 phase, 9 tuần
3. **`docs/plans/progress-log.md`** — nhật ký tiến độ (đã làm gì, đang ở đâu, ghi chú kỹ thuật)
4. **`docs/guides/CLAUDE.md`** — coding conventions, shared library, data sync patterns

## Khi user nói "tiếp tục plan" hoặc "làm tiếp"

1. Đọc `docs/plans/progress-log.md` để biết task nào đã xong, task nào đang dở
2. Đọc `docs/plans/plan-implementation-tracker.md` để xem chi tiết task tiếp theo
3. Đọc file code liên quan được ghi trong progress log
4. Tiếp tục hiện thực task tiếp theo
5. **Sau khi xong mỗi task**: cập nhật progress-log.md

## Project Overview

N2Store là hệ thống quản lý nội bộ cho shop thời trang nữ online, bán hàng qua livestream.

### Modules chính:
- **orders-report/** — Quản lý đơn hàng (Sale team dùng): Tab1 đơn hàng, Tab3 gán SP, Overview báo cáo, KPI, Sổ Sách
- **order-management/** — Quản lý đặt hàng NCC (Duyên dùng): nhập SP, theo dõi số lượng
- **inbox/** — Chat khách hàng qua Pancake/Facebook
- **soquy/** — Sổ quỹ, chấm công
- **shared/** — Thư viện dùng chung (auth, cache, Firebase, TPOS client)

### Tech Stack:
- Vanilla HTML/JS/CSS (không framework)
- Firebase Realtime Database + Firestore
- TPOS OData API (qua Cloudflare Workers proxy)
- Pancake API (messaging)
- PostgreSQL + SSE (processing tags)
- GitHub Pages hosting

### Quy trình nghiệp vụ:
Xem `quy-trinh/quy-trinh-chuan.md` — 8 bộ phận từ nhập hàng → live sale → chốt đơn → giao hàng → CSKH

## Git Workflow

Auto commit & push khi hoàn thành task. Commit message ngắn gọn tiếng Anh.

## Coding Conventions

- Xem chi tiết tại `docs/guides/CLAUDE.md`
- Dùng shared library (`/shared/`) — KHÔNG tạo file duplicate
- Firebase là source of truth, localStorage chỉ là cache
- Tách CSS/JS riêng cho feature mới
