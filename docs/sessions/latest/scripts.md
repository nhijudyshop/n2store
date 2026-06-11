# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260611-083624-a205f29`
**Session file**: [`./20260611-083624-a205f29.md`](../20260611-083624-a205f29.md)
**Commit**: `a205f29` — docs(live-chat): ghi kiến trúc realtime Pancake WS->SSE vào dev-log
**Last updated**: 2026-06-11 08:36:24 +07
**Summary**: docs(live-chat): ghi kiến trúc realtime Pancake WS->SSE vào dev-log

## Files changed in this commit (`scripts/`)

- `scripts/web2-ui-test.js`

## Last 5 commits touching `scripts/`

- `da235c7e4` fix(web2): guard initializeFirestore khi trang không load Firestore SDK + script web2-ui-test _(2026-06-10)_
- `68aff9eed` feat(harvester): lưu cả mật khẩu Pancake → bật auto-renew (trước chỉ lưu token) _(2026-06-09)_
- `0ca2869a9` feat(web2): SePay matcher gán identity theo ĐƠN + QR auto-credit/auto-message _(2026-06-09)_
- `3b2903438` auto: session update _(2026-06-09)_
- `ef37110d8` auto: session update _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260611-083624-a205f29` cho Claude walk chain theo CLAUDE.md protocol.
