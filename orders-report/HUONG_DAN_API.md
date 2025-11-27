# HƯỚNG DẪN SỬ DỤNG API TINHTHANHPHO.COM

## 📋 MỤC LỤC
1. [Giới thiệu](#giới-thiệu)
2. [Cấu hình API](#cấu-hình-api)
3. [Các endpoint chính](#các-endpoint-chính)
4. [Ví dụ sử dụng](#ví-dụ-sử-dụng)
5. [Xử lý lỗi](#xử-lý-lỗi)
6. [Best Practices](#best-practices)

---

## 🌟 GIỚI THIỆU

API TinhThanhPho.com cung cấp dữ liệu đơn vị hành chính Việt Nam với 2 cấu trúc:
- **Cấu trúc CŨ** (trước 1/7/2025): Tỉnh → Quận/Huyện → Phường/Xã
- **Cấu trúc MỚI** (sau 1/7/2025): Tỉnh → Phường/Xã

### Thông tin API
- **Base URL**: `https://tinhthanhpho.com/api/v1`
- **API Key của bạn**: `hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn`
- **Authentication**: Bearer Token
- **Format**: JSON

---

## ⚙️ CẤU HÌNH API

### Cấu hình cơ bản trong JavaScript

```javascript
const API_CONFIG = {
    baseURL: 'https://tinhthanhpho.com/api/v1',
    apiKey: 'hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
};

// Header mẫu cho mọi request
const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_CONFIG.apiKey}`
};
```

---

## 🔌 CÁC ENDPOINT CHÍNH

### 1. CHUYỂN ĐỔI ĐỊA CHỈ (Convert Address)

**Endpoint**: `POST /convert/address`

**Công dụng**: Chuyển đổi địa chỉ từ cấu trúc cũ (3 cấp) sang cấu trúc mới (2 cấp)

**Request Body**:
```json
{
  "provinceCode": "01",
  "districtCode": "001",
  "wardCode": "00001",
  "streetAddress": "15 Nguyễn Văn A" // Optional
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "old": {
      "province": {"code": "01", "name": "Hà Nội", "type": "Thành phố"},
      "district": {"code": "001", "name": "Ba Đình", "type": "Quận"},
      "ward": {"code": "00001", "name": "Phúc Xá", "type": "Phường"},
      "fullAddress": "15 Nguyễn Văn A, Phường Phúc Xá, Quận Ba Đình, Thành phố Hà Nội"
    },
    "new": {
      "province": {"code": "01", "name": "Hà Nội", "type": "Thành phố"},
      "ward": {"code": "00004", "name": "Ba Đình", "type": "Phường"},
      "fullAddress": "15 Nguyễn Văn A, Phường Ba Đình, Thành phố Hà Nội"
    },
    "mergeInfo": {
      "notes": "Quận Ba Đình đã được sáp nhập, Phường Phúc Xá đã được sáp nhập vào Phường Ba Đình"
    }
  }
}
```

**Code mẫu**:
```javascript
async function convertAddress(provinceCode, districtCode, wardCode, streetAddress = '') {
    const response = await fetch('https://tinhthanhpho.com/api/v1/convert/address', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
        },
        body: JSON.stringify({
            provinceCode,
            districtCode,
            wardCode,
            streetAddress
        })
    });
    return await response.json();
}

// Sử dụng
const result = await convertAddress('01', '001', '00001', '15 Nguyễn Văn A');
console.log(result.data.new.ward.name); // "Ba Đình"
```

---

### 2. TÌM KIẾM ĐỊA CHỈ CŨ (Search Address)

**Endpoint**: `GET /search-address?query={keyword}`

**Công dụng**: Tìm kiếm đơn vị hành chính theo cấu trúc CŨ

**Request**:
```
GET /search-address?query=Ba%20Đình
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "type": "province",
      "code": "01",
      "name": "Hà Nội",
      "full_name": "Thành phố Hà Nội",
      "address": "Thành phố Hà Nội"
    },
    {
      "type": "district",
      "code": "001",
      "name": "Ba Đình",
      "full_name": "Quận Ba Đình",
      "address": "Quận Ba Đình, Thành phố Hà Nội",
      "province_code": "01"
    }
  ]
}
```

**Code mẫu**:
```javascript
async function searchAddress(keyword) {
    const response = await fetch(
        `https://tinhthanhpho.com/api/v1/search-address?query=${encodeURIComponent(keyword)}`,
        {
            headers: {
                'Authorization': 'Bearer hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
            }
        }
    );
    return await response.json();
}

// Sử dụng
const results = await searchAddress('Hoàn Kiếm');
console.log(results.data);
```

---

### 3. TÌM KIẾM ĐỊA CHỈ MỚI (Search New Address)

**Endpoint**: `GET /search-new-address?query={keyword}`

**Công dụng**: Tìm kiếm đơn vị hành chính theo cấu trúc MỚI

**Request**:
```
GET /search-new-address?query=Hoàn%20Kiếm
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "type": "province",
      "code": "01",
      "name": "Hà Nội",
      "full_name": "Thành phố Hà Nội",
      "address": "Thành phố Hà Nội"
    },
    {
      "type": "ward",
      "code": "00070",
      "name": "Hoàn Kiếm",
      "full_name": "Phường Hoàn Kiếm",
      "address": "Phường Hoàn Kiếm, Thành phố Hà Nội",
      "province_code": "01"
    }
  ]
}
```

**Code mẫu**:
```javascript
async function searchNewAddress(keyword) {
    const response = await fetch(
        `https://tinhthanhpho.com/api/v1/search-new-address?query=${encodeURIComponent(keyword)}`,
        {
            headers: {
                'Authorization': 'Bearer hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
            }
        }
    );
    return await response.json();
}
```

---

### 4. DANH SÁCH TỈNH/THÀNH PHỐ

#### Cấu trúc cũ
**Endpoint**: `GET /provinces`

#### Cấu trúc mới
**Endpoint**: `GET /new-provinces`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "code": "01",
      "name": "Hà Nội",
      "type": "Thành phố"
    },
    {
      "code": "79",
      "name": "Hồ Chí Minh",
      "type": "Thành phố"
    }
  ],
  "metadata": {
    "total": 63,
    "page": 1,
    "limit": 100
  }
}
```

**Code mẫu**:
```javascript
async function getProvinces(isNew = false) {
    const endpoint = isNew ? '/new-provinces' : '/provinces';
    const response = await fetch(
        `https://tinhthanhpho.com/api/v1${endpoint}`,
        {
            headers: {
                'Authorization': 'Bearer hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
            }
        }
    );
    return await response.json();
}

// Lấy danh sách tỉnh mới
const newProvinces = await getProvinces(true);
```

---

### 5. DANH SÁCH PHƯỜNG/XÃ THEO TỈNH

#### Cấu trúc cũ
**Endpoint**: `GET /wards?province_code={code}`

#### Cấu trúc mới
**Endpoint**: `GET /new-wards?province_code={code}`

**Request**:
```
GET /new-wards?province_code=01
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "code": "00070",
      "name": "Hoàn Kiếm",
      "type": "Phường",
      "province_code": "01"
    },
    {
      "code": "00004",
      "name": "Ba Đình",
      "type": "Phường",
      "province_code": "01"
    }
  ],
  "metadata": {
    "total": 126,
    "page": 1,
    "limit": 500
  }
}
```

**Code mẫu**:
```javascript
async function getWardsByProvince(provinceCode, isNew = false) {
    const endpoint = isNew ? '/new-wards' : '/wards';
    const response = await fetch(
        `https://tinhthanhpho.com/api/v1${endpoint}?province_code=${provinceCode}`,
        {
            headers: {
                'Authorization': 'Bearer hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
            }
        }
    );
    return await response.json();
}

// Lấy danh sách phường/xã mới của Hà Nội
const wards = await getWardsByProvince('01', true);
```

---

### 6. CHI TIẾT ĐƠN VỊ HÀNH CHÍNH

#### Cấu trúc cũ (3 cấp)
**Endpoint**: `GET /address?province_code={p}&district_code={d}&ward_code={w}`

**Request**:
```
GET /address?province_code=01&district_code=001&ward_code=00001
```

#### Cấu trúc mới (2 cấp)
**Endpoint**: `GET /new-address?province_code={p}&ward_code={w}`

**Request**:
```
GET /new-address?province_code=01&ward_code=00070
```

**Response**:
```json
{
  "success": true,
  "data": {
    "province": {
      "code": "01",
      "name": "Hà Nội",
      "type": "Thành phố"
    },
    "ward": {
      "code": "00070",
      "name": "Hoàn Kiếm",
      "type": "Phường"
    }
  }
}
```

**Code mẫu**:
```javascript
// Chi tiết địa chỉ cũ
async function getOldAddressDetail(provinceCode, districtCode, wardCode) {
    const response = await fetch(
        `https://tinhthanhpho.com/api/v1/address?province_code=${provinceCode}&district_code=${districtCode}&ward_code=${wardCode}`,
        {
            headers: {
                'Authorization': 'Bearer hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
            }
        }
    );
    return await response.json();
}

// Chi tiết địa chỉ mới
async function getNewAddressDetail(provinceCode, wardCode) {
    const response = await fetch(
        `https://tinhthanhpho.com/api/v1/new-address?province_code=${provinceCode}&ward_code=${wardCode}`,
        {
            headers: {
                'Authorization': 'Bearer hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'
            }
        }
    );
    return await response.json();
}
```

---

## 💡 VÍ DỤ SỬ DỤNG THỰC TÊ

### Ví dụ 1: Tìm phường mới từ phường cũ

```javascript
// User nhập địa chỉ cũ: Phường 13, Quận 10, TP.HCM
async function findNewWard() {
    // Bước 1: Tìm mã của phường cũ
    const searchResult = await searchAddress('Phường 13 Quận 10');
    
    // Bước 2: Lấy mã từ kết quả tìm kiếm
    const ward = searchResult.data.find(item => item.type === 'ward');
    const district = searchResult.data.find(item => item.type === 'district');
    const province = searchResult.data.find(item => item.type === 'province');
    
    // Bước 3: Chuyển đổi sang địa chỉ mới
    const converted = await convertAddress(
        province.code,
        district.code,
        ward.code
    );
    
    console.log('Phường mới:', converted.data.new.ward.name);
    console.log('Địa chỉ đầy đủ:', converted.data.new.fullAddress);
}
```

### Ví dụ 2: Tạo dropdown chọn tỉnh và phường

```javascript
// Tạo dropdown tỉnh
async function populateProvinceDropdown() {
    const provinces = await getProvinces(true);
    const select = document.getElementById('provinceSelect');
    
    provinces.data.forEach(province => {
        const option = document.createElement('option');
        option.value = province.code;
        option.text = province.name;
        select.appendChild(option);
    });
}

// Tạo dropdown phường dựa trên tỉnh đã chọn
async function populateWardDropdown(provinceCode) {
    const wards = await getWardsByProvince(provinceCode, true);
    const select = document.getElementById('wardSelect');
    select.innerHTML = '<option value="">Chọn phường/xã</option>';
    
    wards.data.forEach(ward => {
        const option = document.createElement('option');
        option.value = ward.code;
        option.text = `${ward.type} ${ward.name}`;
        select.appendChild(option);
    });
}

// HTML
// <select id="provinceSelect" onchange="populateWardDropdown(this.value)"></select>
// <select id="wardSelect"></select>
```

### Ví dụ 3: Chuyển đổi hàng loạt địa chỉ

```javascript
async function convertBulkAddresses(addresses) {
    const results = [];
    
    for (const addr of addresses) {
        try {
            const converted = await convertAddress(
                addr.provinceCode,
                addr.districtCode,
                addr.wardCode,
                addr.streetAddress
            );
            
            results.push({
                original: addr,
                converted: converted.data.new,
                success: true
            });
        } catch (error) {
            results.push({
                original: addr,
                error: error.message,
                success: false
            });
        }
        
        // Delay để tránh rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}

// Sử dụng
const addresses = [
    { provinceCode: '01', districtCode: '001', wardCode: '00001', streetAddress: '10 Nguyễn Du' },
    { provinceCode: '79', districtCode: '760', wardCode: '26734', streetAddress: '20 Lê Lợi' }
];

const results = await convertBulkAddresses(addresses);
console.log('Kết quả chuyển đổi:', results);
```

### Ví dụ 4: Tìm kiếm thông minh

```javascript
async function smartSearch(keyword) {
    // Tìm trong cả 2 cấu trúc
    const [oldResults, newResults] = await Promise.all([
        searchAddress(keyword),
        searchNewAddress(keyword)
    ]);
    
    return {
        old: oldResults.data,
        new: newResults.data,
        total: oldResults.data.length + newResults.data.length
    };
}

// Sử dụng
const results = await smartSearch('Hoàn Kiếm');
console.log('Tìm thấy:', results.total, 'kết quả');
console.log('Cấu trúc cũ:', results.old);
console.log('Cấu trúc mới:', results.new);
```

---

## ⚠️ XỬ LÝ LỖI

### Các loại lỗi phổ biến

1. **401 Unauthorized**: API key không hợp lệ
2. **404 Not Found**: Không tìm thấy dữ liệu
3. **400 Bad Request**: Tham số không hợp lệ
4. **429 Too Many Requests**: Quá nhiều request
5. **500 Internal Server Error**: Lỗi server

### Code xử lý lỗi mẫu

```javascript
async function safeAPICall(apiFunction, ...args) {
    try {
        const result = await apiFunction(...args);
        
        if (!result.success) {
            throw new Error(result.message || 'API call failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        
        if (error.message.includes('401')) {
            alert('API key không hợp lệ. Vui lòng kiểm tra lại.');
        } else if (error.message.includes('429')) {
            alert('Quá nhiều request. Vui lòng thử lại sau.');
        } else if (error.message.includes('404')) {
            alert('Không tìm thấy dữ liệu.');
        } else {
            alert('Đã xảy ra lỗi: ' + error.message);
        }
        
        throw error;
    }
}

// Sử dụng
try {
    const result = await safeAPICall(convertAddress, '01', '001', '00001');
    console.log('Success:', result);
} catch (error) {
    // Error đã được xử lý
}
```

---

## 🎯 BEST PRACTICES

### 1. Cache dữ liệu tĩnh

```javascript
// Cache danh sách tỉnh (ít thay đổi)
const provinceCache = {
    data: null,
    timestamp: null,
    ttl: 24 * 60 * 60 * 1000 // 24 giờ
};

async function getCachedProvinces(isNew = false) {
    const now = Date.now();
    
    if (provinceCache.data && (now - provinceCache.timestamp) < provinceCache.ttl) {
        return provinceCache.data;
    }
    
    const data = await getProvinces(isNew);
    provinceCache.data = data;
    provinceCache.timestamp = now;
    
    return data;
}
```

### 2. Batch requests

```javascript
// Gom nhiều request thành 1
async function batchConvert(addressList) {
    const batchSize = 10;
    const results = [];
    
    for (let i = 0; i < addressList.length; i += batchSize) {
        const batch = addressList.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(addr => convertAddress(addr.provinceCode, addr.districtCode, addr.wardCode))
        );
        results.push(...batchResults);
        
        // Delay giữa các batch
        if (i + batchSize < addressList.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return results;
}
```

### 3. Retry logic

```javascript
async function retryAPICall(apiFunction, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiFunction();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            console.log(`Retry ${i + 1}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// Sử dụng
const result = await retryAPICall(() => convertAddress('01', '001', '00001'));
```

### 4. Debounce cho search

```javascript
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Sử dụng trong input search
const debouncedSearch = debounce(async (keyword) => {
    const results = await searchNewAddress(keyword);
    displayResults(results);
}, 300);

// HTML: <input oninput="debouncedSearch(this.value)">
```

---

## 📊 GIỚI HẠN SỬ DỤNG

⚠️ **Lưu ý**: Vui lòng kiểm tra với nhà cung cấp API về:
- Rate limit (số request/phút, giờ, ngày)
- Quota (tổng số request/tháng)
- Kích thước response tối đa
- Timeout

---

## 🔒 BẢO MẬT

**QUAN TRỌNG**: 
- **KHÔNG** commit API key lên Git/GitHub
- Sử dụng environment variables
- Chỉ gọi API từ server-side nếu có thể
- Sử dụng HTTPS

```javascript
// Đúng - Sử dụng environment variable
const apiKey = process.env.API_KEY;

// SAI - Hard-code API key
const apiKey = 'hvn_QsnEXvmqrmyHwo8gFd7TviNoeixCKbqn'; // ❌ Không làm vậy!
```

---

## 📞 HỖ TRỢ

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra API key còn hiệu lực
2. Xem lại tài liệu chính thức tại: https://tinhthanhpho.com/api-docs
3. Liên hệ support của TinhThanhPho.com

---

## 📝 CHANGELOG

### Version 1.0 (November 2025)
- Hỗ trợ cấu trúc hành chính mới sau 1/7/2025
- Thêm endpoint chuyển đổi địa chỉ
- Tích hợp dữ liệu sáp nhập

---

**Chúc bạn sử dụng API thành công! 🎉**
