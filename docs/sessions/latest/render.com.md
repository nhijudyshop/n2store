# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-094945-41294a1`
**Session file**: [`./20260627-094945-41294a1.md`](../20260627-094945-41294a1.md)
**Commit**: `41294a1` — fix(web2 sepay R4 MEDIUM): CHECK constraint thiếu pending_no_order → gate marker fail → retry storm
**Last updated**: 2026-06-27 09:49:45 +07
**Summary**: Test SePay webhook → ví Web 2.0 (nhánh web2 thuần, không đụng web1): 22 assertions + FIX bug CHECK constraint thiếu pending_no_order (gate marker fail → retry storm)

## Files changed in this commit (`render.com/`)

- `render.com/services/web2-sepay-matching.js`

## Last 5 commits touching `render.com/`

- `41294a16b` fix(web2 sepay R4 MEDIUM): CHECK constraint thiếu pending*no_order → gate marker fail → retry storm *(2026-06-27)\_
- `ca2878c46` fix(web2 cashbook R3 #5 LOW): biên ngày cuối EXCLUSIVE — không bỏ sót phiếu sub-second _(2026-06-27)_
- `fb697db2c` auto: session update _(2026-06-27)_
- `8b5c4b22a` fix(web2 order-tags R3 #1 HIGH): PBH tách — tag tổng hợp mọi bill (hết ẩn nợ + đối soát sớm) _(2026-06-26)_
- `246ad6f40` fix(web2 flow R2 LOW): 5 LOW findings + SAVEPOINT chống poison tx khi sync delivery _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-094945-41294a1` cho Claude walk chain theo CLAUDE.md protocol.
