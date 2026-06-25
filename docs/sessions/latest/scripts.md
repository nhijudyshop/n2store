# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-220850-881c19b`
**Session file**: [`./20260625-220850-881c19b.md`](../20260625-220850-881c19b.md)
**Commit**: `881c19b` — fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR
**Last updated**: 2026-06-25 22:08:50 +07
**Summary**: PBH bill QR sạch + mã dưới QR; tem SP P1 verify real (in tem thật)

## Files changed in this commit (`scripts/`)

- `scripts/export-auth-state.js`

## Last 5 commits touching `scripts/`

- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_
- `4e3d28151` auto: session update _(2026-06-25)_
- `fcebc6ea2` feat(web2/system): thống kê trang↔module + 2 doc agent-reference (PAGE-MODULES + THIRD-PARTIES) _(2026-06-24)_
- `cd77b9569` feat(web2/system): tab Module + tab Bên thứ 3 (audit 5 vòng, 70 bên thứ 3) + sửa tab Dịch vụ cho chính xác _(2026-06-24)_
- `314e8fa2e` fix(web2): dead partner-customer link → customers deep-link (?phone=); clean smoke harness _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-220850-881c19b` cho Claude walk chain theo CLAUDE.md protocol.
