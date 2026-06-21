# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-091121-034f610`
**Session file**: [`./20260621-091121-034f610.md`](../20260621-091121-034f610.md)
**Commit**: `034f610` — docs(dev-log): audit round 2 (auth/xss/tz fix + money defer + FP notes)
**Last updated**: 2026-06-21 09:11:21 +07
**Summary**: audit r2: auth-gate 4 read endpoints + XSS + reconcile tz; defer 2 money (over-refund/wallet-idx); regression r1 sach

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/js/live/comments-mobile-state.js`

## Last 5 commits touching `live-chat/`

- `93bde3438` fix(web2) audit-r2a: auth-gate batch read endpoints (PII/wallet) + XSS multi-tool _(2026-06-21)_
- `f54f82920` fix(web2) audit-r1b: capture-lock auth + zalo boot expectedUid + zalo conv isolation _(2026-06-20)_
- `341141081` fix(web2) audit-r1a: QR-write auth + live-comments seq/N+1 + relay 401 log + so-order conflict timer _(2026-06-20)_
- `7bbf43d85` perf(live-chat): realtime cập nhật incremental (keyed reconcile) — hết rebuild cả cột _(2026-06-20)_
- `4700eb38e` feat(live-chat): hiệu ứng KH chat tới — dòng trượt vào + glow avatar (pk-conv-enter) _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-091121-034f610` cho Claude walk chain theo CLAUDE.md protocol.
