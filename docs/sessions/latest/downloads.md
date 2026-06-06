# Latest Snapshot — `downloads/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-090546-72dc67c`
**Session file**: [`./20260606-090546-72dc67c.md`](../20260606-090546-72dc67c.md)
**Commit**: `72dc67c` — auto: session update
**Last updated**: 2026-06-06 09:05:46 +07
**Summary**: auto: session update

## Files changed in this commit (`downloads/`)

- `downloads/n2store-session/label-right-nudge.png`

## Last 5 commits touching `downloads/`

- `4cdcf7e46` fix(web2): đẩy tem phải +1mm + Kho SP giữ vị trí khi tương tác _(2026-06-06)_
- `6d4de1344` fix(web2 products): tem mã SP 2-up canh giữa đúng tâm cột die-cut _(2026-06-05)_
- `d1982a67b` refactor(web2 supplier-debt): cat sach coupling TPOS/inventory*shipments (Web 1.0) *(2026-06-04)\_
- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `117833f8a` docs(dev-log): so-order mã SP rule + hiển thị mã/SL + nút nhận hàng NCC + NCC=KHO _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-090546-72dc67c` cho Claude walk chain theo CLAUDE.md protocol.
