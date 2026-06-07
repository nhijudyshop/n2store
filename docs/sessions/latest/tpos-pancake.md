# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-194138-f1f0b76`
**Session file**: [`./20260607-194138-f1f0b76.md`](../20260607-194138-f1f0b76.md)
**Commit**: `f1f0b76` — refactor(live-chat): rename tpos-pancake→live-chat, purge chữ 'tpos' + comment qua pages.fm
**Last updated**: 2026-06-07 19:41:38 +07
**Summary**: refactor(live-chat): rename tpos-pancake→live-chat, purge chữ 'tpos' + comment qua pages.fm

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/docs/tpos-realtime-manager.md`
- `tpos-pancake/js/tpos/tpos-fb-live-source.js`

## Last 5 commits touching `tpos-pancake/`

- `f1f0b7690` refactor(live-chat): rename tpos-pancake→live-chat, purge chữ 'tpos' + comment qua pages.fm _(2026-06-07)_
- `4e9cd5eee` fix(web2): cột live lấy comment qua pages.fm (Pancake API), KHÔNG graph.facebook.com _(2026-06-07)_
- `f7a6a56ff` feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback) _(2026-06-07)_
- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `88c9a2660` feat(tpos-pancake): rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe) _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-194138-f1f0b76` cho Claude walk chain theo CLAUDE.md protocol.
