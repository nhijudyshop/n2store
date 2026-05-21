# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-165403-b87aa5f`
**Session file**: [`./20260521-165403-b87aa5f.md`](../20260521-165403-b87aa5f.md)
**Commit**: `b87aa5f` — docs(dev-log): bulk send tin nhắn template cho native-orders
**Last updated**: 2026-05-21 16:54:03 +07
**Summary**: docs(dev-log): bulk send tin nhắn template cho native-orders

## Files changed in this commit (`web2/`)

- `web2/shared/web2-msg-template.js`

## Last 5 commits touching `web2/`

- `d3e665d1` feat(native-orders): bulk send tin nhắn template như orders-report _(2026-05-21)_
- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `acae6441` fix(web2-chat): silent-success bug — sendMessage/replyComment phải check Pancake success:false _(2026-05-21)_
- `832f2f6f` fix(web2/native-orders): in bill — STT merge "26 + 30" + bỏ trễ 250ms _(2026-05-20)_
- `6fe48527` feat(web2/PBH): split-PBH (tách đơn) — 1 native-order → nhiều PBH với STT 24-2, 24-3... _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-165403-b87aa5f` cho Claude walk chain theo CLAUDE.md protocol.
