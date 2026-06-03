# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-165200-af4767e`
**Session file**: [`./20260603-165200-af4767e.md`](../20260603-165200-af4767e.md)
**Commit**: `af4767e` — feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart)
**Last updated**: 2026-06-03 16:52:00 +07
**Summary**: feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `470bad1bd` chore(web2): xóa 15 dead file Web 1.0 (balance-history 13 + customer-wallet legacy 2) — tránh nhầm _(2026-06-03)_
- `9d96bb063` fix(don-inbox): nút 'Làm mới trạng thái phiếu từ TPOS' báo lỗi không tìm thấy đơn _(2026-06-03)_
- `b5cb1b06b` chore(session): RESUME:20260603-164206-a55291d _(2026-06-03)_
- `a55291dd3` feat(web2): Phase 2 decouple Web 1.0 — native-orders + print-export dùng /api/web2/\* (Phase 2b: smart-match/customer-wallet cần endpoint web2) _(2026-06-03)_
- `f8f8c65a1` docs(web2): master plan tách triệt để Web 2.0 (audit 33 trang + 8 phase) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-165200-af4767e` cho Claude walk chain theo CLAUDE.md protocol.
