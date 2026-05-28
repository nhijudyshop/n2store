# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260528-152447-4662e68`
**Session file**: [`./20260528-152447-4662e68.md`](../20260528-152447-4662e68.md)
**Commit**: `4662e68` — feat(web2/live-campaign): modal tạo/sửa campaign giống TPOS — page picker + live video cascade + Config dropdown
**Last updated**: 2026-05-28 15:24:47 +07
**Summary**: feat(web2/live-campaign): modal tạo/sửa campaign giống TPOS — page picker + live video cascade + Config dropdown

## Files changed in this commit (`web2/`)

- `web2/live-campaign/index.html`
- `web2/live-campaign/js/live-campaign-api.js`
- `web2/live-campaign/js/live-campaign-app.js`

## Last 5 commits touching `web2/`

- `4662e6833` feat(web2/live-campaign): modal tạo/sửa campaign giống TPOS — page picker + live video cascade + Config dropdown _(2026-05-28)_
- `6add770ae` feat(web2/balance-history): bo nut Reprocess thu cong tung dong — 100% auto _(2026-05-26)_
- `09a46fcad` feat(web2/balance-history): 100% tu dong — bo khai niem 'Cu' / 'manual', auto-reprocess on page load _(2026-05-26)_
- `0d6d5ec19` fix(web2/balance-history): label "Thủ công" sai cho legacy backfilled rows _(2026-05-26)_
- `715ea8cd1` feat(web2): admin SSE Monitor page — live view of realtime hub activity _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260528-152447-4662e68` cho Claude walk chain theo CLAUDE.md protocol.
