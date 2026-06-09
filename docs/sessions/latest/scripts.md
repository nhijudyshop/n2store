# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-115809-15afc95`
**Session file**: [`./20260609-115809-15afc95.md`](../20260609-115809-15afc95.md)
**Commit**: `15afc95` — chore(scripts): them finder read-only liet ke bill PBH trung/ket theo don nguon + user
**Last updated**: 2026-06-09 11:58:09 +07
**Summary**: chore(scripts): them finder read-only liet ke bill PBH trung/ket theo don nguon + user

## Files changed in this commit (`scripts/`)

- `scripts/tpos-find-stuck-duplicate-bills.js`

## Last 5 commits touching `scripts/`

- `15afc95bf` chore(scripts): them finder read-only liet ke bill PBH trung/ket theo don nguon + user _(2026-06-09)_
- `e7c485201` fix(web2): gỡ TPOS khỏi matcher SePay — auto-gán KH dùng kho web2*customers *(2026-06-09)\_
- `67094481e` test(web2-returns): E2E 12/12 trên DB ảo — mọi luồng ví/kho/COD verified _(2026-06-07)_
- `d8950e49b` feat(web2): gate auto-gán SePay — chỉ cộng ví khi KH có đơn active _(2026-06-07)_
- `667b58307` auto: session update _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-115809-15afc95` cho Claude walk chain theo CLAUDE.md protocol.
