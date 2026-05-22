# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-155529-29e2004`
**Session file**: [`./20260522-155529-29e2004.md`](../20260522-155529-29e2004.md)
**Commit**: `29e2004` — fix(tpos-pancake/inv): drag không fire do inner elements bắt mousedown + lọc SL=0
**Last updated**: 2026-05-22 15:55:29 +07
**Summary**: fix(tpos-pancake/inv): drag không fire do inner elements bắt mousedown + lọc SL=0

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/css/inventory-panel.css`
- `tpos-pancake/index.html`
- `tpos-pancake/js/pancake/inventory-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `29e200478` fix(tpos-pancake/inv): drag không fire do inner elements bắt mousedown + lọc SL=0 _(2026-05-22)_
- `eba99ec9e` fix(tpos-pancake/inv): popover không bị đóng ngay khi click badge mở (setTimeout outside listener) _(2026-05-22)_
- `d35fdf05c` fix(tpos-pancake/inv): poll DOM cho đến khi conv-list xuất hiện + lazy attach observer _(2026-05-22)_
- `b591fded7` fix(tpos-pancake/inv): bootstrap polling 30s để mark has-order rows khi Pancake conv load async _(2026-05-22)_
- `a982d0167` fix(tpos-pancake/inv): detect 'có đơn' qua has*livestream_order/has_phone+tag (conv list field thực tế) *(2026-05-22)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-155529-29e2004` cho Claude walk chain theo CLAUDE.md protocol.
