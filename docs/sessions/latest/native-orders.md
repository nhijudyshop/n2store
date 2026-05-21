# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-183159-94483db`
**Session file**: [`./20260521-183159-94483db.md`](../20260521-183159-94483db.md)
**Commit**: `94483db` — feat(native-orders): bỏ splitPbh ở confirmed, mở splitOrder ra confirmed
**Last updated**: 2026-05-21 18:31:59 +07
**Summary**: feat(native-orders): bỏ splitPbh ở confirmed, mở splitOrder ra confirmed

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `94483dba` feat(native-orders): bỏ splitPbh ở confirmed, mở splitOrder ra confirmed _(2026-05-21)_
- `b31cc8db` feat(native-orders): đơn cancelled vẫn cho tạo PBH (số HĐ mới) _(2026-05-21)_
- `f0c49d92` fix(native-orders): đơn cancelled vẫn tạo PBH mới (UI + backend guard) _(2026-05-21)_
- `3f1cb9a1` feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP _(2026-05-21)_
- `b48fe690` fix(native-orders): cancelOrder dùng WORKER*URL trực tiếp (NativeOrdersApi.\_getBaseUrl không tồn tại) *(2026-05-21)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-183159-94483db` cho Claude walk chain theo CLAUDE.md protocol.
