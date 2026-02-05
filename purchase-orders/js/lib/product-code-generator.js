/**
 * PRODUCT CODE GENERATOR
 * File: product-code-generator.js
 * Purpose: Auto-generate product codes like N123, P045, Q001
 */

window.ProductCodeGenerator = (function() {
    'use strict';

    /**
     * Category keywords mapping
     * N: Quần áo (clothing)
     * P: Phụ kiện (accessories)
     * Q: Khác (others)
     */
    const CATEGORY_N_KEYWORDS = [
        'QUAN', 'AO', 'DAM', 'SET', 'JUM', 'JUMP', 'JUMPSUIT',
        'AOKHOAC', 'KHOAC', 'JACKET', 'VEST', 'GILE', 'GILET',
        'CHAN', 'VAY', 'SKIRT', 'SOMI', 'SO MI', 'SHIRT',
        'TSHIRT', 'POLO', 'THUN', 'TANKTOP', 'CROP', 'CROPTOP',
        'BLAZER', 'CARDIGAN', 'HOODIE', 'SWEATER', 'LEN',
        'JEAN', 'JEANS', 'SHORT', 'SHORTS', 'LEGGING',
        'BODY', 'BODYSUIT', 'OVERALL', 'ROMPER',
        'BIKINI', 'DO', 'DOBO', 'NGUNGU', 'PIJAMA', 'PAJAMA',
        'AODAI', 'KIMONO', 'HANBOK', 'SUON', 'SUONXAM'
    ];

    const CATEGORY_P_KEYWORDS = [
        // Bags
        'TUI', 'TIXACH', 'BALO', 'CLUTCH', 'VI', 'POCHETTE', 'BAG',
        // Eyewear
        'MATKINH', 'KINH', 'KINHMAT', 'SUNGLASSES', 'GLASSES',
        // Footwear
        'GIAYDEP', 'GIAY', 'DEP', 'SANDAL', 'BOOT', 'SNEAKER', 'HEEL',
        // Hats
        'NONBERET', 'NON', 'MU', 'HAT', 'CAP', 'BERET',
        // Scarves & Belts
        'KHANQUANG', 'KHAN', 'SCARF', 'DAYLUNG', 'THATLUNG', 'BELT',
        // Jewelry
        'DONGHO', 'TRANGSUC', 'VONGTAY', 'DAYCHUYEN', 'BONGTAI',
        'NHAN', 'RING', 'BRACELET', 'NECKLACE', 'EARRING',
        // Gloves & Socks
        'GANG', 'TAT', 'VO', 'SOCK', 'GLOVE',
        // Ties & Accessories
        'CAVATCA', 'CAVAT', 'TIE', 'GHIM', 'PIN', 'TRAMSAI', 'BROOCH',
        // Cosmetics
        'MYPHAM', 'KEMMATTROI', 'NUOCHOA', 'SONMOI', 'KEMNEN',
        'PHANKEMOT', 'MASCARA', 'KEBMAT', 'COTICA', 'KEMDUONG',
        'SERUMDA', 'MATTNA', 'KEMCHONGNANG', 'SERUM', 'CREAM',
        // Other accessories
        'BANGDO', 'KHOACCHOANG', 'CAPE', 'SHAWL'
    ];

    /**
     * Remove Vietnamese diacritics
     * @param {string} str
     * @returns {string}
     */
    function removeVietnameseDiacritics(str) {
        if (!str) return '';
        const map = {
            'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a',
            'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
            'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
            'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
            'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
            'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
            'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o',
            'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
            'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
            'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
            'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
            'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
            'đ': 'd',
            'À': 'A', 'Á': 'A', 'Ạ': 'A', 'Ả': 'A', 'Ã': 'A',
            'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ậ': 'A', 'Ẩ': 'A', 'Ẫ': 'A',
            'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ặ': 'A', 'Ẳ': 'A', 'Ẵ': 'A',
            'È': 'E', 'É': 'E', 'Ẹ': 'E', 'Ẻ': 'E', 'Ẽ': 'E',
            'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ệ': 'E', 'Ể': 'E', 'Ễ': 'E',
            'Ì': 'I', 'Í': 'I', 'Ị': 'I', 'Ỉ': 'I', 'Ĩ': 'I',
            'Ò': 'O', 'Ó': 'O', 'Ọ': 'O', 'Ỏ': 'O', 'Õ': 'O',
            'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ộ': 'O', 'Ổ': 'O', 'Ỗ': 'O',
            'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ợ': 'O', 'Ở': 'O', 'Ỡ': 'O',
            'Ù': 'U', 'Ú': 'U', 'Ụ': 'U', 'Ủ': 'U', 'Ũ': 'U',
            'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ự': 'U', 'Ử': 'U', 'Ữ': 'U',
            'Ỳ': 'Y', 'Ý': 'Y', 'Ỵ': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y',
            'Đ': 'D'
        };
        return str.split('').map(char => map[char] || char).join('');
    }

    /**
     * Tokenize product name
     * @param {string} name
     * @returns {string[]}
     */
    function tokenize(name) {
        if (!name) return [];
        // Remove diacritics, uppercase, remove special chars, split by whitespace
        const normalized = removeVietnameseDiacritics(name)
            .toUpperCase()
            .replace(/[^A-Z0-9\s]/g, ' ')
            .trim();
        return normalized.split(/\s+/).filter(t => t.length > 0);
    }

    /**
     * Detect product category from name
     * @param {string} productName
     * @returns {'N'|'P'|'Q'|null}
     */
    function detectProductCategory(productName) {
        if (!productName || typeof productName !== 'string') {
            return null;
        }

        const tokens = tokenize(productName);
        if (tokens.length === 0) {
            return null;
        }

        // Sequential token scanning
        let startIndex = 0;

        // Token 1: Skip if it's a date (4 digits like ddmm)
        if (tokens[0] && /^\d{4}$/.test(tokens[0])) {
            startIndex = 1;
        }

        // Token 2: Skip if it's a supplier code (A43, B12, etc.)
        if (tokens[startIndex] && /^[A-Z]\d{1,4}$/.test(tokens[startIndex])) {
            startIndex++;
        }

        // Check remaining tokens sequentially
        for (let i = startIndex; i < tokens.length; i++) {
            const token = tokens[i];

            // Check N keywords (clothing)
            if (CATEGORY_N_KEYWORDS.includes(token)) {
                return 'N';
            }

            // Check P keywords (accessories)
            if (CATEGORY_P_KEYWORDS.includes(token)) {
                return 'P';
            }
        }

        // Fallback: scan ALL tokens if sequential didn't match
        for (const token of tokens) {
            if (CATEGORY_N_KEYWORDS.includes(token)) {
                return 'N';
            }
            if (CATEGORY_P_KEYWORDS.includes(token)) {
                return 'P';
            }
        }

        // Default: If name has valid structure with keyword tokens, use 'N'
        if (tokens.length >= 2) {
            return 'N';
        }

        return 'Q'; // Others
    }

    /**
     * Get max number from form items
     * @param {Array} items - Form items
     * @param {string} category - Category prefix (N, P, Q)
     * @returns {number}
     */
    function getMaxNumberFromItems(items, category) {
        if (!items || !Array.isArray(items) || !category) {
            return 0;
        }

        const regex = new RegExp(`^${category}(\\d+)`, 'i');
        let maxNum = 0;

        for (const item of items) {
            const code = item.productCode || item.product_code || item._tempProductCode;
            if (code) {
                const match = code.match(regex);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        }

        return maxNum;
    }

    /**
     * Get max number from Firestore (purchase_order_items collection)
     * @param {string} category
     * @returns {Promise<number>}
     */
    async function getMaxNumberFromFirestore(category) {
        try {
            // Use Firestore to query items with matching code prefix
            if (!window.firebase || !window.firebase.firestore) {
                console.warn('Firestore not available');
                return 0;
            }

            const db = firebase.firestore();
            const prefix = category.toUpperCase();

            // Query purchase_order_items where product_code starts with category
            // Firestore doesn't support startsWith directly, so we use range query
            const startCode = prefix;
            const endCode = prefix + '\uf8ff';

            const snapshot = await db.collection('purchase_order_items')
                .where('product_code', '>=', startCode)
                .where('product_code', '<=', endCode)
                .orderBy('product_code', 'desc')
                .limit(50)
                .get();

            let maxNum = 0;
            const regex = new RegExp(`^${prefix}(\\d+)`, 'i');

            snapshot.forEach(doc => {
                const code = doc.data().product_code;
                if (code) {
                    const match = code.match(regex);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxNum) {
                            maxNum = num;
                        }
                    }
                }
            });

            return maxNum;
        } catch (error) {
            console.error('Error getting max number from Firestore:', error);
            return 0;
        }
    }

    /**
     * Check if product code exists in form items
     * @param {string} code
     * @param {Array} items
     * @returns {boolean}
     */
    function codeExistsInItems(code, items) {
        if (!code || !items) return false;
        const upperCode = code.toUpperCase();
        return items.some(item => {
            const itemCode = (item.productCode || item.product_code || item._tempProductCode || '').toUpperCase();
            return itemCode === upperCode;
        });
    }

    /**
     * Check if product code exists in Firestore
     * @param {string} code
     * @returns {Promise<boolean>}
     */
    async function codeExistsInFirestore(code) {
        try {
            if (!window.firebase || !window.firebase.firestore) {
                return false;
            }

            const db = firebase.firestore();

            // Check in purchase_order_items
            const itemsSnapshot = await db.collection('purchase_order_items')
                .where('product_code', '==', code.toUpperCase())
                .limit(1)
                .get();

            if (!itemsSnapshot.empty) {
                return true;
            }

            // Check in products collection if exists
            const productsSnapshot = await db.collection('products')
                .where('product_code', '==', code.toUpperCase())
                .limit(1)
                .get();

            return !productsSnapshot.empty;
        } catch (error) {
            console.error('Error checking code in Firestore:', error);
            return false;
        }
    }

    /**
     * Check if product code exists on TPOS
     * @param {string} code
     * @returns {Promise<boolean>}
     */
    async function codeExistsOnTPOS(code) {
        try {
            if (!window.TPOSClient || !window.TPOSClient.searchProduct) {
                return false;
            }

            const result = await window.TPOSClient.searchProduct(code);
            return result && result.length > 0;
        } catch (error) {
            console.error('Error checking code on TPOS:', error);
            return false;
        }
    }

    /**
     * Generate product code from max number
     * @param {string} productName - Product name for category detection
     * @param {Array} existingItems - Form items to check against
     * @param {number} maxAttempts - Max attempts before giving up
     * @returns {Promise<string|null>}
     */
    async function generateProductCodeFromMax(productName, existingItems = [], maxAttempts = 30) {
        // Detect category
        const category = detectProductCategory(productName);
        if (!category) {
            console.warn('Could not detect category for:', productName);
            return null;
        }

        // Get max numbers from all sources
        const maxFromItems = getMaxNumberFromItems(existingItems, category);
        const maxFromFirestore = await getMaxNumberFromFirestore(category);
        const maxNumber = Math.max(maxFromItems, maxFromFirestore);

        // Try to find unused code
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const number = maxNumber + attempt;
            const candidateCode = `${category}${number.toString().padStart(3, '0')}`;

            // Check form items
            if (codeExistsInItems(candidateCode, existingItems)) {
                continue;
            }

            // Check Firestore
            const existsInDB = await codeExistsInFirestore(candidateCode);
            if (existsInDB) {
                continue;
            }

            // Check TPOS (optional, may be slow)
            const existsOnTPOS = await codeExistsOnTPOS(candidateCode);
            if (existsOnTPOS) {
                continue;
            }

            // Found unused code
            return candidateCode;
        }

        console.warn(`Failed to generate code after ${maxAttempts} attempts for:`, productName);
        return null;
    }

    /**
     * Simple synchronous code generation (without DB checks)
     * @param {string} productName
     * @param {Array} existingItems
     * @returns {string|null}
     */
    function generateProductCodeSync(productName, existingItems = []) {
        const category = detectProductCategory(productName);
        if (!category) {
            return null;
        }

        const maxFromItems = getMaxNumberFromItems(existingItems, category);
        const number = maxFromItems + 1;
        return `${category}${number.toString().padStart(3, '0')}`;
    }

    /**
     * Extract base product code from variant code
     * @param {string} code - "N123VX" or "P045-01"
     * @returns {string} - "N123" or "P045"
     */
    function extractBaseProductCode(code) {
        if (!code || typeof code !== 'string') {
            return '';
        }
        // Pattern: starts with letter + digits
        const match = code.match(/^([A-Z]+\d+)/i);
        return match ? match[1].toUpperCase() : code.toUpperCase();
    }

    /**
     * Validate product code format
     * @param {string} code
     * @returns {boolean}
     */
    function isValidProductCode(code) {
        if (!code || typeof code !== 'string') {
            return false;
        }
        // Format: Letter(s) + digits, optionally followed by variant suffix
        return /^[A-Z]+\d{1,}[A-Z0-9]*$/i.test(code.trim());
    }

    // Public API
    return {
        detectProductCategory,
        getMaxNumberFromItems,
        getMaxNumberFromFirestore,
        generateProductCodeFromMax,
        generateProductCodeSync,
        extractBaseProductCode,
        isValidProductCode,
        codeExistsInItems,
        codeExistsInFirestore,
        codeExistsOnTPOS,
        // Utilities
        removeVietnameseDiacritics,
        tokenize,
        // Keywords for reference
        CATEGORY_N_KEYWORDS,
        CATEGORY_P_KEYWORDS
    };
})();
