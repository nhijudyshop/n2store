# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-143300-5806ca3`
**Session file**: [`./20260521-143300-5806ca3.md`](../20260521-143300-5806ca3.md)
**Commit**: `5806ca3` — feat(chat): khi gửi tin nhắn lỗi 24h/no-extension → modal hướng dẫn login FB Business
**Last updated**: 2026-05-21 14:33:00 +07
**Summary**: feat(chat): khi gửi tin nhắn lỗi 24h/no-extension → modal hướng dẫn login FB Business

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `5806ca3d` feat(chat): khi gửi tin nhắn lỗi 24h/no-extension → modal hướng dẫn login FB Business _(2026-05-21)_
- `7376cd57` fix(native-orders): preserve DOM during SSE-driven reload — skip loading wipe when rows already exist _(2026-05-21)_
- `8fed11e7` feat(native-orders): split orders dính kế nhau — sort display*stt DESC, split_index ASC + group CSS *(2026-05-21)\_
- `268fe4d7` feat(native-orders): tách đơn nháp + smooth incremental render + clearer over*sell error + bỏ Xóa đơn *(2026-05-21)\_
- `832f2f6f` fix(web2/native-orders): in bill — STT merge "26 + 30" + bỏ trễ 250ms _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-143300-5806ca3` cho Claude walk chain theo CLAUDE.md protocol.
