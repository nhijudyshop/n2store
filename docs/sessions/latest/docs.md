# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-202247-4aed604`
**Session file**: [`./20260630-202247-4aed604.md`](../20260630-202247-4aed604.md)
**Commit**: `4aed604` — fix(web2 zalo): QR đăng nhập lỗi ảnh vỡ — re-add data:image/png;base64 prefix bị zca-js bóc
**Last updated**: 2026-06-30 20:22:47 +07
**Summary**: fix web2 zalo QR login broken image (re-add data:image base64 prefix)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4aed60423` fix(web2 zalo): QR đăng nhập lỗi ảnh vỡ — re-add data:image/png;base64 prefix bị zca-js bóc _(2026-06-30)_
- `baf4e467d` chore(session): RESUME:20260630-200604-24195eb _(2026-06-30)_
- `24195eb88` refactor(web2 product-units): gom builder per-tem về Web2ProductUnits.printUnit _(2026-06-30)_
- `9e8110fbc` chore(session): RESUME:20260630-200323-f547f29 _(2026-06-30)_
- `1459840e4` chore(session): RESUME:20260630-195331-2ae3f06 _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-202247-4aed604` cho Claude walk chain theo CLAUDE.md protocol.
