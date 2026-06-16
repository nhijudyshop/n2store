# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-134827-bc13317`
**Session file**: [`./20260616-134827-bc13317.md`](../20260616-134827-bc13317.md)
**Commit**: `bc13317` — auto: session update
**Last updated**: 2026-06-16 13:48:27 +07
**Summary**: auto: session update

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`

## Last 5 commits touching `don-inbox/`

- `7296b99aa` fix(orders-report,don-inbox): product search rỗng — tự refresh token TPOS stale _(2026-06-16)_
- `5eef62c12` revert: gỡ bump api-config version nhầm trên 7 file Web 1.0 (Web1⊥Web2) _(2026-06-15)_
- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `c0038ee92` fix(bill): PBH lẻ in MẤT MÃ VẠCH — pre-render CODE128 data-URI (bỏ race ảnh ngoài) _(2026-06-15)_
- `4a59600b9` fix(pancake): PIVOT sang query-param ?client*key (CORS) — X-API-Key header bị worker preflight chặn *(2026-06-13)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-134827-bc13317` cho Claude walk chain theo CLAUDE.md protocol.
