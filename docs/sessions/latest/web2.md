# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-204551-bf09bab`
**Session file**: [`./20260630-204551-bf09bab.md`](../20260630-204551-bf09bab.md)
**Commit**: `bf09bab` — fix(web2 util-money): ₫ 1-nguồn — load web2-format.js cho unit-scan (không sidebar)
**Last updated**: 2026-06-30 20:45:51 +07
**Summary**: Fix util-money ₫ 1-nguồn: load web2-format.js cho unit-scan (không sidebar) → audit partial→resolved

## Files changed in this commit (`web2/`)

- `web2/system/data/web2-dedup-audit.json`
- `web2/unit-scan/index.html`

## Last 5 commits touching `web2/`

- `bf09bab4f` fix(web2 util-money): ₫ 1-nguồn — load web2-format.js cho unit-scan (không sidebar) _(2026-06-30)_
- `b97a54dc1` feat(web2 zalo): tự chọn tài khoản chat khi chỉ có 1 tài khoản cá nhân _(2026-06-30)_
- `2da2cde5a` refactor(web2 dedup): re-verify audit 16-agent — fix esc 4→5char (3 leaf), util-money→partial, +print-unit group _(2026-06-30)_
- `2a85aca87` fix(web2 reconcile): scanner-box tràn — nút camera/OCR lòi ra ngoài viền bo tròn _(2026-06-30)_
- `4aed60423` fix(web2 zalo): QR đăng nhập lỗi ảnh vỡ — re-add data:image/png;base64 prefix bị zca-js bóc _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-204551-bf09bab` cho Claude walk chain theo CLAUDE.md protocol.
