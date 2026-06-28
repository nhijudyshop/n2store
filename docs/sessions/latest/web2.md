# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-212124-f3fe30c`
**Session file**: [`./20260628-212124-f3fe30c.md`](../20260628-212124-f3fe30c.md)
**Commit**: `f3fe30c` — fix(unit-scan): camera den moi trinh duyet - id #scanHost{display:block} de .w2bc{display:flex} cua scanner lam stage sap 0px; chi giu width/height; relax retry 2.5->5s; bump v20260628d
**Last updated**: 2026-06-28 21:21:24 +07
**Summary**: fix(unit-scan): camera den moi trinh duyet - id #scanHost{display:block} de .w2bc{display:flex} cua scanner lam stage...

## Files changed in this commit (`web2/`)

- `web2/unit-scan/css/unit-scan.css`
- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `f3fe30c5c` fix(unit-scan): camera den moi trinh duyet - id #scanHost{display:block} de .w2bc{display:flex} cua scanner lam stage sap 0px; chi giu width/height; relax retry 2.5->5s; bump v20260628d _(2026-06-28)_
- `f50644a60` feat(permissions+scan): đăng ký phân quyền unit-scan + clearance; fix camera đen trên PWA _(2026-06-28)_
- `81ef7612a` fix(web2-vn-address): gate ghi city/ward theo isReady() — chặn data-loss cửa sổ đang-tải _(2026-06-28)_
- `ac6e7b042` auto: session update _(2026-06-28)_
- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-212124-f3fe30c` cho Claude walk chain theo CLAUDE.md protocol.
