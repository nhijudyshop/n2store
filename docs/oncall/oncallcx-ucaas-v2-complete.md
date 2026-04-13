<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Tổng hợp hoàn chỉnh — OnCallCX UCaaS (V1.1 + V2.0 + Portal Live)

> **Nguồn tổng hợp**:
> - PDF V1.1: `oncallcxucaasuserguidevieforcustomerv112 (2).pdf` (75 trang)
> - PDF V2.0: `VI-Huong-dan-quan-tri-TĐ-ONCALLCX-UCAAS--V2.0.pdf` (78 trang)
> - Portal Live: `pbx-ucaas.oncallcx.vn` (fetched 2026-04-11)
>
> **Nhà phát hành**: FPT Telecom — sản phẩm OnCallCX UCaaS
> **Ngày tổng hợp**: 2026-04-11

Tài liệu kết hợp phân tích chi tiết từ 2 phiên bản PDF (V1.1 + V2.0) cùng dữ liệu thực từ PBX Portal. Bao gồm bảng tra cứu nhanh, cảnh báo pitfall, SIP config thật, và inventory 16+ trang portal.

---

## Mục lục

0. [Portal Live — Thông tin PBX thật](#0-portal-live--thông-tin-pbx-thật)
1. [Giao diện PBX Portal & Tài khoản](#1-giao-diện-pbx-portal--tài-khoản)
2. [Quản lý bộ phận & số máy nhánh](#2-quản-lý-bộ-phận--số-máy-nhánh)
3. [Kết nối & quản lý thiết bị SIP](#3-kết-nối--quản-lý-thiết-bị-sip)
4. [Định tuyến & phân phối cuộc gọi](#4-định-tuyến--phân-phối-cuộc-gọi)
5. [Cuộc họp hội nghị](#5-cuộc-họp-hội-nghị)
6. [anConnect & anMeet (V1.1)](#6-anconnect--anmeet)
7. [Lịch sử cuộc gọi](#7-lịch-sử-cuộc-gọi)
8. [Hướng dẫn cài đặt thiết bị đầu cuối (V2.0 mới)](#8-hướng-dẫn-cài-đặt-thiết-bị-đầu-cuối-v20-mới)
9. [Cheatsheet — Tổng hợp service codes](#9-cheatsheet--tổng-hợp-service-codes)
10. [Ghi chú phân tích & pitfalls](#10-ghi-chú-phân-tích--pitfalls)

---

## 0. PORTAL LIVE — THÔNG TIN PBX THẬT

> Dữ liệu fetch trực tiếp từ `https://pbx-ucaas.oncallcx.vn/portal/` ngày 2026-04-11.

### Account & PBX

| Trường | Giá trị |
|---|---|
| **PBX Name** | UCaaS_HNCX01402 |
| **Doanh nghiệp** | HỘ KINH DOANH LÊ ÁNH DUNG - TOMATO HOUSE |
| **Email admin** | carmelledung@gmail.com |
| **Public Number** | 0963839208 |
| **Valid From** | 13.04.2026 16:59 |
| **CTI Device ID** | ou.69437 |
| **SIP Server** | `pbx-ucaas.oncallcx.vn` |
| **SIP Port** | `9060` (UDP) |
| **Portal URL** | `https://pbx-ucaas.oncallcx.vn/portal/` |

### Dashboard Statistics

| Metric | Actual | Max |
|---|---|---|
| Extensions | 0 registered | 10 |
| Service Extensions | — | 10 |
| Phones | 0 registered | 0 configured |
| External Channels | 0 | 10 |
| Internal Calls | 0 | — |
| External Calls | 0 | 10 |
| Inbound / Outbound Calls | 0 / 0 | — |
| VoiceMail | Good / 0 full | — |

### Extensions hiện có
- Extension `101` — Distribution Mode: Phones

### Add-ons
- DECT Add-ons
- O365 Presence Add-ons (Setup/Remove wizard)

### Portal Navigation Map (4 nhóm, 16+ trang)

| Nhóm | Trang |
|---|---|
| **Extension** (PBX Member) | Features, Phones, Calls, Call Analytics, Contacts, Blocked Numbers |
| **Department** | Settings, Users, Holidays, Timetables, Calls, Contacts, Blocked Numbers |
| **PBX** (UCaaS_HNCX01402) | Dashboard, Settings, Public Numbers, Extensions, Users, Add-ons, Phones, Holidays, Timetables, Calls, Live Calls, Call Analytics, Contacts, Blocked Numbers, Conference Rooms |
| **Operations** | Dashboard, Public Numbers, OrgUnits, Users, PBX List, Logs, Calls, Pricelists, Phone Types, Add-on Types |

### SIP Configuration (V2.0 PDF trang 72 + Portal)

| Tham số | Giá trị |
|---|---|
| **Server IP/Address** | `pbx-ucaas.oncallcx.vn` |
| **Port** | `9060` |
| **Transport** | `UDP` |
| **User Name/Number** | Số extension (vd `100`, `101`) |
| **Register Name/Auth ID** | Lấy từ Portal: Extension → Phone Setup → Manual config → Next |
| **(Auth) Password** | Auto-generated, mỗi extension khác nhau |
| **Zoiper Username** | `extension@pbx-ucaas.oncallcx.vn:9060` |
| **Zoiper Outbound Proxy** | `pbx-ucaas.oncallcx.vn:9060` |

> IP `42.112.59.137:5060` có thể là IP trực tiếp. PDF V2.0 dùng domain `pbx-ucaas.oncallcx.vn:9060` — khuyến nghị dùng domain.

---

## 1. GIAO DIỆN PBX PORTAL & TÀI KHOẢN

### 1.1 Đăng nhập / Đăng xuất
- URL truy cập: PBX Portal do FPT cung cấp.
- **Username = địa chỉ email** của người dùng. Bắt buộc phải là email thật vì:
  - Liên kết khôi phục mật khẩu (`Password forgotten?`) gửi tới hộp thư này.
  - Sau khi tạo tài khoản, **không nên đổi email** vì gây mất khả năng recovery.
- Đăng xuất: click avatar góc phải → **Logout**.
- Tuỳ chọn `Use as initial page` cho phép đặt trang hiện tại làm trang khởi động sau login.

### 1.2 Sắp xếp & bộ lọc
- **Sort**: click tiêu đề cột (E-Mail, First Name, Last Name…). Quay lại mặc định bằng `F5` hoặc icon refresh.
- **Filter** (icon phễu):
  - Hiển thị thanh nhập multi-tiêu chí (E-Mail, First Name, Last Name, Roles, OrgUnit, User Blocked…).
  - Nhập một phần ký tự (vd `vu`) → bấm **Apply** → lọc.
  - Xoá filter qua icon `×` cạnh tag bộ lọc.
- **Autocomplete**: form cấu hình (vd Choose extension) tự gợi ý khi gõ ký tự đầu.

### 1.3 Inline-Help
- Mỗi trang có icon `?` (thường ở góc phải header). Click để bật/tắt mô tả ngắn về thao tác trên trang đó. Hữu ích cho admin mới.

---

## 2. QUẢN LÝ BỘ PHẬN & SỐ MÁY NHÁNH

### Khái niệm cốt lõi
Hệ thống có quan hệ: **PBX → Departments → Extensions → Phones (SIP devices)**.

Khi đã có extension + department, PBX được "kích hoạt" để:
- Kết nối điện thoại SIP vào hệ thống.
- Quản lý chuyển tiếp cuộc gọi, từ chối, voicemail.
- Tạo "cuộc gọi nhóm" qua **ACD** (Advanced Call Distribution) hoặc **IVR** (Interactive Voice Response).
- Tổ chức theo Department: cấu hình giống PBX cha, định tuyến riêng, có quản trị viên riêng.

**Hai loại extension**:

| Loại | Quyền sở hữu | Mục đích | Distribution mặc định |
|---|---|---|---|
| **Cá nhân** (Personal) | 1 PBX Member | Cuộc gọi cá nhân; gán không giới hạn số phones | All Phones |
| **Dịch vụ** (Service) | PBX hoặc Department | Cuộc gọi nhóm (ACD/IVR) | ACD/IVR |

> ⚠️ Quy ước ngầm: Extension **không có phone gán** sẽ tự động được tính là Service Extension.

### 2.1 Tạo & quản lý Department
**Đường dẫn**: Operations → PBX List → chọn PBX → Departments → **+ New**

| Trường | Mô tả |
|---|---|
| **Name** | Tên bộ phận |
| **Description** | Diễn giải thêm |
| **External channels** | Số cuộc gọi đồng thời tối đa (cả vào & ra) cho department. **0 = chặn hoàn toàn cuộc gọi qua PBX** |
| **Time mode** | Định tuyến theo thời gian biểu (chi tiết §4.1) |
| **Email / First Name / Last Name** | Tài khoản admin của department |
| **Language** | Ngôn ngữ Web Portal, In-Band messages, VoiceMail announcements |

- **Quản lý**: vào lại Department List → click row → trang `Department Settings` (chứa Topstop, Department Extensions Overview, On Hold Music…).
- **Xoá**: tick row → **× Delete**.

### 2.2 Tạo & quản lý Extension
**Đường dẫn**: Operations → PBX → Extensions → **+ New**

| Trường | Mô tả |
|---|---|
| **Name to Display** | Tên hiển thị cho extension |
| **Member of** | Mặc định = tên PBX (có thể chọn department) |
| **Internal Number** | Số nội bộ — **tối đa 10 chữ số** |
| **Dial In Number of** | Số public (DID) cho phép gọi vào extension |
| **Display Public Number** | Số hiển thị khi gọi ra ngoài (CLI outbound) |
| **Outbound Public Number** | Số public hiển thị khi gọi ra (V2.0 — có thể khác Display Public Number) |
| **Display Public Number Group** | Toggle bật/tắt nhóm số hiển thị (V2.0) |
| **PIN** | Mã PIN của extension (nếu cần) |
| **International / National / National VAS** | 1 trong 3 quy tắc: `Allowed`, `Blocked`, `PIN required`. Phân loại số này dựa trên **bảng giá cước** gán vào PBX |
| **E-Mail / First / Last Name / Language** | Thông tin tài khoản người dùng |

- **Extension Setup** (nút riêng trên trang Extension Related Features): xem/sửa tham số chi tiết của extension; **Send** để gửi hướng dẫn cấu hình qua email.

#### Xoá extension
> ⚠️ **TẤT CẢ** dữ liệu liên kết bị xoá: phones, voicemail, messages.
> ✅ **KHÔNG bị xoá**: CDR (Call Detail Records) — vẫn giữ để báo cáo/billing.

#### Generate dải extension hàng loạt (nút **Generate**)
**Mode 1 — Không có DID**:
- Chỉ cần `Extension range` (vd `301 → 305`).
- Nếu dải mới chứa số đã tồn tại → lỗi `Extensions could not be generated. Internal numbers are not unique.`
- Nếu dải quá lớn so với giới hạn license → lỗi `Maximum number of extension reached`.
- `Department` là tuỳ chọn để gán bộ phận.

**Mode 2 — Có DID + Display Public Number**:
- `Extension range` (vd `100–105`) + `Dial In Number of` (vd `02873000000–02873000005`).
- **Sai lệch độ dài dải**:
  - DID < extension → các extension cuối không nhận DID.
  - DID > extension → DID dư không dùng.
  - DID đã được sử dụng → hộp thoại 3 lựa chọn:
    - **Cancel**: huỷ.
    - **Skip**: bỏ qua DID đã dùng, extension mới không có DID.
    - **Replace**: lấy DID khỏi extension cũ, gán cho extension mới.
- `Displayed Public Number`:
  - `Same as for DID` — CLI = DID
  - `Same for all extensions` — CLI cố định cho cả dải

### 2.3 Tổng quan tính năng theo extension

**Đường dẫn truy cập**:
- **PBX Member** (user): menu `Features` → trang **Extension Related Features**. Chỉ Member mới xem/nghe được voicemail riêng tư.
- **PBX Administrator**: Extensions → click row → mở Extension Related Features.

#### a) Call Forwarding (chuyển tiếp cuộc gọi)

| Loại | Mô tả | Active | Deactive | Status | Tham số Web |
|---|---|---|---|---|---|
| **CFU** — Call Forward Unconditional | Chuyển tiếp mọi cuộc gọi | `*21<số>` | `#21` | `*#21` | Unconditional |
| **CFF** — Call Forward Fallback | Khi không có SIP registration hợp lệ | `*22<số>` | `#22` | `*#22` | Call Failed |
| **CFNR** — Call Forward No Reply | Không trả lời sau **14 giây** | `*61<số>` | `#61` | `*#61` | No Reply |
| **CFB** — Call Forward Busy | Khi đang bận cuộc gọi khác | `*67<số>` | `#67` | `*#67` | On Busy |
| **CFO** — Call Forking | Chia sẻ cuộc gọi tới số bổ sung **đồng thời** | `*481<số>` | `#481` | `*#481` | — |
| **Reset all CF** | Xoá tất cả CF đang active | `*00` | — | `*#00` | — |

#### b) Call Rejection

| Tính năng | Mô tả | Active | Deactive | Status | Tham số Web |
|---|---|---|---|---|---|
| **DND** — Do Not Disturb | Từ chối tất cả cuộc gọi đến | `*26` | `#26` | `*#26` | Do Not Disturb |
| **ACR** — Anonymous Call Reject | Từ chối cuộc gọi giấu số | `*99` | `#99` | `*#99` | Reject Anonymous Calls |

#### b2) Account settings (V2.0 bổ sung)
- **Forward call to 'On Busy'** — chuyển tiếp khi bận
- **Suppress own Number** — ẩn số khi gọi ra
- **Reject Anonymous Calls** — từ chối cuộc gọi ẩn danh
- **Call waiting** — báo cuộc gọi chờ
- **Ring 'On not Available'** — đổ chuông khi extension không available (V2.0 mới)
- **Distribution Mode** — dropdown: All Phones / ACD / IVR / Phones / Paging

#### c) Connection-oriented

| Tính năng | Mô tả | Code |
|---|---|---|
| **Call Pick Up** | Nhận cuộc gọi đến extension khác bằng phone bất kỳ trong PBX | `*76<số>` |
| **Flip Phone** | Tiếp nhận cuộc gọi đang active sang phone khác cùng extension | `*78` |

#### d) Conference

| Tính năng | Code | Ghi chú |
|---|---|---|
| Tham gia phòng hội nghị | `*72` | Phải cấu hình phòng trước qua menu Conference Rooms (§5) |

#### e) VoiceMail Box

- **Truy cập**: `*86` — kết nối với VoiceMail Box của extension.
- **Lời chào cá nhân**:
  - Định dạng: **WAV (PCM)** hoặc **MP3**
  - Thời lượng: **tối đa 2 phút**
  - Upload: nút **Upload** → chọn file → **Save**
  - Nghe lại: nút ▶
  - Xoá để revert default hệ thống: **Delete**
- **Tuỳ chọn cấu hình** (trên trang VoiceMail Box):
  - `Set PIN`, `PIN bypass for extension`, `Call back allowed`
  - `Send message by e-mail` + `Email attachment format` (vd `mp3`)
  - `Send email if no message was left`
  - `Delete VM after sending email`

---

## 3. KẾT NỐI & QUẢN LÝ THIẾT BỊ SIP

### 3.1 Tổng quan
- **N device / 1 extension**: bất kỳ SIP device nào (IP phone, ATA…) đều có thể đăng ký với 1 extension; số lượng không giới hạn.
- Một số model phone được hỗ trợ provision/re-provision trực tiếp từ Web Portal.

### 3.2 Provisioning — 3 phương án

#### a) Auto-Provisioning theo MAC Address
1. Admin tạo phone mới với **MAC Address** thật của thiết bị, chọn `Provisioning Option = Auto-Provisioning`. Có thể tick gửi hướng dẫn qua email user.
2. Admin báo user kết nối phone.
3. User factory reset phone → cắm Internet → phone tự gọi redirect server và tải config từ PBX.
> Phone **bắt buộc có Internet outbound** để tới redirect server.

#### b) Provisioning bằng file URL (.xml)
1. Admin tạo phone với `Provisioning Option = Configuration of the provisioning file URL`. Hệ thống sinh URL `config.xml` (one-time key gắn trong filename).
2. Admin gửi URL cho user (hoặc qua email tự động).
3. User truy cập **Web-GUI của phone** → Settings → Sub-menu **Auto-Provision** → dán URL vào `Server URL` → **Confirm** → **Autoprovision Now** → **OK**.
4. Cấu hình tính năng nâng cao tiếp tục qua giao diện PBX.

#### c) Manual SIP credentials
1. Admin tạo phone với `Provisioning Option = Manual configuration of SIP-Credentials`.
2. Admin gửi user các giá trị (xuất hiện trong panel Provisioning Instructions):
   - `Server IP/Address` = `pbx-ucaas.oncallcx.vn` (port `9060`)
   - `Port`
   - `Display Name (and Label)`
   - `User Name/Number`
   - `Register Name / Auth ID`
   - `(Auth) Password`
   - `Transport (Protocol/Type)` = `UDP`
3. User mở Web-GUI phone → SIP settings/Connection → nhập đầy đủ → **Activate** identity/line/account.

### 3.2.x Cấu hình phím & ringtone (Phone Keys)
- **Đường dẫn**: Phones → click row phone → trang **Phone Related Features** → block `Phone Keys` (Type/Value/Label) và `Phone Notification` (Internal Call / External Call ringtone).
- Mở rộng qua **Phone Auxiliary Keyboards**.
- **Đồng bộ**:
  - Phone online + registered → tự sync.
  - Không tự sync → bấm **Synchronize** thủ công.
  - Verify qua trường `Last Synchronization` ở **Phone Related Status**.

### 3.2.2 Re-Provisioning
**Khi nào dùng**:
- Phone hỏng, phải thay thế.
- Đổi sang model khác.
- Đã tải config thành công nhưng config thiếu/sai → registered nhưng không hoạt động đúng.
- Config corrupt.

**Tác dụng**: Re-provisioning thay đổi 2 thành phần trong config:
1. **SIP credentials mới** → đảm bảo chỉ phone mới này đăng ký được.
2. **One-time key của file config mới** → file config cũ không tải lại được nữa (chống replay).

> Lợi ích: tránh phải xoá phone trên PBX và tạo lại từ đầu.

**Quy trình**:
1. Factory reset thiết bị.
2. Nếu là phone mới: cập nhật `Telephone Type` mới, `MAC Address` mới.
3. Vào Phones → click row phone → **Phone Setup** → bấm **🔄 Phone Configuration Re-Provisioning**.

### 3.3 Kiểm tra đăng ký SIP

**Vị trí xem**:
- **Dashboard PBX** — block `Phone Information`
- **Danh sách Phones** — cột `Registration Status`
- **Extensions Overview** — icon trạng thái mỗi extension

**Trạng thái** (đèn màu):

| Màu | Ý nghĩa |
|---|---|
| 🟢 **Xanh** | Ít nhất 1 phone đang đăng ký |
| 🔴 **Đỏ** | Đã từng đăng ký nhưng hiện không active |
| ⚫ **Đen** | Chưa từng có phone nào đăng ký |

**Chi tiết SIP**: Phones → click row → **Phone Related Status**:
- `Last Synchronization` — timestamp đồng bộ cuối
- `ACD Membership`
- Bảng **Registrations**: Status, Expires, IP, Extension, Endpoint, UserAgent (vd `Yealink SIP-T21P_E2`), Contact (`sip:1006@...`)
- Bảng **Subscriptions**: events `message-summary`, `as-feature-event`

---

## 4. ĐỊNH TUYẾN & PHÂN PHỐI CUỘC GỌI

### 4.1 Định tuyến theo Timetable

**Khái niệm**:
- **Timetable** = tài nguyên thuộc PBX hoặc Department.
- Mỗi Timetable chứa **tối đa 5 Timeband** + 1 **"Off Timeband"** cho thời gian ngoài.
- Mỗi Timeband ràng buộc với 1 ACD/IVR cụ thể.
- Timeband xác định lịch theo: ngày trong tuần, giờ trong ngày, holiday.

#### 4.1.1 Tạo & quản lý Holiday
**Đường dẫn**: PBX → Holidays → **+ New** / Edit / **Import** / **Export** Excel.

- Mỗi holiday có `Name` + `Date`.
- Hỗ trợ nhập/xuất Excel để batch update danh sách ngày lễ năm mới.

#### 4.1.2 Tạo & quản lý Timetable
**Đường dẫn**: PBX → Timetables → **+ New**.

- Mỗi Timetable có lưới `Mo–Su–Ho × 0h–24h`.
- **Tạo Timeband**: chọn `Timeband-1..5` (mỗi cái 1 màu) → thêm `Registration Period` (`From`, `To`, checkbox `Mon..Sun, Holiday`).
- Có thể chứa nhiều registration period cho cùng 1 Timeband để mô tả lịch phức tạp.
- Hỗ trợ Import/Export Excel.

#### Timetable Modes của PBX (chế độ tổng)
| Mode | Hành vi | Reset |
|---|---|---|
| **Timetable** | Mặc định, áp dụng Timetable đã cấu hình | — |
| **Night** | Toàn bộ call rơi vào "Off Timeband" từ thời điểm kích hoạt → 24:00 | Tự động 24:00 cùng ngày |
| **Night Permanent** | Như Night | Manual |
| **Weekend** | Toàn bộ call rơi vào "Off Timeband" cho đến hết Chủ nhật tới | Tự động 24:00 Chủ nhật |
| **Weekend Permanent** | Như Weekend | Manual |

> Use case điển hình: lễ tết khẩn cấp → bật Weekend Permanent → tất cả call định tuyến về lễ tân/IVR ngoài giờ.

### 4.2 Audio files & thông báo
**Dùng cho**:
- **Call Hold** — nhạc chờ
- **VoiceMail Box** — lời chào cá nhân
- **ACD** — thông báo + nhạc chờ
- **IVR** — menu announcement + waiting music

**Định dạng & giới hạn**:
- WAV (PCM) hoặc MP3
- Thời lượng tối đa: **5 phút** (riêng VoiceMail box: 2 phút)
- ACD/IVR: kích thước file tối đa **50 MB**

**Quy trình**: Upload → Choose new file → Save → test bằng nút ▶.

### 4.3 Distribution Mode "All Phones"
- Dùng cho extension cá nhân.
- **Cấu hình**: Extensions → click row → trường `Distribution Mode = All Phones` → Save.
- Hành vi: tất cả phones đăng ký với extension đổ chuông **đồng thời**. User vẫn dùng đầy đủ Call Forwarding, Reject, DND…

### 4.4 ACD — Advanced Call Distribution

- **Activate**: Distribution Mode = `Advanced Call Distribution ACD` → Save → click link **Advanced Call Distribution ACD** mới xuất hiện.

#### Bước 5.1 — Selected timetable
| Lựa chọn | Hành vi |
|---|---|
| `Permanent` | Không gắn timetable, áp dụng 24/7 |
| Một timetable cụ thể | Mỗi Timeband cấu hình ACD riêng biệt: Destinations, Method, Queue, Notification, Music |

> Nếu trước đó ACD đã có cấu hình "Permanent", khi chuyển sang timetable thì cấu hình cũ được gán vào "Non-Timeband Hours".

#### Bước 5.2 — Notification & Waiting music
- Upload audio (panel `Audio Files` → **+ New** → đặt `Name` → **Upload** → **Save**).
- Chọn:
  - `Waiting music` — nhạc chờ
  - `Notification` — thông báo
  - `Play the notification the first time after` — delay (giây)
  - `Repeat every` — chu kỳ lặp (giây)

#### Bước 5.3 — Cấu hình Call Distribution

**Destinations** — thêm bằng nút **+ New** ở block Call Distribution:
- `Number`: extension nội bộ, số quốc gia hoặc quốc tế
- `Phone`: chọn chính xác 1 SIP phone (vật lý) trong PBX/Department
- `Fallback if no response to`: số dự phòng khi không destination nào trả lời

**Method** — phương thức báo hiệu:

| Method | Mô tả | Tham số chính |
|---|---|---|
| **Linear** | Báo hiệu lần lượt từ destination đầu → cuối → quay lại đầu (mọi cuộc gọi mới đều bắt đầu từ #1) | `Reroute Timeout` — thời gian ring mỗi destination |
| **Cyclic** | Như Linear nhưng **mỗi cuộc gọi mới bắt đầu ở destination kế tiếp** (load balance hợp lý cho call center) | `Reroute Timeout` |
| **Parallel** | Mỗi destination ring theo pattern user định nghĩa qua slider (delay + duration). Cho phép đồng thời + lệch giờ | `Configure ringing start and duration`, `Queue Timeout` (= max ringing tổng) |
| **User defined** | ⚠️ **Không sử dụng** (PDF ghi rõ). Như Parallel nhưng không có waiting queue | — |

> **Rule of thumb tính ringing duration**: phone ring ~4s/cycle; 3 cycles + 2s buffer = 14s.

**Queue** (chống flood người chờ):

| Tham số | Ý nghĩa | Lưu ý |
|---|---|---|
| `Queue size` | Số người chờ tối đa | `0` = tắt queue, fallback ngay |
| `Queue Timeout` | Thời gian tối đa chờ trong queue (giây) | `0` = chờ vô hạn |

> ⚠️ **PITFALL nghiêm trọng**: Nếu cả `Queue Size = 0` **và** `Queue Timeout = 0` → **fallback destination KHÔNG BAO GIỜ được gọi**. Đây là lỗi cấu hình rất phổ biến.

### 4.5 IVR — Interactive Voice Response

- **Activate**: Distribution Mode = `Interactive Voice Response IVR` → Save → click link **Interactive Voice Response IVR**.

#### Cấu trúc IVR
- 1 IVR có nhiều **Menu**.
- Mỗi Menu có nhiều **IVR-Rule** dạng `Condition → Action`.

#### Conditions (điều kiện kích hoạt rule)

| Condition | Mô tả |
|---|---|
| `Immediately when the menu starts` | Thực thi ngay khi menu được vào, không cần input |
| `After some delay` | Sau N giây (vd 14s) |
| `If a key is pressed` | Khi user nhấn phím xác định. Có thể là nhiều phím `0-3,9,*,#`, hoặc `0-9` để match toàn bộ |
| `If a collected number matches a certain criteria` | Khi chuỗi số người dùng nhập khớp regex |

#### Actions (hành động)

| Action | Mô tả |
|---|---|
| `Call a number` | Quay số đã cấu hình. Có option fallback menu khi không trả lời |
| `Play an audio file` | Phát file âm thanh (lặp). Option fallback menu khi phát xong |
| `Play a notification` | Phát 1 lần, có thể lặp định kỳ (vd 15s) |
| `Change to another menu` | Chuyển sang menu IVR khác |
| `Release this connection` | Ngắt kết nối ngay |
| `Call the collected number` | Quay số do user nhập. **Bắt buộc** có pattern regex để bảo mật. Hỗ trợ sed `s/.../.../` và Java regex backreference để biến đổi (vd thêm prefix `*86` khi listen voicemail từ outside) |

#### Bảng regex tham khảo (PDF page 52–54)

| Pattern | Match | Use case |
|---|---|---|
| `2673` | đúng `2673` | PIN cố định, single number |
| `(123\|99\|056789)` | 1 trong 3 số chính xác | Whitelist nhỏ — vd `(110\|112\|023456789)` cho khẩn cấp + hotline công ty |
| `40[7-9]` | 407 / 408 / 409 | Dải số nhỏ (3 chữ số, prefix `40`) |
| `[125]...0` hoặc `[125].{3}0` | 5 ký tự, đầu 1/2/5, vị trí 5 = `0` | Pattern tương tự |
| `[1-9][1-9][1-9]` hoặc `[1-9]{3}` | 3 chữ số ≠ 0 | Extension nội bộ ≤ 3 chữ số (chặn quốc tế vì không cho `0` đầu) |
| `[1-9]*` | Mọi độ dài, không có `0` | Extension nội bộ tự do (chặn quốc tế) |

#### Quy trình cấu hình IVR

1. **Chọn timetable** (Permanent / một timetable):
   - Mỗi Timeband sẽ có `Start menu during timeband-X hours`.
   - Non-timeband hours: `Start menu during non-timeband hours`.
2. **Tạo Menus** (panel Menus → **+ New** → đặt Name → Save).
3. **Upload Audio Files** (panel Audio Files → **+ New** → Name → Upload → Save).
4. **Gán waiting music** + **start menu** cho từng Timeband.
5. **Thêm IVR-Rule** vào từng menu (nút **+ New IVR-Rule** trong dialog Menu).

**Ví dụ menu (PDF page 60)**:
```
Menu "Welcome to the Support" (Level 1):
  - Start immediately AND play notification "Menu Welcome to the Support",
    repeat every 15 seconds
  - On key 1 → call number 41
  - On key 2 → call number 42
  - After 90 seconds delay → release the call
```

Multi-level menu (Level 1 → Level 2 IVR) qua action `Change to another menu`.

### 4.6 Tạm dừng ACD/IVR để bảo trì

Trong khi bảo trì, cần giữ đường dây support hoạt động → kích hoạt **CFU (Unconditional Call Forwarding)** trên extension dịch vụ → forward về:
- VoiceMail Box của extension
- Một extension nội bộ khác
- Số quốc gia/quốc tế

**Thao tác**: Extension Related Features → block `Call Forwarding` → toggle slider **Unconditional** xanh + nhập số đích.

---

## 5. CUỘC HỌP HỘI NGHỊ

### Đặc tính
- **Tối đa 10 người tham gia** mỗi phòng.
- Số phòng duy nhất, có PIN bảo mật.
- Phòng tồn tại đến khi bị xoá thủ công (sử dụng lại được).
- Truy cập internal qua `*72`.

### 5.1 Tạo phòng hội nghị
**Đường dẫn**: PBX → Conference Rooms → **+ New**

| Trường | Quy tắc |
|---|---|
| `Conference Room Number` | 2–16 chữ số |
| `PIN` | 1–16 chữ số. **Optional** — nếu bỏ trống, người gọi vào ngay không cần xác thực |
| `Owner` | Chọn email user sở hữu phòng |
| `Conference Room Name` | Tên hiển thị |

### 5.2 Tham gia phòng

**Internal (member PBX)**:
- Quay `*72` từ phone PBX bất kỳ → nhập `Room Number` + `PIN`.

**External (người ngoài)**:
- Quay public number do người tổ chức cung cấp.
- Tuỳ cấu hình, sẽ được route đến cổng hội nghị qua:
  - Trực tiếp (CFU)
  - IVR menu hướng dẫn
  - Member PBX transfer thủ công
- Sau khi tới cổng → nhập Room Number + PIN.

### 5.3 Cấu hình truy cập từ bên ngoài

#### Option 1 — CFU đơn giản
1. Tạo extension dịch vụ (vd `7000 - Conference Portal`).
2. Gán DID public number (vd hotline `1900xxxx`) làm `Dial In Number of`.
3. Bật slider **Unconditional** trong Call Forwarding với đích `*72`.

#### Option 2 — IVR-Rule (linh hoạt hơn)
1. Tạo extension dịch vụ với Distribution Mode = IVR (hoặc dùng menu IVR có sẵn).
2. Trong IVR-Rule, chọn action `Call a number` → giá trị `*72`.
3. Có thể đặt sau menu chào, vd:
```
Start on key 3 → then call the number *72
```

> Option 2 phù hợp khi public number là tổng đài đa mục đích (hỗ trợ kỹ thuật, sales, hội nghị…).

---

## 6. ANCONNECT & ANMEET

### Tổng quan
- **anConnect** = client unified communication: voice/video call (PBX intern, OnNet, PSTN), instant messaging, file transfer, screen share.
- **anMeet** = video conference rooms (group meeting, raise hand, layout switching…).

### Clients hỗ trợ
| Nền tảng | App |
|---|---|
| Windows | OncallCX Windows |
| macOS | OncallCX macOS |
| Android | OncallCX Android (CH Play) |
| iOS | OncallCX iOS |
| Web | Web OncallCX (khuyến nghị **Chromium-based**: Chrome, Cốc Cốc) |

### 6.1 Kích hoạt / huỷ kích hoạt
**Đường dẫn**: Extensions → click row extension → block **OnCallCX** → toggle slider `OnCallCX Activation`.

> Khi kích hoạt lại sau khi huỷ, **nếu user đăng nhập đúng Encryption Password cũ** → toàn bộ messages + cấu hình anConnect/anMeet được khôi phục.

### 6.2 Setup ban đầu
1. User truy cập anConnect Web với username (email) + password do FPT cấp.
2. Tạo **Encryption Password** để bảo mật end-to-end.

> ⚠️ **CRITICAL**: Encryption Password do user tự quản lý. **Không ai (kể cả FPT) có thể recovery**. Mất → toàn bộ tin nhắn mã hoá đã gửi sẽ mất vĩnh viễn.

3. Sau setup web, user có thể cài thêm app PC/mobile.

### 6.3 Voice/Video call đến contact (anConnect)

**Bước**: chọn contact → click icon ☎ (voice) hoặc 📹 (video).

**Toolbar trong cuộc gọi video**:

| # | Icon | Chức năng |
|---|---|---|
| 1 | Dialpad | Bắt đầu cuộc gọi PSTN xen kẽ |
| 2 | Mic | Tắt/bật micro |
| 3 | Camera | Tắt/bật camera |
| 4 | Share | Chia sẻ màn hình |
| 5 | Sidebar | Ẩn thanh bên |
| 6 | More | Hold / Transfer |
| 7 | 🔴 | Ngắt kết nối |

### 6.4 Cuộc gọi PSTN qua anConnect
1. Click icon dialpad.
2. Quay số → click ☎.
3. Nếu PBX có sync danh bạ → có thể search contact và gọi trực tiếp.

### 6.5 anMeet — Video conference

**Tạo phòng nhóm**:
1. Sidebar Groups → **+ Create group** → đặt tên.
2. Nút **Invite to this room** → mời các contact PBX.

**Bắt đầu meeting**:
1. Bất kỳ thành viên nào chọn phòng → click icon meeting → bắt đầu hoặc tham gia.
2. Banner **Join meeting** hiển thị → click để vào.

**Toolbar anMeet**:

| # | Chức năng |
|---|---|
| 1 | Mute mic |
| 2 | Camera on/off |
| 3 | Share screen / window |
| 4 | Raise hand |
| 5 | Toggle layout người tham gia |
| 6 | Invite participant |
| 7 | More actions (Manage video quality, Full screen, Security options, Mute everyone, Share YouTube, Background, Speaker stats, Settings…) |
| 8 | Leave meeting |

---

## 7. LỊCH SỬ CUỘC GỌI

> V2.0 gọi chương này là "Lịch sử cuộc gọi" (V1.1 gọi "Thống kê cuộc gọi"). Nội dung giống nhau.

### Mỗi cuộc gọi có 1 CDR
Bao gồm: số điện thoại, thời lượng, cước, thông tin kỹ thuật & chất lượng.

### Truy cập
1. PBX → menu **Calls (Lịch sử cuộc gọi)**.
2. **Filter** (icon phễu) — các tham số:
   - `Start from` / `Start until`
   - `Từ` (From) / `Đến` (To)
   - `Số công cộng gọi đi` (Outbound Public)
   - `Duration from` / `Duration until`
   - `Trạng thái SIP` (SIP Status)
   - `Restricted` / `Connected`
   - **Thực hiện (Apply)** để lọc.
3. Chọn 1 row → **Show Call Stats** xem chi tiết.
4. Toggle **Show detailed calls** để xem thêm thông tin chi tiết.
5. Xuất dữ liệu: **Export as .csv** / **Export as .xlsx**.
6. **Play Audio** / **Download Audio** (nếu có recording).

---

## 8. HƯỚNG DẪN CÀI ĐẶT THIẾT BỊ ĐẦU CUỐI (V2.0 MỚI)

> Chương này tổng hợp V1.1 §8 (MS Teams + Desktop) và V2.0 §7 (thêm IP Phone/Zoiper/QR).

### 8.1 MS Teams Plugin

**Tiền điều kiện**: FTI đăng ký plugin OnCallCX trong tenant MS Azure của khách hàng.

**Cài đặt**:
1. Mở Teams Client với cùng email đang dùng cho PBX Portal (PBX Member).
2. Sidebar **Apps** → search `oncallcx`.
3. Mục **Built for your org** → click **Add** hoặc **Open**.
4. Plugin xuất hiện ở sidebar trái. Right-click → **Pin** để ghim.

**Cấu hình Plugin**:
- Mở plugin → tab **Settings**:
  - `Email address` (read-only)
  - **Identity** — chọn extension PBX để điều khiển (vd `1029 1029:OnCallCX`)
  - Radio `Selected identity is device that must support CTI`:
    - **Use local application to start calls** — gọi qua app desktop OnCallCX local
    - **Use selected device to start calls** — CTI control thiết bị SIP từ xa
  - `Theme` — Automatic
  - **Refresh DB** để đồng bộ contact

### 8.2 OnCallCX Desktop App

**Quy trình provisioning (V2.0 trang 69–71)**:
1. Portal → **Extensions** → click extension cần cài → mục **Assigned Phones** → **New Phone**.
2. Tại **Phone Setup** → `Provisioning Option` = **OnCallCX-Desktop** → **Save** → **Send** (gửi email).
3. Lưu ý: extension phải điền email trong **Extension Setup** (nếu chưa có, vào Extension Setup → nhập email → Save).
4. User nhận email **"Desktop Application Provisioning"** từ `ops_as7@oncallcx.vn`:
   - Link tải Windows (`.exe`)
   - Link tải macOS (`.pkg`)
   - **Activation link** — click từ chính máy đã cài
5. Cài đặt → mở **activation link** → app gắn với extension.

**Giao diện app desktop**:
- Dialpad (0–9, *, #)
- History tabs: `All` / `Outgoing` / `Missed` / `Incoming` / `Voicemail`
- Sidebar: Portal, Receive calls, Don't forward calls on busy, Don't forward calls, Settings
- **Yêu cầu**: tai nghe kết nối máy tính & hoạt động bình thường.

### 8.3 IP Phone (Yealink) & App Zoiper (V2.0 MỚI, trang 71–76)

> Section này hoàn toàn mới trong V2.0. Hướng dẫn lấy SIP credentials và cài lên thiết bị vật lý hoặc softphone.

**Bước lấy SIP credentials từ Portal**:
1. Portal → **Extensions** → click extension cần cấu hình.
2. Mục **Assigned Phones** → **New Phone**.
3. **Phone Setup** → `Provisioning Option` = **Manual configuration of SIP-Credentials** → **Save** → **Next**.
4. Hệ thống hiện **Provisioning Instructions** với các thông số:

| Tham số | Ví dụ (extension 100) |
|---|---|
| Server IP/Address | `pbx-ucaas.oncallcx.vn` (port `:9060`) |
| Port | `9060` |
| Display Name (and Label) | `Chanh VP` |
| User Name/Number | `100` |
| Register Name/Auth ID | `UCwylgpi...` (auto-generated) |
| (Auth) Password | `Ci2ehgCC...` (auto-generated) |
| Transport (Protocol/Type) | `UDP` |

**Cài lên Yealink IP Phone**:
1. Truy cập Web-GUI IP Phone (qua browser, IP phone trong LAN).
2. Tab **Account** → menu **Register**.
3. Điền:
   - `User Name` / `Display Name` = số extension
   - `Register Name` = Auth ID lấy từ Portal
   - `Password` = Auth Password
   - `Server Host` = `pbx-ucaas.oncallcx.vn`
   - `Port` = `9060`
   - `Transport` = `UDP`
4. **Confirm** → Status hiện `Registered` = thành công.

**Cài lên Zoiper (softphone)**:
1. Tải Zoiper: https://www.zoiper.com/en/voip-softphone/download/current
2. Mở app → Login:
   - **Username**: `số_extension@pbx-ucaas.oncallcx.vn:9060`
   - **Password**: Auth Password lấy từ Portal
3. Hostname: `pbx-ucaas.oncallcx.vn:9060`
4. Optional Authentication and Outbound proxy:
   - **Auth Username**: User Name/Auth ID lấy từ Portal
   - **Outbound proxy**: `pbx-ucaas.oncallcx.vn:9060`
5. Chờ test transport → **SIP TCP** hoặc **SIP UDP** hiện xanh = thành công.

### 8.4 Tạo mã QR cho OnCallCX UC Mobile (V2.0 MỚI, trang 77–78)

**Bước tạo QR lần đầu**:
1. Portal → **Extensions** → click extension.
2. Mục **Assigned Phones** → **New Phone**.
3. Phone Setup → `Provisioning Option` = **OnCallCX-Mobile** → **Save** → **Next** → sinh mã QR.
4. User mở app **OnCallCX UC** trên mobile → scan QR → đăng ký extension.

**Lấy lại QR (extension đã tạo trước)**:
1. Portal → Extensions → click extension → click phone đã tạo (type OnCallCX-Mobile).
2. **Phone Setup** → QR hiện lại.

### 8.5 Provisioning Options — Tổng hợp (V2.0 trang 78)

| Option | Mục đích | Yêu cầu |
|---|---|---|
| **Auto-Provisioning** | Tự động theo MAC Address | Phone factory reset + Internet |
| **Configuration of the provisioning file URL** | File .xml download | Phone Web-GUI |
| **Manual configuration of SIP-Credentials** | Thủ công nhập SIP | Phone Web-GUI hoặc app |
| **OnCallCX-Mobile** | QR cho app mobile UC | App OnCallCX UC |
| **OnCallCX-Desktop** | Desktop app (activation link qua email) | App desktop + email |
| **Click to Call** | Click-to-call integration | Chưa có tài liệu chi tiết |

> **"Click to Call"** xuất hiện trong dropdown Provisioning Options nhưng PDF V2.0 không có hướng dẫn chi tiết. Đây có thể là tính năng mới đang được FTI phát triển — cần hỏi FTI để biết cách sử dụng.

---

## 9. Cheatsheet — Tổng hợp service codes

| Code | Tính năng | Ghi chú |
|---|---|---|
| `*00` | Reset all CF | Status: `*#00` |
| `*21<số>` / `#21` | CFU (Unconditional) | Status: `*#21` |
| `*22<số>` / `#22` | CFF (Fallback when SIP not registered) | Status: `*#22` |
| `*26` / `#26` | DND (Do Not Disturb) | Status: `*#26` |
| `*61<số>` / `#61` | CFNR (No Reply, 14s) | Status: `*#61` |
| `*67<số>` / `#67` | CFB (Busy) | Status: `*#67` |
| `*72` | Tham gia cổng hội nghị | Yêu cầu Conference Room đã tạo |
| `*76<số>` | Call Pick Up extension khác | — |
| `*78` | Flip Phone (chuyển kết nối sang phone khác cùng extension) | — |
| `*86` | Voice Mail Box | Listen + record greeting |
| `*99` / `#99` | ACR (Anonymous Call Reject) | Status: `*#99` |
| `*481<số>` / `#481` | CFO (Call Forking — đồng thời) | Status: `*#481` |

---

## 10. Ghi chú phân tích & pitfalls

### Mối quan hệ phụ thuộc cấu hình
Để dựng 1 ACD/IVR hoàn chỉnh theo lịch, **thứ tự bắt buộc**:

```
Holiday → Timetable (gồm Timeband) → Audio file → Extension Service
                                                        ↓
                                            Distribution Mode (ACD/IVR)
                                                        ↓
                                            Destinations + Method + Queue
```

Bỏ bước → khi cấu hình ACD/IVR sẽ không thấy timetable hoặc audio để chọn.

### Pitfalls đáng nhớ

1. **ACD: `Queue Size = 0 AND Queue Timeout = 0`** → fallback destination **không bao giờ** được gọi. Lỗi này âm thầm, chỉ phát hiện khi user gọi vào không ai bắt.

2. **Encryption Password loss** (anConnect) → toàn bộ message history mã hoá mất vĩnh viễn. **Không có recovery flow**. Phải training user backup password.

3. **Xoá extension** → mất tất cả phones, voicemail, message; CDR vẫn còn. Cần export data trước nếu cần.

4. **User defined Method (ACD)** → PDF ghi rõ "Không sử dụng". Tránh chọn vì hành vi không có waiting queue → call bị drop khi không destination free.

5. **Generate dải extension với DID conflict** → `Replace` mode âm thầm cướp DID khỏi extension cũ. Phải chắc trước khi confirm.

6. **Internal Number max 10 chữ số** — vượt quá thì không tạo được. Quy hoạch đánh số nội bộ phù hợp.

7. **Email username** không đổi được sau tạo. Nếu user nghỉ việc + cần chuyển extension cho người mới → phải xoá + tạo lại (mất dữ liệu).

8. **Phone provisioning cần Internet outbound** đến redirect server. Nếu mạng nội bộ chặn → chỉ dùng được manual mode hoặc URL provisioning offline.

9. **Night/Weekend Permanent mode** không tự reset → admin dễ quên tắt → call ngoài giờ kéo dài. Dùng auto mode khi có thể.

10. **Conference Room không có PIN** → bất kỳ ai biết Room Number đều vào được. Bắt buộc PIN cho phòng có nội dung nhạy cảm.

### Khuyến nghị triển khai

- **Setup checklist cho khách hàng mới**:
  1. Tạo PBX Administrator (FPT cấp)
  2. Import danh sách Holiday năm hiện tại (Excel)
  3. Tạo Timetable Working-Hours
  4. Tạo Departments theo cơ cấu công ty
  5. Generate dải Extension + DID
  6. Provisioning phones (chọn 1 trong 3 phương án)
  7. Tạo extension dịch vụ + ACD/IVR cho hotline tổng
  8. Cấu hình voicemail email forwarding
  9. Train user về codes `*72`, `*86`, CFU/DND
  10. Backup Encryption Password cho user anConnect

- **Cảnh báo bảo mật**:
  - PIN extension/conference room không chia sẻ qua kênh không mã hoá
  - Encryption Password anConnect — yêu cầu user lưu password manager
  - International calls — mặc định nên `PIN required` hoặc `Blocked` cho extension nội bộ

---

### Pitfall mới từ V2.0

11. **SIP Port = 9060** (không phải 5060 chuẩn). Nếu dùng IP trần `42.112.59.137` + port 5060 → có thể không register được. Luôn dùng domain `pbx-ucaas.oncallcx.vn:9060`.

12. **"Click to Call" provisioning option** — tồn tại trong dropdown nhưng chưa có tài liệu. Không nên chọn nếu chưa được FTI hướng dẫn cụ thể.

13. **Email bắt buộc trong Extension Setup** khi dùng OnCallCX-Desktop provisioning. Nếu extension chưa có email → provisioning email không gửi được → user không nhận activation link.

14. **Zoiper auth username khác extension number** — Auth ID là string auto-generated (vd `UCwylgpi...`), KHÔNG phải số extension. Nhầm lẫn phổ biến khi setup lần đầu.

---

*Hết tổng hợp. Tài liệu này kết hợp 75 trang PDF V1.1 + 78 trang PDF V2.0 + portal live data thành ~850 dòng markdown có cấu trúc. Tham khảo PDF gốc để xem screenshots chi tiết các bước thao tác UI.*
