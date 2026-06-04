# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-195454-cc865c3`
**Session file**: [`./20260604-195454-cc865c3.md`](../20260604-195454-cc865c3.md)
**Commit**: `cc865c3` — feat(web2): quan ly may in + in thang IP:port (print-bridge ESC/POS raster) + gan may theo chuc nang
**Last updated**: 2026-06-04 19:54:54 +07
**Summary**: feat(web2): quan ly may in + in thang IP:port (print-bridge ESC/POS raster) + gan may theo chuc nang

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/tpos-sidebar.js`
- `web2/shared/web2-bill-service.js`
- `web2/shared/web2-printer.js`

## Last 5 commits touching `web2/`

- `cc865c318` feat(web2): quan ly may in + in thang IP:port (print-bridge ESC/POS raster) + gan may theo chuc nang _(2026-06-04)_
- `6c943de98` fix(web2-balance): modal Gan KH seed bang extraction*preview (bo FT/GD ref >10 so) *(2026-06-04)\_
- `4d47e00fb` perf(web2-bill): in qua iframe an tai su dung thay popup window (het 'in bill lau') + giam stroke _(2026-06-04)_
- `d69e23b07` style(web2-bill): danh so SP (de dem khi nhieu) + STT len canh ten khach _(2026-06-04)_
- `2a5c38c5b` style(web2-bill): bo cuc lai bill + chu dam hon (font-weight 700 + stroke chong dut/mo khi in) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-195454-cc865c3` cho Claude walk chain theo CLAUDE.md protocol.
