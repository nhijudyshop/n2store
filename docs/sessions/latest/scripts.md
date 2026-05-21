# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-094554-f97ef68`
**Session file**: [`./20260521-094554-f97ef68.md`](../20260521-094554-f97ef68.md)
**Commit**: `f97ef68` — auto: session update
**Last updated**: 2026-05-21 09:45:54 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/n2store-browser-session.js`

## Last 5 commits touching `scripts/`

- `f97ef682` auto: session update _(2026-05-21)_
- `ac49c9e4` feat(domain): setup nhijudy.store DNS via GoDaddy API + update OG URLs _(2026-05-20)_
- `4b338d24` feat(so-order): bảng giống native-orders — font Segoe UI + header bg + button action màu _(2026-05-18)_
- `ba75d7a3` feat(scripts): seeder fake demo data cho Web 2.0 _(2026-05-18)_
- `6f055e41` fix(web2): broken paths sau khi move web2-products/web2-variants vào web2/ _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-094554-f97ef68` cho Claude walk chain theo CLAUDE.md protocol.
