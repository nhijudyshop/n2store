# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-095056-4b43164`
**Session file**: [`./20260621-095056-4b43164.md`](../20260621-095056-4b43164.md)
**Commit**: `4b43164` — docs(dev-log): audit round 4 (video-tts fix; notifications shop-wide FP; inventory Web1 out-scope)
**Last updated**: 2026-06-21 09:50:56 +07
**Summary**: audit r4: video-tts fallback fix; notifications shop-wide=FP; inventory-tracking=Web1 out-scope; 44 total fix qua 4 vong

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/js/video-tts.js`

## Last 5 commits touching `web2/`

- `9376200bf` fix(web2) audit-r4: video-tts copyToChannel fallback (Safari/iOS cu) _(2026-06-21)_
- `b6eeb56dc` fix(web2) audit-r3: so-order footer cost-price (CRIT) + native-orders renderRows/STT + SSE relay hardening + KPI tz + XSS/a11y _(2026-06-21)_
- `10c511fba` fix(web2) audit-r2b: reconcile audit date filter dung GMT+7 (khong theo TZ trinh duyet) _(2026-06-21)_
- `93bde3438` fix(web2) audit-r2a: auth-gate batch read endpoints (PII/wallet) + XSS multi-tool _(2026-06-21)_
- `77bdd329c` fix(web2) audit-r1f: frontend minor (r.ok check, tz GMT+7, so-order race) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-095056-4b43164` cho Claude walk chain theo CLAUDE.md protocol.
