# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-183447-6089734`
**Session file**: [`./20260602-183447-6089734.md`](../20260602-183447-6089734.md)
**Commit**: `6089734` — feat(native-orders): dong bo gui attachment (anh/audio/video/tep) qua extension — parity tpos-pancake
**Last updated**: 2026-06-02 18:34:47 +07
**Summary**: feat(native-orders): dong bo gui attachment (anh/audio/video/tep) qua extension — parity tpos-pancake

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `6089734e3` feat(native-orders): dong bo gui attachment (anh/audio/video/tep) qua extension — parity tpos-pancake _(2026-06-02)_
- `79f371068` feat(native-orders): gửi tin UI-first — hiện ngay, chạy nền, lỗi thì bật lại text (giữ extension-trước) _(2026-06-02)_
- `6c30ffcb2` fix(native-orders): customer 360 modal — đọc đúng shape từ /api/web2/customer-orders _(2026-06-02)_
- `373ffc716` fix(native-orders): cột STT show campaignStt (1..n per campaign) thay vì displayStt (global seq) _(2026-06-02)_
- `2395cacb3` auto: session update _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-183447-6089734` cho Claude walk chain theo CLAUDE.md protocol.
