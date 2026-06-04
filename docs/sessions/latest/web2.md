# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-133604-a220409`
**Session file**: [`./20260604-133604-a220409.md`](../20260604-133604-a220409.md)
**Commit**: `a220409` — auto: session update
**Last updated**: 2026-06-04 13:36:04 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/print.html`
- `web2/overview/index.html`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `67c028c1d` refactor(web2): bo nut In PBH per-row (trung In bill) + sweep HD/NW->NJ _(2026-06-04)_
- `99f8cb7ab` auto: session update _(2026-06-04)_
- `8a627947c` auto: session update _(2026-06-04)_
- `3e2868402` feat(web2): photo-studio — chèn nền: 8 preset studio + chọn nền trên camera (live) + lưu nền riêng dùng lại _(2026-06-04)_
- `1efd14a23` auto: session update _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-133604-a220409` cho Claude walk chain theo CLAUDE.md protocol.
