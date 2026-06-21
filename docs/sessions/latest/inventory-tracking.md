# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-154659-5b8e242`
**Session file**: [`./20260621-154659-5b8e242.md`](../20260621-154659-5b8e242.md)
**Commit**: `5b8e242` — auto: session update
**Last updated**: 2026-06-21 15:46:59 +07
**Summary**: auto: session update

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`
- `inventory-tracking/js/data-loader.js`
- `inventory-tracking/js/modal-image-manager.js`

## Last 5 commits touching `inventory-tracking/`

- `5b8e24255` auto: session update _(2026-06-21)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `4199e3b5f` feat(inventory-tracking): nút "Cập nhật từ TPOS" per-row trong modal Tạo đơn đặt hàng _(2026-06-19)_
- `b2a7acbf2` feat(inventory-tracking): nút "Cập nhật TPOS" full sync trong modal Tạo đơn đặt hàng _(2026-06-19)_
- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-154659-5b8e242` cho Claude walk chain theo CLAUDE.md protocol.
