# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-114704-4301fa2`
**Session file**: [`./20260621-114704-4301fa2.md`](../20260621-114704-4301fa2.md)
**Commit**: `4301fa2` — fix(web2) audit-r5: fb-posts read GETs gate requireWeb2AuthSoft + inventory-tracking limit/offset clamp (DoS/NaN)
**Last updated**: 2026-06-21 11:47:04 +07
**Summary**: audit r5: fb-posts auth gate + inventory clamp; 4 deferred = no-bug

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4301fa286` fix(web2) audit-r5: fb-posts read GETs gate requireWeb2AuthSoft + inventory-tracking limit/offset clamp (DoS/NaN) _(2026-06-21)_
- `2a39135fc` chore(session): RESUME:20260621-095056-4b43164 _(2026-06-21)_
- `4b431643f` docs(dev-log): audit round 4 (video-tts fix; notifications shop-wide FP; inventory Web1 out-scope) _(2026-06-21)_
- `a82b70149` chore(session): RESUME:20260621-093107-a7c0b30 _(2026-06-21)_
- `a7c0b3049` docs(dev-log): audit round 3 (so-order cost CRIT + native/SSE/KPI/a11y, 12 fix) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-114704-4301fa2` cho Claude walk chain theo CLAUDE.md protocol.
