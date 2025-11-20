// =====================================================
// IMPROVED PAYLOAD PREPARATION FOR PUT REQUEST
// =====================================================

/**
 * HYBRID APPROACH (RECOMMENDED)
 * - Xóa metadata và expanded objects
 * - Xóa computed fields
 * - Giữ lại core data structure
 */
function prepareOrderPayloadHybrid(orderData) {
    // Clone để không ảnh hưởng dữ liệu gốc
    const payload = JSON.parse(JSON.stringify(orderData));
    
    // ============================================
    // 1. XÓA METADATA
    // ============================================
    delete payload['@odata.context'];
    
    // ============================================
    // 2. XÓA EXPANDED OBJECTS
    // API sẽ tự resolve các objects này từ IDs
    // ============================================
    delete payload.Partner;
    delete payload.User;
    delete payload.CRMTeam;
    
    // ============================================
    // 3. XÓA COMPUTED FIELDS (Top Level)
    // Các fields này được tính từ dữ liệu khác
    // ============================================
    const topLevelComputedFields = [
        // Name fields (computed from relations)
        'PartnerName',
        'UserName', 
        'CRMTeamName',
        'WarehouseName',
        'CompanyName',
        'LiveCampaignName',
        'AssignedEmployeeName',
        
        // Status text fields (computed from Status enum)
        'StatusText',
        'PartnerStatusText',
        
        // Computed metadata
        'PartnerNameNosign',
        'StatusStr',
        'CommentIds',
        'IsCreated',
        'IsUpdated',
        'FormAction',
        'Error',
        
        // Partner computed fields
        'PartnerCode',
        'PartnerStatus',
        'PartnerPhone',
        'PartnerUniqueId',
        
        // Other computed
        'DeliveryInfo',
        'MatchingId',
        'MessageCount',
        'PriorityStatus',
        'IsNewAddress',
        'NameNetwork',
        
        // City/District/Ward names (computed from codes)
        'CityName',
        'DistrictName', 
        'WardName'
    ];
    
    topLevelComputedFields.forEach(field => {
        if (payload.hasOwnProperty(field)) {
            delete payload[field];
        }
    });
    
    // ============================================
    // 4. CLEAN DETAILS ARRAY
    // ============================================
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details = payload.Details.map(detail => {
            // Clone detail
            const cleaned = { ...detail };
            
            // Xóa computed fields trong Details
            const detailComputedFields = [
                'ProductName',           // Computed from ProductId
                'ProductNameGet',        // Computed from ProductId  
                'ProductCode',           // Computed from ProductId
                'UOMName',               // Computed from UOMId
                'ImageUrl',              // Computed from ProductId
                'IsDisabledLiveCampaignDetail',  // Computed
                'QuantityRegex',         // Computed
                'IsOrderPriority'        // Computed
            ];
            
            detailComputedFields.forEach(field => {
                if (cleaned.hasOwnProperty(field)) {
                    delete cleaned[field];
                }
            });
            
            // Đảm bảo OrderId match với Id của Order
            cleaned.OrderId = payload.Id;
            
            return cleaned;
        });
    }
    
    // ============================================
    // 5. VALIDATE & LOG
    // ============================================
    console.log('[PAYLOAD HYBRID] Prepared payload:', {
        orderId: payload.Id,
        orderCode: payload.Code,
        detailsCount: payload.Details?.length || 0,
        payloadSize: JSON.stringify(payload).length,
        hasRowVersion: !!payload.RowVersion
    });
    
    return payload;
}

/**
 * MINIMAL APPROACH (FALLBACK)
 * - Chỉ gửi các fields chính xác cần thiết
 * - An toàn nhất nhưng phức tạp để maintain
 */
function prepareOrderPayloadMinimal(orderData) {
    const payload = {
        // ============================================
        // CORE IDENTIFIERS (Required)
        // ============================================
        Id: orderData.Id,
        Code: orderData.Code,
        
        // ============================================
        // FACEBOOK/SOCIAL SOURCE INFO
        // ============================================
        Facebook_UserId: orderData.Facebook_UserId,
        Facebook_PostId: orderData.Facebook_PostId,
        Facebook_ASUserId: orderData.Facebook_ASUserId,
        Facebook_CommentId: orderData.Facebook_CommentId,
        Facebook_AttachmentId: orderData.Facebook_AttachmentId,
        Facebook_UserName: orderData.Facebook_UserName,
        Facebook_UserAvatar: orderData.Facebook_UserAvatar,
        Facebook_Content: orderData.Facebook_Content,
        Facebook_CommentsText: orderData.Facebook_CommentsText,
        
        // ============================================
        // ZALO SOURCE INFO
        // ============================================
        ZaloOrderCode: orderData.ZaloOrderCode,
        ZaloOrderId: orderData.ZaloOrderId,
        ZaloOAId: orderData.ZaloOAId,
        
        // ============================================
        // CUSTOMER CONTACT INFO (Editable)
        // ============================================
        Name: orderData.Name,
        Telephone: orderData.Telephone,
        Email: orderData.Email,
        Address: orderData.Address,
        
        // Location codes (not names)
        CityCode: orderData.CityCode,
        DistrictCode: orderData.DistrictCode,
        WardCode: orderData.WardCode,
        
        // ============================================
        // ORDER INFO
        // ============================================
        Note: orderData.Note,
        Deposit: orderData.Deposit || 0,
        TotalAmount: orderData.TotalAmount || 0,
        TotalQuantity: orderData.TotalQuantity || 0,
        
        // ============================================
        // RELATIONS (IDs only)
        // ============================================
        LiveCampaignId: orderData.LiveCampaignId,
        PartnerId: orderData.PartnerId,
        WarehouseId: orderData.WarehouseId || 1,
        CompanyId: orderData.CompanyId || 1,
        CRMTeamId: orderData.CRMTeamId,
        UserId: orderData.UserId,
        CreatedById: orderData.CreatedById,
        AssignedEmployeeId: orderData.AssignedEmployeeId,
        
        // ============================================
        // STATUS & METADATA
        // ============================================
        Status: orderData.Status,
        Source: orderData.Source,
        Source_FacebookUserId: orderData.Source_FacebookUserId,
        Source_FacebookMessageId: orderData.Source_FacebookMessageId,
        
        // ============================================
        // IMPORTANT: ROW VERSION (For Concurrency Control)
        // ============================================
        RowVersion: orderData.RowVersion,
        
        // ============================================
        // TRACKING
        // ============================================
        SessionIndex: orderData.SessionIndex,
        Session: orderData.Session,
        Index: orderData.Index,
        PrintCount: orderData.PrintCount,
        Tags: orderData.Tags,
        
        // ============================================
        // DATES (Usually readonly, but include for safety)
        // ============================================
        DateCreated: orderData.DateCreated,
        LastUpdated: orderData.LastUpdated,
        
        // ============================================
        // DETAILS ARRAY
        // ============================================
        Details: orderData.Details ? orderData.Details.map(detail => ({
            // Identity
            Id: detail.Id || null,  // null = new detail, value = update existing
            
            // Product reference
            ProductId: detail.ProductId,
            
            // Quantity & Price
            Quantity: detail.Quantity || 1,
            Price: detail.Price || 0,
            
            // UOM
            UOMId: detail.UOMId || 1,
            Factor: detail.Factor || 1,
            
            // Additional info
            Note: detail.Note || null,
            Priority: detail.Priority || 0,
            ProductWeight: detail.ProductWeight || 0,
            
            // Relations
            OrderId: orderData.Id,  // Must match Order.Id
            LiveCampaign_DetailId: detail.LiveCampaign_DetailId || null,
            
            // Creator
            CreatedById: detail.CreatedById || orderData.UserId
        })) : []
    };
    
    console.log('[PAYLOAD MINIMAL] Prepared payload:', {
        orderId: payload.Id,
        orderCode: payload.Code,
        detailsCount: payload.Details?.length || 0,
        payloadSize: JSON.stringify(payload).length,
        hasRowVersion: !!payload.RowVersion
    });
    
    return payload;
}

/**
 * FULL APPROACH (Keep Everything Except Metadata & Expanded)
 * - Giữ nguyên hầu hết dữ liệu
 * - Chỉ xóa @odata.context và expanded objects
 */
function prepareOrderPayloadFull(orderData) {
    const payload = JSON.parse(JSON.stringify(orderData));
    
    // Xóa metadata
    delete payload['@odata.context'];
    
    // Xóa expanded objects
    delete payload.Partner;
    delete payload.User;
    delete payload.CRMTeam;
    
    // Clean Details - CHỈ xóa computed fields
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details = payload.Details.map(detail => {
            const cleaned = { ...detail };
            
            // Chỉ xóa những fields RÕ RÀNG là computed
            delete cleaned.ProductName;
            delete cleaned.ProductNameGet;
            delete cleaned.ProductCode;
            delete cleaned.UOMName;
            delete cleaned.ImageUrl;
            
            return cleaned;
        });
    }
    
    console.log('[PAYLOAD FULL] Prepared payload:', {
        orderId: payload.Id,
        orderCode: payload.Code,
        detailsCount: payload.Details?.length || 0,
        payloadSize: JSON.stringify(payload).length
    });
    
    return payload;
}

/**
 * SMART SELECTOR
 * Chọn strategy phù hợp dựa vào context
 */
function prepareOrderPayload(orderData, strategy = 'hybrid') {
    console.log(`[PAYLOAD] Using strategy: ${strategy}`);
    
    switch (strategy) {
        case 'minimal':
            return prepareOrderPayloadMinimal(orderData);
        case 'full':
            return prepareOrderPayloadFull(orderData);
        case 'hybrid':
        default:
            return prepareOrderPayloadHybrid(orderData);
    }
}

/**
 * VALIDATE PAYLOAD
 * Kiểm tra payload trước khi gửi
 */
function validatePayload(payload) {
    const errors = [];
    
    // Check required fields
    if (!payload.Id) errors.push('Missing Id');
    if (!payload.Code) errors.push('Missing Code');
    if (!payload.PartnerId) errors.push('Missing PartnerId');
    if (!payload.RowVersion) errors.push('Missing RowVersion (concurrency control)');
    
    // Check Details
    if (payload.Details) {
        if (!Array.isArray(payload.Details)) {
            errors.push('Details must be an array');
        } else {
            payload.Details.forEach((detail, index) => {
                if (!detail.ProductId) {
                    errors.push(`Detail[${index}]: Missing ProductId`);
                }
                if (!detail.Quantity || detail.Quantity < 1) {
                    errors.push(`Detail[${index}]: Invalid Quantity`);
                }
                if (detail.OrderId !== payload.Id) {
                    errors.push(`Detail[${index}]: OrderId mismatch`);
                }
            });
        }
    }
    
    // Check for computed fields that shouldn't be there
    const forbiddenFields = [
        'Partner', 'User', 'CRMTeam',  // Expanded objects
        '@odata.context'  // Metadata
    ];
    
    forbiddenFields.forEach(field => {
        if (payload.hasOwnProperty(field)) {
            errors.push(`Should not contain: ${field}`);
        }
    });
    
    if (errors.length > 0) {
        console.error('[VALIDATE] Payload validation errors:', errors);
        return { valid: false, errors };
    }
    
    console.log('[VALIDATE] Payload is valid');
    return { valid: true, errors: [] };
}

/**
 * COMPARE PAYLOADS
 * So sánh 2 payloads để xem sự khác biệt
 */
function comparePayloads(original, modified) {
    const changes = {
        added: [],
        removed: [],
        modified: []
    };
    
    // Compare top-level fields
    const allKeys = new Set([
        ...Object.keys(original),
        ...Object.keys(modified)
    ]);
    
    allKeys.forEach(key => {
        if (key === 'Details') return; // Handle separately
        
        if (!(key in original) && key in modified) {
            changes.added.push(key);
        } else if (key in original && !(key in modified)) {
            changes.removed.push(key);
        } else if (JSON.stringify(original[key]) !== JSON.stringify(modified[key])) {
            changes.modified.push({
                field: key,
                old: original[key],
                new: modified[key]
            });
        }
    });
    
    // Compare Details
    if (original.Details || modified.Details) {
        const origDetails = original.Details || [];
        const modDetails = modified.Details || [];
        
        changes.detailsChanges = {
            originalCount: origDetails.length,
            modifiedCount: modDetails.length,
            added: modDetails.filter(d => !d.Id).length,
            removed: origDetails.length - modDetails.filter(d => d.Id).length
        };
    }
    
    console.log('[COMPARE] Payload changes:', changes);
    return changes;
}

// =====================================================
// USAGE EXAMPLES
// =====================================================

/*
// Example 1: Use recommended hybrid approach
const payload = prepareOrderPayload(currentEditOrderData, 'hybrid');
const validation = validatePayload(payload);

if (validation.valid) {
    const response = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
} else {
    console.error('Invalid payload:', validation.errors);
}

// Example 2: Try hybrid, fallback to minimal on error
async function saveWithFallback(orderData) {
    try {
        const payload = prepareOrderPayload(orderData, 'hybrid');
        return await putOrder(payload);
    } catch (error) {
        if (error.status === 400) {
            console.warn('Hybrid failed, trying minimal...');
            const payload = prepareOrderPayload(orderData, 'minimal');
            return await putOrder(payload);
        }
        throw error;
    }
}

// Example 3: Compare before/after
const originalPayload = prepareOrderPayload(originalData, 'hybrid');
const modifiedPayload = prepareOrderPayload(modifiedData, 'hybrid');
const changes = comparePayloads(originalPayload, modifiedPayload);
console.log('Changes to be saved:', changes);
*/

// =====================================================
// EXPORT FOR USE IN OTHER MODULES
// =====================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        prepareOrderPayload,
        prepareOrderPayloadHybrid,
        prepareOrderPayloadMinimal,
        prepareOrderPayloadFull,
        validatePayload,
        comparePayloads
    };
}

// Export to window for browser use
if (typeof window !== 'undefined') {
    window.PayloadHelper = {
        prepareOrderPayload,
        prepareOrderPayloadHybrid,
        prepareOrderPayloadMinimal,
        prepareOrderPayloadFull,
        validatePayload,
        comparePayloads
    };
}
