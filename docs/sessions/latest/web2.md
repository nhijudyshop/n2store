# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-154935-0991424`
**Session file**: [`./20260613-154935-0991424.md`](../20260613-154935-0991424.md)
**Commit**: `0991424` — feat(live-chat): video dock đỉnh cột Kho SP (hết float đè UI) + force extract đa nhiệm (pool 3 luồng song song + chạy nền, bấm lại=hủy)
**Last updated**: 2026-06-13 15:49:35 +07
**Summary**: feat(live-chat): video dock đỉnh cột Kho SP (hết float đè UI) + force extract đa nhiệm (pool 3 luồng so...

## Files changed in this commit (`web2/`)

- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `f392d0ca7` fix(web2-zalo): UX review — a11y + contrast + perf fixes (10 confirmed findings) _(2026-06-13)_
- `e4f48d8d1` docs(web2): C8 done phase 1 — so-order Firestore→Postgres (15/15 audit ĐÓNG) _(2026-06-13)_
- `038554748` feat(worker): route /api/web2-so-order/\* → Render (C8 so-order server storage) _(2026-06-13)_
- `04046483f` docs(web2): audit FIX TOÀN BỘ — flip ⬜→✅ 14/15 item + C8 defer plan _(2026-06-13)_
- `e17ddbcab` fix(web2): adversarial-review fixes — returnedRowIds CỘNG DỒN + modal remaining + cron pool + C7 /me-kpi fallback _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-154935-0991424` cho Claude walk chain theo CLAUDE.md protocol.
