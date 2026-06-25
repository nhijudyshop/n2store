# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-211040-25b2363`
**Session file**: [`./20260625-211040-25b2363.md`](../20260625-211040-25b2363.md)
**Commit**: `25b2363` — auto: session update
**Last updated**: 2026-06-25 21:10:40 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `25b23634c` auto: session update _(2026-06-25)_
- `501cf9933` fix(web2/ai-assistant): ẩn khối <think> reasoning model khỏi chat _(2026-06-25)_
- `2557fef33` feat(so-order/AI): đối chiếu Sổ Order ⇄ Kho SP tính sẵn — AI hết xin data _(2026-06-25)_
- `308ce60ba` fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware _(2026-06-25)_
- `c9495a30a` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-211040-25b2363` cho Claude walk chain theo CLAUDE.md protocol.
