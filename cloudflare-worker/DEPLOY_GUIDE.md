# 🚀 Hướng dẫn Deploy Cloudflare Worker

## Bước 1: Tạo tài khoản Cloudflare (MIỄN PHÍ)

1. Truy cập: https://dash.cloudflare.com/sign-up
2. Đăng ký tài khoản miễn phí
3. Verify email

## Bước 2: Tạo Worker

1. Đăng nhập vào Cloudflare Dashboard
2. Vào **Workers & Pages** từ menu bên trái
3. Click **Create Application**
4. Chọn **Create Worker**
5. Đặt tên: `chatomni-proxy` (hoặc tên bạn thích)
6. Click **Deploy**

## Bước 3: Edit Worker Code

1. Sau khi deploy, click **Edit code**
2. **XÓA HẾT** code mặc định
3. **DÁN** nội dung file `worker.js` vào
4. Click **Save and Deploy**

## Bước 4: Lấy Worker URL

Sau khi deploy, bạn sẽ có URL dạng:
```
https://chatomni-proxy.YOUR-SUBDOMAIN.workers.dev
```

Ví dụ:
```
https://chatomni-proxy.nhijudyshop.workers.dev
```

**Lưu lại URL này!**

## Bước 5: Test Worker

Mở terminal và test:

### Test API Proxy:
```bash
curl "https://YOUR-WORKER-URL.workers.dev/api/api-ms/chatomni/v1/conversations/search" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Limit": 1,
    "Channels": [{"Id": "270136663390370", "Type": 4}],
    "Type": "message"
  }'
```

### Test Image Proxy:
```bash
curl "https://YOUR-WORKER-URL.workers.dev/api/image-proxy?url=https://img1.tpos.vn/img/abc123.jpg" \
  --output test-image.jpg
```

Nếu trả về dữ liệu → **THÀNH CÔNG!**

## Bước 6: Cập nhật Code

Gửi Worker URL cho Claude để update `chat-data-manager.js`

---

## 💡 Tips

- **Free tier**: 100,000 requests/ngày
- **Không sleep**: Response luôn nhanh
- **Edge network**: Deploy toàn cầu
- **Monitor**: Xem logs tại Workers Dashboard

## 🔧 Troubleshooting

### Lỗi: "Exceeded free tier"
→ Bạn đã dùng > 100,000 requests/ngày (rất khó xảy ra)

### Lỗi: "Worker threw exception"
→ Check logs tại Workers Dashboard → Logs

### CORS vẫn bị block
→ Đảm bảo bạn đã copy đúng code `worker.js`

---

Nếu gặp vấn đề gì, gửi screenshot cho Claude!
