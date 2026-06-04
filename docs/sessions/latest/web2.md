# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-200904-a1bf703`
**Session file**: [`./20260604-200904-a1bf703.md`](../20260604-200904-a1bf703.md)
**Commit**: `a1bf703` — auto: session update
**Last updated**: 2026-06-04 20:09:04 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/js/web2-customer-detail-modal.js`
- `web2/printer-settings/index.html`

## Last 5 commits touching `web2/`

- `a1bf7030c` auto: session update _(2026-06-04)_
- `f63e8ccc3` fix(printer-settings): canh bao bridge ro hon (PNA restart + phan biet EHOSTUNREACH may in) _(2026-06-04)_
- `5a7e21a7f` feat(web2 pancake-settings): auto-refresh token qua extension + cảnh báo sắp hết hạn _(2026-06-04)_
- `b3e40adbf` auto: session update _(2026-06-04)_
- `4f2e38218` feat(web2 printer): in tem ma SP thang ra may tem (role label) qua bridge — HTML->ESC/POS raster html2canvas _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-200904-a1bf703` cho Claude walk chain theo CLAUDE.md protocol.
