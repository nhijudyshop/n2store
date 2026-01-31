/**
 * Test Address Parsing Logic
 * Run this in browser console to test extractDistrictFromAddress
 */

(function() {
    'use strict';

    // =====================================================
    // TEST CASES
    // =====================================================

    const testCases = [
        // Good addresses
        { address: "123 Nguyễn Văn Cừ, Phường 4, Quận 5, TP.HCM", expected: { districtNumber: "5", isProvince: false } },
        { address: "456 Lê Văn Sỹ, P.14, Q.3, Hồ Chí Minh", expected: { districtNumber: "3", isProvince: false } },
        { address: "789 CMT8, Phường 11, Quận 10, Sài Gòn", expected: { districtNumber: "10", isProvince: false } },
        { address: "12 Phan Văn Trị, Gò Vấp, HCM", expected: { districtName: "Gò Vấp", isProvince: false } },
        { address: "34 Nguyễn Oanh, Bình Thạnh", expected: { districtName: "Bình Thạnh", isProvince: false } },
        { address: "56 Hoàng Văn Thụ, Tân Bình, TPHCM", expected: { districtName: "Tân Bình", isProvince: false } },

        // Province addresses (should select SHIP TỈNH)
        { address: "123 Trần Hưng Đạo, TP Biên Hòa, Đồng Nai", expected: { isProvince: true, cityName: "dong nai" } },
        { address: "456 Lê Lợi, Thủ Dầu Một, Bình Dương", expected: { isProvince: true, cityName: "binh duong" } },
        { address: "789 Nguyễn Trãi, Đà Lạt, Lâm Đồng", expected: { isProvince: true, cityName: "lam dong" } },
        { address: "Xã An Phú, Huyện Củ Chi, TP.HCM", expected: { districtName: "Củ Chi", isProvince: false } },

        // Bad format addresses (need to handle)
        { address: "66/. 9. Trân  thuận  đông  quân  7. D. 0965157133", expected: { districtNumber: "7", isProvince: false }, note: "Phone mixed in, bad format" },
        { address: "12A đường 3/2 Q.10 HCM 0912345678", expected: { districtNumber: "10", isProvince: false }, note: "Phone at end" },
        { address: "số 5 , ngõ 123 , Q 7 , SG", expected: { districtNumber: "7", isProvince: false }, note: "Extra spaces and commas" },
        { address: "12/3/4 khu phố 2 phường 5 q.8", expected: { districtNumber: "8", isProvince: false }, note: "Lowercase, no city" },
        { address: "abc xyz quan7 hcm", expected: { districtNumber: "7", isProvince: false }, note: "No space in quan7" },
        { address: "P.12 Q.Bình Thạnh TPHCM", expected: { districtName: "Bình Thạnh", isProvince: false }, note: "Q. prefix with name" },
        { address: "hẻm 123 bình thạnh", expected: { districtName: "Bình Thạnh", isProvince: false }, note: "Lowercase district" },

        // Edge cases
        { address: "ấp bình thạnh, xã abc, huyện xyz, Tây Ninh", expected: { isProvince: true, cityName: "tay ninh" }, note: "ấp bình thạnh should NOT match Bình Thạnh district" },
        { address: "1234567890", expected: { districtNumber: null, isProvince: false }, note: "Just phone number" },
        { address: "", expected: null, note: "Empty address" },
        { address: "Q2-12, Bình Tân", expected: { districtName: "Bình Tân", isProvince: false }, note: "Dash format" },
        { address: "Quận 12, HCM", expected: { districtNumber: "12", isProvince: false }, note: "Q12 not Q1" },
        { address: "Quận 1, HCM", expected: { districtNumber: "1", isProvince: false }, note: "Q1 not Q10/Q11/Q12" },
    ];

    // =====================================================
    // RUN TESTS
    // =====================================================

    function runTests() {
        console.log('='.repeat(60));
        console.log('🧪 TESTING ADDRESS PARSING');
        console.log('='.repeat(60));

        let passed = 0;
        let failed = 0;

        for (const testCase of testCases) {
            const result = window.extractDistrictFromAddress(testCase.address, null);

            let isPass = true;
            const issues = [];

            if (testCase.expected === null) {
                if (result !== null) {
                    isPass = false;
                    issues.push(`Expected null, got ${JSON.stringify(result)}`);
                }
            } else {
                if (result === null) {
                    isPass = false;
                    issues.push(`Expected result, got null`);
                } else {
                    // Check district number
                    if (testCase.expected.districtNumber !== undefined) {
                        if (result.districtNumber !== testCase.expected.districtNumber) {
                            isPass = false;
                            issues.push(`districtNumber: expected "${testCase.expected.districtNumber}", got "${result.districtNumber}"`);
                        }
                    }

                    // Check district name
                    if (testCase.expected.districtName !== undefined) {
                        if (result.districtName !== testCase.expected.districtName) {
                            isPass = false;
                            issues.push(`districtName: expected "${testCase.expected.districtName}", got "${result.districtName}"`);
                        }
                    }

                    // Check isProvince
                    if (testCase.expected.isProvince !== undefined) {
                        if (result.isProvince !== testCase.expected.isProvince) {
                            isPass = false;
                            issues.push(`isProvince: expected ${testCase.expected.isProvince}, got ${result.isProvince}`);
                        }
                    }

                    // Check cityName for provinces
                    if (testCase.expected.cityName !== undefined) {
                        const resultCity = (result.cityName || '').toLowerCase();
                        if (!resultCity.includes(testCase.expected.cityName)) {
                            isPass = false;
                            issues.push(`cityName: expected to contain "${testCase.expected.cityName}", got "${result.cityName}"`);
                        }
                    }
                }
            }

            if (isPass) {
                passed++;
                console.log(`✅ PASS: "${testCase.address.substring(0, 40)}..."`);
            } else {
                failed++;
                console.log(`❌ FAIL: "${testCase.address.substring(0, 40)}..."`);
                console.log(`   Note: ${testCase.note || 'N/A'}`);
                console.log(`   Issues: ${issues.join(', ')}`);
                console.log(`   Result:`, result);
            }
        }

        console.log('='.repeat(60));
        console.log(`📊 RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
        console.log('='.repeat(60));

        return { passed, failed, total: testCases.length };
    }

    // =====================================================
    // MANUAL TEST FUNCTION
    // =====================================================

    function testSingleAddress(address) {
        console.log('='.repeat(60));
        console.log('🔍 TESTING ADDRESS:', address);
        console.log('='.repeat(60));

        const result = window.extractDistrictFromAddress(address, null);

        console.log('📋 Result:', result);

        if (result) {
            console.log('  - District Number:', result.districtNumber || '(none)');
            console.log('  - District Name:', result.districtName || '(none)');
            console.log('  - Is Province:', result.isProvince);
            console.log('  - City Name:', result.cityName || '(none)');
        } else {
            console.log('  ⚠️ Could not extract district info');
        }

        return result;
    }

    // =====================================================
    // SIMULATE CARRIER SELECTION
    // =====================================================

    function simulateCarrierSelection(address) {
        console.log('='.repeat(60));
        console.log('🚚 SIMULATING CARRIER SELECTION');
        console.log('   Address:', address);
        console.log('='.repeat(60));

        const result = window.extractDistrictFromAddress(address, null);

        if (!result) {
            console.log('❌ Could not extract district → Default to SHIP TỈNH');
            return 'SHIP TỈNH';
        }

        if (result.isProvince) {
            console.log(`📍 Province detected: ${result.cityName} → SHIP TỈNH`);
            return 'SHIP TỈNH';
        }

        if (result.districtNumber) {
            const num = result.districtNumber;
            // Simulate carrier matching based on known carriers
            const hcmInnerDistricts = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
            const hcmOuterDistricts = ['2', '9', '12'];

            if (hcmInnerDistricts.includes(num)) {
                console.log(`📍 District ${num} → THÀNH PHỐ (nội thành)`);
                return `THÀNH PHỐ (1 3 4 5 6 7 8 10 11)`;
            } else if (hcmOuterDistricts.includes(num)) {
                console.log(`📍 District ${num} → THÀNH PHỐ (ngoại thành)`);
                return `THÀNH PHỐ (Q2-12)`;
            }
        }

        if (result.districtName) {
            const name = result.districtName;
            const innerDistricts = ['Bình Thạnh', 'Phú Nhuận', 'Tân Bình', 'Tân Phú', 'Gò Vấp'];
            const outerDistricts = ['Bình Tân', 'Thủ Đức', 'Hóc Môn', 'Củ Chi', 'Nhà Bè', 'Cần Giờ', 'Bình Chánh'];

            if (innerDistricts.includes(name)) {
                console.log(`📍 District ${name} → THÀNH PHỐ (nội thành)`);
                return `THÀNH PHỐ (Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp)`;
            } else if (outerDistricts.includes(name)) {
                console.log(`📍 District ${name} → THÀNH PHỐ (ngoại thành)`);
                return `THÀNH PHỐ (ngoại thành)`;
            }
        }

        console.log('⚠️ No match found → Default to SHIP TỈNH');
        return 'SHIP TỈNH';
    }

    // Export for browser console
    window.testAddressParsing = runTests;
    window.testSingleAddress = testSingleAddress;
    window.simulateCarrierSelection = simulateCarrierSelection;
    window.addressTestCases = testCases;

    console.log('[TEST] Address parsing test loaded.');
    console.log('  - Run window.testAddressParsing() to run all tests');
    console.log('  - Run window.testSingleAddress("địa chỉ") to test single address');
    console.log('  - Run window.simulateCarrierSelection("địa chỉ") to simulate carrier selection');
})();
