# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-173630-9d637c7`
**Session file**: [`./20260625-173630-9d637c7.md`](../20260625-173630-9d637c7.md)
**Commit**: `9d637c7` — docs(dev-log): so-order browser-test — fix SSE realtime + địa danh derive (verified)
**Last updated**: 2026-06-25 17:36:30 +07
**Summary**: browser-test so-order: fix SSE web2/products hiện SP mới (no F5) + region derive prefix mã (12/12 verified)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9d637c720` docs(dev-log): so-order browser-test — fix SSE realtime + địa danh derive (verified) _(2026-06-25)_
- `fec33ee42` chore(session): RESUME:20260625-170704-a90cf11 _(2026-06-25)_
- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_
- `ad187a9bd` chore(session): RESUME:20260625-163554-dfde626 _(2026-06-25)_
- `0ee9d2872` chore(session): RESUME:20260625-161605-234147e _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-173630-9d637c7` cho Claude walk chain theo CLAUDE.md protocol.
