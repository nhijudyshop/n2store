// ========== PRODUCT MODULE - INLINE ==========
const availableAttributes = {
  sizeText: {
    id: 1,
    name: "Size Chữ",
    code: "SZCh",
    values: [
      { Id: 31, Name: "XXL", Code: "xxl", Sequence: null },
      { Id: 32, Name: "XXXL", Code: "xxxl", Sequence: null },
      { Id: 5, Name: "Free Size", Code: "FS", Sequence: 0 },
      { Id: 1, Name: "S", Code: "S", Sequence: 1 },
      { Id: 2, Name: "M", Code: "M", Sequence: 2 },
      { Id: 3, Name: "L", Code: "L", Sequence: 3 },
      { Id: 4, Name: "XL", Code: "XL", Sequence: 4 },
    ],
  },
  color: {
    id: 3,
    name: "Màu",
    code: "Mau",
    values: [
      { Id: 6, Name: "Trắng", Code: "trang", Sequence: null },
      { Id: 7, Name: "Đen", Code: "den", Sequence: null },
      { Id: 8, Name: "Đỏ", Code: "do", Sequence: null },
      { Id: 9, Name: "Vàng", Code: "vang", Sequence: null },
      { Id: 10, Name: "Cam", Code: "cam", Sequence: null },
      { Id: 11, Name: "Xám", Code: "xam", Sequence: null },
      { Id: 12, Name: "Hồng", Code: "hong", Sequence: null },
      { Id: 14, Name: "Nude", Code: "nude", Sequence: null },
      { Id: 15, Name: "Nâu", Code: "nau", Sequence: null },
      { Id: 16, Name: "Rêu", Code: "reu", Sequence: null },
      { Id: 17, Name: "Xanh", Code: "xanh", Sequence: null },
      { Id: 25, Name: "Bạc", Code: "bac", Sequence: null },
      { Id: 26, Name: "Tím", Code: "tim", Sequence: null },
      { Id: 27, Name: "Xanh Min", Code: "xanhmin", Sequence: null },
      { Id: 28, Name: "Trắng Kem", Code: "trangkem", Sequence: null },
      { Id: 29, Name: "Xanh Lá", Code: "xanhla", Sequence: null },
      { Id: 38, Name: "Cổ Vịt", Code: "co vit", Sequence: null },
      { Id: 40, Name: "Xanh Đậu", Code: "xanh dau", Sequence: null },
      { Id: 42, Name: "Tím Môn", Code: "timmon", Sequence: null },
      { Id: 43, Name: "Muối Tiêu", Code: "muoitieu", Sequence: null },
      { Id: 45, Name: "Kem", Code: "kem", Sequence: null },
      { Id: 47, Name: "Hồng Đậm", Code: "hongdam", Sequence: null },
      { Id: 49, Name: "Ghi", Code: "ghi", Sequence: null },
      { Id: 50, Name: "Xanh Mạ", Code: "xanhma", Sequence: null },
      { Id: 51, Name: "Vàng Đồng", Code: "vangdong", Sequence: null },
      { Id: 52, Name: "Xanh Bơ", Code: "xanhbo", Sequence: null },
      { Id: 53, Name: "Xanh Đen", Code: "xanhden", Sequence: null },
      { Id: 54, Name: "Xanh CoBan", Code: "xanhcoban", Sequence: null },
      { Id: 55, Name: "Xám Đậm", Code: "xamdam", Sequence: null },
      { Id: 56, Name: "Xám Nhạt", Code: "xamnhat", Sequence: null },
      { Id: 57, Name: "Xanh Dương", Code: "xanhduong", Sequence: null },
      { Id: 58, Name: "Cam Sữa", Code: "camsua", Sequence: null },
      { Id: 59, Name: "Hồng Nhạt", Code: "hongnhat", Sequence: null },
      { Id: 60, Name: "Đậm", Code: "dam", Sequence: null },
      { Id: 61, Name: "Nhạt", Code: "nhat", Sequence: null },
      { Id: 62, Name: "Xám Khói", Code: "xamkhoi", Sequence: null },
      { Id: 63, Name: "Xám Chuột", Code: "xamchuot", Sequence: null },
      { Id: 64, Name: "Xám Đen", Code: "xamden", Sequence: null },
      { Id: 65, Name: "Xám Trắng", Code: "xamtrang", Sequence: null },
      { Id: 66, Name: "Xanh Đậm", Code: "xanhdam", Sequence: null },
      { Id: 67, Name: "Sọc Đen", Code: "socden", Sequence: null },
      { Id: 68, Name: "Sọc Trắng", Code: "soctrang", Sequence: null },
      { Id: 69, Name: "Sọc Xám", Code: "socxam", Sequence: null },
      { Id: 70, Name: "Jean Trắng", Code: "jeantrang", Sequence: null },
      { Id: 71, Name: "Jean Xanh", Code: "jeanxanh", Sequence: null },
      { Id: 72, Name: "Cam Đất", Code: "camdat", Sequence: null },
      { Id: 73, Name: "Nâu Đậm", Code: "naudam", Sequence: null },
      { Id: 74, Name: "Nâu Nhạt", Code: "naunhat", Sequence: null },
      { Id: 75, Name: "Đỏ Tươi", Code: "dotuoi", Sequence: null },
      { Id: 76, Name: "Đen Vàng", Code: "denvang", Sequence: null },
      { Id: 77, Name: "Cà Phê", Code: "caphe", Sequence: null },
      { Id: 78, Name: "Đen Bạc", Code: "denbac", Sequence: null },
      { Id: 79, Name: "Bò", Code: "bo", Sequence: null },
      { Id: 82, Name: "Sọc Xanh", Code: "socxanh", Sequence: null },
      { Id: 83, Name: "Xanh Rêu", Code: "xanhreu", Sequence: null },
      { Id: 84, Name: "Hồng Ruốc", Code: "hongruoc", Sequence: null },
      { Id: 85, Name: "Hồng Dâu", Code: "hongdau", Sequence: null },
      { Id: 86, Name: "Xanh Nhạt", Code: "xanhnhat", Sequence: null },
      { Id: 87, Name: "Xanh Ngọc", Code: "xanhngoc", Sequence: null },
      { Id: 88, Name: "Caro", Code: "caro", Sequence: null },
      { Id: 89, Name: "Sọc Hồng", Code: "sochong", Sequence: null },
      { Id: 90, Name: "Trong", Code: "trong", Sequence: null },
      { Id: 95, Name: "Trắng Hồng", Code: "tranghong", Sequence: null },
      { Id: 96, Name: "Trắng Sáng", Code: "trangsang", Sequence: null },
      { Id: 97, Name: "Đỏ Đô", Code: "dodo", Sequence: null },
      { Id: 98, Name: "Cam Đào", Code: "camdao", Sequence: null },
      { Id: 99, Name: "Cam Lạnh", Code: "camlanh", Sequence: null },
      { Id: 100, Name: "Hồng Đào", Code: "hongdao", Sequence: null },
      { Id: 101, Name: "Hồng Đất", Code: "hongdat", Sequence: null },
      { Id: 102, Name: "Tím Đậm", Code: "timdam", Sequence: null },
    ],
  },
  sizeNumber: {
    id: 4,
    name: "Size Số",
    code: "SZNu",
    values: [
      { Id: 80, Name: "27", Code: "27", Sequence: null },
      { Id: 81, Name: "28", Code: "28", Sequence: null },
      { Id: 18, Name: "29", Code: "29", Sequence: null },
      { Id: 19, Name: "30", Code: "30", Sequence: null },
      { Id: 20, Name: "31", Code: "31", Sequence: null },
      { Id: 21, Name: "32", Code: "32", Sequence: null },
      { Id: 46, Name: "34", Code: "34", Sequence: null },
      { Id: 33, Name: "35", Code: "35", Sequence: null },
      { Id: 34, Name: "36", Code: "36", Sequence: null },
      { Id: 35, Name: "37", Code: "37", Sequence: null },
      { Id: 36, Name: "38", Code: "38", Sequence: null },
      { Id: 37, Name: "39", Code: "39", Sequence: null },
      { Id: 44, Name: "40", Code: "40", Sequence: null },
      { Id: 91, Name: "41", Code: "41", Sequence: null },
      { Id: 92, Name: "42", Code: "42", Sequence: null },
      { Id: 93, Name: "43", Code: "43", Sequence: null },
      { Id: 94, Name: "44", Code: "44", Sequence: null },
      { Id: 22, Name: "1", Code: "1", Sequence: null },
      { Id: 23, Name: "2", Code: "2", Sequence: null },
      { Id: 24, Name: "3", Code: "3", Sequence: null },
      { Id: 48, Name: "4", Code: "4", Sequence: null },
    ],
  },
};

let currentAttributeLines = [];
let imageBase64 = null;
let imagePreviewUrl = null;

// Image handling
function handleImageFile(file) {
  if (!file.type.startsWith("image/"))
    return showMessage("error", "Vui lòng chọn file hình ảnh");
  const reader = new FileReader();
  reader.onload = (e) => {
    const fullDataUrl = e.target.result;
    imageBase64 = fullDataUrl.split(",")[1];
    imagePreviewUrl = fullDataUrl;
    document.getElementById("imagePreview").src = imagePreviewUrl;
    document.getElementById("imageUploadPlaceholder").classList.add("hidden");
    document.getElementById("imagePreviewContainer").classList.remove("hidden");
    document.getElementById("imageUpload").classList.add("border-green-500");
    showMessage("success", `Đã tải ảnh (${(file.size / 1024).toFixed(2)} KB)`);
  };
  reader.readAsDataURL(file);
}

function removeImage(event) {
  if (event) event.stopPropagation();
  imageBase64 = null;
  imagePreviewUrl = null;
  document.getElementById("imagePreview").src = "";
  document.getElementById("imageUploadPlaceholder").classList.remove("hidden");
  document.getElementById("imagePreviewContainer").classList.add("hidden");
  document.getElementById("imageUpload").classList.remove("border-green-500");
  document.getElementById("fileInput").value = "";
  showMessage("success", "Đã xóa ảnh");
}

// Attribute modal
function openAttributeModal() {
  try {
    currentAttributeLines = JSON.parse(
      document.getElementById("attributeLinesDisplay").value,
    );
  } catch (e) {
    currentAttributeLines = [];
  }
  populateSelect("sizeTextSelect", availableAttributes.sizeText.values);
  populateSelect("colorSelect", availableAttributes.color.values);
  populateSelect("sizeNumberSelect", availableAttributes.sizeNumber.values);
  renderChips("sizeText");
  renderChips("color");
  renderChips("sizeNumber");
  document.getElementById("attributeModal").classList.remove("hidden");
}

function closeAttributeModal() {
  document.getElementById("attributeModal").classList.add("hidden");
}

function switchAttrTab(tab, event) {
  document
    .querySelectorAll(".attr-tab-content")
    .forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tab}`).classList.remove("hidden");
  document.querySelectorAll("#attributeModal button").forEach((btn) => {
    btn.classList.remove("border-blue-500", "text-blue-500");
    btn.classList.add("text-gray-500");
  });
  event.target.classList.add("border-blue-500", "text-blue-500");
  event.target.classList.remove("text-gray-500");
}

function populateSelect(selectId, values) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">-- Chọn --</option>';
  values.forEach(
    (item) =>
      (select.innerHTML += `<option value="${item.Id}">${item.Name}</option>`),
  );
  select.onchange = (e) => {
    const valueId = parseInt(e.target.value);
    if (!valueId) return;
    const type = selectId.replace("Select", "");
    const attrConfig = availableAttributes[type];
    const selectedValue = attrConfig.values.find((v) => v.Id === valueId);
    if (!selectedValue) return;
    let attrLine = currentAttributeLines.find(
      (line) => line.AttributeId === attrConfig.id,
    );
    if (!attrLine) {
      attrLine = {
        Attribute: {
          Id: attrConfig.id,
          Name: attrConfig.name,
          Code: attrConfig.code,
          Sequence: null,
          CreateVariant: true,
        },
        Values: [],
        AttributeId: attrConfig.id,
      };
      currentAttributeLines.push(attrLine);
    }
    if (attrLine.Values.find((v) => v.Id === valueId)) {
      showMessage("error", "Giá trị đã được thêm");
      e.target.value = "";
      return;
    }
    attrLine.Values.push({
      Id: selectedValue.Id,
      Name: selectedValue.Name,
      Code: selectedValue.Code,
      Sequence: selectedValue.Sequence,
      AttributeId: attrConfig.id,
      AttributeName: attrConfig.name,
      PriceExtra: null,
      NameGet: `${attrConfig.name}: ${selectedValue.Name}`,
      DateCreated: null,
    });
    renderChips(type);
    e.target.value = "";
  };
}

function renderChips(type) {
  const attrConfig = availableAttributes[type];
  const chipsContainer = document.getElementById(`${type}Chips`);
  chipsContainer.innerHTML = "";
  const attrLine = currentAttributeLines.find(
    (line) => line.AttributeId === attrConfig.id,
  );
  if (!attrLine || !attrLine.Values || attrLine.Values.length === 0) {
    chipsContainer.innerHTML =
      '<p class="text-gray-400 text-sm">Chưa có giá trị</p>';
    return;
  }
  attrLine.Values.forEach((val) => {
    const chip = document.createElement("div");
    chip.className = "size-chip";
    chip.innerHTML = `<span>${val.Name}</span><button class="size-chip-remove" onclick="removeValue('${type}', ${val.Id})">×</button>`;
    chipsContainer.appendChild(chip);
  });
}

function removeValue(type, valueId) {
  const attrConfig = availableAttributes[type];
  const attrLine = currentAttributeLines.find(
    (line) => line.AttributeId === attrConfig.id,
  );
  if (!attrLine) return;
  attrLine.Values = attrLine.Values.filter((v) => v.Id !== valueId);
  if (attrLine.Values.length === 0) {
    currentAttributeLines = currentAttributeLines.filter(
      (line) => line.AttributeId !== attrLine.AttributeId,
    );
  }
  renderChips(type);
}

function saveAttributeLines() {
  document.getElementById("attributeLinesDisplay").value = JSON.stringify(
    currentAttributeLines,
    null,
    2,
  );
  closeAttributeModal();
  showMessage("success", "Đã lưu biến thể");
}

// Generate Variants
function generateVariants(
  productName,
  listPrice,
  attributeLines,
  imageBase64Data,
) {
  if (!attributeLines || attributeLines.length === 0) return [];
  const combinations = [];
  function getCombinations(lines, current = [], index = 0) {
    if (index === lines.length) {
      combinations.push([...current]);
      return;
    }
    const line = lines[index];
    for (const value of line.Values) {
      current.push(value);
      getCombinations(lines, current, index + 1);
      current.pop();
    }
  }
  getCombinations(attributeLines);
  return combinations.map((attrs) => {
    const variantName = attrs.map((a) => a.Name).join(", ");
    return {
      Id: 0,
      EAN13: null,
      DefaultCode: null,
      NameTemplate: productName,
      NameNoSign: null,
      ProductTmplId: 0,
      UOMId: 0,
      UOMName: null,
      UOMPOId: 0,
      QtyAvailable: 0,
      VirtualAvailable: 0,
      OutgoingQty: null,
      IncomingQty: null,
      NameGet: `${productName} (${variantName})`,
      POSCategId: null,
      Price: null,
      Barcode: null,
      Image: imageBase64Data,
      ImageUrl: null,
      Thumbnails: [],
      PriceVariant: listPrice,
      SaleOK: true,
      PurchaseOK: true,
      DisplayAttributeValues: null,
      LstPrice: 0,
      Active: true,
      ListPrice: 0,
      PurchasePrice: null,
      DiscountSale: null,
      DiscountPurchase: null,
      StandardPrice: 0,
      Weight: 0,
      Volume: null,
      OldPrice: null,
      IsDiscount: false,
      ProductTmplEnableAll: false,
      Version: 0,
      Description: null,
      LastUpdated: null,
      Type: "product",
      CategId: 0,
      CostMethod: null,
      InvoicePolicy: "order",
      Variant_TeamId: 0,
      Name: `${productName} (${variantName})`,
      PropertyCostMethod: null,
      PropertyValuation: null,
      PurchaseMethod: "receive",
      SaleDelay: 0,
      Tracking: null,
      Valuation: null,
      AvailableInPOS: true,
      CompanyId: null,
      IsCombo: null,
      NameTemplateNoSign: productName,
      TaxesIds: [],
      StockValue: null,
      SaleValue: null,
      PosSalesCount: null,
      Factor: null,
      CategName: null,
      AmountTotal: null,
      NameCombos: [],
      RewardName: null,
      Product_UOMId: null,
      Tags: null,
      DateCreated: null,
      InitInventory: 0,
      OrderTag: null,
      StringExtraProperties: null,
      CreatedById: null,
      TaxAmount: null,
      Error: null,
      AttributeValues: attrs.map((a) => ({
        Id: a.Id,
        Name: a.Name,
        Code: null,
        Sequence: null,
        AttributeId: a.AttributeId,
        AttributeName: a.AttributeName,
        PriceExtra: null,
        NameGet: a.NameGet,
        DateCreated: null,
      })),
    };
  });
}

// Create product
async function createProductOneClick() {
  const defaultCode = document
    .getElementById("defaultCode")
    .value.trim()
    .toUpperCase();
  const productName = document.getElementById("productName").value.trim();
  const listPrice = parseFloat(document.getElementById("listPrice").value);
  const purchasePrice = parseFloat(
    document.getElementById("purchasePrice").value,
  );
  const qtyAvailable = parseFloat(
    document.getElementById("qtyAvailable").value,
  );
  if (!defaultCode || !productName)
    return showMessage("error", "⚠️ Vui lòng nhập đầy đủ thông tin!");

  // Hide previous results
  document.getElementById("productResult").classList.add("hidden");
  document.getElementById("productVariantsResult").classList.add("hidden");

  try {
    showMessage("info", "🔍 Đang kiểm tra...");
    const checkResponse = await fetch(
      `https://tomato.tpos.vn/odata/ProductTemplate/OdataService.GetViewV2?Active=true&DefaultCode=${defaultCode}`,
      { headers: getHeaders() },
    );
    const checkData = await checkResponse.json();
    if (checkData.value && checkData.value.length > 0) {
      showMessage("error", "❌ Sản phẩm đã tồn tại! Mã: " + defaultCode);
      displayProductResult("❌ Sản phẩm đã tồn tại", checkData.value[0]);
      return;
    }
    showMessage("info", "✅ Đang tạo mới...");
    const attributeLines = JSON.parse(
      document.getElementById("attributeLinesDisplay").value,
    );
    const productVariants = generateVariants(
      productName,
      listPrice,
      attributeLines,
      imageBase64,
    );
    const payload = {
      Id: 0,
      Name: productName,
      Type: "product",
      ListPrice: listPrice,
      PurchasePrice: purchasePrice,
      DefaultCode: defaultCode,
      QtyAvailable: qtyAvailable,
      Image: imageBase64,
      ImageUrl: null,
      Thumbnails: [],
      AttributeLines: attributeLines,
      ProductVariants: productVariants,
      Active: true,
      SaleOK: true,
      PurchaseOK: true,
      UOMId: 1,
      UOMPOId: 1,
      CategId: 2,
      CompanyId: 1,
      Tracking: "none",
      InvoicePolicy: "order",
      PurchaseMethod: "receive",
      AvailableInPOS: true,
      DiscountSale: 0,
      DiscountPurchase: 0,
      StandardPrice: 0,
      Weight: 0,
      SaleDelay: 0,
      UOM: {
        Id: 1,
        Name: "Cái",
        Rounding: 0.001,
        Active: true,
        Factor: 1,
        FactorInv: 1,
        UOMType: "reference",
        CategoryId: 1,
        CategoryName: "Đơn vị",
      },
      UOMPO: {
        Id: 1,
        Name: "Cái",
        Rounding: 0.001,
        Active: true,
        Factor: 1,
        FactorInv: 1,
        UOMType: "reference",
        CategoryId: 1,
        CategoryName: "Đơn vị",
      },
      Categ: {
        Id: 2,
        Name: "Có thể bán",
        CompleteName: "Có thể bán",
        Type: "normal",
        PropertyCostMethod: "average",
        NameNoSign: "Co the ban",
        IsPos: true,
      },
      Items: [],
      UOMLines: [],
      ComboProducts: [],
      ProductSupplierInfos: [],
    };
    const response = await fetch(
      "https://tomato.tpos.vn/odata/ProductTemplate/ODataService.InsertV2?$expand=ProductVariants,UOM,UOMPO",
      { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) },
    );
    const data = await response.json();
    if (response.ok) {
      showMessage("success", "🎉 Tạo sản phẩm thành công! Mã: " + defaultCode);
      displayProductResult("✅ Thành công", data);

      // Fetch and display variants
      await fetchAndDisplayCreatedVariants(data.Id);

      document.getElementById("productName").value = "";
      document.getElementById("defaultCode").value = "NTEST";
      document.getElementById("attributeLinesDisplay").value = "[]";
      currentAttributeLines = [];
      if (imageBase64) removeImage();
    } else {
      showMessage("error", "❌ Lỗi: " + (data.error?.message || "Unknown"));
      displayProductResult("❌ Lỗi", data);
    }
  } catch (error) {
    showMessage("error", "❌ Lỗi: " + error.message);
  }
}

async function fetchAndDisplayCreatedVariants(productTemplateId) {
  try {
    showMessage("info", "📥 Đang tải variants...");
    const url = `https://tomato.tpos.vn/odata/ProductTemplate(${productTemplateId})?$expand=ProductVariants($expand=AttributeValues)`;

    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
      throw new Error("Không tải được variants");
    }

    const data = await response.json();
    displayCreatedVariants(data.ProductVariants || []);
    showMessage(
      "success",
      `✅ Đã tải ${data.ProductVariants?.length || 0} variants`,
    );
  } catch (error) {
    console.error("Error fetching variants:", error);
  }
}

function displayCreatedVariants(variants) {
  document.getElementById("productVariantsResult").classList.remove("hidden");
  document.getElementById("createdVariantCount").textContent = variants.length;

  const tbody = document.getElementById("createdVariantsTableBody");
  if (variants.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="border p-4 text-center text-gray-500">Không có variants</td></tr>';
    return;
  }

  tbody.innerHTML = variants
    .map((variant) => {
      const attributes =
        variant.AttributeValues?.map((attr) => attr.NameGet).join(", ") ||
        "N/A";
      return `
      <tr class="hover:bg-green-50 transition">
        <td class="border p-3 text-sm font-medium">${variant.Id}</td>
        <td class="border p-3 text-sm font-bold text-purple-600">${variant.DefaultCode || "N/A"}</td>
        <td class="border p-3 text-sm">${variant.Name}</td>
        <td class="border p-3 text-sm font-semibold text-green-600">${variant.PriceVariant?.toLocaleString("vi-VN")}₫</td>
        <td class="border p-3 text-sm font-semibold text-blue-600">${variant.StandardPrice?.toLocaleString("vi-VN")}₫</td>
        <td class="border p-3 text-sm text-gray-600">${attributes}</td>
      </tr>
    `;
    })
    .join("");

  // Scroll to variants section
  document
    .getElementById("productVariantsResult")
    .scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function displayProductResult(title, data) {
  document.getElementById("productResult").classList.remove("hidden");
  document.getElementById("productResultContent").textContent = JSON.stringify(
    data,
    null,
    2,
  );
}

// ========== ORDER MODULE ==========
let currentStep = 1;
let orders = [];
let selectedOrder = null;
let products = [];
let selectedProducts = [];
let orderDetail = null;

const today = new Date();
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(today.getDate() - 2);
document.getElementById("startDate").value = twoDaysAgo
  .toISOString()
  .split("T")[0];
document.getElementById("endDate").value = today.toISOString().split("T")[0];

function formatDateForAPI(dateStr, isEndDate = false) {
  const date = new Date(dateStr);
  if (isEndDate) {
    date.setHours(16, 59, 59, 0);
  } else {
    date.setHours(17, 0, 0, 0);
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function goToStep(step) {
  currentStep = step;
  updateStepUI();
}

function updateStepUI() {
  document
    .getElementById("stepContent1")
    .classList.toggle("hidden", currentStep !== 1);
  document
    .getElementById("stepContent2")
    .classList.toggle("hidden", currentStep !== 2);
  document
    .getElementById("stepContent3")
    .classList.toggle("hidden", currentStep < 3);
  document
    .getElementById("updateSection")
    .classList.toggle("hidden", currentStep !== 4);
  for (let i = 1; i <= 4; i++) {
    const circle = document.getElementById(`step${i}`);
    circle.classList.toggle("bg-blue-500", i <= currentStep);
    circle.classList.toggle("text-white", i <= currentStep);
    circle.classList.toggle("bg-gray-200", i > currentStep);
    circle.classList.toggle("text-gray-500", i > currentStep);
  }
  for (let i = 1; i <= 3; i++) {
    document
      .getElementById(`line${i}`)
      .classList.toggle("bg-blue-500", i < currentStep);
  }
}

async function fetchOrders() {
  try {
    const startDate = formatDateForAPI(
      document.getElementById("startDate").value,
      false,
    );
    const endDate = formatDateForAPI(
      document.getElementById("endDate").value,
      true,
    );
    const sessionIndex = document.getElementById("sessionIndex").value;
    const url = `https://tomato.tpos.vn/odata/SaleOnline_Order/ODataService.GetView?$top=50&$orderby=DateCreated desc&$filter=(DateCreated ge ${startDate} and DateCreated le ${endDate} and SessionIndex eq ${sessionIndex})&$count=true`;
    const response = await fetch(url, { headers: getHeaders() });
    const data = await response.json();
    orders = data.value || [];
    displayOrders();
    showMessage("success", `Tìm thấy ${data["@odata.count"]} đơn hàng`);
    goToStep(2);
  } catch (error) {
    showMessage("error", "Lỗi: " + error.message);
  }
}

function displayOrders() {
  document.getElementById("orderCount").textContent = orders.length;
  const container = document.getElementById("ordersList");
  container.innerHTML = orders
    .map(
      (order) => `
    <div onclick="selectOrder('${order.Id}')" id="order-${order.Id}" class="order-item p-4 border-2 rounded-lg cursor-pointer transition border-gray-200 hover:border-blue-300">
      <div class="flex justify-between">
        <div><p class="font-bold">#${order.Code}</p><p class="text-sm text-gray-600">${order.Name}</p></div>
        <div class="text-right"><p class="font-bold text-blue-600">${order.TotalAmount?.toLocaleString("vi-VN")}₫</p><p class="text-sm">SL: ${order.TotalQuantity}</p></div>
      </div>
    </div>
  `,
    )
    .join("");
}

function selectOrder(orderId) {
  selectedOrder = orders.find((o) => o.Id === orderId);
  document
    .querySelectorAll(".order-item")
    .forEach((item) => item.classList.remove("border-blue-500", "bg-blue-50"));
  document
    .getElementById(`order-${orderId}`)
    .classList.add("border-blue-500", "bg-blue-50");
}

async function fetchOrderDetail() {
  if (!selectedOrder) return showMessage("error", "Vui lòng chọn đơn hàng");
  try {
    const response = await fetch(
      `https://tomato.tpos.vn/odata/SaleOnline_Order(${selectedOrder.Id})?$expand=Details,Partner,User,CRMTeam`,
      { headers: getHeaders() },
    );
    orderDetail = await response.json();
    document.getElementById("orderCode").textContent = orderDetail.Code;
    document.getElementById("customerName").textContent = orderDetail.Name;
    showMessage("success", "Đã tải chi tiết đơn hàng");
    goToStep(4);
  } catch (error) {
    showMessage("error", "Lỗi: " + error.message);
  }
}

async function searchProducts() {
  const searchTerm = document.getElementById("productSearch").value.trim();
  if (!searchTerm) return showMessage("error", "Vui lòng nhập tên sản phẩm");
  try {
    const response = await fetch(
      `https://tomato.tpos.vn/odata/Product/OdataService.GetViewV2?Active=true&Name=${encodeURIComponent(searchTerm)}`,
      { headers: getHeaders() },
    );
    const data = await response.json();
    products = data.value || [];
    displayProducts();
    showMessage("success", `Tìm thấy ${data["@odata.count"]} sản phẩm`);
  } catch (error) {
    showMessage("error", "Lỗi: " + error.message);
  }
}

function displayProducts() {
  document.getElementById("productsList").innerHTML = products
    .map(
      (product) => `
    <div class="p-3 border rounded-lg flex justify-between items-center hover:border-blue-300">
      <div><p class="font-semibold">${product.NameGet}</p><p class="text-sm text-gray-600">${product.ListPrice?.toLocaleString("vi-VN")}₫</p></div>
      <button onclick='addProductToList(${JSON.stringify(product).replace(/'/g, "&apos;")})' class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg">Thêm</button>
    </div>
  `,
    )
    .join("");
}

function addProductToList(product) {
  if (selectedProducts.find((p) => p.ProductId === product.Id))
    return showMessage("error", "Sản phẩm đã được thêm");
  selectedProducts.push({
    ProductId: product.Id,
    ProductName: product.Name,
    ProductNameGet: product.NameGet,
    UOMId: 1,
    UOMName: product.UOMName || "Cái",
    Quantity: 1,
    Price: product.ListPrice || 0,
    Factor: 1,
    ProductWeight: 0,
  });
  displaySelectedProducts();
  showMessage("success", "Đã thêm sản phẩm");
}

function displaySelectedProducts() {
  document.getElementById("selectedCount").textContent =
    selectedProducts.length;
  document.getElementById("newProductCount").textContent =
    selectedProducts.length;
  document.getElementById("selectedProductsList").innerHTML = selectedProducts
    .map(
      (product, index) => `
    <div class="p-4 border rounded-lg flex justify-between items-center mb-3">
      <div class="flex-1"><p class="font-semibold">${product.ProductNameGet}</p><p class="text-sm text-gray-600">${product.Price?.toLocaleString("vi-VN")}₫</p></div>
      <div class="flex items-center gap-3">
        <input type="number" min="1" value="${product.Quantity}" onchange="updateQuantity(${index}, this.value)" class="w-20 px-3 py-2 border rounded-lg text-center">
        <button onclick="removeProduct(${index})" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg">Xóa</button>
      </div>
    </div>
  `,
    )
    .join("");
}

function updateQuantity(index, quantity) {
  selectedProducts[index].Quantity = parseInt(quantity) || 1;
}
function removeProduct(index) {
  selectedProducts.splice(index, 1);
  displaySelectedProducts();
}

async function updateOrder() {
  if (!orderDetail || selectedProducts.length === 0)
    return showMessage("error", "Chưa đủ dữ liệu");
  try {
    generateNewGUID();
    const updatedOrder = { ...orderDetail, Details: selectedProducts };
    const response = await fetch(
      `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderDetail.Id})`,
      {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(updatedOrder),
      },
    );
    if (response.ok) showMessage("success", "Cập nhật đơn hàng thành công!");
    else showMessage("error", "Lỗi khi cập nhật");
  } catch (error) {
    showMessage("error", "Lỗi: " + error.message);
  }
}

// ========== VARIANTS MODULE ==========
async function fetchProductVariants() {
  const templateId = document.getElementById("productTemplateId").value.trim();
  if (!templateId)
    return showMessage("error", "Vui lòng nhập Product Template ID");

  try {
    showMessage("info", "📥 Đang tải dữ liệu...");
    const url = `https://tomato.tpos.vn/odata/ProductTemplate(${templateId})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`;

    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
      throw new Error("Không tìm thấy sản phẩm");
    }

    const data = await response.json();
    displayProductVariants(data);
    showMessage(
      "success",
      `✅ Đã tải ${data.ProductVariants?.length || 0} variants`,
    );
  } catch (error) {
    showMessage("error", "Lỗi: " + error.message);
  }
}

function displayProductVariants(data) {
  document.getElementById("variantsResult").classList.remove("hidden");
  document.getElementById("variantCount").textContent =
    data.ProductVariants?.length || 0;

  // Display product info
  const productInfo = document.getElementById("productInfo");
  productInfo.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><span class="font-semibold">ID:</span> ${data.Id}</div>
      <div><span class="font-semibold">Tên:</span> ${data.Name}</div>
      <div><span class="font-semibold">Mã:</span> ${data.DefaultCode}</div>
      <div><span class="font-semibold">Giá Bán:</span> ${data.ListPrice?.toLocaleString("vi-VN")}₫</div>
      <div><span class="font-semibold">Giá Mua:</span> ${data.PurchasePrice?.toLocaleString("vi-VN")}₫</div>
      <div><span class="font-semibold">Tồn Kho:</span> ${data.QtyAvailable}</div>
    </div>
  `;

  // Display variants table
  const tbody = document.getElementById("variantsTableBody");
  if (!data.ProductVariants || data.ProductVariants.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="border p-4 text-center text-gray-500">Không có variants</td></tr>';
    return;
  }

  tbody.innerHTML = data.ProductVariants.map((variant) => {
    const attributes =
      variant.AttributeValues?.map((attr) => attr.NameGet).join(", ") || "N/A";
    return `
      <tr class="hover:bg-gray-50">
        <td class="border p-3 text-sm">${variant.Id}</td>
        <td class="border p-3 text-sm font-medium">${variant.DefaultCode || "N/A"}</td>
        <td class="border p-3 text-sm">${variant.Name}</td>
        <td class="border p-3 text-sm font-semibold text-green-600">${variant.PriceVariant?.toLocaleString("vi-VN")}₫</td>
        <td class="border p-3 text-sm font-semibold text-blue-600">${variant.StandardPrice?.toLocaleString("vi-VN")}₫</td>
        <td class="border p-3 text-sm text-gray-600">${attributes}</td>
      </tr>
    `;
  }).join("");
}

// ========== SHARED UTILITIES ==========
function generateGUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateNewGUID() {
  document.getElementById("requestId").value = generateGUID();
  showMessage("success", "Đã tạo GUID mới");
}

function getHeaders() {
  return {
    accept: "application/json, text/plain, */*",
    authorization: document.getElementById("authToken")?.value?.trim() || "",
    "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "content-type": "application/json;charset=UTF-8",
    origin: "https://tomato.tpos.vn",
    referer: "https://tomato.tpos.vn/",
    tposappversion: "5.9.10.1",
    "user-agent": navigator.userAgent,
    "x-request-id":
      document.getElementById("requestId")?.value || generateGUID(),
  };
}

function showMessage(type, text) {
  const alert = document.getElementById("messageAlert");
  alert.className = `mb-6 p-4 rounded-lg flex items-center gap-3 fade-in ${
    type === "success"
      ? "bg-green-100 text-green-800"
      : type === "info"
        ? "bg-blue-100 text-blue-800"
        : type === "warning"
          ? "bg-orange-100 text-orange-800"
          : "bg-red-100 text-red-800"
  }`;
  alert.innerHTML = `<span>${type === "success" ? "✓" : type === "info" ? "ℹ" : "⚠"}</span><span>${text}</span>`;
  alert.classList.remove("hidden");
  setTimeout(() => alert.classList.add("hidden"), 5000);
}

function toggleHeaders() {
  const section = document.getElementById("headersSection");
  const toggleText = document.getElementById("toggleText");
  section.classList.toggle("hidden");
  toggleText.textContent = section.classList.contains("hidden") ? "Hiện" : "Ẩn";
}

function saveHeaders() {
  try {
    const config = {
      authToken: document.getElementById("authToken").value,
      requestId: document.getElementById("requestId").value,
    };
    localStorage.setItem("tposHeaders", JSON.stringify(config));
    showMessage("success", "Đã lưu cấu hình");
  } catch (e) {
    showMessage("error", "Lỗi: " + e.message);
  }
}

function loadDefaultHeaders() {
  document.getElementById("authToken").value =
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiZGQxMGFkZmMtZjNhYy00YjcxLWE5ZDQtM2I3MWRhMjYwYzU5IiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6InNob3AxIiwiRGlzcGxheU5hbWUiOiJTaG9wIiwiQXZhdGFyVXJsIjoiIiwiU2VjdXJpdHlTdGFtcCI6ImU4Mzk3YWQ3LTI2YzYtNDU2MS05NWQ5LTgxMThlMjA4NTFkOSIsIkNvbXBhbnlJZCI6IjEiLCJUZW5hbnRJZCI6InRvbWF0by50cG9zLnZuIiwiUm9sZUlkcyI6IjczMTU0MzU4LWQ1MGItNDA5ZS05OWZkLWE5ODQwMTNiNGVhNSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFkbWluaXN0cmF0b3JzIiwianRpIjoiZTkwMjg0NGYtNGIyNi00ZDY0LWIzZmEtMzVlODI5YWMwM2E3IiwiaWF0IjoiMTc2MDY5MjUxNiIsIm5iZiI6MTc2MDY5MjUxNiwiZXhwIjoxNzYxOTg4NTE2LCJpc3MiOiJodHRwczovL3RvbWF0by50cG9zLnZuIiwiYXVkIjoiaHR0cHM6Ly90b21hdG8udHBvcy52bixodHRwczovL3Rwb3Mudm4ifQ.7RrDsYu2eS9AFFP3fNsfNaXbEtkgpmEvLDm_zHm8jUg";
  generateNewGUID();
  showMessage("success", "Đã khôi phục cấu hình mặc định");
}

function switchModule(module) {
  ["productModule", "orderModule", "variantsModule"].forEach((m) => {
    document.getElementById(m).classList.add("hidden");
  });
  document.getElementById(`${module}Module`).classList.remove("hidden");

  const buttons = ["btnProduct", "btnOrder", "btnVariants"];
  buttons.forEach((btn) => {
    const el = document.getElementById(btn);
    el.classList.remove("active");
    el.classList.add("bg-gray-200", "text-gray-700");
  });

  const activeBtn =
    module === "product"
      ? "btnProduct"
      : module === "order"
        ? "btnOrder"
        : "btnVariants";
  const activeEl = document.getElementById(activeBtn);
  activeEl.classList.add("active");
  activeEl.classList.remove("bg-gray-200", "text-gray-700");
}

// ========== INITIALIZE ==========
document
  .getElementById("defaultCode")
  .addEventListener(
    "input",
    (e) => (e.target.value = e.target.value.toUpperCase()),
  );
document
  .getElementById("imageUpload")
  .addEventListener("click", () =>
    document.getElementById("fileInput").click(),
  );
document.getElementById("fileInput").addEventListener("change", (e) => {
  if (e.target.files[0]) handleImageFile(e.target.files[0]);
});
document.addEventListener("paste", (e) => {
  const items = e.clipboardData.items;
  for (let item of items) {
    if (item.type.indexOf("image") !== -1) handleImageFile(item.getAsFile());
  }
});

const savedConfig = localStorage.getItem("tposHeaders");
if (savedConfig) {
  try {
    const config = JSON.parse(savedConfig);
    if (config.authToken)
      document.getElementById("authToken").value = config.authToken;
    if (config.requestId)
      document.getElementById("requestId").value = config.requestId;
  } catch (e) {}
} else {
  loadDefaultHeaders();
}
updateStepUI();
