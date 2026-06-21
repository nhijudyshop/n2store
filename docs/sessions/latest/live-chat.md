# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-232439-261b4fb`
**Session file**: [`./20260621-232439-261b4fb.md`](../20260621-232439-261b4fb.md)
**Commit**: `261b4fb` — docs(web2) live-tv: dev-log Phase5-6 + SSE đa-instance finding + regen codemap
**Last updated**: 2026-06-21 23:24:39 +07
**Summary**: feat(web2) TV Livestream: chiến dịch gắn SP + 2 trang TV/điều khiển + số NCC báo realtime + migrate 2 fork → Web2Campaign

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-campaign-manager.js`

## Last 5 commits touching `live-chat/`

- `80e96e30d` refactor(web2) live-tv Phase6: migrate 2 fork chiến dịch → Web2Campaign (1 nguồn) _(2026-06-21)_
- `bde0e54ae` fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `93bde3438` fix(web2) audit-r2a: auth-gate batch read endpoints (PII/wallet) + XSS multi-tool _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-232439-261b4fb` cho Claude walk chain theo CLAUDE.md protocol.
