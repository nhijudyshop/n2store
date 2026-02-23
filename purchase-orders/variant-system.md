# Hệ Thống Variant (Biến Thể Sản Phẩm)

## 1. Tổng Quan Kiến Trúc

Hệ thống variant quản lý các biến thể sản phẩm (màu sắc, size) với 3 lớp chính:

```
┌─────────────────────────────────────────────────────────┐
│                    UI COMPONENTS                         │
│  VariantSelectorDialog │ VariantDropdownSelector        │
│  VariantGeneratorDialog │ ProductList │ LiveProducts     │
├─────────────────────────────────────────────────────────┤
│                   UTILITY LAYER                          │
│  variant-utils.ts │ variant-display-utils.ts            │
│  tpos-variant-converter.ts │ attribute-sort-utils.ts    │
├─────────────────────────────────────────────────────────┤
│                   DATA LAYER                             │
│  3 JSON files (TPOS cache) │ 3 CSV files │ TPOS API    │
│  use-product-variants.ts │ product-variants-fetcher.ts  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Dữ Liệu Gốc - 3 File JSON

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_mau.json` - Thuộc tính Màu sắc

- **AttributeId**: `3`
- **AttributeName**: `"Màu"`
- **Tổng**: 74 giá trị
- **Ví dụ**: Trắng (`trang`), Đen (`den`), Đỏ (`do`), Vàng (`vang`), Xanh Dương (`xanhduong`), Hồng Đào (`hongdao`)...
- **Nguồn OData**: `http://tomato.tpos.vn/odata/$metadata#ProductAttributeValue`

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizeso.json` - Thuộc tính Size Số

- **AttributeId**: `4`
- **AttributeName**: `"Size Số"`
- **Tổng**: 21 giá trị
- **Dải giá trị**: 1, 2, 3, 4, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizechu.json` - Thuộc tính Size Chữ

- **AttributeId**: `1`
- **AttributeName**: `"Size Chữ"`
- **Tổng**: 6 giá trị
- **Giá trị**: S (Sequence 1), M (2), L (3), XL (4), XXL, XXXL

### Cấu trúc chung mỗi bản ghi

```json
{
  "Id": 6,
  "Name": "Trắng",
  "Code": "trang",
  "Sequence": null,
  "AttributeId": 3,
  "AttributeName": "Màu",
  "PriceExtra": null,
  "NameGet": "Màu: Trắng",
  "DateCreated": null
}
```

| Field         | Mô tả                                      |
| ------------- | ------------------------------------------- |
| Id            | TPOS ID duy nhất                            |
| Name          | Tên hiển thị                                |
| Code          | Mã code (slug)                              |
| Sequence      | Thứ tự sắp xếp (chỉ Size Chữ có giá trị)  |
| AttributeId   | ID nhóm thuộc tính (1, 3, hoặc 4)          |
| AttributeName | Tên nhóm ("Màu", "Size Số", "Size Chữ")    |
| PriceExtra    | Phụ phí thêm theo variant                   |
| NameGet       | Tên đầy đủ dạng "Nhóm: Giá trị"            |
| DateCreated   | Ngày tạo                                    |

---

## 3. Utility Functions

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-utils.ts` - Xử lý chuỗi variant

#### 3.1 Parse / Format cơ bản

Định dạng variant string: `"tên_variant - mã_sản_phẩm"` (phân cách bằng ` - `)

| Hàm              | Đầu vào              | Đầu ra                                | Mô tả                          |
| ----------------- | --------------------- | ------------------------------------- | ------------------------------- |
| `parseVariant()`  | `"Size M - N152"`     | `{ name: "Size M", code: "N152" }`   | Tách variant thành tên + mã SP  |
| `formatVariant()` | `("Size M", "N152")`  | `"Size M - N152"`                     | Ghép tên + mã thành chuỗi      |
| `getVariantName()`| `"Size M - N152"`     | `"Size M"`                            | Lấy phần tên                   |
| `getVariantCode()`| `"Size M - N152"`     | `"N152"`                              | Lấy phần mã                    |

Các trường hợp đặc biệt:
- `null` / `undefined` / `""` → `{ name: "", code: "" }`
- `"- N152"` (không có tên) → `{ name: "", code: "N152" }`
- `"Size M"` (format cũ, không có ` - `) → `{ name: "Size M", code: "" }`

#### 3.2 `formatVariantFromAttributeValues()` - Ghép nhóm từ mảng phẳng

```
Input:  [{ AttributeName: "Size Số", Name: "1" }, { AttributeName: "Màu", Name: "Nude" }]

Parent (isParent=true):  "(1) (Nude)"           ← dùng | phân cách, có ngoặc
Child  (isParent=false): "1 Nude"               ← dùng dấu phẩy, không ngoặc
```

- **Parent format**: `"(VALUE1 | VALUE2) (VALUEA | VALUEB)"` - dùng cho sản phẩm cha, liệt kê tất cả variant
- **Child format**: `"VALUE1, VALUE2 VALUEA"` - dùng cho sản phẩm con, chỉ hiện giá trị cụ thể

#### 3.3 `formatVariantFromTPOSAttributeLines()` - Ghép nhóm từ cấu trúc lồng

```
Input:  product.AttributeLines (nested { Attribute, Values[] })
Output: "(Cam | Đỏ | Vàng) (S | M | L)"
```

Khác biệt với `formatVariantFromAttributeValues`:
- `AttributeValues`: Mảng phẳng `{ AttributeName, Name }`
- `AttributeLines`: Cấu trúc lồng `{ Attribute, Values[] }` từ TPOS API

---

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-display-utils.ts` - Hiển thị UI

#### `formatVariantForDisplay()`

```
Input:  "(1 | 2) (Nude | Nâu | Hồng)"
Output: "1 | 2 | Nude | Nâu | Hồng"
```

Bỏ ngoặc đơn, gộp tất cả giá trị thành 1 chuỗi phẳng phân cách bằng ` | ` cho hiển thị trên bảng danh sách sản phẩm.

---

## 4. Tương Tác Với TPOS API

### `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-variant-converter.ts`

#### 4.1 `convertVariantsToAttributeLines()` - Chuyển UI → TPOS format

```
Chuỗi UI:  "(Đỏ | Xanh) (S | M)"
     ↓ Regex parse ra từng nhóm: ["(Đỏ | Xanh)", "(S | M)"]
     ↓ Tách ra từng giá trị: ["Đỏ", "Xanh", "S", "M"]
     ↓ Query CSV file product_attribute_values_rows.csv (WHERE value IN (...))
     ↓ Group theo tpos_attribute_id
     ↓
TPOS API Format:
[
  {
    "Attribute": { "Id": 3 },
    "AttributeId": 3,
    "Values": [
      { "Id": 8,  "Name": "Đỏ",   "AttributeName": "Màu", ... },
      { "Id": 17, "Name": "Xanh",  "AttributeName": "Màu", ... }
    ]
  },
  {
    "Attribute": { "Id": 1 },
    "AttributeId": 1,
    "Values": [
      { "Id": 1, "Name": "S", "AttributeName": "Size Chữ", ... },
      { "Id": 2, "Name": "M", "AttributeName": "Size Chữ", ... }
    ]
  }
]
```

#### 4.2 `generateProductVariants()` - Tạo tổ hợp biến thể

```
Input:  AttributeLines gồm Màu(Đỏ, Xanh) + Size(S, M)
     ↓ Tích Descartes (Cartesian Product)
     ↓
Output: 4 variant objects:
  - "Đỏ, S"    → Name: "Áo Thun (Đỏ, S)"
  - "Đỏ, M"    → Name: "Áo Thun (Đỏ, M)"
  - "Xanh, S"  → Name: "Áo Thun (Xanh, S)"
  - "Xanh, M"  → Name: "Áo Thun (Xanh, M)"
```

Mỗi variant được tạo ra là 1 object đầy đủ ~60 fields theo đúng format TPOS API:

```
Id, EAN13, DefaultCode, NameTemplate, ProductTmplId, UOMId, QtyAvailable,
NameGet, Price, Barcode, Image, PriceVariant, SaleOK, PurchaseOK, ListPrice,
StandardPrice, Weight, Type, CategId, Active, ... AttributeValues (cuối cùng)
```

---

## 5. Truy Vấn Dữ Liệu

### `/Users/mac/Downloads/github-html-starter-main/src/hooks/use-product-variants.ts` - React Query Hook

```typescript
useProductVariants("N152")
```

Query từ CSV file `products_rows.csv`:
```sql
SELECT id, product_code, product_name, variant, product_images,
       tpos_image_url, stock_quantity, base_product_code
FROM products_rows.csv
WHERE base_product_code = 'N152'
  AND variant IS NOT NULL
  AND variant != ''
  AND product_code != 'N152'    -- Loại bỏ sản phẩm gốc
ORDER BY created_at ASC
```

Interface trả về:
```typescript
interface ProductVariant {
  id: string;
  product_code: string;
  product_name: string;
  variant: string;
  product_images: string[] | null;
  tpos_image_url: string | null;
  stock_quantity: number;
  base_product_code: string | null;
}
```

### `/Users/mac/Downloads/github-html-starter-main/src/lib/product-variants-fetcher.ts` - Fetch Logic

Hai chiến lược tìm variant dựa trên tên sản phẩm:

```
fetchProductVariants("ABC123")
     │
     ├─ CASE 1: product_name chứa "-"
     │    → Cắt lấy phần trước "-" (base name)
     │    → Ưu tiên cắt theo ' - ' (có space), fallback '-'
     │    → Tìm tất cả SP có tên bắt đầu bằng base name (ILIKE prefix%)
     │
     └─ CASE 2: product_name KHÔNG chứa "-"
          → Lấy base_product_code (hoặc product_code nếu không có)
          → Tìm tất cả SP có cùng base_product_code
          → variant IS NOT NULL AND variant != ''
          → Ghép: sản phẩm gốc + tất cả variant
```

---

## 6. Database (CSV files từ Supabase export)

### `product_attributes_rows.csv`
**Đường dẫn**: `/Users/mac/Downloads/n2store/purchase-orders/product_attributes_rows.csv`
**Tổng**: 3 bản ghi (Màu, Size Số, Size Chữ)

| Column        | Type    | Mô tả                         |
| ------------- | ------- | ------------------------------ |
| id            | UUID    | Primary key                    |
| name          | string  | Tên thuộc tính (Màu, Size...) |
| display_order | number  | Thứ tự hiển thị               |
| is_active     | boolean | Trạng thái hoạt động          |
| created_at    | string  | Ngày tạo                      |
| updated_at    | string  | Ngày cập nhật                 |

### `product_attribute_values_rows.csv`
**Đường dẫn**: `/Users/mac/Downloads/n2store/purchase-orders/product_attribute_values_rows.csv`

| Column            | Type         | Mô tả                           |
| ----------------- | ------------ | -------------------------------- |
| id                | UUID         | Primary key                      |
| attribute_id      | UUID (FK)    | → product_attributes.id          |
| value             | string       | Giá trị (Đỏ, M, 36...)          |
| code              | string/null  | Mã code (slug)                   |
| price_extra       | number/null  | Phụ phí theo variant             |
| name_get          | string/null  | Tên đầy đủ "Nhóm: Giá trị"     |
| sequence          | number/null  | Thứ tự TPOS                     |
| display_order     | number       | Thứ tự hiển thị                 |
| tpos_id           | number/null  | ID mapping sang TPOS             |
| tpos_attribute_id | number/null  | Attribute ID mapping sang TPOS   |
| is_active         | boolean      | Trạng thái hoạt động            |
| created_at        | string       | Ngày tạo                        |
| updated_at        | string       | Ngày cập nhật                   |

### `products_rows.csv`
**Đường dẫn**: `/Users/mac/Downloads/n2store/purchase-orders/products_rows.csv`

| Column             | Type        | Mô tả                                        |
| ------------------ | ----------- | --------------------------------------------- |
| id                 | UUID        | Primary key                                   |
| product_code       | string      | Mã sản phẩm                                  |
| product_name       | string      | Tên sản phẩm                                 |
| variant            | string/null | Chuỗi variant, VD: `"(Đỏ \| Xanh) (S \| M)"` |
| selling_price      | number      | Giá bán                                       |
| purchase_price     | number      | Giá mua                                       |
| unit               | string      | Đơn vị tính                                   |
| category           | string      | Danh mục                                      |
| barcode            | string      | Mã vạch                                       |
| stock_quantity     | number      | Số lượng tồn kho                              |
| supplier_name      | string      | Tên nhà cung cấp                              |
| product_images     | json        | Ảnh sản phẩm (mảng URL)                      |
| price_images       | json        | Ảnh giá                                       |
| created_at         | string      | Ngày tạo                                      |
| updated_at         | string      | Ngày cập nhật                                 |
| tpos_image_url     | string/null | URL ảnh từ TPOS                               |
| tpos_product_id    | number/null | ID sản phẩm trên TPOS                        |
| productid_bienthe  | number/null | ID sản phẩm cha (biến thể) trên TPOS         |
| base_product_code  | string/null | Mã sản phẩm cha (liên kết các variant)       |
| virtual_available  | number      | Số lượng khả dụng ảo                          |

---

## 7. UI Components

### `/Users/mac/Downloads/github-html-starter-main/src/components/products/VariantSelectorDialog.tsx`

Dialog chọn variant dạng multi-column grid:

```
┌──────────────────────────────────────────────┐
│  Chọn Variant                            [X] │
├──────────────┬───────────────┬───────────────┤
│  Màu         │  Size Số      │  Size Chữ     │
│  [🔍 Tìm...] │  [🔍 Tìm...]  │  [🔍 Tìm...]  │
│  ☑ Đỏ       │  ☑ 36        │  ☑ S          │
│  ☑ Xanh     │  ☑ 37        │  ☐ M          │
│  ☐ Vàng     │  ☐ 38        │  ☐ L          │
│  ☐ Trắng    │  ☐ 39        │  ☐ XL         │
│  ...         │  ...          │  ...          │
├──────────────┴───────────────┴───────────────┤
│  Đã chọn: [Đỏ ×] [Xanh ×] [36 ×] [37 ×]   │
│                                              │
│  Output: "(Đỏ | Xanh) (36 | 37) (S)"        │
│                              [Hủy] [Xác nhận]│
└──────────────────────────────────────────────┘
```

- Mỗi cột = 1 nhóm thuộc tính
- Có ô search để lọc nhanh
- Badges hiển thị giá trị đã chọn (click × để bỏ)
- Dùng trong: `EditTPOSProductDialog`

### `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantDropdownSelector.tsx`

- Popover-based dropdown cho purchase order
- Hiển thị badge số lượng variant
- Props: `baseProductCode`, `value`, `onChange`, `onVariantSelect`

### `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantGeneratorDialog.tsx`

- Chọn nhiều thuộc tính → tính tích Descartes tất cả tổ hợp
- Sắp xếp thông minh qua `/Users/mac/Downloads/github-html-starter-main/src/lib/attribute-sort-utils.ts`:
  - **Màu**: thứ tự chuẩn (Trắng → Đen → Đỏ → Xanh...)
  - **Size Số**: tăng dần (27, 28, 29...)
  - **Size Chữ**: S → M → L → XL → XXL → XXXL
- Checkbox chọn tổ hợp mong muốn

### Attribute Management Components

| Component                            | Đường dẫn                                                                                                    | Vai trò                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `AttributeValueTable`                | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/AttributeValueTable.tsx`     | Bảng hiển thị + sắp xếp + xóa |
| `CreateEditAttributeValueDialog`     | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/CreateEditAttributeValueDialog.tsx` | Tạo/sửa giá trị thuộc tính    |
| `ImportAttributesDialog`             | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/ImportAttributesDialog.tsx`  | Import hàng loạt               |

---

## 8. Variant Trong Purchase Order (Đơn Nhập Hàng) - Chi Tiết Từng Bước

### 8.1 Tổng quan luồng

```
User chọn sản phẩm → Mở VariantGeneratorDialog → Chọn thuộc tính (Màu, Size)
  → Tính tích Descartes → Chọn tổ hợp → Tạo N dòng variant items
  → Mỗi dòng lưu selectedAttributeValueIds (UUID[])
  → Lưu DB: purchase_order_items.selected_attribute_value_ids
  → Background: Tạo sản phẩm variant trên TPOS API
```

### 8.2 State Variables

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

```typescript
// Line 440-447
const [isSelectProductOpen, setIsSelectProductOpen] = useState(false);
const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
const [isVariantGeneratorOpen, setIsVariantGeneratorOpen] = useState(false);
const [variantGeneratorIndex, setVariantGeneratorIndex] = useState<number | null>(null);
const [showDebugColumn, setShowDebugColumn] = useState(false);
```

### 8.3 Bước 1: Thêm sản phẩm vào đơn

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

#### Cách 1: Bấm nút `[+ Thêm sản phẩm]` (line 2006-2009)
```
User bấm → onClick: addItem()
  → Thêm 1 dòng trống vào mảng items[]
  → User nhập tay: tên SP, mã SP, giá...
```
- **Icon**: `<Plus />` + text "Thêm sản phẩm"
- **Handler**: `addItem()` — push 1 item rỗng vào `items` state

#### Cách 2: Bấm nút `[📦 Chọn từ Kho SP]` (line 2010-2018)
```
User bấm → onClick: openSelectProduct(index)
  → State: isSelectProductOpen = true, currentItemIndex = index
  → Mở SelectProductDialog
  → User chọn sản phẩm từ kho
  → Tự điền: tên SP, mã SP, giá mua, giá bán, ảnh...
```
- **Icon**: `<Warehouse />` + text "Chọn từ Kho SP"
- **Handler**: `openSelectProduct(items.length > 0 && items[items.length - 1].product_name ? items.length : items.length - 1)`

### 8.4 Bước 2: Tạo biến thể cho sản phẩm

#### Bấm vào ô "Biến thể" trên mỗi dòng (line 2080-2103)

```
┌─────────────────────┐
│ Nhấn để tạo biến thể │  ← khi chưa có variant
│         HOẶC         │
│ Nude, XXXL       ✏️  │  ← khi đã có variant
│ ✓ 3 thuộc tính đã   │
│   chọn               │
└─────────────────────┘
```

**Text hiển thị**:
- Chưa có variant: `"Nhấn để tạo biến thể"` (line 2081)
- Đã có variant: hiển thị chuỗi variant (VD: `"Nude, XXXL"`) + icon `✏️ Pencil`

**onClick handler** (line 2085-2088):
```typescript
onClick={() => {
  setVariantGeneratorIndex(index);  // Ghi nhớ dòng nào đang edit
  setIsVariantGeneratorOpen(true);  // Mở VariantGeneratorDialog
}}
```

**Badge "✓ X thuộc tính đã chọn"** (line 2098-2102):
```typescript
// Hiển thị khi selectedAttributeValueIds.length > 0
<Badge variant="secondary" className="text-xs">
  ✓ {item.selectedAttributeValueIds.length} thuộc tính đã chọn
</Badge>
```
- Số đếm = `selectedAttributeValueIds.length` (số UUID trong mảng)

### 8.5 Bước 3: VariantGeneratorDialog - Chọn thuộc tính

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantGeneratorDialog.tsx`

#### 8.5.1 Load dữ liệu (line 46)
```typescript
const { attributes, attributeValues, isLoading } = useProductAttributes();
// → Query CSV: product_attributes_rows.csv + product_attribute_values_rows.csv
// → attributes = [{ id, name: "Màu" }, { id, name: "Size Số" }, { id, name: "Size Chữ" }]
// → attributeValues = [{ id: "uuid", value: "Đỏ", attribute_id: "..." }, ...]
```

#### 8.5.2 State variables (line 42-44)
```typescript
const [selectedValues, setSelectedValues] = useState<Record<string, string[]>>({});
// VD: { "attr-uuid-mau": ["Nude"], "attr-uuid-sizechu": ["XXXL"] }

const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
// VD: { "attr-uuid-mau": "nu" }  ← ô tìm kiếm

const [selectedCombinations, setSelectedCombinations] = useState<Set<string>>(new Set());
// VD: Set { "Nude, XXXL", "27, XXXL" }
```

#### 8.5.3 User tick checkbox thuộc tính (line 305-328)
```
┌─────────────────────────────────────────────┐
│  Màu           │  Size Số    │  Size Chữ    │
│  [🔍 Tìm...]   │  [🔍 Tìm...] │ [🔍 Tìm...]  │
│  ☑ Nude        │  ☑ 27      │  ☑ XXXL      │
│  ☐ Đen        │  ☐ 28      │  ☐ S         │
│  ☐ Trắng      │  ☐ 29      │  ☐ M         │
└─────────────────────────────────────────────┘
   Đã chọn: [Nude ×] [27 ×] [XXXL ×]
```

**Khi tick checkbox** (line 313-319):
```typescript
onClick={() => {
  if (isChecked) {
    removeValue(attr.id, value.value);  // Bỏ chọn
  } else {
    addValue(attr.id, value.value);     // Chọn thêm
  }
}}
```

- `addValue(attrId, valueName)` (line 49-54): thêm value vào `selectedValues[attrId][]`
- `removeValue(attrId, valueName)` (line 57-69): xóa value, xóa key nếu mảng rỗng

**Bấm nút × trên badge đã chọn** (line 240-246):
```typescript
onClick={() => removeValue(attrId, value)
```

#### 8.5.4 Tự động tính tổ hợp (line 72-106, useMemo)

Khi `selectedValues` thay đổi → `useMemo` tự tính lại:

```typescript
// Thuật toán tích Descartes (Cartesian Product)
const cartesian = (...arrays: string[][]): string[][] => {
  return arrays.reduce(
    (acc, curr) => acc.flatMap((a) => curr.map((b) => [...a, b])),
    [[]] as string[][]
  );
};
```

**Sắp xếp** qua `sortAttributeValues()` từ `/Users/mac/Downloads/github-html-starter-main/src/lib/attribute-sort-utils.ts`:

| Attribute Name | Quy tắc sắp xếp |
|---|---|
| "Màu" | Màu cơ bản trước (TRẮNG, ĐEN, ĐỎ, XANH...), rồi theo alphabet |
| "Size Số" | Số tăng dần (27, 28, 29...) |
| "Size Chữ" | Thứ tự chuẩn: S → M → L → XL → XXL → XXXL |
| Khác | Giữ nguyên thứ tự |

**Output**: mảng chuỗi `["Nude, XXXL", "27, XXXL"]`

#### 8.5.5 User tick chọn tổ hợp muốn tạo (line 364-380)

```
┌───────────────────────────────────┐
│  [Chọn tất cả] / [Bỏ chọn tất cả] │
│                                     │
│  ☑ Nude, XXXL                       │
│  ☑ 27, XXXL                         │
│  ☐ Nude, 27                         │  ← bỏ chọn
└───────────────────────────────────┘
```

**Tick/bỏ tick tổ hợp** (line 369-374 → handler line 118-128):
```typescript
const toggleCombination = (combo: string) => {
  setSelectedCombinations(prev => {
    const newSet = new Set(prev);
    if (newSet.has(combo)) newSet.delete(combo);
    else newSet.add(combo);
    return newSet;
  });
};
```

**Bấm "Chọn tất cả" / "Bỏ chọn tất cả"** (line 347-352):
```typescript
const toggleAllCombinations = () => {
  if (selectedCombinations.size === generateCombinations.length) {
    setSelectedCombinations(new Set());         // Bỏ hết
  } else {
    setSelectedCombinations(new Set(generateCombinations)); // Chọn hết
  }
};
```

#### 8.5.6 Bấm nút `[Tạo X biến thể]` (line 409-414)

**Text nút**: `"Tạo {selectedCombinations.size} biến thể"` (VD: "Tạo 2 biến thể")

**Handler** `handleSubmit()` (line 139-183):

```
Bước 1 (line 140-147): Validate - ít nhất 1 tổ hợp phải được chọn

Bước 2 (line 150-160): Tạo allSelectedAttributeValueIds
  selectedValues = { "attr-mau": ["Nude"], "attr-sizeso": ["27"], "attr-sizechu": ["XXXL"] }
  ↓ Duyệt từng attribute → tìm UUID trong attributeValues
  ↓
  allSelectedAttributeValueIds = [
    "44b6c5c5-...",  // Nude → UUID từ product_attribute_values
    "51959c0a-...",  // 27   → UUID từ product_attribute_values
    "c9fb1a11-..."   // XXXL → UUID từ product_attribute_values
  ]

Bước 3 (line 163-166): Tạo mảng combinations
  [
    { combinationString: "Nude, XXXL",  selectedAttributeValueIds: [...3 UUIDs] },
    { combinationString: "27, XXXL",    selectedAttributeValueIds: [...3 UUIDs] }
  ]

Bước 4: Gọi onSubmit(result) callback → trả về CreatePurchaseOrderDialog

Bước 5 (line 180-182): Reset state
  selectedValues = {}
  searchQueries = {}
  selectedCombinations = new Set()
```

**Bấm nút `[Hủy]`** (line 406-407):
```typescript
onClick={() => handleOpenChange(false)
// → Reset tất cả state (selectedValues, searchQueries, selectedCombinations)
// → Đóng dialog
```

### 8.6 Bước 4: Nhận kết quả từ VariantGeneratorDialog

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

**onSubmit handler** (line 2420-2467):

```
VariantGeneratorDialog trả về result.combinations
  ↓
Bước 1 (line 2432-2446): Tạo N dòng item mới
  result.combinations.map((combo, index) => ({
    product_name: sourceItem.product_name,     // Copy từ dòng gốc
    product_code: sourceItem.product_code,     // Copy từ dòng gốc
    variant: combo.combinationString,          // "Nude, XXXL"
    purchase_price: sourceItem.purchase_price,
    selling_price: sourceItem.selling_price,
    quantity: 1,                               // Mỗi variant SL = 1
    product_images: [...sourceItem.product_images],
    price_images: [...sourceItem.price_images],
    selectedAttributeValueIds: combo.selectedAttributeValueIds,  // ← KEY: UUID[]
    hasVariants: true,
    notes: sourceItem.notes || "",
    tempId: `variant-${Date.now()}-${index}`
  }))

Bước 2 (line 2454-2456): Thay thế dòng gốc bằng N dòng variant
  setItems(prev => {
    const filtered = prev.filter((_, idx) => idx !== variantGeneratorIndex);
    return [...filtered, ...newVariantItems];
  });
  // Dòng gốc bị xóa, N dòng variant mới được thêm vào

Bước 3 (line 2459-2462): Hiển thị toast "Đã tạo X biến thể"

Bước 4 (line 2465-2466): Đóng dialog
  setIsVariantGeneratorOpen(false)
  setVariantGeneratorIndex(null)
```

**Kết quả trên UI** (theo screenshot):
```
┌─────┬────────────────┬──────────────┬──────┬────┬───────┬───────┬─────────────┐
│ STT │ Tên sản phẩm   │ Biến thể     │ Mã SP│ SL │Giá mua│Giá bán│ Thành tiền  │
├─────┼────────────────┼──────────────┼──────┼────┼───────┼───────┼─────────────┤
│  1  │ TH ÁO CHỮ NU  │ Nude, XXXL   │ N4023│  1 │  100  │  200  │ 100.000 đ   │
│     │                │ ✓ 3 thuộc    │      │    │       │       │             │
│     │                │   tính đã    │      │    │       │       │             │
│     │                │   chọn       │      │    │       │       │             │
├─────┼────────────────┼──────────────┼──────┼────┼───────┼───────┼─────────────┤
│  2  │ TH ÁO CHỮ NU  │ 27, XXXL     │ N4023│  1 │  100  │  200  │ 100.000 đ   │
│     │                │ ✓ 2 thuộc    │      │    │       │       │             │
│     │                │   tính đã    │      │    │       │       │             │
│     │                │   chọn       │      │    │       │       │             │
└─────┴────────────────┴──────────────┴──────┴────┴───────┴───────┴─────────────┘
```

### 8.7 Bước 5: Debug: Attr IDs - Toggle hiển thị UUID

#### Bấm icon `[◀]` / `[▶]` ở góc phải header bảng (line 2043-2051)

```typescript
// Icon: ChevronLeft (khi đang mở) / ChevronRight (khi đang đóng)
onClick={() => setShowDebugColumn(!showDebugColumn)}
```

**Khi `showDebugColumn = true`**:

Header cột (line 2053):
```typescript
<span className="text-xs text-muted-foreground whitespace-nowrap">
  Debug: Attr IDs
</span>
```

Mỗi dòng hiển thị UUID (line 2246-2257):
```typescript
{item.selectedAttributeValueIds.map((id, idx) => (
  <div className="font-mono text-[10px] bg-yellow-50 px-1 py-0.5 rounded border border-yellow-200">
    {id}   // VD: "44b6c5c5-ed97-46e1-a413-ad037f932f64"
  </div>
))}
```

**Hiển thị trên UI**:
```
┌──────────────────────────────────────────┐
│  Debug: Attr IDs                         │
├──────────────────────────────────────────┤
│  44b6c5c5-ed97-46e1-a413-ad037f932f64   │  ← Nude (Màu)
│  51959c0a-7a96-4858-b6a2-902fb25776d2   │  ← 27 (Size Số)
│  c9fb1a11-4fd5-4db6-9535-7c255d68804f   │  ← XXXL (Size Chữ)
├──────────────────────────────────────────┤
│  0d77152f-9f61-4046-837a-82ca401238fd   │  ← 27 (Size Số)
│  c9fb1a11-4fd5-4db6-9535-7c255d68804f   │  ← XXXL (Size Chữ)
└──────────────────────────────────────────┘
```

**Lưu ý tên field khác nhau giữa Create và Edit**:
- **CreatePurchaseOrderDialog**: `item.selectedAttributeValueIds` (camelCase) - state local
- **EditPurchaseOrderDialog**: `item.selected_attribute_value_ids` (snake_case) - từ DB
- **Database column**: `selected_attribute_value_ids` (snake_case)

### 8.8 Bước 6: Bấm `[Tạo đơn hàng]` hoặc `[Lưu nháp]`

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

#### Bấm `[Lưu nháp]` (line 2358)
```
onClick → saveDraftMutation.mutate()
  → Lưu đơn hàng với status = "draft"
  → Lưu items kèm selected_attribute_value_ids
  → KHÔNG trigger background processing
```

#### Bấm `[Tạo đơn hàng]` (line 2364)
```
onClick → Validate items → createOrderMutation.mutate()
  → Lưu đơn hàng với status = "confirmed"
  → Lưu items kèm selected_attribute_value_ids (line 760-775):

const orderItems = items.map((item, index) => ({
  purchase_order_id: order.id,
  product_code: item.product_code.trim().toUpperCase(),
  product_name: item.product_name.trim().toUpperCase(),
  variant: item.variant?.trim().toUpperCase() || null,     // "NUDE, XXXL"
  purchase_price: Number(item.purchase_price || 0) * 1000,
  selling_price: Number(item.selling_price || 0) * 1000,
  selected_attribute_value_ids: item.selectedAttributeValueIds || null, // ← UUID[]
  // ...
}));

→ INSERT vào bảng purchase_order_items
→ Trigger background processing → Tạo variant trên TPOS
```

#### Bấm `[Hủy]` (line 2353)
```
onClick → handleClose()
  → Đóng dialog, reset tất cả state
```

### 8.9 Bước 7: Background Processing - Tạo variant trên TPOS

#### Step 1: Grouping items

**File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts`

```typescript
// Line 101-112: Group items theo product_code + selected_attribute_value_ids
const groups = new Map<string, typeof items>();

for (const item of items) {
  const sortedIds = (item.selected_attribute_value_ids || []).sort().join(',');
  const groupKey = `${item.product_code}|${sortedIds}`;
  if (!groups.has(groupKey)) {
    groups.set(groupKey, []);
  }
  groups.get(groupKey)!.push(item);
}
```

```
Ví dụ grouping:
  Item 1: N4023 | "Nude, XXXL" | IDs: [uuid-nude, uuid-27, uuid-xxxl]
  Item 2: N4023 | "27, XXXL"   | IDs: [uuid-27, uuid-xxxl]

  → Group 1: "N4023|uuid-27,uuid-nude,uuid-xxxl" → [Item 1]
  → Group 2: "N4023|uuid-27,uuid-xxxl"           → [Item 2]
```

#### Step 2: Gọi create-tpos-variants-from-order

**File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts`

```typescript
// Line 217-219: Nhận selectedAttributeValueIds
const {
  baseProductCode,
  productName,
  purchasePrice,
  sellingPrice,
  selectedAttributeValueIds,  // ← UUID[] từ purchase order item
} = await req.json();
```

```typescript
// Line 538-560: Query attribute values từ UUIDs
const { data: attributeValuesWithAttrs } = await supabase
  .from('product_attribute_values')
  .select(`
    id, value, code, tpos_id, tpos_attribute_id, sequence, name_get, attribute_id,
    product_attributes!attribute_id (id, name, display_order)
  `)
  .in('id', selectedAttributeValueIds);  // ← QUERY BẰNG UUID[]
```

```typescript
// Line 604-618: Group theo attribute → tạo AttributeLines cho TPOS
const groupedByAttribute: Record<string, AttributeValue[]> = {};
for (const value of attributeValues) {
  if (!groupedByAttribute[value.attribute_id]) {
    groupedByAttribute[value.attribute_id] = [];
  }
  groupedByAttribute[value.attribute_id].push(value);
}

const attributeGroups = attributes
  .map(attr => groupedByAttribute[attr.id])
  .filter(group => group && group.length > 0);
```

#### Step 3: Tạo sản phẩm trên TPOS

```
selectedAttributeValueIds: ["uuid-nude", "uuid-xxxl"]
  ↓ Query product_attribute_values BY UUID
  ↓
  [
    { value: "Nude",  tpos_id: 14, tpos_attribute_id: 3, attribute: "Màu" },
    { value: "XXXL",  tpos_id: 32, tpos_attribute_id: 1, attribute: "Size Chữ" }
  ]
  ↓ Group by attribute → Build TPOS AttributeLines
  ↓
  [
    { Attribute: { Id: 3 }, Values: [{ Id: 14, Name: "Nude" }] },
    { Attribute: { Id: 1 }, Values: [{ Id: 32, Name: "XXXL" }] }
  ]
  ↓ Gửi TPOS API → Tạo product variant trên hệ thống TPOS
```

### 8.10 EditPurchaseOrderDialog - Chỉnh sửa đơn nhập

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/EditPurchaseOrderDialog.tsx`

#### Load dữ liệu từ DB (line 437-451 → mapping line 485)
```typescript
// Query purchase_order_items
const { data: existingItems } = useQuery({
  queryKey: ["purchaseOrderItems", order?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", order.id)
      .order("position", { ascending: true });
    return data || [];
  }
});

// Map vào state (line 485)
selected_attribute_value_ids: item.selected_attribute_value_ids || [],
```

#### Tạo variant mới trong edit mode (line 1610-1624)
Luồng giống hệt Create, nhưng dùng `_temp` fields:
```typescript
const newVariantItems = result.combinations.map((combo, index) => ({
  quantity: 1,
  selected_attribute_value_ids: combo.selectedAttributeValueIds,
  variant: combo.combinationString,
  product_name: sourceItem._tempProductName,
  product_code: sourceItem._tempProductCode,
  // ...
}));
```

### 8.11 VariantDropdownSelector - Chọn variant có sẵn

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantDropdownSelector.tsx`

**Khi nào xuất hiện**: Khi sản phẩm đã có variant trong kho (base_product_code khớp)

#### Load variant (line 30)
```typescript
const { data: variants = [] } = useProductVariants(baseProductCode);
// → Query products WHERE base_product_code = "N4023" AND variant IS NOT NULL
```

#### Hiển thị popover
```
User focus vào ô variant → onFocus={() => setOpen(true)}
  ↓
┌──────────────────────────────────┐
│  Badge: "3 biến thể"            │
├──────────────────────────────────┤
│  TRẮNG, L          N4023-TL     │  ← click để chọn
│  ĐEN, M            N4023-DM     │
│  TRẮNG, XL         N4023-TXL    │
└──────────────────────────────────┘
```

#### User click chọn variant (line 32-42)
```typescript
const handleSelectVariant = (variant: ProductVariant) => {
  onVariantSelect?.({
    productCode: variant.product_code,   // "N4023-TL"
    productName: variant.product_name,   // "TH ÁO CHỮ NU (TRẮNG, L)"
    variant: variant.variant             // "TRẮNG, L"
  });
  setTimeout(() => setOpen(false), 100); // Đóng popover sau 100ms
};
```

### 8.12 Load dữ liệu Purchase Order (Page)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx`

**Query (line 250-259)**:
```typescript
.select(`
  *,
  items:purchase_order_items(
    id, quantity, position, notes,
    product_code, product_name, variant,
    purchase_price, selling_price,
    product_images, price_images,
    tpos_product_id, selected_attribute_value_ids  // ← LẤY TỪ DB
  )
`)
```

**Interface (line 34)**:
```typescript
interface PurchaseOrderItem {
  selected_attribute_value_ids?: string[] | null;
}
```

### 8.13 Database Column

**Migration file**: `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251027120913_18e287ad-d774-4cfc-b8b6-d9e99a80718c.sql`

```sql
ALTER TABLE purchase_order_items
ADD COLUMN selected_attribute_value_ids uuid[] NULL;
COMMENT ON COLUMN purchase_order_items.selected_attribute_value_ids IS
  'Array of product_attribute_values.id used to generate variants. Null for non-variant products.';
```

**TypeScript type** (`/Users/mac/Downloads/github-html-starter-main/src/integrations/supabase/types.ts`):
```typescript
// Line 1081 - Row type
selected_attribute_value_ids: string[] | null
// Line 1104 - Insert type
selected_attribute_value_ids?: string[] | null
```

### 8.14 Legacy: create-tpos-variants function

**File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants/index.ts`

Phiên bản cũ, cùng logic (line 95-98):
```typescript
const { baseProductCode, selectedAttributeValueIds } = await req.json();
```

### 8.15 Bảng tổng hợp: Tất cả nút bấm và handler

| Dialog | Nút bấm (text Vietnamese) | Icon | Line | Handler | State thay đổi |
|--------|--------------------------|------|------|---------|----------------|
| **CreatePO** | "Thêm sản phẩm" | `<Plus />` | 2006 | `addItem()` | `items[]` thêm 1 dòng rỗng |
| **CreatePO** | "Chọn từ Kho SP" | `<Warehouse />` | 2010 | `openSelectProduct(index)` | `isSelectProductOpen=true`, `currentItemIndex` |
| **CreatePO** | Settings icon | `<Settings />` | 1970 | `setShowValidationSettings(true)` | `showValidationSettings=true` |
| **CreatePO** | "Nhấn để tạo biến thể" | — | 2081 | `setVariantGeneratorIndex(i)` + `setIsVariantGeneratorOpen(true)` | `variantGeneratorIndex`, `isVariantGeneratorOpen` |
| **CreatePO** | Variant text + ✏️ | `<Pencil />` | 2085 | same as above | same |
| **CreatePO** | ◀ / ▶ (Debug toggle) | `<ChevronLeft/Right />` | 2043 | `setShowDebugColumn(!showDebugColumn)` | `showDebugColumn` |
| **CreatePO** | Pencil icon (mã SP) | `<Pencil />` / `<Check />` | 2120 | Toggle `_manualCodeEdit` | `item._manualCodeEdit` |
| **CreatePO** | "Hủy" | — | 2353 | `handleClose()` | Đóng dialog, reset state |
| **CreatePO** | "Lưu nháp" | — | 2358 | `saveDraftMutation.mutate()` | Lưu DB status=draft |
| **CreatePO** | "Tạo đơn hàng" | — | 2364 | `createOrderMutation.mutate()` | Lưu DB status=confirmed + trigger TPOS |
| **VariantGen** | Checkbox thuộc tính | `<Checkbox />` | 305 | `addValue()` / `removeValue()` | `selectedValues` |
| **VariantGen** | × trên badge đã chọn | — | 240 | `removeValue(attrId, value)` | `selectedValues` |
| **VariantGen** | "Chọn tất cả" / "Bỏ chọn tất cả" | — | 347 | `toggleAllCombinations()` | `selectedCombinations` |
| **VariantGen** | Checkbox tổ hợp | `<Checkbox />` | 369 | `toggleCombination(combo)` | `selectedCombinations` |
| **VariantGen** | "Tạo X biến thể" | — | 410 | `handleSubmit()` | Gọi `onSubmit()` callback → đóng dialog |
| **VariantGen** | "Hủy" | — | 406 | `handleOpenChange(false)` | Reset tất cả state |
| **VariantDropdown** | Click vào variant item | — | 99 | `handleSelectVariant(variant)` | Gọi `onVariantSelect()` callback |

---

## 9. Hình Ảnh Variant - Chi Tiết Từng Bước

### 9.1 Cấu trúc cột hình ảnh trên bảng Purchase Order

```
┌─────┬──────────┬─────────┬──────┬────┬───────┬───────┬─────────┬────────────┬────────────┬────────┐
│ STT │ Tên SP   │ Biến thể│ Mã SP│ SL │Giá mua│Giá bán│Thành    │ Hình ảnh   │ Hình ảnh   │ Thao   │
│     │          │         │      │    │ (VND) │ (VND) │tiền     │ sản phẩm   │ Giá mua    │ tác    │
├─────┼──────────┼─────────┼──────┼────┼───────┼───────┼─────────┼────────────┼────────────┼────────┤
│  1  │ TH ÁO   │ Nude,   │N4023 │  1 │  100  │  200  │100.000đ │ [Ctrl+V]   │ [Ctrl+V]   │ 📥🖼️📋🗑️│
│     │ CHỮ NU  │ XXXL    │      │    │       │       │         │ Dán ảnh    │ Dán ảnh    │        │
└─────┴──────────┴─────────┴──────┴────┴───────┴───────┴─────────┴────────────┴────────────┴────────┘
```

**Header cột** (CreatePurchaseOrderDialog):
- Line 2038: `"Hình ảnh sản phẩm"` (w-[100px])
- Line 2039: `"Hình ảnh Giá mua"` (w-[100px], có border-l-2 phân cách)

### 9.2 Bước 1: Upload / Dán ảnh vào ô

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/ImageUploadCell.tsx`

3 cách thêm ảnh:

#### Cách 1: Dán ảnh Ctrl+V (phổ biến nhất)

```
User copy ảnh → Focus vào ô ảnh → Ctrl+V
  ↓
handlePaste() (form-modal.js)
  ↓ Kiểm tra clipboard: item.type.indexOf('image') !== -1
  ↓ Convert clipboard item → File object
  ↓ Nếu có ImageUtils → compressImage() (max 1920x1920)
  ↓ Convert → dataUrl cho preview tức thì
  ↓ Lưu vào pendingImages (chưa upload)
  ↓ Khi submit đơn → uploadPendingImages()
  ↓ Upload lên Firebase Storage → nhận download URL
  ↓ Thay dataUrl bằng Firebase URL trong formData
```

#### Cách 2: Kéo thả (Drag & Drop)

```
User kéo file ảnh vào ô → handleDrop() (line 187-196)
  → Cùng luồng upload như Ctrl+V
```

#### Cách 3: Click chọn file

```
User click vào ô → mở file browser → chọn ảnh
  → Cùng luồng upload như Ctrl+V
```

**Placeholder text**: `"Dán ảnh (Ctrl+V)"` (ImageUploadCell.tsx line 86)

### 9.3 Upload lên Firebase Storage

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/service.js` — `PurchaseOrderService.uploadImage()`

```javascript
// Tạo tên file
const timestamp = Date.now();
const extension = file.name.split('.').pop() || 'jpg';
const filename = `${folder}/${timestamp}_${Math.random().toString(36).substring(7)}.${extension}`;
//               ↑ folder VD: "purchase-orders/products"   ↑ VD: "1708912345678_a3b2c1.jpg"

// Upload lên Firebase Storage
const ref = this.storage.ref().child(filename);
const snapshot = await ref.put(file);

// Lấy download URL
const downloadURL = await snapshot.ref.getDownloadURL();
// → "https://firebasestorage.googleapis.com/v0/b/{project}/o/purchase-orders%2Fproducts%2F170891...?alt=media&token=..."
```

**Folder structure trên Firebase Storage**:

| Folder                          | Dùng cho                    |
|---------------------------------|-----------------------------|
| `purchase-orders/invoices/`     | Ảnh hóa đơn                |
| `purchase-orders/products/`     | Ảnh sản phẩm + ảnh giá mua |

| Config      | Giá trị                    |
|-------------|---------------------------|
| Storage     | Firebase Storage           |
| Compression | Auto nếu > 1MB (ImageUtils) |
| Max dims    | 1920x1920                 |

### 9.4 Image Compression (tự động)

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js` — `addLocalImages()`

```
File ảnh được thêm vào?
  ↓ Kiểm tra window.ImageUtils.compressImage
  ↓ Có → compressImage(file, 1, 1920, 1920)
  ↓ Resize xuống max 1920x1920, quality 1
  ↓ Output: File đã nén
  ↓ Convert → dataUrl cho preview
  ↓ Lưu vào pendingImages → Upload khi submit
```

### 9.5 Pending Images System (n2store)

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js`

**Mục đích**: Lưu ảnh dạng dataUrl local trước, chỉ upload Firebase khi submit đơn.

```javascript
// Khởi tạo pending images
this.pendingImages = {
    invoice: [],      // Array of {file: File, dataUrl: string}
    products: {},     // itemId -> Array of {file: File, dataUrl: string}
    prices: {}        // itemId -> Array of {file: File, dataUrl: string}
};
```

#### Khi user dán/chọn ảnh → Lưu local (chưa upload)

```
User dán ảnh (Ctrl+V) hoặc chọn file
  ↓ addLocalImages(files, type, itemId)
  ↓ Compress nếu có ImageUtils
  ↓ Convert file → dataUrl (FileReader)
  ↓ Lưu vào pendingImages[type]
  ↓ Cập nhật formData (dataUrl) cho preview
  ↓ Toast: "Đã thêm N ảnh (sẽ tải lên khi tạo đơn)"
```

#### Khi submit đơn → Upload tất cả lên Firebase

```
handleSubmit() / handleSaveDraft()
  ↓ hasPendingImages()? → true
  ↓ uploadPendingImages()
  ↓ Upload invoice files → Firebase Storage (purchase-orders/invoices/)
  ↓ Upload product files → Firebase Storage (purchase-orders/products/)
  ↓ Upload price files → Firebase Storage (purchase-orders/products/)
  ↓ Thay dataUrl bằng Firebase download URL
  ↓ Clear pendingImages
  ↓ getFormData() → submit với Firebase URLs
```

#### Khi tạo đơn hàng → Lưu Firebase Storage URLs

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js` — `uploadPendingImages()`

```javascript
// Upload ảnh hóa đơn
purchaseOrderService.uploadImages(files, 'purchase-orders/invoices')
  .then(urls => {
    // Thay data URLs bằng Firebase URLs
    this.formData.invoiceImages = this.formData.invoiceImages.map(url => {
      const idx = dataUrls.indexOf(url);
      return idx >= 0 && urls[idx] ? urls[idx] : url;
    });
  });

// Upload ảnh sản phẩm + ảnh giá mua
purchaseOrderService.uploadImages(files, 'purchase-orders/products')
  .then(urls => { ... });
```

### 9.6 Bước 2: Áp dụng ảnh cho tất cả biến thể

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

#### Bấm nút `[📋]` trên mỗi dòng (line 2210)

**Title**: `"Áp dụng giá & hình ảnh cho tất cả biến thể"`

```
User bấm nút 📋 trên dòng 1 (Nude, XXXL)
  ↓
applyAllFieldsToVariants(sourceIndex) (line 1799-1838)
  ↓ Lấy sourceItem = items[sourceIndex]
  ↓ Duyệt tất cả items có cùng product_code
  ↓ Copy các field sang:
     - product_images: [...sourceItem.product_images]
     - price_images: [...sourceItem.price_images]
     - purchase_price
     - selling_price
  ↓
Kết quả: Tất cả dòng variant cùng SP có cùng ảnh + giá
```

### 9.7 Bước 3: Ảnh được lưu trên Firebase Storage

Trong hệ thống n2store, ảnh được upload trực tiếp lên **Firebase Storage** khi submit đơn hàng.

```
Submit đơn hàng
  ↓ uploadPendingImages() (form-modal.js)
  ↓ Upload từng file lên Firebase Storage
  ↓ Nhận download URLs
  ↓ Lưu URLs vào Firestore document:
     - order.invoiceImages: ["https://firebasestorage.googleapis.com/..."]
     - item.productImages: ["https://firebasestorage.googleapis.com/..."]
     - item.priceImages: ["https://firebasestorage.googleapis.com/..."]
  ↓
Khi cần gửi TPOS API → fetch Firebase URL → convert base64 → gửi TPOS
```

**Lưu ý**: React app (github-html-starter-main) dùng Supabase Storage + Edge Functions cho background processing. N2store dùng Firebase Storage trực tiếp.

### 9.8 Ưu tiên hiển thị ảnh (Image Priority)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line 38-66)

```
getProductImages(product):
  ↓
  Priority 1: product.product_images[]     ← Ảnh upload bởi user
  ↓ nếu rỗng
  Priority 2: product.tpos_image_url       ← Ảnh sync từ TPOS
  ↓ nếu null
  Priority 3: parent product image         ← Ảnh SP cha (nếu là variant con)
  ↓ nếu không có
  return []  ← Không có ảnh
```

### 9.9 Hiển thị ảnh trên các trang

#### Purchase Order List (danh sách đơn nhập)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderList.tsx`

```
Ảnh sản phẩm (line 705):
  className="w-8 h-8 object-cover rounded border cursor-pointer
             hover:scale-[14] hover:z-50"
  → Ảnh 8x8px, hover phóng to 14 lần

Ảnh giá (line 724):
  → Cùng style hover:scale-[14]

Ảnh hóa đơn (line 650):
  className="w-20 h-20 ... hover:scale-[7]"
  → Ảnh 20x20px, hover phóng to 7 lần
```

#### Purchase Order Detail Dialog

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderDetailDialog.tsx`

```
Header (line 227): "Hình ảnh"

Hiển thị (line 237-262):
  → Tối đa 2 ảnh
  → Nếu nhiều hơn → hiển thị "+N" badge
  → Click ảnh → window.open(imageUrl, '_blank') → mở tab mới
```

### 9.10 Order Image Generator (tạo ảnh đơn hàng)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/order-image-generator.ts`

```
generateOrderImage(imageUrl, variant, quantity, productName)
  ↓
Bước 1: Lấy variant name
  getVariantName("Nude, XXXL - N4023") → "Nude, XXXL"

Bước 2: Tạo text
  text = "Nude, XXXL - 1"  (variant - số lượng)

Bước 3: Vẽ canvas
  ┌───────────────────────┐
  │                       │
  │    [Ảnh sản phẩm]     │  ← 2/3 canvas
  │                       │
  ├───────────────────────┤
  │   Nude, XXXL - 1      │  ← 1/3 canvas, font đỏ #ff0000
  └───────────────────────┘

Bước 4: Export → Copy to clipboard
  canvas.toBlob() → ClipboardItem → navigator.clipboard.write()
  → Toast: "Đã copy ảnh"
```

### 9.11 tpos_image_url - Ảnh sync từ TPOS

**Field**: `products.tpos_image_url` (string | null)

#### Sync từ TPOS

**File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-product-sync.ts`
```typescript
// Line 167, 209: Khi sync sản phẩm
tpos_image_url: fullProduct.ImageUrl || null,

// Line 313: Khi update
if (tposData.ImageUrl) updateData.tpos_image_url = tposData.ImageUrl;
```

**React app** dùng Supabase Edge Function `sync-tpos-images` để batch update. N2store lưu `tpos_image_url` trong CSV file `products_rows.csv`.

#### Sử dụng trong variant

**File**: `/Users/mac/Downloads/github-html-starter-main/src/hooks/use-product-variants.ts` (line 10, 25):
```typescript
// Interface
tpos_image_url: string | null;

// Query
.select("id, product_code, product_name, variant, product_images, tpos_image_url, ...")
```

### 9.12 Bảng tổng hợp: Tất cả file hình ảnh variant

| File | Đường dẫn đầy đủ | Vai trò |
|------|-------------------|---------|
| `ImageUploadCell` | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/ImageUploadCell.tsx` | Ô upload ảnh + auto-cache base64 |
| `service.js` (n2store) | `/Users/mac/Downloads/n2store/purchase-orders/js/service.js` | Upload ảnh lên Firebase Storage (`uploadImage`, `uploadImages`) |
| `form-modal.js` (n2store) | `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js` | Pending images: Ctrl+V, browse, compress, upload khi submit |
| `unified-image-upload` (React) | `/Users/mac/Downloads/github-html-starter-main/src/components/ui/unified-image-upload.tsx` | React component upload: Ctrl+V, drag-drop, browse |
| `image-utils` | `/Users/mac/Downloads/github-html-starter-main/src/lib/image-utils.ts` | Compress ảnh: resize, giảm quality |
| `order-image-generator` | `/Users/mac/Downloads/github-html-starter-main/src/lib/order-image-generator.ts` | Tạo ảnh đơn hàng: ảnh SP + variant text đỏ |
| `tpos-product-sync` | `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-product-sync.ts` | Sync `tpos_image_url` từ TPOS |
| `table-renderer.js` (n2store) | `/Users/mac/Downloads/n2store/purchase-orders/js/table-renderer.js` | Hiển thị ảnh thumbnail + hover zoom trên bảng |

---

## 10. Tự Tạo Mã Sản Phẩm (Auto-Generate Product Code) - Chi Tiết Từng Bước

### 10.1. Tổng Quan

Hệ thống tự động tạo mã sản phẩm (product_code) dựa trên **tên sản phẩm** khi tạo đơn nhập hàng. Mã được chia thành 3 **category** theo loại sản phẩm:

| Category | Ý nghĩa | Ví dụ mã | Keyword nhận diện |
| -------- | -------- | --------- | ----------------- |
| **N** | Quần áo (Clothing) | N123, N456 | QUAN, AO, DAM, SET, JUM, AOKHOAC |
| **P** | Phụ kiện (Accessories) | P45, P78 | TUI, MATKINH, GIAY, DEP, SON, SERUM, KHAN, NIT, VONG, NHAN... (34 keywords) |
| **Q** | Nhà cung cấp Q | Q1, Q5 | Tên bắt đầu bằng Q hoặc Q+số |

### 10.2. File Liên Quan (n2store)

| File | Đường dẫn | Vai trò |
| ---- | --------- | ------- |
| `product-code-generator.js` | `purchase-orders/js/lib/product-code-generator.js` | Core logic: detect category, query max (Firestore), generate code, check trùng |
| `form-modal.js` | `purchase-orders/js/form-modal.js` | UI auto-generate + Pencil/Check toggle + edit mode read-only |
| `service.js` | `purchase-orders/js/service.js` | Firestore CRUD, `prepareItems()` lưu `productCode` |

### 10.3. Bước 1: User Nhập Tên Sản Phẩm

```
┌─────────────────────────────────────────────────────────────────┐
│ Tên sản phẩm          │ Biến thể │ Mã SP    │ SL │ Giá mua   │
├────────────────────────┼──────────┼──────────┼────┼───────────┤
│ [0501 A12 Áo thun...] │          │ [Mã SP ✏️]│ 1  │ 0         │
└─────────────────────────────────────────────────────────────────┘
```

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~2078
- **Input**: `<Input placeholder="Nhập tên sản phẩm" onChange={e => updateItem(index, "product_name", e.target.value)} />`
- **Trigger**: Khi user gõ tên sản phẩm → `product_name` thay đổi → debounce 500ms

### 10.4. Bước 2: Debounce 500ms

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~452-456
- **Logic**: Dùng `useDebounce` hook, đợi user ngừng gõ 500ms trước khi chạy auto-generate

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:452
const debouncedProductNames = useDebounce(
  items.map(i => i.product_name).join('|'),
  500
);
```

- Khi `debouncedProductNames` thay đổi → trigger `useEffect` auto-generate

### 10.5. Bước 3: Kiểm Tra Điều Kiện Auto-Generate

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~528-535
- **useEffect** lắng nghe `debouncedProductNames` và `manualProductCodes`

**Điều kiện để auto-generate chạy cho item `[index]`**:
1. `item.product_name.trim()` !== "" → Tên không rỗng
2. `item.product_code.trim()` === "" → Chưa có mã
3. `!manualProductCodes.has(index)` → User chưa bấm vào ô mã để sửa tay

Nếu 1 trong 3 điều kiện sai → **SKIP** item đó

### 10.6. Bước 4: Detect Product Category

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts` line 68-138
- **Hàm**: `detectProductCategory(productName)`

**Quy trình phân tích tên sản phẩm**:

```
Input: "0501 A12 Áo thun trắng đẹp"
         ↓
convertVietnameseToUpperCase() → "0501 A12 AO THUN TRANG DEP"
         ↓
Tokenize: ["0501", "A12", "AO", "THUN", "TRANG", "DEP"]
         ↓
Step 1: Token[0] = "0501" → 4 chữ số → là ngày (ddmm) → skip, index++
         ↓
Step 2: Token[1] = "A12" → match /^[A-Z]\d+$/ → là NCC → skip, index++
         ↓
Step 3: Token[2] = "AO" → match CATEGORY_N_KEYWORDS → return 'N' ✅
```

**Các bước chi tiết**:

| Step | Kiểm tra | Ví dụ match | Kết quả |
| ---- | -------- | ----------- | ------- |
| 1 | Token đầu tiên là ngày? (`/^\d{4}$/`) | "0501" → yes | Skip token, index++ |
| 2 | Token tiếp theo là NCC? | "Q5" → return 'Q' ngay | Return 'Q' |
| 2b | NCC pattern khác? (`/^[A-Z]\d+$/`) | "A12", "B5" → yes | Skip token, index++ |
| 3 | Token tiếp theo match CATEGORY_N_KEYWORDS? | "AO", "QUAN", "DAM" | Return 'N' |
| 3b | Token tiếp theo match CATEGORY_P_KEYWORDS? | "TUI", "GIAY", "SON" | Return 'P' |
| 4 | Fallback: scan TẤT CẢ tokens | Bất kỳ token nào match | Return 'N' hoặc 'P' |
| 5 | Có NCC + text nhưng không match keyword? | "A12 XYZ" | Default return 'N' |
| 6 | Không đủ thông tin | Chỉ có "abc" | Return `null` → skip |

### 10.7. Bước 5: Vietnamese Text Normalization

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/utils.ts` line 8-47
- **Hàm**: `convertVietnameseToUpperCase(text)`

Bỏ **toàn bộ dấu tiếng Việt** + convert sang UPPERCASE:

| Input | Output |
| ----- | ------ |
| "Áo thun" | "AO THUN" |
| "Túi đeo chéo" | "TUI DEO CHEO" |
| "Quần jeans" | "QUAN JEANS" |
| "Đầm maxi" | "DAM MAXI" |
| "Mắt kính" | "MAT KINH" |
| "Sữa rửa mặt" | "SUA RUA MAT" |

**Mapping đầy đủ**: à/á/ạ/ả/ã/â/ầ/ấ/ậ/ẩ/ẫ/ă/ằ/ắ/ặ/ẳ/ẵ → `a`, è/é/ẹ/ẻ/ẽ/ê/ề/ế/ệ/ể/ễ → `e`, đ/Đ → `d`, v.v.

### 10.8. Bước 6: Query Max Number Từ 3 Nguồn

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~560-570
- Chạy **song song** (Promise.all) 2 query DB + 1 scan form:

```typescript
const [maxFromProducts, maxFromPurchaseOrderItems] = await Promise.all([
  getMaxNumberFromProductsDB(category),      // RPC function → nhanh
  getMaxNumberFromPurchaseOrderItemsDB(category)  // RPC function → nhanh
]);
const maxFromForm = getMaxNumberFromItems(currentFormItems, category);
```

| Nguồn | Hàm | File:Line | Cách query |
| ----- | ---- | --------- | ---------- |
| **products** table | `getMaxNumberFromProductsDB(category)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:537-541` | Supabase RPC `get_max_product_code_number('N', 'products')` |
| **purchase_order_items** table | `getMaxNumberFromPurchaseOrderItemsDB(category)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:548-552` | Supabase RPC `get_max_product_code_number('N', 'purchase_order_items')` |
| **Form hiện tại** | `getMaxNumberFromItems(items, category)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:216-233` | Scan tất cả `product_code` trong form, regex `/^([NPQ])(\d+)$/` |

**Ví dụ**:
- products table: N125 → max = 125
- purchase_order_items: N130 → max = 130
- Form items: N132 → max = 132
- **Kết quả**: `Math.max(125, 130, 132)` = **132** → nextNumber = **133** → candidateCode = **"N133"**

### 10.9. Bước 7: Kiểm Tra Trùng Mã (Loop Tối Đa 30 Lần)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~580-640
- **Hàm check**: `isProductCodeExists(candidateCode, currentFormItems)`
- **File check**: `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts` line 452-502

```
candidateCode = "N133"
         ↓
┌─── Loop (max 30 attempts) ───┐
│                               │
│  ① Check FORM items          │  → formItems.some(code === "N133")
│     ↓ Không trùng            │
│  ② Check purchase_order_items│  → supabase.from('purchase_order_items').ilike('product_code', 'N133')
│     ↓ Không trùng            │
│  ③ Check products table      │  → supabase.from('products').ilike('product_code', 'N133')
│     ↓ Không trùng            │
│  ④ Check TPOS API            │  → searchTPOSProduct("N133")
│     ↓ Không tồn tại          │
│                               │
│  ✅ Mã "N133" khả dụng!      │
│  → Assign cho item           │
└───────────────────────────────┘
         │
         │ Nếu trùng ở bất kỳ bước nào:
         │ nextNumber++ → "N134" → loop lại
         │
         │ Nếu loop 30 lần vẫn trùng:
         │ → Toast warning: "⚠️ Mã trùng trên TPOS hơn 30 mã"
         │ → "Vào TPOS tìm mã lớn nhất điền tay cho mã sản phẩm đầu tiên"
```

**4 nguồn kiểm tra trùng** (theo thứ tự):

| # | Nguồn | Cách check | File:Line |
| - | ----- | ---------- | --------- |
| 1 | Form hiện tại | `formItems.some(item => item.product_code === code)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:459-461` |
| 2 | purchase_order_items (ALL statuses) | `supabase.from('purchase_order_items').ilike('product_code', code)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:469-473` |
| 3 | products table | `supabase.from('products').ilike('product_code', code)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:485-489` |
| 4 | TPOS API | `searchTPOSProduct(candidateCode)` | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~600` |

### 10.10. Bước 8: Assign Mã Cho Item

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~610-635
- Sau khi tìm được mã khả dụng:

```typescript
setItems(prev => {
  const newItems = [...prev];
  // Triple-check trước khi assign:
  // 1. Code vẫn rỗng (chưa bị assign bởi race condition)
  // 2. Không phải manual edit
  // 3. Không duplicate trong form
  if (newItems[index] &&
      !newItems[index].product_code.trim() &&
      !manualProductCodes.has(index)) {

    const isDuplicate = newItems.some((item, i) =>
      i !== index && item.product_code.trim().toUpperCase() === candidateCode.toUpperCase()
    );

    if (!isDuplicate) {
      newItems[index] = { ...newItems[index], product_code: candidateCode };
      currentFormItems.push({ product_code: candidateCode });
    }
  }
  return newItems;
});
```

**Kết quả UI**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tên sản phẩm          │ Biến thể │ Mã SP    │ SL │ Giá mua   │
├────────────────────────┼──────────┼──────────┼────┼───────────┤
│ 0501 A12 Áo thun trắng│          │ [N133 ✏️]│ 1  │ 0         │
└─────────────────────────────────────────────────────────────────┘
                                      ↑
                              Auto-generated!
                              Read-only (disabled)
                              Bấm ✏️ để sửa tay
```

### 10.11. UI: Pencil/Check Toggle (Sửa Tay Mã SP)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~2106-2144

**Trạng thái mặc định**: Mã SP **read-only** + icon ✏️ (Pencil)

```
[N133 ✏️]  ← Read-only, disabled=true, readOnly=true
```

**Bấm ✏️ Pencil** → Toggle sang chế độ sửa tay:

```
[N133 ✓]  ← Editable, disabled=false, readOnly=false, focus vào input
```

**Bấm ✓ Check** → Khóa lại mã:

```
[N999 ✏️]  ← Read-only lại, disabled=true, readOnly=true
```

**Logic toggle**:

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~2127
onClick={() => {
  const newItems = [...items];
  newItems[index]._manualCodeEdit = !newItems[index]._manualCodeEdit;  // Toggle
  setItems(newItems);
  if (newItems[index]._manualCodeEdit) {
    // Auto-focus vào input khi bật edit mode
    setTimeout(() => {
      document.getElementById(`product-code-${index}`)?.focus();
    }, 0);
  }
}}
```

**Icon hiển thị**:

```typescript
{item._manualCodeEdit ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
```

### 10.12. Tracking Manual Edit (manualProductCodes)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line 445

```typescript
const [manualProductCodes, setManualProductCodes] = useState<Set<number>>(new Set());
```

**Khi user focus vào ô mã SP** (onFocus):

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~2114
onFocus={() => {
  setManualProductCodes(prev => new Set(prev).add(index));
}}
```

→ Thêm `index` vào Set → auto-generate sẽ **SKIP** item này mãi mãi (trừ khi reset form)

**Reset form** → Clear Set:

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~1372
setManualProductCodes(new Set());
```

### 10.13. Copy Item → Auto-Generate Mã Mới

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~1447-1522
- Khi user bấm nút **Copy** (icon copy) trên 1 row:

```
Bấm Copy  →  copyItem(index)
              ↓
          1. Clone item (deep copy images)
          2. detectProductCategory(itemToCopy.product_name)
          3. Query max từ 3 nguồn (DB + form + purchase_order_items)
          4. Loop check trùng (form + DB + TPOS) tối đa 30 lần
          5. Assign mã mới cho item copy
          6. Insert item mới vào form (sau item gốc)
```

**Nếu category = null** (không detect được) → Toast error:
```
"⚠️ Chưa đủ thông tin để tạo mã SP. Vui lòng nhập thêm:
 • Loại SP (ÁO, TÚI, QUẦN...)
 • Hoặc NCC (Q5, A12...)"
```

### 10.14. Category Keywords Chi Tiết

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts` line 6-40

**CATEGORY_N_KEYWORDS** (Quần áo - 6 keywords):

| Keyword | Tiếng Việt | Ví dụ tên SP |
| ------- | ---------- | ------------ |
| QUAN | Quần | "A12 Quần jeans" |
| AO | Áo | "0501 A5 Áo thun" |
| DAM | Đầm | "B3 Đầm maxi" |
| SET | Set đồ | "A12 Set áo quần" |
| JUM | Jumpsuit | "A5 Jum dài" |
| AOKHOAC | Áo khoác | "A12 Áo khoác dạ" |

**CATEGORY_P_KEYWORDS** (Phụ kiện - 34 keywords):

| Keyword | Tiếng Việt | Keyword | Tiếng Việt |
| ------- | ---------- | ------- | ---------- |
| TUI | Túi | SON | Son |
| MATKINH | Mắt kính | CUSHION | Cushion |
| KINH | Kính | VONG | Vòng (tay, cổ) |
| MAT | Mặt | NHAN | Nhẫn |
| MYPHAM | Mỹ phẩm | BONG | Bông tai |
| BANGDO | Băng đô | PHAN | Phấn |
| GIAYDEP | Giày dép | NA | Nạ (mặt nạ) |
| GIAY | Giày | NUOC | Nước (hoa hồng) |
| DEP | Dép | XIT | Xịt (khoáng) |
| PHU | Phụ (kiện) | GEL | Gel |
| DONG | Đồng (hồ) | TONER | Toner |
| DAY | Dây (chuyền) | SERUM | Serum |
| LAC | Lắc | TINH | Tinh (chất) |
| KHAN | Khăn | TAY | Tẩy (trang) |
| NIT | Nịt | KEM | Kem |
| SUA | Sữa | BANH | Bánh |

### 10.15. Các Hàm Phụ Trợ Trong `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts`

| Hàm | Line | Chức năng |
| ---- | ---- | --------- |
| `extractBaseProductCode(code)` | 47-60 | Tách prefix+số từ variant code: "N123VX" → "N123" |
| `detectProductCategory(name)` | 68-138 | Phân tích tên → return 'N' / 'P' / 'Q' / null |
| `getNextProductCode(category)` | 145-179 | Query products table → tìm max → return next |
| `incrementProductCode(code, existingCodes)` | 187-208 | Tăng mã +1: "N123" → "N124", tránh trùng existingCodes |
| `getMaxNumberFromItems(items, category)` | 216-233 | Scan form items → tìm max number cho category |
| `getMaxNumberFromPurchaseOrderItems(category)` | 242-275 | Query purchase_order_items → tìm max |
| `getMaxNumberFromProducts(category)` | 282-315 | Query products table → tìm max |
| `generateProductCodeFromMax(name, items, userId?)` | 325-368 | Main: detect + max từ 3 nguồn + check TPOS loop |
| `getNextNACode()` | 374-418 | Tạo mã N/A, N/A1, N/A2... cho live_products |
| `generateProductCode(name)` | 425-440 | Simple version: detect + next code (không check form) |
| `isProductCodeExists(code, formItems?)` | 452-502 | Check trùng 3 nguồn: form + purchase_order_items + products |
| `getMaxNumberFromDB(category, tableName)` | 510-530 | RPC version: gọi DB function `get_max_product_code_number` |
| `getMaxNumberFromProductsDB(category)` | 537-541 | Wrapper RPC cho products table |
| `getMaxNumberFromPurchaseOrderItemsDB(category)` | 548-552 | Wrapper RPC cho purchase_order_items table |

### 10.16. EditPurchaseOrderDialog - Khác Biệt

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/EditPurchaseOrderDialog.tsx` line ~213-310 (auto-generate), line ~1276-1315 (UI toggle)

| Điểm | CreatePurchaseOrderDialog | EditPurchaseOrderDialog |
| ---- | ------------------------- | ----------------------- |
| Field tên SP | `product_name` | `_tempProductName` (temp field) |
| Field mã SP | `product_code` | `_tempProductCode` (temp field) |
| Icon | `<Pencil />` / `<Check />` | `<Edit />` / `<Check />` |
| Toggle cho item cũ | Luôn hiện | **Chỉ hiện cho item mới** (`!item.id`) |
| Item cũ (đã lưu DB) | N/A | Read-only, `bg-muted/50 cursor-not-allowed opacity-70` |
| Trigger manual | onFocus → `manualProductCodes.add(index)` | onChange value.trim() → `_manualCodeEdit = true` |
| State tracking | `manualProductCodes` (Set\<number\>) | `_manualCodeEdit` (boolean trên mỗi item) |

### 10.17. Luồng Hoạt Động End-to-End (Tạo Mã SP)

```
User gõ tên SP: "0501 A12 Áo thun trắng"
         │
         ↓ (500ms debounce)
detectProductCategory("0501 A12 Áo thun trắng")
         │
         ↓ convertVietnameseToUpperCase()
"0501 A12 AO THUN TRANG"
         │
         ↓ Tokenize + scan
tokens: ["0501", "A12", "AO", "THUN", "TRANG"]
  "0501" → ngày ddmm → skip
  "A12"  → NCC pattern → skip
  "AO"   → match CATEGORY_N_KEYWORDS ✅
         │
         ↓ category = 'N'
Query MAX from 3 sources (parallel):
  ├─ products table (RPC) → 125
  ├─ purchase_order_items (RPC) → 130
  └─ form items (scan) → 0
         │
         ↓ max = 130, next = 131
candidateCode = "N131"
         │
         ↓ Check trùng loop:
  ① isProductCodeExists("N131", formItems)
     ├─ form: không trùng ✅
     ├─ purchase_order_items: không trùng ✅
     └─ products: không trùng ✅
  ② searchTPOSProduct("N131")
     └─ Không tồn tại trên TPOS ✅
         │
         ↓ Assign
setItems → item.product_code = "N131"
         │
         ↓ UI update
[N131 ✏️] (read-only, auto-generated)
         │
         ↓ User muốn sửa?
Bấm ✏️ → [N131 ✓] (editable) → sửa → bấm ✓ → [N999 ✏️] (locked)
```

---

## 11. Luồng Hoạt Động End-to-End (Toàn Bộ Hệ Thống)


```
                    ┌──────────────────────┐
                    │   TPOS API (OData)   │
                    │  tomato.tpos.vn      │
                    └─────────┬────────────┘
                              │ Sync
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
  variant_mau.json    variant_sizeso.json   variant_sizechu.json
  (74 màu)            (21 size số)          (6 size chữ)
              │               │               │
              └───────────────┼───────────────┘
                              │ Export thành CSV
                              ▼
              ┌─────────────────────────────────┐
              │  3 CSV Files (từ Supabase)      │
              │  ┌──────────────────────────┐   │
              │  │ product_attributes_rows  │   │
              │  │ .csv (Màu, Size Số, ...) │   │
              │  └──────┬───────────────────┘   │
              │         │ 1:N                   │
              │  ┌──────▼───────────────────┐   │
              │  │ product_attribute_values  │   │
              │  │ _rows.csv (Đỏ, S, 36..) │   │
              │  └──────────────────────────┘   │
              │                                 │
              │  ┌──────────────────────────┐   │
              │  │ products_rows.csv        │   │
              │  │ - variant: string        │   │
              │  │ - base_product_code      │   │
              │  └──────────────────────────┘   │
              └─────────────────────────────────┘
                              │
                              │ Load CSV data
                              ▼
              ┌─────────────────────────────────┐
              │  Frontend (React)               │
              │                                 │
              │  1. VariantSelectorDialog        │
              │     → Chọn: Đỏ, Xanh, S, M     │
              │     → Output: "(Đỏ|Xanh)(S|M)" │
              │                                 │
              │  2. tpos-variant-converter       │
              │     → Tạo AttributeLines        │
              │     → generateProductVariants()  │
              │     → 4 variant objects          │
              │                                 │
              │  3. Push lên TPOS API            │
              │     + Lưu CSV                   │
              │                                 │
              │  4. ProductList / LiveProducts   │
              │     → formatVariantForDisplay()  │
              │     → Hiển thị "Đỏ|Xanh|S|M"   │
              └─────────────────────────────────┘
```

### Chi tiết từng bước:

1. **Đồng bộ dữ liệu**: TPOS API → 3 file JSON cache → Export thành 3 CSV files (`product_attributes_rows.csv` + `product_attribute_values_rows.csv` + `products_rows.csv`)
2. **Chọn variant**: User mở `VariantSelectorDialog`, chọn các giá trị → output chuỗi `"(Đỏ | Xanh) (S | M)"`
3. **Chuyển đổi**: `convertVariantsToAttributeLines()` query DB, map sang TPOS `AttributeLines` format
4. **Tạo tổ hợp**: `generateProductVariants()` tính tích Descartes → N variant objects đầy đủ
5. **Đẩy lên TPOS**: Gửi variant objects qua TPOS API để tạo sản phẩm con
6. **Lưu local**: Lưu vào `products_rows.csv` với `variant` string + `base_product_code`
7. **Hiển thị**: `formatVariantForDisplay()` bỏ ngoặc để hiển thị phẳng trên UI

---

## 12. Bảng Tóm Tắt Tất Cả File

### Data files (JSON cache từ TPOS)

| File                          | Đường dẫn đầy đủ                                                                          | Vai trò                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `variant_mau.json`            | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_mau.json`                  | Cache 74 màu từ TPOS (AttributeId=3)            |
| `variant_sizeso.json`         | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizeso.json`               | Cache 21 size số từ TPOS (AttributeId=4)         |
| `variant_sizechu.json`        | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizechu.json`              | Cache 6 size chữ từ TPOS (AttributeId=1)         |

### Utility / Hook files

| File                          | Đường dẫn đầy đủ                                                                          | Vai trò                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `variant-utils.ts`            | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-utils.ts`                  | Parse/format chuỗi variant, chuyển đổi values    |
| `variant-display-utils.ts`    | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-display-utils.ts`          | Format variant cho hiển thị UI (bỏ ngoặc)        |
| `tpos-variant-converter.ts`   | `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-variant-converter.ts`         | Chuyển đổi UI ↔ TPOS, tạo tổ hợp variant        |
| `product-variants-fetcher.ts` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-variants-fetcher.ts`       | Fetch variants từ CSV theo product_code          |
| `use-product-variants.ts`     | `/Users/mac/Downloads/github-html-starter-main/src/hooks/use-product-variants.ts`         | React Query hook lấy variants theo base code     |
| `attribute-sort-utils.ts`     | `/Users/mac/Downloads/github-html-starter-main/src/lib/attribute-sort-utils.ts`           | Sắp xếp thông minh (màu chuẩn, size số/chữ)    |
| `product-code-generator.ts`  | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts`         | Auto-generate mã SP: detect category, query max, check trùng 4 nguồn |
| `utils.ts`                    | `/Users/mac/Downloads/github-html-starter-main/src/lib/utils.ts`                          | `convertVietnameseToUpperCase()` bỏ dấu tiếng Việt |

### UI Components

| Component                        | Đường dẫn đầy đủ                                                                                              | Cách sử dụng                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `ProductList`                    | `/Users/mac/Downloads/github-html-starter-main/src/components/products/ProductList.tsx`                        | `formatVariantForDisplay()` hiển thị bảng |
| `LiveProducts`                   | `/Users/mac/Downloads/github-html-starter-main/src/pages/LiveProducts.tsx`                                     | `getVariantName()` tìm kiếm + lọc        |
| `EditTPOSProductDialog`          | `/Users/mac/Downloads/github-html-starter-main/src/components/products/EditTPOSProductDialog.tsx`              | Chỉnh sửa variant qua VariantSelector    |
| `AddProductToLiveDialog`         | `/Users/mac/Downloads/github-html-starter-main/src/components/live-products/AddProductToLiveDialog.tsx`        | Tự nhận diện variant khi thêm SP live     |
| `PurchaseOrderList`              | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderList.tsx`           | Hiển thị variant trong đơn nhập hàng      |
| `VariantSelectorDialog`          | `/Users/mac/Downloads/github-html-starter-main/src/components/products/VariantSelectorDialog.tsx`              | Dialog chọn variant multi-column grid     |
| `VariantDropdownSelector`        | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantDropdownSelector.tsx`     | Dropdown chọn variant cho purchase order  |
| `VariantGeneratorDialog`         | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantGeneratorDialog.tsx`      | Tạo tổ hợp variant (tích Descartes)      |
| `AttributeValueTable`            | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/AttributeValueTable.tsx`     | Bảng hiển thị + sắp xếp + xóa           |
| `CreateEditAttributeValueDialog` | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/CreateEditAttributeValueDialog.tsx` | Tạo/sửa giá trị thuộc tính          |
| `ImportAttributesDialog`         | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/ImportAttributesDialog.tsx`  | Import hàng loạt                          |
| `order-image-generator`          | `/Users/mac/Downloads/github-html-starter-main/src/lib/order-image-generator.ts`                               | `getVariantName()` in trên ảnh đơn hàng  |

### Purchase Order - Variant Flow (Debug: Attr IDs)

| Component                            | Đường dẫn đầy đủ                                                                                              | Cách sử dụng                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `CreatePurchaseOrderDialog`          | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`    | Tạo đơn, lưu `selectedAttributeValueIds`, Debug column |
| `EditPurchaseOrderDialog`            | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/EditPurchaseOrderDialog.tsx`      | Sửa đơn, load/lưu `selected_attribute_value_ids`      |
| `PurchaseOrders` (page)              | `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx`                                   | Query `selected_attribute_value_ids` từ DB             |

### Supabase Edge Functions (Backend)

| Function                               | Đường dẫn đầy đủ                                                                                                   | Vai trò                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `process-purchase-order-background`    | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts`       | Group items theo product_code + attribute IDs      |
| `create-tpos-variants-from-order`      | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts`         | Query UUIDs → Build AttributeLines → Push TPOS API |
| `create-tpos-variants` (legacy)        | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants/index.ts`                    | Phiên bản cũ, cùng logic                          |

### Database Migration

| File                                   | Đường dẫn đầy đủ                                                                                                   | Vai trò                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Migration `20251027120913`             | `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251027120913_18e287ad-d774-4cfc-b8b6-d9e99a80718c.sql` | Thêm column `selected_attribute_value_ids uuid[]`  |
