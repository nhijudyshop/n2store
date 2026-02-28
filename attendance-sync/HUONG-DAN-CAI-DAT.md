# Huong Dan Cai Dat Attendance Sync Service v2.0

## Yeu cau
- Windows PC luon bat (cung mang LAN voi may cham cong)
- Node.js v18+ (khuyen nghi v22 LTS)
- May cham cong Ronald Jack DG-600 tai IP 192.168.1.201
- File `serviceAccountKey.json` tu Firebase Console

## Cai dat nhanh (1 click)

1. Mo thu muc `attendance-sync` trong File Explorer
2. Copy file `serviceAccountKey.json` vao thu muc nay
3. Nhan doi `setup.bat` -> cai dat tu dong

## Cai dat thu cong

```
cd attendance-sync
npm install
node test-connection.js    # Test ket noi
node diagnose.js           # Chan doan neu loi
node sync-service.js       # Chay service
```

## Cac file

| File | Mo ta |
|------|-------|
| setup.bat | Cai dat 1 click |
| start-hidden.vbs | Chay service an |
| stop.bat | Dung service |
| uninstall-autostart.bat | Go bo tu dong chay |
| test-connection.js | Test nhanh ket noi |
| diagnose.js | Chan doan chi tiet (TCP/UDP) |
| sync-service.js | Service chinh |

## Xu ly loi

### Khong ket noi duoc may cham cong
1. Chay `node diagnose.js` de xem may ho tro TCP hay UDP
2. Kiem tra firewall Windows: cho phep UDP port 4370
3. Tat phan mem cham cong khac (ZKTeco Access, etc.)
4. Kiem tra Comm Key tren may = 0 (Menu > Comm > Comm Key)
5. Thu tat/bat lai may cham cong

### Loi Firebase
1. Kiem tra file `serviceAccountKey.json` co dung khong
2. Kiem tra Firestore rules cho phep read/write

## Giao thuc
- Ronald Jack DG-600 su dung giao thuc ZK qua **UDP** port 4370
- Thu vien: node-zklib (ho tro ca TCP va UDP, tu dong fallback)
- Neu TCP timeout, service se force UDP truc tiep
