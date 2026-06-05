# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-184120-1c7a720`
**Session file**: [`./20260605-184120-1c7a720.md`](../20260605-184120-1c7a720.md)
**Commit**: `1c7a720` — fix(web2): auto-reply báo 'số tiền chuyển khoản' thay vì 'số dư ví'
**Last updated**: 2026-06-05 18:41:20 +07
**Summary**: fix(web2): auto-reply báo 'số tiền chuyển khoản' thay vì 'số dư ví'

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `6d4de1344` fix(web2 products): tem mã SP 2-up canh giữa đúng tâm cột die-cut _(2026-06-05)_
- `d556ecbba` auto: session update _(2026-06-05)_
- `91e84e986` auto: session update _(2026-06-05)_
- `1a6c8a4dc` auto: session update _(2026-06-05)_
- `710e088e2` fix(web2 products): tem ma SP canh giua doc (justify center) thay space-between - khoi noi dung to nhung khong sat mep tem _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-184120-1c7a720` cho Claude walk chain theo CLAUDE.md protocol.
