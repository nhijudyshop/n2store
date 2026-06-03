# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-164206-a55291d`
**Session file**: [`./20260603-164206-a55291d.md`](../20260603-164206-a55291d.md)
**Commit**: `a55291d` — feat(web2): Phase 2 decouple Web 1.0 — native-orders + print-export dùng /api/web2/_ (Phase 2b: smart-match/customer-wallet cần endpoint web2)
**Last updated**: 2026-06-03 16:42:06 +07
**Summary**: feat(web2): Phase 2 decouple Web 1.0 — native-orders + print-export dùng /api/web2/_ (Phase 2b: smart-match/custom...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-TOTAL-SEPARATION-PLAN.md`

## Last 5 commits touching `docs/`

- `a55291dd3` feat(web2): Phase 2 decouple Web 1.0 — native-orders + print-export dùng /api/web2/\* (Phase 2b: smart-match/customer-wallet cần endpoint web2) _(2026-06-03)_
- `f8f8c65a1` docs(web2): master plan tách triệt để Web 2.0 (audit 33 trang + 8 phase) _(2026-06-03)_
- `f63d50e47` chore(session): RESUME:20260603-162656-9216ea8 _(2026-06-03)_
- `9216ea885` feat(inventory-tracking): iPad — nút STT/NCC luôn hiện (bỏ phụ thuộc :hover) _(2026-06-03)_
- `7c2c2e9b8` chore(session): RESUME:20260603-162445-7305973 _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-164206-a55291d` cho Claude walk chain theo CLAUDE.md protocol.
