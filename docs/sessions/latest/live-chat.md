# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-064534-a6fa763`
**Session file**: [`./20260621-064534-a6fa763.md`](../20260621-064534-a6fa763.md)
**Commit**: `a6fa763` — docs(dev-log): audit Web 2.0 25 bug fix (r1a-r1f)
**Last updated**: 2026-06-21 06:45:34 +07
**Summary**: audit Web 2.0 full-surface: fix 25/27 bug (auth/sse-leak/anti-lag/click-path/zalo/pancake)

## Files changed in this commit (`live-chat/`)

- `live-chat/js/live/live-livestream-snap-init.js`
- `live-chat/server/relay.js`

## Last 5 commits touching `live-chat/`

- `f54f82920` fix(web2) audit-r1b: capture-lock auth + zalo boot expectedUid + zalo conv isolation _(2026-06-20)_
- `341141081` fix(web2) audit-r1a: QR-write auth + live-comments seq/N+1 + relay 401 log + so-order conflict timer _(2026-06-20)_
- `7bbf43d85` perf(live-chat): realtime cập nhật incremental (keyed reconcile) — hết rebuild cả cột _(2026-06-20)_
- `4700eb38e` feat(live-chat): hiệu ứng KH chat tới — dòng trượt vào + glow avatar (pk-conv-enter) _(2026-06-20)_
- `8bc94ed16` feat(live-chat): picker livestream chọn chiến dịch cha HOẶC bài live (multi-select); fix(native-orders): 401 chiến dịch cha thiếu x-web2-token _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-064534-a6fa763` cho Claude walk chain theo CLAUDE.md protocol.
