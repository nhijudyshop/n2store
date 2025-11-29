# Product Search Module - Hướng Dẫn Sử Dụng

Module tách riêng các hàm search, suggestion, và xử lý sản phẩm để có thể tái sử dụng ở các trang khác.

**Lưu ý:** Module này sử dụng Cloudflare Worker proxy (`https://chatomni-proxy.nhijudyshop.workers.dev/api`) thay vì gọi trực tiếp `tomato.tpos.vn` để tránh CORS và cải thiện hiệu suất với token caching.

## Cài Đặt

### 1. Import các thư viện cần thiết

```html
<!-- XLSX Library (bắt buộc cho loadExcelData) -->
<script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>

<!-- Firebase (tùy chọn - chỉ cần nếu dùng loadProductDetails với autoAddVariants) -->
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js"></script>
<script src="firebase-helpers.js"></script>

<!-- Product Search Module -->
<script src="product-search-module.js"></script>
```

### 2. Sử dụng trong code

```javascript
// Module được export tự động vào window.ProductSearchModule
const {
    removeVietnameseTones,
    loadExcelData,
    searchProducts,
    displaySuggestions,
    loadProductDetails,
    autoSearchExactMatch,
    getProductsData,
    setAutoAddVariants
} = window.ProductSearchModule;
```

## Các Hàm Chính

### 1. `removeVietnameseTones(str)`

Loại bỏ dấu tiếng Việt khỏi chuỗi.

```javascript
const result = removeVietnameseTones('Áo thun nữ');
console.log(result); // "ao thun nu"
```

### 2. `loadExcelData(onLoadingStart, onLoadingEnd)`

Load dữ liệu sản phẩm từ API (chỉ load 1 lần).

**Tham số:**
- `onLoadingStart` (Function, optional): Callback khi bắt đầu loading
- `onLoadingEnd` (Function, optional): Callback khi kết thúc loading

**Returns:** `Promise<Array>` - Mảng sản phẩm

```javascript
// Ví dụ 1: Đơn giản
await loadExcelData();

// Ví dụ 2: Với loading indicator
await loadExcelData(
    () => {
        document.getElementById('loading').style.display = 'block';
    },
    () => {
        document.getElementById('loading').style.display = 'none';
    }
);

// Lấy dữ liệu sau khi load
const products = getProductsData();
console.log(`Đã load ${products.length} sản phẩm`);
```

### 3. `searchProducts(searchText)`

Tìm kiếm sản phẩm theo text (tên, mã sản phẩm).

**Tham số:**
- `searchText` (string): Text cần tìm (tối thiểu 2 ký tự)

**Returns:** `Array` - Mảng sản phẩm phù hợp (tối đa 10)

```javascript
const results = searchProducts('áo thun');
console.log(results);
// [
//   { id: 123, name: 'Áo thun nữ', code: 'AT001', nameNoSign: 'ao thun nu' },
//   { id: 124, name: 'Áo thun nam', code: 'AT002', nameNoSign: 'ao thun nam' }
// ]
```

**Độ ưu tiên tìm kiếm:**
1. Match trong [] brackets (ví dụ: [Q5X1])
2. Match trong mã sản phẩm
3. Match trong tên sản phẩm

### 4. `displaySuggestions(suggestions, suggestionsElementId, onProductClick)`

Hiển thị gợi ý sản phẩm trong dropdown.

**Tham số:**
- `suggestions` (Array): Mảng sản phẩm gợi ý
- `suggestionsElementId` (string, default: 'suggestions'): ID của element hiển thị
- `onProductClick` (Function, optional): Callback khi click vào suggestion `(productId, productText) => {}`

```javascript
// HTML cần có element
// <div id="suggestions" class="suggestions-dropdown"></div>

const results = searchProducts('áo');
displaySuggestions(results, 'suggestions', (productId, productText) => {
    console.log('Clicked:', productId, productText);
    // Xử lý khi click vào suggestion
});
```

**CSS cần thiết:**
```css
.suggestions-dropdown {
    display: none;
    position: absolute;
    background: white;
    border: 1px solid #ddd;
    max-height: 300px;
    overflow-y: auto;
}

.suggestions-dropdown.show {
    display: block;
}

.suggestion-item {
    padding: 10px;
    cursor: pointer;
}

.suggestion-item:hover {
    background: #f0f0f0;
}
```

### 5. `autoSearchExactMatch(searchText, onSingleMatch, suggestionsElementId, onProductClick)`

Tự động tìm kiếm và xử lý:
- Nếu tìm thấy exact match (theo mã) hoặc chỉ 1 kết quả → gọi `onSingleMatch`
- Nếu nhiều kết quả → hiển thị suggestions

**Tham số:**
- `searchText` (string): Text cần tìm
- `onSingleMatch` (Function, optional): Callback khi tìm thấy 1 kết quả duy nhất `(productId) => {}`
- `suggestionsElementId` (string, default: 'suggestions'): ID của element hiển thị
- `onProductClick` (Function, optional): Callback khi click vào suggestion

```javascript
// Ví dụ: Tìm kiếm khi nhấn Enter
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const searchText = e.target.value.trim();

        autoSearchExactMatch(
            searchText,
            (productId) => {
                // Tìm thấy 1 sản phẩm duy nhất
                console.log('Load product:', productId);
                loadProductDetails(productId);
            },
            'suggestions',
            (productId, productText) => {
                // Click vào suggestion
                console.log('Selected:', productId);
                loadProductDetails(productId);
            }
        );
    }
});
```

### 6. `loadProductDetails(productId, options)`

Load thông tin chi tiết sản phẩm từ API, có hỗ trợ tự động thêm variants.

**Tham số:**
- `productId` (number|string): ID sản phẩm
- `options` (Object): Tùy chọn
  - `autoAddVariants` (boolean, default: true): Tự động thêm variants
  - `database` (Object): Firebase database reference (bắt buộc nếu autoAddVariants = true)
  - `savedProducts` (Object): Object chứa sản phẩm đã lưu (bắt buộc nếu autoAddVariants = true)
  - `onSuccess` (Function): Callback khi thành công `(result) => {}`
  - `onError` (Function): Callback khi lỗi `(error) => {}`
  - `updateProductList` (Function): Callback để update UI
  - `showNotification` (Function): Callback để hiển thị thông báo

**Returns:** `Promise<Object>` - Product data

```javascript
// Ví dụ 1: Load đơn giản (không dùng Firebase)
const productData = await loadProductDetails(123, {
    autoAddVariants: false,
    onSuccess: (result) => {
        console.log('Product:', result.productData);
        console.log('Template:', result.templateData);
        console.log('Variants:', result.variants);
    },
    onError: (error) => {
        alert('Lỗi: ' + error.message);
    }
});

// Ví dụ 2: Load với auto-add variants (cần Firebase)
await loadProductDetails(123, {
    autoAddVariants: true,
    database: database, // Firebase database reference
    savedProducts: savedProducts, // Object chứa sản phẩm đã lưu
    onSuccess: (result) => {
        console.log('Đã thêm:', result.addResult);
        console.log('Message:', result.message);
    },
    updateProductList: () => {
        // Update UI
        updateProductListPreview();
    },
    showNotification: (message) => {
        alert(message);
    }
});
```

## Ví Dụ Hoàn Chỉnh

### Trang tìm kiếm sản phẩm đơn giản

```html
<!DOCTYPE html>
<html>
<head>
    <title>Tìm Kiếm Sản Phẩm</title>
    <style>
        .search-container {
            position: relative;
            width: 400px;
            margin: 50px auto;
        }

        #searchInput {
            width: 100%;
            padding: 10px;
            font-size: 16px;
        }

        #suggestions {
            display: none;
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            width: 100%;
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
        }

        #suggestions.show {
            display: block;
        }

        .suggestion-item {
            padding: 10px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        }

        .suggestion-item:hover {
            background: #f0f0f0;
        }

        #loading {
            display: none;
            text-align: center;
            margin-top: 20px;
        }

        #productDetails {
            margin-top: 30px;
            padding: 20px;
            border: 1px solid #ddd;
        }
    </style>
</head>
<body>
    <div class="search-container">
        <input type="text" id="searchInput" placeholder="Tìm sản phẩm...">
        <div id="suggestions"></div>
    </div>

    <div id="loading">Đang tải dữ liệu...</div>
    <div id="productDetails"></div>

    <!-- Libraries -->
    <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
    <script src="product-search-module.js"></script>

    <script>
        // Lấy module functions
        const {
            loadExcelData,
            searchProducts,
            displaySuggestions,
            autoSearchExactMatch,
            loadProductDetails
        } = window.ProductSearchModule;

        // Load dữ liệu khi trang load
        window.addEventListener('DOMContentLoaded', async () => {
            await loadExcelData(
                () => document.getElementById('loading').style.display = 'block',
                () => document.getElementById('loading').style.display = 'none'
            );
        });

        // Search khi gõ
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const searchText = e.target.value.trim();

            searchTimeout = setTimeout(() => {
                if (searchText.length >= 2) {
                    const results = searchProducts(searchText);
                    displaySuggestions(results, 'suggestions', async (productId, productText) => {
                        // Khi click vào suggestion
                        document.getElementById('searchInput').value = productText;

                        // Load product details
                        const product = await loadProductDetails(productId, {
                            autoAddVariants: false,
                            onSuccess: (result) => {
                                displayProductDetails(result);
                            },
                            onError: (error) => {
                                alert('Lỗi: ' + error.message);
                            }
                        });
                    });
                } else {
                    document.getElementById('suggestions').classList.remove('show');
                }
            }, 300);
        });

        // Auto search khi nhấn Enter
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchText = e.target.value.trim();

                autoSearchExactMatch(
                    searchText,
                    async (productId) => {
                        // Tìm thấy 1 sản phẩm duy nhất
                        const product = await loadProductDetails(productId, {
                            autoAddVariants: false,
                            onSuccess: (result) => {
                                displayProductDetails(result);
                            }
                        });
                    },
                    'suggestions',
                    async (productId, productText) => {
                        // Click vào suggestion
                        const product = await loadProductDetails(productId, {
                            autoAddVariants: false,
                            onSuccess: (result) => {
                                displayProductDetails(result);
                            }
                        });
                    }
                );
            }
        });

        // Ẩn suggestions khi click ra ngoài
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                document.getElementById('suggestions').classList.remove('show');
            }
        });

        // Hiển thị thông tin sản phẩm
        function displayProductDetails(result) {
            const { productData, templateData, imageUrl, variants } = result;

            let html = `
                <h2>${productData.NameGet}</h2>
                <p><strong>ID:</strong> ${productData.Id}</p>
                <p><strong>Số lượng:</strong> ${productData.QtyAvailable}</p>
            `;

            if (imageUrl) {
                html += `<img src="${imageUrl}" style="max-width: 300px;">`;
            }

            if (variants.length > 0) {
                html += `<h3>Biến thể (${variants.length})</h3><ul>`;
                variants.forEach(v => {
                    html += `<li>${v.NameGet} - SL: ${v.QtyAvailable}</li>`;
                });
                html += `</ul>`;
            }

            document.getElementById('productDetails').innerHTML = html;
        }
    </script>
</body>
</html>
```

## State Management

### Lấy và set dữ liệu

```javascript
const { getProductsData, setProductsData, getAutoAddVariants, setAutoAddVariants } = window.ProductSearchModule;

// Lấy dữ liệu sản phẩm
const products = getProductsData();

// Set dữ liệu sản phẩm (nếu đã có sẵn)
setProductsData([...]);

// Lấy/set autoAddVariants
const autoAdd = getAutoAddVariants(); // true/false
setAutoAddVariants(false);
```

## Configuration

### Cloudflare Worker Proxy

Module sử dụng Cloudflare Worker làm proxy để:
- **Tránh CORS**: Bypass CORS restrictions khi gọi API từ browser
- **Token Caching**: Cache token ở Worker để giảm số lần gọi API lấy token
- **Performance**: Cải thiện tốc độ và độ tin cậy

**Default Configuration:**
```javascript
{
    apiBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev/api',
    auth: {
        username: 'nvkt',
        password: 'Aa@123456789',
        clientId: 'tmtWebApp'
    }
}
```

**Proxy Mapping:**
- `/api/token` → `https://tomato.tpos.vn/token` (with caching)
- `/api/*` → `https://tomato.tpos.vn/*`

### Thay đổi cấu hình API

Nếu bạn muốn dùng proxy khác hoặc gọi trực tiếp (không khuyến khích):

```javascript
const { configure } = window.ProductSearchModule;

// Sử dụng custom Cloudflare Worker
configure({
    apiBaseUrl: 'https://your-worker.workers.dev/api'
});

// Hoặc gọi trực tiếp (sẽ gặp CORS issue)
configure({
    apiBaseUrl: 'https://tomato.tpos.vn',
    auth: {
        username: 'your_username',
        password: 'your_password',
        clientId: 'tmtWebApp'
    }
});
```

## Helper Functions

### `sortVariants(variants)`

Sắp xếp variants theo thứ tự số (1), (2), (3)... và size (S), (M), (L), (XL), (XXL), (XXXL).

```javascript
const { sortVariants } = window.ProductSearchModule;

const sorted = sortVariants([
    { NameGet: 'Áo (L)' },
    { NameGet: 'Áo (M)' },
    { NameGet: 'Áo (XL)' }
]);
// Kết quả: [{ NameGet: 'Áo (M)' }, { NameGet: 'Áo (L)' }, { NameGet: 'Áo (XL)' }]
```

### `cleanProductForFirebase(product)`

Làm sạch dữ liệu sản phẩm cho Firebase.

```javascript
const { cleanProductForFirebase } = window.ProductSearchModule;

const clean = cleanProductForFirebase({
    Id: 123,
    NameGet: 'Áo thun',
    QtyAvailable: 10,
    imageUrl: 'https://...'
});
```

### `authenticatedFetch(url, options)`

Thực hiện fetch với authentication tự động.

```javascript
const { authenticatedFetch } = window.ProductSearchModule;

const response = await authenticatedFetch('https://tomato.tpos.vn/odata/Product(123)');
const data = await response.json();
```

## Lưu Ý

1. **XLSX Library**: Bắt buộc phải load trước khi gọi `loadExcelData()`
2. **Firebase**: Chỉ cần nếu sử dụng `loadProductDetails` với `autoAddVariants = true`
3. **firebase-helpers.js**: Phải import nếu dùng chức năng thêm variants vào Firebase
4. **Authentication**: Token được tự động cache trong localStorage và refresh khi hết hạn
5. **DOM Elements**: Các hàm `displaySuggestions` và `autoSearchExactMatch` cần DOM elements tương ứng

## Troubleshooting

### "XLSX library chưa được load"
→ Thêm `<script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>`

### "Function addProductsToFirebase chưa được định nghĩa"
→ Thêm `<script src="firebase-helpers.js"></script>`

### "Element #suggestions không tồn tại"
→ Thêm `<div id="suggestions"></div>` vào HTML
