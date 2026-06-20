# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-064534-a6fa763`
**Session file**: [`./20260621-064534-a6fa763.md`](../20260621-064534-a6fa763.md)
**Commit**: `a6fa763` — docs(dev-log): audit Web 2.0 25 bug fix (r1a-r1f)
**Last updated**: 2026-06-21 06:45:34 +07
**Summary**: audit Web 2.0 full-surface: fix 25/27 bug (auth/sse-leak/anti-lag/click-path/zalo/pancake)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-realtime-init.js`
- `native-orders/js/native-orders-snapshots.js`

## Last 5 commits touching `native-orders/`

- `77bdd329c` fix(web2) audit-r1f: frontend minor (r.ok check, tz GMT+7, so-order race) _(2026-06-21)_
- `550719520` fix(web2) audit-r1e: click-path double-submit/dup-listener _(2026-06-21)_
- `7967c22fb` fix(web2) audit-r1c: cleanup SSE/timer leak khi roi trang (pagehide) _(2026-06-20)_
- `8bc94ed16` feat(live-chat): picker livestream chọn chiến dịch cha HOẶC bài live (multi-select); fix(native-orders): 401 chiến dịch cha thiếu x-web2-token _(2026-06-20)_
- `3e3021e45` feat(native-orders): Đơn Inbox 'Gán FB khác' — gán lại Facebook đúng nếu auto-dò nhầm _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-064534-a6fa763` cho Claude walk chain theo CLAUDE.md protocol.
