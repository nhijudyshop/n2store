# Pancake Documentation - Mục lục & Tóm tắt nội dung

> Tài liệu hướng dẫn sử dụng Pancake - nền tảng quản lý hội thoại đa kênh (omnichannel).
> Mỗi mục dưới đây tóm tắt nội dung chi tiết của từng file `.txt` (đã convert từ `.docx`).
> Khi cần tra cứu chi tiết, mở file `.txt` tương ứng trong thư mục `docs/pancake/`.

---

## 1. TỔNG QUAN VỀ PANCAKE

### Introduction.txt
- Giới thiệu Pancake là nền tảng quản lý hội thoại đa kênh (omnichannel conversation management).
- Hỗ trợ quản lý tin nhắn, bình luận từ nhiều nền tảng: Facebook, Instagram, TikTok, WhatsApp, Shopee, Lazada, Line, YouTube, Threads, Google Locations, Livechat/Chat Plugin.

### Overview.txt
- Tổng quan giao diện và các tính năng chính của Pancake.
- Bao gồm: quản lý hội thoại, quản lý đơn hàng, phân quyền nhân viên, tags, Round Robin, AI Assistant, v.v.

---

## 2. CÀI ĐẶT CHUNG (SETTINGS)

### General.txt
- Cài đặt chung cho trang (page): ngôn ngữ, timezone, thông báo, v.v.
- Các tùy chọn hiển thị và cấu hình cơ bản.

### Connection.txt
- Quản lý kết nối các nền tảng: hiển thị danh sách các page đã kết nối, trạng thái kết nối.

### Display.txt
- Cài đặt hiển thị giao diện hội thoại: cách sắp xếp tin nhắn, hiển thị avatar, tên khách hàng.

### Engagement.txt
- Cài đặt tương tác: auto-reply, quick replies, cài đặt thời gian phản hồi, SLA.

### Export.txt
- Hướng dẫn xuất dữ liệu: xuất danh sách hội thoại, khách hàng, báo cáo ra file Excel/CSV.

### Permissions.txt
- Hệ thống phân quyền trên Pancake: Admin, Manager, Staff.
- Chi tiết từng quyền hạn: xem tin nhắn, trả lời, xóa, quản lý tags, cài đặt page, v.v.
- Cách gán quyền cho từng nhân viên.

### Review.txt
- Quản lý đánh giá (reviews) từ khách hàng trên các nền tảng.
- Cách xem, trả lời reviews từ giao diện Pancake.

### User.txt
- Quản lý tài khoản người dùng (staff/nhân viên): thêm, xóa, chỉnh sửa quyền hạn.

---

## 3. TÍNH NĂNG QUẢN LÝ HỘI THOẠI

### Round Robin.txt
- Tính năng phân bổ hội thoại tự động cho nhân viên (round-robin assignment).
- Các chế độ: phân bổ đều, ưu tiên nhân viên online, phân bổ theo nhóm.
- Cài đặt chi tiết: số lượng tối đa hội thoại/nhân viên, thời gian reset.

### Sync.txt
- Đồng bộ dữ liệu hội thoại giữa Pancake và các nền tảng.
- Các trường hợp cần đồng bộ lại: mất tin nhắn, tin nhắn không hiển thị.
- Cách sync thủ công từng page hoặc toàn bộ.

### Tags.txt
- Quản lý tags (nhãn) cho hội thoại và khách hàng.
- Tạo, chỉnh sửa, xóa tags. Gán tags tự động hoặc thủ công.
- Phân loại tags: conversation tags, customer tags.

### Conversation tags.txt
- Tổng quan về conversation tags - dùng để phân biệt các hội thoại/khách hàng khác nhau.

### Conversation tags > Conversation Tag Management.txt
- **Quản lý tags hội thoại chi tiết:**
  - Thêm tag mới (index, tên, màu, mô tả)
  - Sửa/Xóa tag (hỗ trợ xóa nhiều tag cùng lúc)
  - Kéo thả để sắp xếp lại vị trí tag
  - Sync/Copy tag từ page A sang page B (thêm vào hoặc thay thế)
  - Vô hiệu hóa tag (không xóa nhưng ẩn khỏi danh sách)

### Conversation tags > Conversation Tag Settings.txt
- **Cài đặt tags hội thoại:**
  - Cho phép gán nhiều tag/hội thoại
  - Hiển thị tên đầy đủ của tag (hoặc chỉ chấm màu)
  - Lọc nhiều tag đồng thời (AND/OR)
  - Đồng bộ tag (tất cả hội thoại cùng khách hàng tự động gán cùng tags)
  - Auto-tag khi cuộc gọi thất bại/không nghe máy

---

## 4. AI ASSISTANT

### AI Assistant.txt
- **Pancake AI Assistant** - bộ công cụ AI hỗ trợ nhân viên (KHÔNG tự động trả lời khách).
- Khác với **Botcake AI** (tự động trả lời dựa trên kịch bản).
- Tính năng:
  1. **Smart Auto-Reply Suggestions**: AI gợi ý câu trả lời tối ưu, nhấn Tab để chuyển gợi ý, Enter để gửi.
  2. **Real-Time Emotion Detection**: Phát hiện cảm xúc khách hàng, tự động gắn tag khi phát hiện khách giận.
- Cài đặt: Bật AI Assistant → Nạp tiền Pancake Wallet (USD) → Chọn model AI → Train 20-200 hội thoại.
- Mỗi page được gán 1 AI Assistant riêng.

---

## 5. CUỘC GỌI (CALLS)

### Call.txt
- Tính năng gọi điện trực tiếp trên Pancake cho cả **Messenger** và **WhatsApp**.
- **Messenger Calls:**
  - 2 chế độ: Gửi yêu cầu gọi (Send call request) hoặc Gọi trực tiếp (Initiate a call).
  - Giới hạn: tối đa 2 yêu cầu/ngày cho cùng 1 khách.
  - Nếu khách đã chấp nhận, có thể gọi trực tiếp trong 7 ngày tiếp theo.
  - Tính năng nâng cao: định tuyến cuộc gọi (ưu tiên nhân viên phụ trách/tất cả/chọn cụ thể), auto-tag khi gọi thành công/lỡ.
  - Có thể dùng Meta Business Suite (chỉ hỗ trợ gửi yêu cầu gọi).
- **WhatsApp Calls:** Cài đặt tương tự, một số quốc gia không hỗ trợ.

---

## 6. API & WEBHOOKS

### Pancake API.txt
- Pancake hỗ trợ API để thực hiện các hành động với tin nhắn, hội thoại, v.v.
- Danh sách API tham khảo trên trang docs.

### Webhooks.txt
- **Pancake Webhooks** - nhận thông báo HTTP real-time khi có thay đổi.
- Cần: tạo endpoint nhận POST request JSON, đăng ký page_id, tạo Subscription (2 slots).
- **3 loại event:**
  1. **Messages event**: Khi có tin nhắn mới hoặc cập nhật tin nhắn (inbox/comment). Payload chứa: conversation, message, post data.
  2. **Subscription event**: Khi có thay đổi liên quan đến subscription (kích hoạt, gia hạn, v.v.).
  3. **Post event**: Khi post được tạo hoặc cập nhật.

### Error codes and troubleshooting suggestions.txt
- Danh sách mã lỗi thường gặp trên Facebook Messenger và WhatsApp kèm cách xử lý.

---

## 7. CÔNG CỤ (TOOLS)

### Tools.txt
- Mục lục các công cụ hỗ trợ trên Pancake.

### Tools > Create a link with access source.txt
- **Tạo shortlink m.me hoặc wa.me** với thông tin nguồn truy cập (traffic source).
- Workflow: Khách click shortlink → Meta lưu data → Pancake xử lý và hiển thị nguồn.
- Cách tạo: Settings → Tools → Add new → Đặt tên nguồn (VD: Facebook Ads, Google Ads) → Nhập tin nhắn pre-filled.
- Hiển thị nguồn hội thoại trong giao diện Pancake, hỗ trợ filter theo nguồn.

---

## 8. KẾT NỐI NỀN TẢNG (CONNECT PLATFORMS)

### Connect Pancake with Platforms.txt
- Tổng quan các nền tảng hỗ trợ kết nối: Facebook, Instagram, WhatsApp, TikTok, Shopee, Lazada, Line, YouTube, Threads, Google Locations, Livechat/Chat Plugin, Tokopedia.

### Connect Pancake with Platforms > Activate Page.txt
- Sau khi kết nối, cần **kích hoạt page** mới dùng được.
- Hỗ trợ kích hoạt nhiều page cùng lúc.
- Tab "Hidden Connection" để khôi phục page đã ẩn.

---

### 8.1 FACEBOOK

#### Connect Pancake to Facebook.txt
- **Yêu cầu:** Có quyền Admin hoặc Standard access trên Facebook Page. Nếu Page thuộc Business Manager, cần được gán quyền.
- **Các bước:** Đăng nhập Pancake → Sign in Facebook → Chọn Business Manager → Chọn Pages → Xác nhận quyền → Activate Page.
- Pancake sync hội thoại 14 ngày gần nhất.

#### Facebook.txt
- Mục lục các tính năng liên quan Facebook.

#### Facebook > Messenger Calls on Pancake.txt
- Hướng dẫn chi tiết tính năng gọi Messenger trên Pancake.
- Cài đặt trong Settings → Calls. Hỗ trợ gọi trực tiếp hoặc gửi yêu cầu.

#### Facebook > Spam signals.txt
- Các tín hiệu spam trên Facebook Messenger, cách nhận biết và xử lý.

---

### 8.2 INSTAGRAM

#### Connect Pancake to Instagram.txt
- **3 phương pháp kết nối:**
  1. **Qua Facebook** (Instagram đã liên kết FB Page) - không thể quản lý nhân viên trên Pancake.
  2. **Trực tiếp Instagram** (Instagram Direct) - có thể quản lý nhân viên trên Pancake.
  3. **Qua Facebook link** (chưa có Instagram Business) - hướng dẫn chuyển đổi sang Professional Account.

#### Connect Pancake to Instagram > Grand access for Pancake with Instagram.txt
- Xử lý **Error 124**: Cần cấp quyền truy cập cho Pancake qua Instagram.
- Vào Facebook Settings → Linked accounts → Instagram → Enable "Allow access to Instagram messages in Inbox."

#### Connect Pancake to Instagram > Instagram Unified Onboarding.txt
- Kết nối Instagram qua **Meta business account** (Unified Onboarding).
- Yêu cầu: Instagram phải là Professional account.
- Cần kiểm tra routing settings trong Meta Business Settings và Facebook Page settings.

---

### 8.3 WHATSAPP

#### Connect Pancake with WhatsApp.txt
- Tổng quan các loại WhatsApp: Personal, Business API, API Co-Existence.
- Bảng so sánh các tính năng từng loại.

#### Connect Pancake with WhatsApp > WhatsApp API.txt
- **Yêu cầu:** BM verified, số WA không đang dùng WA cá nhân, tài khoản có quyền Admin BM.
- **Các bước:** Connect → WhatsApp → Embedded Signup → Chọn Business Portfolio → Tạo WABA mới hoặc chọn có sẵn → Nhập số điện thoại → Xác thực OTP → Finish.
- **Quan trọng:** Website phải accessible, nên dùng domain chứa brand name.

#### Connect Pancake with WhatsApp > WhatsApp API Co-Existence.txt
- Dùng **đồng thời** WhatsApp Business App và WhatsApp API.
- **Lợi ích:** Sync lịch sử chat, đầy đủ tính năng API, vẫn chat free từ điện thoại.
- **Không hỗ trợ:** EEA, EU, UK, Australia, India, Japan, Nigeria, Philippines, Russia, South Korea, South Africa, Turkey.
- Kết nối: Chọn "Connect a WhatsApp Business App" → Nhập số → Scan QR code → Xác nhận.
- Sync lịch sử chat 6 tháng gần nhất.

#### Connect Pancake with WhatsApp > Create a Wallet on Pancake.txt
- **Pancake Wallet** - ví điện tử nạp tiền trước để trả phí Template trên WhatsApp API.
- Tạo wallet: Account Management → Connect → Sign Up → Create New wallet (chọn USD) → Top up (Bank Transfer hoặc Stripe).
- Liên kết WhatsApp với wallet: Chọn Settings trong wallet → Chọn WhatsApp account → Save.
- Có thể gộp nhiều số WA API vào 1 wallet.

#### Connect Pancake with WhatsApp > Creating WhatsApp API templates.txt
- **Tạo Message Template** trên WhatsApp Manager: Marketing/Utility/Authentication.
- Quy trình: WhatsApp Manager → Account tools → Message templates → Create template.
- Nội dung: Template Name, Language, Variables, Header (optional), Content, Footer (optional), Button (optional).
- Submit → Pending Approval (tối đa 15 phút) → Sync với Pancake.
- **Lưu ý quan trọng:** Sau khi Meta approve, phải nhập lại Header trong Pancake Settings → Message Templates.

#### Connect Pancake with WhatsApp > Types of Conversation Models in WhatsApp API.txt
- **4 loại template:** Marketing, Utility, Authentication, Service (miễn phí).
- **Mô hình tính phí:** Tính theo phiên hội thoại 24h, không theo từng tin nhắn.
- **Quy tắc:**
  - Khách nhắn trước + trả lời Service = miễn phí.
  - Gửi Marketing + Utility = tính 2 lần.
  - Gửi cùng loại template trong 24h = không tính thêm.
- Hệ thống **pre-paid**, cần ít nhất $5 trong wallet.

---

### 8.4 TIKTOK

#### Connect Pancake to Tiktok.txt
- **3 tùy chọn kết nối:** TikTok Business Messaging, TikTok Livestream AIO, TikTok Shop.
- TikTok Business: Nâng cấp miễn phí từ tài khoản cá nhân, cho phép chạy Click-to-Message ads.
- TikTok Livestream AIO: Giải pháp **không chính thức** của Pancake, quản lý TikTok cá nhân + TikTok Shop.

#### Connect Pancake to Tiktok > TikTok Business Messaging.txt
- Pancake là đối tác toàn cầu đầu tiên tích hợp TikTok Business Messaging API.
- **Yêu cầu:** TikTok Business account, bật Messages/Comments từ Everyone, tắt filter.
- **Các bước:** Dashboard → Connect → TikTok → Login → Authorize → Nếu chưa Business thì chuyển đổi.
- Sync 100 hội thoại gần nhất.
- **Kết nối TikTok Ads:** Settings → Tools → Connect → Authorize ads account → Filter theo Ad ID.
- Hỗ trợ **Botcake** automation: default reply, keywords, sequences, rules.

#### Connect Pancake to Tiktok > TikTok Shop.txt
- Yêu cầu: Owner của TikTok Shop account.
- Các bước: Connect → TikTok Shop → Login → Cấu hình → Authorize → Kết nối POS (chọn store + warehouse).

---

### 8.5 SHOPEE

#### Connect Pancake to Shopee.txt
- Yêu cầu: Có Shopee Seller Account.
- Các bước: Dashboard → Connect → Shopee → Đăng nhập Shopee seller.
- Tự động kéo tin nhắn và reviews 2 tuần gần nhất.
- Tùy chọn kết nối POS để sync sản phẩm.

---

### 8.6 LAZADA

#### Connect Pancake with Lazada.txt
- **Bước 1:** Đăng ký Pancake V2 app + Pancake POS app trên **Lazada Service Marketplace** (miễn phí).
- **Bước 2:** Dashboard → Connect → Lazada → Đăng nhập bằng email/password Lazada admin seller.

---

### 8.7 LINE OA

#### Connect Pancake to LineOA.txt
- Yêu cầu: Có Line OA account (Admin), có Pancake account, cài Pancake v2 extension.
- Các bước: Đăng nhập LineOA → Enable Messaging API → Bật Greeting/Auto-response/Webhooks → Copy link LineOA → Paste vào Pancake → Fetch info → Connect.
- **Lưu ý:** Sau 1000 tin broadcast miễn phí/tháng, cần mua thêm trên Line. Không sync tin nhắn cũ. Chỉ trả lời qua Pancake.

#### Connect Pancake to LineOA > with Pancake extension.txt
- Hướng dẫn chi tiết kết nối **có** Pancake extension (tự động điền Channel ID, Channel Secret).

#### Connect Pancake to LineOA > without Pancake extension.txt
- Hướng dẫn kết nối **không có** extension (copy thủ công Channel ID, Channel Secret từ Messaging API).

---

### 8.8 YOUTUBE

#### Connect Pancake to Youtube.txt
- Yêu cầu: Gmail phải là **Owner** của YouTube channel (Manager không được).
- Các bước: Connect → YouTube → Đăng nhập Gmail Owner → Chọn channel → Cấp quyền (view, edit, delete videos/comments).
- Quản lý comments trên video từ giao diện Pancake.

---

### 8.9 THREADS

#### Connect Pancake to Thread.txt
- Threads là nền tảng của Meta, tích hợp với Instagram.
- **Lợi ích:** Tự động sync bài viết + comments, trả lời nhanh, không bỏ sót đơn.
- Các bước: Connect → Threads → Đăng nhập (tự động hoặc qua Instagram) → Hoàn tất.
- Chỉ fetch bài viết 14 ngày gần nhất. Bài cũ có comment mới sẽ tự động cập nhật.

---

### 8.10 GOOGLE LOCATIONS

#### Connect Pancake to Google Locations.txt
- Quản lý và trả lời **reviews** từ Google Maps trực tiếp trên Pancake.
- Yêu cầu: Gmail quản lý Google Business Profile.
- Các bước: Connect → Google → Tạo page name → Đăng nhập Gmail → Chọn locations (tối đa 30).
- Pancake sync reviews mỗi 6 giờ.

---

### 8.11 TOKOPEDIA

#### Connect Pancake to Tokopedia.txt
- TikTok Shop ở Indonesia = Tokopedia x Shop.

#### Connect Tokopedia with TikTokShop.txt
- Yêu cầu: Owner Tokopedia, verified Gojek/GoPay.
- Các bước: Join store → Login Tokopedia + TikTok Shop → Scan QR → OTP → Grant permissions → Review.
- Tùy chọn: Kết nối TikTok account để sync sản phẩm, quản lý đơn, chạy ads.

---

### 8.12 LIVECHAT / CHAT PLUGIN

#### Connect Pancake with Livechat/Chat Plugin website.txt
- Pancake Chat Plugin là widget live chat nhúng vào website.

#### Create Pancake Chat Plugin.txt
- Tạo Chat Plugin: Connect → Chat Plugin → Đặt Connection username + Display name → Upload avatar → Create.

#### Chat Plugin configuration.txt
- **Cấu hình chi tiết:**
  1. **Display Settings:** Button style (round/vertical/horizontal), size, position, colors, icon, avatar, chat window height.
  2. **Form:** Welcome message, custom fields (Number/Text/Long Text/Dropdown), required fields.
  3. **Functions:** Voice call (beta - 1 concurrent, 20 calls/day, 15 min max), button animation, auto open, notification, language, quick replies (Botcake), service rating.
  4. **Plugin Code:** Whitelist domains, insert `<script>` vào `<body>`. Custom config: đổi ngôn ngữ, auto-open, pre-fill form.

---

## 9. PANCAKE SUBSCRIPTION (GÓI ĐĂNG KÝ)

### Pancake Subscription.txt
- Quản lý gói đăng ký: free trial hoặc paid subscription.
- Mỗi gói bao gồm số lượng pages và staff accounts nhất định.
- Giá phụ thuộc: số pages, số staff, thời hạn sử dụng.

### Pancake Subscription > Creat new Pancake Subscription.txt
- **Tạo mới:** Account Management → Create → Chọn gói có sẵn hoặc Custom plan → Create Subscription → Nhập thông tin hóa đơn → Scan QR thanh toán.

### Pancake Subscription > Renew Pancake Subscription.txt
- **Gia hạn:** Có thể gia hạn trước 7 ngày hết hạn. Chọn Renew → Nhập thông tin hóa đơn → Scan QR thanh toán.

### Pancake Subscription > Set Pancake subscription.txt
- **Cài đặt gói:** Thêm/xóa Connections, thêm/xóa Users, chia sẻ subscription với người khác.
- Connections và Users phải cùng subscription mới dùng được.
- Hỗ trợ auto-config (tự động thêm page).

### Pancake Subscription > Upgrade Pancake Subscription.txt
- **Nâng cấp:** Giá trị còn lại của gói cũ được trừ vào gói mới.
- Gói mới phải có giá trị cao hơn gói cũ. Gói còn < 1 ngày không nâng cấp được.

---

## 10. FACEBOOK (TÍNH NĂNG NÂNG CAO)

### Facebook > Messenger Calls on Pancake.txt
- Chi tiết tính năng gọi Messenger: cài đặt, gửi yêu cầu gọi, gọi trực tiếp, call routing, auto-tag.

### Facebook > Spam signals.txt
- Các tín hiệu spam trên Messenger và cách xử lý.

---

## 11. GOOGLE (TÍNH NĂNG NÂNG CAO)

### Google.txt
- Mục lục tính năng Google.

### Google > Google Message Ads - WhatsApp.txt
- Hướng dẫn chạy Google Message Ads kết hợp WhatsApp.

---

## 12. TIKTOK (TÍNH NĂNG NÂNG CAO)

### TikTok.txt
- Mục lục tính năng TikTok.

### TikTok > TikTok Messaging Ads Direct Message destination (TTDM).txt
- Hướng dẫn tạo TikTok Messaging Ads với đích là **TikTok Direct Message**.
- Chi tiết cách cài đặt quảng cáo, chọn TikTok account, tạo creative, theo dõi hiệu quả.

### TikTok > TikTok Messaging Ads Instant Messaging App destination (IMA).txt
- Hướng dẫn tạo TikTok Messaging Ads với đích là **ứng dụng nhắn tin** (WhatsApp, Messenger).
- Chi tiết cài đặt quảng cáo IMA, so sánh với TTDM.

---

## 13. WHATSAPP (TÍNH NĂNG NÂNG CAO)

### WhatsApp.txt
- Mục lục tính năng WhatsApp.

### WhatsApp > Ads that Click-to-WhatsApp.txt
- Hướng dẫn tạo **Click-to-WhatsApp Ads** trên Facebook/Instagram.
- Khách click quảng cáo → Mở WhatsApp → Bắt đầu hội thoại.
- **Miễn phí 72h** đầu nếu trả lời trong 24h.

### WhatsApp > Auto-send WhatsApp message to New Google Sheet Entries.txt
- Tự động gửi tin WhatsApp khi có dòng mới trong Google Sheet.
- Sử dụng **Botcake** kết hợp Google Sheets integration.
- Quy trình: Tạo flow trên Botcake → Kết nối Google Sheet → Map cột dữ liệu → Chọn template → Activate.

### WhatsApp > Create a Catalog on WhatsApp API.txt
- Tạo **catalog sản phẩm** trên WhatsApp API.
- Quản lý sản phẩm, giá, hình ảnh. Gửi catalog cho khách qua tin nhắn.

### WhatsApp > MMlite - Marketing Message Lite.txt
- **MMlite** - gửi tin nhắn marketing "nhẹ" trên WhatsApp.
- Gửi tin cho khách đã tương tác, chi phí thấp hơn broadcast thông thường.

### WhatsApp > Mass Broadcast / Blasting on WhatsApp API.txt
- Tổng quan tính năng **broadcast hàng loạt** trên WhatsApp API.

### WhatsApp > Mass Broadcast > Regular broadcast.txt
- Hướng dẫn gửi **broadcast thông thường**: Chọn template → Chọn danh sách → Gửi.

### WhatsApp > Mass Broadcast > Broadcast with information from an Excel file.txt
- Gửi broadcast với **thông tin từ file Excel**: upload file → map cột → chọn template → gửi.

### WhatsApp > Mass Broadcast > Broadcast with the customer's name from an Excel.txt
- Gửi broadcast có **tên khách hàng cá nhân hóa** từ file Excel.

### WhatsApp > Send OTP on WhatsApp via Botcake API.txt
- Gửi **mã OTP** qua WhatsApp sử dụng **Botcake API**.
- Authentication template, tích hợp API endpoint.

### WhatsApp > WA migration from another BSP to Pancake.txt
- **Di chuyển số WA API** từ BSP khác sang Pancake.
- Không cần ngừng hoạt động số. Templates approved + high quality sẽ được chuyển.
- **Mất:** Lịch sử chat. **Giữ:** Conversation limit. **Cần verify lại:** Green tick.
- Chuẩn bị: Tắt Two-step verification trên WABA cũ → Tạo WABA mới trên Pancake → Nhập số → OTP.

### WhatsApp > WhatsApp API entry points.txt
- **4 điểm tiếp cận WhatsApp API:**
  1. **Discover Businesses**: Khách tìm kiếm doanh nghiệp trong app WhatsApp.
  2. **WhatsApp Link**: Link wa.me/[số] có thể gắn greeting message, đặt trên website/social.
  3. **QR Code**: Tạo QR từ WhatsApp link, in trên sản phẩm/hóa đơn.
  4. **Click-to-WhatsApp Ads (CTWA)**: Quảng cáo Facebook/Instagram, miễn phí 72h đầu.

### WhatsApp > WhatsApp Calling.txt
- **Gọi WhatsApp** trực tiếp trên Pancake (đang thử nghiệm với Meta).
- **Yêu cầu:** Không ở USA/Canada/Turkey/Egypt/Vietnam/Nigeria, ít nhất 1000 business-initiated conversations/24h.
- **Giới hạn:** 10 cuộc gọi/24h, 1 yêu cầu/khách/24h, 2 yêu cầu/khách/7 ngày.
- Cần gửi template message xin phép trước khi gọi (Utility recommended).
- Tính phí theo vị trí khách hàng.

### WhatsApp > WhatsApp Manager Dashboard.txt
- Quản lý WhatsApp API qua **WhatsApp Manager** trên Meta.
- **Message templates:** Kiểm tra status thường xuyên, tránh bị spam.
- **Phone number:** Xem giới hạn conversations/24h, điều kiện tăng lên 10000.
- **Phone number quality:** 3 mức High/Average/Low. Khi Low, giảm gửi tin cho khách chưa tương tác.
- **Profile:** Tùy chỉnh avatar, display name, description.
- **Official Business Account (green tick):** Không bắt buộc nhưng tăng uy tín. Yêu cầu: BM verified, display name approved, two-step verification on. Cần 5 supporting links. Duyệt 3-4 ngày, bị từ chối phải đợi 30 ngày.

---

## QUICK REFERENCE - FILE NÀO ĐỌC KHI NÀO?

| Cần làm gì? | Đọc file nào? |
|---|---|
| Kết nối Facebook | `Connect Pancake to Facebook.txt` |
| Kết nối Instagram | `Connect Pancake to Instagram.txt` |
| Kết nối WhatsApp API | `Connect Pancake with WhatsApp > WhatsApp API.txt` |
| Tạo Pancake Wallet cho WA | `Create a Wallet on Pancake.txt` |
| Tạo WA template | `Creating Whatsapp API templates.txt` |
| Hiểu phí WA API | `Types of Conversation Models in Whats.txt` |
| Kết nối TikTok DM | `Connect Pancake to Tiktok > TikTok Business Messaging.txt` |
| Kết nối TikTok Shop | `Connect Pancake to Tiktok > TikTok Shop.txt` |
| Kết nối Shopee | `Connect Pancake to Shopee.txt` |
| Kết nối Lazada | `Connect Pancake with Lazada.txt` |
| Kết nối Line OA | `Connect Pancake to LineOA.txt` |
| Kết nối YouTube | `Connect Pancake to Youtube.txt` |
| Kết nối Threads | `Connect Pancake to Thread.txt` |
| Cài Chat Plugin website | `Chat Plugin config.txt` |
| Phân quyền nhân viên | `Permissions.txt` |
| Round Robin assignment | `Round Robin.txt` |
| Quản lý tags | `Conversation tags > Conversation Tag Management.txt` |
| Cài đặt AI Assistant | `AI Assistant.txt` |
| Cài đặt cuộc gọi | `Call.txt` |
| Webhooks/API | `Webhooks.txt`, `Pancake API.txt` |
| Mua/gia hạn gói | `Pancake Subscription` folder |
| WA broadcast hàng loạt | `WhatsApp > Mass Broadcast` folder |
| Di chuyển WA từ BSP khác | `WA migration from another BSP to Pancake.txt` |
| Xin green tick WA | `WhatsApp Manager Dashboard.txt` |
