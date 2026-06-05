# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-135409-9a86a3f`
**Session file**: [`./20260605-135409-9a86a3f.md`](../20260605-135409-9a86a3f.md)
**Commit**: `9a86a3f` — docs(dev-log): bill STT khop list don gop
**Last updated**: 2026-06-05 13:54:09 +07
**Summary**: docs(dev-log): bill STT khop list don gop

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `220a8f98c` fix(native-orders): bill STT khop list (computeOrderStt dung chung) - don gop ghi 'STT1 + STT2', don thuong campaignStt (truoc in displayStt global lech) _(2026-06-05)_
- `5ad4e2281` fix(native-orders): in bill truyen pbhCarrierName vao delivery.carrierName - don PBH SHOP gio hien dau 'PBH SHOP' tren bill (truoc hardcode '' -> mat dau shop) _(2026-06-05)_
- `397deda52` feat(web2 bill): don ban tai shop ghi tieu de 'PBH SHOP' (thay 'Phieu Ban Hang (SHOP)') + sub 'BAN TAI SHOP' _(2026-06-05)_
- `e48a7e7cf` fix(web2-msg-send): mount /api/web2/msg-send (CF worker forward /api/web2/\*) thay /api/web2-msg-send (chua trong allowlist -> roi ve TPOS 404) _(2026-06-05)_
- `a6f0e3e7d` feat(native-orders): gửi tin nhắn template qua JOB server-side đa-account Pancake + extension fallback (refresh-safe, SSE progress) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-135409-9a86a3f` cho Claude walk chain theo CLAUDE.md protocol.
