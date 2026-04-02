# Attendance Sync - Ronald Jack DG-600

Dong bo cham cong tu may van tay Ronald Jack DG-600 (ZKTeco rebrand) len cloud (Render PostgreSQL).

## Kien truc hien tai (ADMS v2)

```
DG-600 (192.168.1.201)
    │  ADMS Protocol (HTTP push)
    │  May tu dong day du lieu
    ▼
PC Proxy (192.168.1.27:8081)         ← adms-proxy.js
    │  Forward HTTP → HTTPS
    ▼
Render Server (n2store-fallback)     ← render.com/routes/adms.js
    │  Parse ATTLOG, luu PostgreSQL
    ▼
PostgreSQL Database (Render)
    │
    ▼
Web App (soquy/attendance.html)
```

**Tai sao can PC Proxy?**
- May cham cong chi ho tro HTTP (khong HTTPS)
- Render chi cho phep HTTPS
- May chi nhan IP so (khong domain name)
- PC lam cau noi HTTP → HTTPS

## ADMS Protocol

Giao thuc push HTTP cua ZKTeco. May chu dong day du lieu len server, khong can PC poll.

### Endpoints (tren Render server)

| Method | Path | Chuc nang |
|--------|------|-----------|
| GET | `/iclock/cdata` | Heartbeat - may ket noi, server tra config |
| POST | `/iclock/cdata` | May day du lieu cham cong (ATTLOG) |
| GET | `/iclock/getrequest` | May hoi server co lenh gi khong |
| POST | `/iclock/devicecmd` | May bao ket qua thuc hien lenh |
| POST | `/iclock/querydata` | May tra ket qua DATA QUERY |

### Flow hoat dong

```
1. May boot → GET /iclock/cdata?SN=xxx&options=all
   Server tra config: ATTLOGStamp, Delay, Realtime, ServerVer...

2. May day du lieu → POST /iclock/cdata?table=ATTLOG&Stamp=xxx
   Body (tab-separated):
   PIN\tDatetime\tStatus\tVerify\tWorkcode\tReserved1\tReserved2
   1\t2026-04-01 08:00:00\t0\t1\t0\t0\t0

3. May poll lenh → GET /iclock/getrequest?SN=xxx
   Server tra: "OK" (khong co lenh) hoac "C:1:CHECK" (lenh)

4. Realtime: Moi khi ai quet tay → may push ngay lap tuc
```

### Config quan trong (server tra ve may)

| Parameter | Gia tri | Mo ta |
|-----------|---------|-------|
| `ATTLOGStamp` | 0 hoac gia tri DB | 0 = gui lai tat ca, >0 = chi gui moi |
| `ServerVer` | `3.4.1 2020-06-07` | **BAT BUOC** - thieu thi may khong bulk upload |
| `PushProtVer` | `2.4.1` | Protocol version |
| `Realtime` | `1` | Push ngay khi quet tay |
| `Delay` | `10` | Poll getrequest moi 10 giay |
| `TransFlag` | `1111000000` | Bitmask: bat TransData, AttLog, OpLog, Photo |
| `TimeZone` | `7` | UTC+7 Vietnam |

### Lenh co the gui may qua getrequest

| Lenh | Format | Chuc nang |
|------|--------|-----------|
| CHECK | `C:1:CHECK` | Force may kiem tra lai va re-sync |
| DATA QUERY | `C:2:DATA QUERY ATTLOG StartTime=...\tEndTime=...` | Yeu cau du lieu theo khoang thoi gian |
| REBOOT | `C:3:REBOOT` | Restart may |
| INFO | `C:4:INFO` | Lay thong tin may |
| CLEAR LOG | `C:5:CLEAR LOG` | Xoa log tren may |

## Thu muc attendance-sync/

| File | Mo ta |
|------|-------|
| `adms-proxy.js` | **DANG DUNG** - Proxy HTTP→HTTPS, forward may → Render |
| `setup-adms.bat` | Cai dat proxy: kill cu, tao autostart, chay background |
| `zk.js` | [Legacy] ZK binary protocol (TCP/UDP) |
| `index.js` | [Legacy] Sync service qua ZK protocol |
| `api.js` | [Legacy] Upload du lieu len Render API |
| `test.js` | Test ket noi may qua ZK protocol |
| `diagnose.js` | Chan doan raw data tu may |
| `find-commkey.js` | Tim CommKey may cham cong |
| `setup.bat` | [Legacy] Setup cho ZK protocol |
| `stop.bat` | Dung service |

## Database (PostgreSQL - Render)

### attendance_records

| Column | Type | Mo ta |
|--------|------|-------|
| `id` | VARCHAR(100) PK | `{pin}_{timestamp_ms}` (idempotent) |
| `device_user_id` | VARCHAR(20) | Ma nhan vien tren may |
| `check_time` | TIMESTAMPTZ | Thoi gian quet tay |
| `date_key` | VARCHAR(10) | `YYYY-MM-DD` de query theo ngay |
| `type` | INTEGER | 0=Check-in, 1=Check-out |
| `source` | VARCHAR(20) | `adms` hoac `device` |
| `synced_at` | TIMESTAMPTZ | Thoi gian luu vao DB |

### attendance_device_users

| Column | Type | Mo ta |
|--------|------|-------|
| `user_id` | INTEGER PK | ID tren may |
| `uid` | INTEGER | UID tren may |
| `name` | VARCHAR | Ten (ASCII) |
| `display_name` | VARCHAR | Ten hien thi (Unicode) |
| `role` | INTEGER | 0=User, 14=Admin |
| `daily_rate` | INTEGER | Luong ngay (VND) |
| `work_start` | INTEGER | Gio bat dau (8 = 8:00) |
| `work_end` | INTEGER | Gio ket thuc (20 = 20:00) |

### attendance_sync_status

| Column | Type | Mo ta |
|--------|------|-------|
| `id` | VARCHAR PK | `current` |
| `connected` | BOOLEAN | May dang ket noi |
| `last_sync_time` | TIMESTAMPTZ | Lan sync cuoi |
| `last_stamp` | VARCHAR(50) | Stamp cuoi de incremental sync |
| `last_error` | TEXT | Loi cuoi (neu co) |

### attendance_commands

| Column | Type | Mo ta |
|--------|------|-------|
| `id` | SERIAL PK | Auto increment |
| `action` | TEXT | Lenh (vd: `CHECK`, `DATA QUERY ATTLOG ...`) |
| `status` | VARCHAR | `pending` / `processing` / `completed` |
| `result` | TEXT | Ket qua tu may |
| `created_at` | TIMESTAMPTZ | Thoi gian tao |
| `processed_at` | TIMESTAMPTZ | Thoi gian xu ly |

## Nhan vien hien tai

| UID | Name | Display Name | Daily Rate |
|-----|------|-------------|------------|
| 1 | Truong | | |
| 3 | Lai | LAI | 200,000 |
| 4 | Tam | | 200,000 |
| 9 | Myem | MY | 200,000 |
| 13 | Huyenem | HUYEN NHO | 184,000 |
| 25 | Dung | DUNG | 184,000 |
| 30 | Duyen | DUYEN | 200,000 |
| 34 | Bo | BO | 200,000 |
| 36 | Hanh | HANH | 200,000 |
| 39 | Coi | COI | 461,000 |
| 40 | Hong | HONG | 184,000 |
| 41 | Thanh | THANH | 184,000 |
| 42 | Dat | | 200,000 |
| 43 | Phuoc | PHUOC NHO | 184,000 |
| 44 | Cam | CAM | 184,000 |
| 45 | 15 (Tam?) | | 200,000 |

## Cai dat (Windows)

### ADMS Proxy (hien tai)

```cmd
:: 1. Chay setup (tu dong: kill cu, tao autostart, chay background)
setup-adms.bat

:: 2. Kiem tra proxy dang chay
:: Mo browser: http://localhost:8081/status
:: Xem log:    http://localhost:8081/debug

:: 3. Cau hinh may cham cong:
::    Menu > Comm > Cloud Server
::    Server address: 192.168.1.27
::    Port: 8081
::    Khoi dong ten mien: TAT
::    Mode: Tu dong tai du lieu

:: 4. Restart may cham cong de ket noi
```

### Troubleshooting

| Van de | Giai phap |
|--------|-----------|
| May khong ket noi | Kiem tra IP dung (192.168.1.27), port 8081, proxy dang chay |
| Chi co realtime, khong co data cu | Thieu `ServerVer` trong config, hoac stamp chua = 0 |
| Proxy khong chay | Chay lai `setup-adms.bat` hoac `node adms-proxy.js` |
| Du lieu bi trung | ID = `pin_timestamp` dam bao idempotent (ON CONFLICT DO UPDATE) |
| Muon re-sync toan bo | Xoa `last_stamp` trong `attendance_sync_status`, restart may |
| Xem log realtime | Mo browser: `http://localhost:8081/debug` |

### Force re-sync toan bo du lieu

```sql
-- Tren Render database
UPDATE attendance_sync_status SET last_stamp = NULL WHERE id = 'current';
-- Sau do restart may cham cong
```

## ZK Protocol (Legacy)

Giao thuc nhi phan qua TCP (port 4370). Da thay the bang ADMS nhung code van giu de tham khao.

Xem chi tiet: `docs/guides/ATTENDANCE_SYNC.md`

### Tai sao chuyen tu ZK sang ADMS?

1. **ZK protocol loi chunk**: Doc data lon (>16KB) bi loi parsing o chunk 2 → 106/515 records co timestamp=0
2. **ADMS don gian hon**: Text protocol, may tu push, khong can parse binary
3. **Tin cay hon**: May tu dong retry, khong can PC poll lien tuc
4. **Debug de hon**: Log text doc duoc, co `/debug` endpoint
