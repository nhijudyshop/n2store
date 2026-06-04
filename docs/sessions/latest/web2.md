# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-194558-6c943de`
**Session file**: [`./20260604-194558-6c943de.md`](../20260604-194558-6c943de.md)
**Commit**: `6c943de` — fix(web2-balance): modal Gan KH seed bang extraction_preview (bo FT/GD ref >10 so)
**Last updated**: 2026-06-04 19:45:58 +07
**Summary**: fix(web2-balance): modal Gan KH seed bang extraction_preview (bo FT/GD ref >10 so)

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`

## Last 5 commits touching `web2/`

- `6c943de98` fix(web2-balance): modal Gan KH seed bang extraction*preview (bo FT/GD ref >10 so) *(2026-06-04)\_
- `4d47e00fb` perf(web2-bill): in qua iframe an tai su dung thay popup window (het 'in bill lau') + giam stroke _(2026-06-04)_
- `d69e23b07` style(web2-bill): danh so SP (de dem khi nhieu) + STT len canh ten khach _(2026-06-04)_
- `2a5c38c5b` style(web2-bill): bo cuc lai bill + chu dam hon (font-weight 700 + stroke chong dut/mo khi in) _(2026-06-04)_
- `3e7bbafc4` auto: session update _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-194558-6c943de` cho Claude walk chain theo CLAUDE.md protocol.
