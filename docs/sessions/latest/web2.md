# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-193425-c09724e`
**Session file**: [`./20260629-193425-c09724e.md`](../20260629-193425-c09724e.md)
**Commit**: `c09724e` — feat(putwall): đèn put-to-light (ESP32+WS2811) cho Quét tem + tài liệu lắp/mua
**Last updated**: 2026-06-29 19:34:25 +07
**Summary**: feat(putwall): đèn put-to-light (ESP32+WS2811) cho Quét tem + tài liệu lắp/mua

## Files changed in this commit (`web2/`)

- `web2/putwall/firmware/putwall-esp32.ino`
- `web2/shared/web2-putwall.js`

## Last 5 commits touching `web2/`

- `c09724e18` feat(putwall): đèn put-to-light (ESP32+WS2811) cho Quét tem + tài liệu lắp/mua _(2026-06-29)_
- `f92f54010` auto: session update _(2026-06-29)_
- `80d81ca1b` feat(web2/system): nút mở link tunnel máy Gemini trong tab Services _(2026-06-29)_
- `159831fc6` auto: session update _(2026-06-29)_
- `dc11a6b70` feat(unit-scan): hiện mã tem theo từng STT (tem nào vào STT nào) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-193425-c09724e` cho Claude walk chain theo CLAUDE.md protocol.
