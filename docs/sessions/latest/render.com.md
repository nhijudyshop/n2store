# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-113334-411482c`
**Session file**: [`./20260521-113334-411482c.md`](../20260521-113334-411482c.md)
**Commit**: `411482c` — feat(domain): rewire codebase sang custom domain nhijudy.store
**Last updated**: 2026-05-21 11:33:34 +07
**Summary**: feat(domain): rewire codebase sang custom domain nhijudy.store

## Files changed in this commit (`render.com/`)

- `render.com/routes/telegram-bot.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `411482c3` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `8fed11e7` feat(native-orders): split orders dính kế nhau — sort display*stt DESC, split_index ASC + group CSS *(2026-05-21)\_
- `268fe4d7` feat(native-orders): tách đơn nháp + smooth incremental render + clearer over*sell error + bỏ Xóa đơn *(2026-05-21)\_
- `218e85db` refactor(purchase-orders): rollback Bunny → Postgres bytea cho upload mới + policy "Bunny chỉ AI KOL" _(2026-05-21)_
- `d2abbaaf` fix(web2-products): migration 078 — backfill product snapshots vào tất cả đơn _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-113334-411482c` cho Claude walk chain theo CLAUDE.md protocol.
