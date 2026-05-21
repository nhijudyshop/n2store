# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-171455-a67519e`
**Session file**: [`./20260521-171455-a67519e.md`](../20260521-171455-a67519e.md)
**Commit**: `a67519e` — feat(native-orders): bulk-send skip đơn SL=0 (giỏ trống)
**Last updated**: 2026-05-21 17:14:55 +07
**Summary**: feat(native-orders): bulk-send skip đơn SL=0 (giỏ trống)

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `a67519e1` feat(native-orders): bulk-send skip đơn SL=0 (giỏ trống) _(2026-05-21)_
- `d3e665d1` feat(native-orders): bulk send tin nhắn template như orders-report _(2026-05-21)_
- `e7b5c890` fix(native-orders+ext v2.0.4): Pancake API route cho global*id + m.facebook.com permission *(2026-05-21)\_
- `497a855a` fix(native-orders): 1545012 root cause = gửi PSID thay vì FB global ID _(2026-05-21)_
- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-171455-a67519e` cho Claude walk chain theo CLAUDE.md protocol.
