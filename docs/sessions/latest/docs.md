# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-094645-6032f12`
**Session file**: [`./20260606-094645-6032f12.md`](../20260606-094645-6032f12.md)
**Commit**: `6032f12` — fix(supplier-debt): hóa đơn mới tự chèn theo ngày thay vì dồn cuối (sửa xáo thứ tự kéo tay) + reset thứ tự B24 bị hỏng
**Last updated**: 2026-06-06 09:46:45 +07
**Summary**: fix(supplier-debt): hóa đơn mới tự chèn theo ngày thay vì dồn cuối (sửa xáo thứ tự kéo tay) + r...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6032f122f` fix(supplier-debt): hóa đơn mới tự chèn theo ngày thay vì dồn cuối (sửa xáo thứ tự kéo tay) + reset thứ tự B24 bị hỏng _(2026-06-06)_
- `fbd7af8d4` chore(session): RESUME:20260606-093945-90c3cd1 _(2026-06-06)_
- `90c3cd165` perf(tpos-pancake): render comment thông minh — inline SVG (bỏ createIcons full-DOM), lazy status dropdown, bỏ data đơn TPOS legacy, lazy avatar _(2026-06-06)_
- `357b345cb` chore(session): RESUME:20260606-091109-b97279f _(2026-06-06)_
- `b97279f6e` feat(web2): audit đơn có tiền — PBH trừ ví + hoàn ví huỷ đơn ghi performed*by *(2026-06-06)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-094645-6032f12` cho Claude walk chain theo CLAUDE.md protocol.
