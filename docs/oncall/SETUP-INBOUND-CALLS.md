# Hướng dẫn: Nhận cuộc gọi khách vào 10 ext

> Cấu hình OnCallCX PBX để khách gọi số công ty → ring tất cả 10 extension cùng lúc → ai online bắt máy.

## Vấn đề hiện tại

Hiện các ext 101-110 mỗi ext tách riêng, khách chỉ gọi được vào **1 ext duy nhất** (DID đã map 1:1). Nếu ext đó offline, cuộc gọi rơi.

## Giải pháp: Tạo ACD Ring Group

Tạo **extension dịch vụ 100** làm "cổng" chung. Gán DID công ty vào ext 100. Khi khách gọi → ext 100 fan-out ring tất cả 101-110 cùng lúc.

---

## Bước 1: Tạo extension service 100

Truy cập [portal](https://pbx-ucaas.oncallcx.vn/portal/pbxDashboard.xhtml) → **Operations → PBX → Extensions → + New**:

| Field | Giá trị |
|-------|---------|
| Name to Display | **Hotline N2Store** |
| Internal Number | **100** |
| Dial In Number of (DID) | **Số hotline công ty** (vd 02873000100) |
| Display Public Number | Same as DID |
| PIN | (để trống) |
| E-Mail | (để trống — không phải user thật) |

**Save**.

---

## Bước 2: Bật ACD cho ext 100

Vào **Extensions → click dòng ext 100 → Extension Related Features**:

- Trường **Distribution Mode** → chọn **`Advanced Call Distribution ACD`**
- **Save**
- Link **"Advanced Call Distribution ACD"** xuất hiện → click

---

## Bước 3: Cấu hình ACD ring 10 ext

Trong màn hình ACD:

### 3.1. Timetable
- Chọn **`Permanent`** (24/7, không cần lịch)

### 3.2. Destinations
Bấm **`+ New`** 10 lần, thêm từng ext:
```
101
102
103
104
105
106
107
108
109
110
```

### 3.3. Method
Chọn **`Parallel`** (ring tất cả cùng lúc):
- Slider `Start delay`: **0s** cho tất cả
- Slider `Duration`: **30s** (ring 30 giây)

> Nếu muốn ring theo thứ tự (101 trước, không ai bắt thì 102…) → chọn **`Cyclic`** + `Reroute Timeout: 14s`.

### 3.4. Queue
- `Queue size`: **5** (tối đa 5 khách chờ)
- `Queue timeout`: **60** (chờ tối đa 60 giây)

> ⚠️ **Bắt buộc** set ≥1 giá trị > 0 cho `Queue size` hoặc `Queue timeout`. Nếu cả 2 = 0 → fallback KHÔNG BAO GIỜ chạy.

### 3.5. Fallback
- `Fallback if no response to`: **`*86`** (voicemail) hoặc số di động admin (`+84901234567`)

**Save**.

---

## Bước 4: (Tuỳ chọn) Nhạc chờ

Nếu muốn khách nghe nhạc khi chờ:
1. Trong ACD screen → panel **Audio Files → + New**
2. Upload file MP3/WAV (max 5 phút)
3. Quay lại tab **Notification & Waiting music** → chọn file vừa upload làm **Waiting music**

---

## Bước 5: (Tuỳ chọn) Timetable — giờ hành chính

Nếu muốn routing khác ngoài giờ (vd ngoài 8h-17h → voicemail):

1. **PBX → Timetables → + New** → Name: "Working Hours"
2. Grid: chọn Thứ 2–Thứ 7, giờ 8h–17h → paint bằng **Timeband-1**
3. Quay lại ACD ext 100 → đổi **Timetable** từ `Permanent` sang `Working Hours`
4. Config riêng cho 2 khoảng:
   - **Timeband-1 Hours**: ring 10 ext như trên
   - **Non-Timeband Hours**: fallback voicemail trực tiếp

---

## Bước 6: Test

1. Trên điện thoại (ngoài hệ thống) gọi số công ty **02873000100**
2. Tất cả 10 máy / 10 ext browser widget phải ring cùng lúc
3. Bất kỳ ai bắt máy → cuộc gọi nối máy đó, 9 máy kia tắt chuông
4. Verify log: **Portal → PBX → Calls** → thấy CDR với From/To/Duration

---

## Luồng hoạt động

```
Khách gọi 02873000100
         ↓
PBX OnCallCX nhận DID
         ↓
Route tới ext 100 (ACD service)
         ↓
ACD Parallel → fan-out INVITE
         ↓
Ext 101 102 103 ... 110 cùng ring
(ở các browser widget đã register)
         ↓
User bất kỳ bấm "Bắt máy"
         ↓
PBX send CANCEL cho 9 ext còn lại
         ↓
Cuộc gọi 2 bên: khách ↔ user
```

---

## Lợi ích của approach này

✅ **Không cần server-side registrar** (đã deploy nhưng có NAT limitation)
✅ **Không cần tất cả 10 user online** — chỉ 1 user bắt máy là đủ
✅ **Voicemail tự động** khi cả shop nghỉ
✅ **Giờ hành chính** configurable
✅ **Scale**: thêm ext mới chỉ cần thêm vào ACD destinations

---

## Các câu cần hỏi FPT/OnCallCX support

1. **DID**: Số hotline công ty là gì? Dải DID hiện có cấp bao nhiêu số?
2. **Trunk**: Client trunk SIP đã setup chưa? Carrier nào?
3. **REST API**: Có click-to-call REST API để gọi ra từ code không?
4. **Webhook**: Có push event "incoming call" sang URL của mình không?
5. **Recording**: Call recording có sẵn không? Lưu bao lâu? Download thế nào?

Hotline FPT UCaaS: theo hợp đồng dịch vụ.

---

## Tham khảo

- [oncallcx-ucaas-v2-complete.md](oncallcx-ucaas-v2-complete.md) (line 518-563): ACD Method details
- [oncallcx-ucaas-v2-complete.md](oncallcx-ucaas-v2-complete.md) (line 466-497): Timetable configuration
- [oncallcx-ucaas-v2-complete.md](oncallcx-ucaas-v2-complete.md) (line 366-379): Voicemail setup
- [VI-Huong-dan-quan-tri-TĐ-ONCALLCX-UCAAS--V2.0.pdf](VI-Huong-dan-quan-tri-TĐ-ONCALLCX-UCAAS--V2.0.pdf): Manual gốc tiếng Việt
