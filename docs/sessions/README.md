<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Session Resume Protocol — N2Store

> Mục đích: nối liền context giữa các đoạn hội thoại Claude. Sau mỗi commit+push, một file resume được sinh ra trong thư mục này. Mở chat mới chỉ cần paste **resume token** ngắn — Claude tự đọc file và biết toàn bộ ngữ cảnh phiên cũ để làm tiếp.

---

## 1. Vì sao không dùng base64 / hash thô

| Phương án | Vấn đề |
|---|---|
| Base64 toàn bộ transcript | File hội thoại có thể vài MB → paste không nổi, vượt context |
| SHA hash | 1-chiều, không recover content được |
| LZ-string compress | Vẫn quá dài cho hội thoại dài, lại làm khó đọc/audit |

→ **Giải pháp**: token ngắn (~30 ký tự) trỏ đến file markdown **có cấu trúc** trong git. Token để paste, file để đọc, git để đồng bộ giữa máy / chia sẻ.

---

## 2. Format Resume Token

```
RESUME:YYYYMMDD-HHMMSS-<gitSha7>
```

Ví dụ: `RESUME:20260513-094400-2f8a169`

- `YYYYMMDD-HHMMSS` = timestamp tạo session resume (local time, GMT+7)
- `<gitSha7>` = 7 ký tự đầu của commit SHA mới nhất (HEAD)
- File tương ứng: `docs/sessions/20260513-094400-2f8a169.md`

---

## 3. Khi nào tạo file resume

**BẮT BUỘC** sau mỗi lần Claude thực hiện flow `commit + push` thành công:

1. Verify push xong (`git rev-parse HEAD` = `git rev-parse @{u}`)
2. Lấy SHA7: `git rev-parse --short=7 HEAD`
3. Tạo file `docs/sessions/<timestamp>-<sha7>.md` theo template
4. Commit + push file đó luôn (1 commit nhỏ riêng: `chore(session): resume token <sha7>`)
5. In token ra cuối câu trả lời theo format: `🔗 RESUME:<timestamp>-<sha7>`

**Cách nhanh**: chạy `bash scripts/save-session-resume.sh "<summary 1 dòng>"` — script tự làm hết.

---

## 4. Khi nào CLAUDE đọc resume

Trong đoạn hội thoại mới, **nếu user paste chuỗi match regex** `RESUME:[0-9]{8}-[0-9]{6}-[a-f0-9]{7}`:

1. Parse token → lấy filename `docs/sessions/<timestamp>-<sha7>.md`
2. `Read` file đó
3. Tóm tắt ngắn (2-3 câu) cho user xác nhận hiểu đúng phiên cũ
4. Tiếp tục từ "Next Steps" trong file

Nếu file không tồn tại (token sai / file đã xóa) → báo lỗi cho user, KHÔNG đoán mò.

---

## 5. Template file session

Xem [`_TEMPLATE.md`](./_TEMPLATE.md). Mỗi session phải có 6 mục:

1. **Header** — timestamp, branch, commit range, author
2. **Summary** — 2-4 câu mô tả phiên đã làm gì
3. **Files Modified** — list path + ý nghĩa thay đổi
4. **Key Decisions** — quyết định kỹ thuật + lý do (để session sau không lặp lại debate)
5. **Open Todos / Next Steps** — phần dở dang, hướng đi tiếp
6. **Context Pointers** — file/doc/URL cần đọc để vào việc tiếp

---

## 6. Tools hỗ trợ (research)

Đã khảo sát các giải pháp sẵn có để khỏi reinvent:

- **`/save-session` + `/resume-session`** (Claude Code built-in skill) — lưu vào `~/.claude/sessions/`, không follow repo, không share giữa máy. Phù hợp cho dev cá nhân, không phù hợp dự án nhiều máy / nhiều người.
- **`ck` skill** (persistent per-project memory) — auto-load, nhưng append-only memory chunks, không structured cho "tiếp tục công việc dở".
- **`continuous-learning` skills** — focus extract patterns chứ không full session state.
- **Aider's chat history (`.aider.chat.history.md`)** — gần nhất với pattern này, nhưng quá verbose (raw transcript).
- **OpenAI Cookbook — "Session Memory with Vector Stores"** — over-engineered cho use case của repo nhỏ.

→ Chọn approach **token + file markdown trong git** vì:
- Zero dependency, chỉ markdown + bash
- Git-tracked → đồng bộ giữa máy, có history
- Token ngắn, paste tay được
- File structured → Claude đọc nhanh, audit được
- Tương thích với 3 file root đã có (CLAUDE.md, MEMORY.md, dev-log.md)

---

## 7. Cleanup policy

- Giữ resume files trong git **vĩnh viễn** (chúng là log nối tiếp lịch sử dev)
- Không cần xóa cũ — markdown nhỏ, repo chịu được hàng nghìn file
- Nếu cần archive: di chuyển vào `docs/sessions/archive/<năm>/` thay vì xóa
