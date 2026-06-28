# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-210724-7ce9d5a`
**Session file**: [`./20260628-210724-7ce9d5a.md`](../20260628-210724-7ce9d5a.md)
**Commit**: `7ce9d5a` — auto: session update
**Last updated**: 2026-06-28 21:07:24 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/customers/index.html`

## Last 5 commits touching `web2/`

- `81ef7612a` fix(web2-vn-address): gate ghi city/ward theo isReady() — chặn data-loss cửa sổ đang-tải _(2026-06-28)_
- `ac6e7b042` auto: session update _(2026-06-28)_
- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `b3b021bbb` feat(sidebar): thêm 'Quét tem đóng gói' (web2/unit-scan) vào nhóm Bán Hàng _(2026-06-28)_
- `7d1f0653a` auto: session update _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-210724-7ce9d5a` cho Claude walk chain theo CLAUDE.md protocol.
