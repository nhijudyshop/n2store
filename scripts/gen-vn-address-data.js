#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — generator dữ liệu đơn vị hành chính VN (Tỉnh/TP → Phường/Xã, 2 cấp).
// =====================================================================
// gen-vn-address-data.js — sinh web2/shared/data/vn-units.json
//
// Nguồn: thanglequoc/vietnamese-provinces-database (MIT) — bản
//   `vn_only_simplified ... minified` (2 cấp: Tỉnh/TP → Phường/Xã,
//   theo nghị định 30/2026/QH16, hiệu lực 30/04/2026 — 34 tỉnh, 3321
//   phường/xã, KHÔNG còn cấp Quận/Huyện).
//
// Tạo file tĩnh nhỏ gọn cho frontend (GitHub Pages) lazy-load + cache:
//   { meta, provinces: [{ code, name, wards: [{ code, name }] }] }
//
// Chạy lại khi có nghị định mới sáp nhập/đổi tên đơn vị hành chính:
//   node scripts/gen-vn-address-data.js                 # tải từ upstream
//   node scripts/gen-vn-address-data.js <path-local.json> # dùng file đã tải
// =====================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const UPSTREAM_URL =
    'https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/json/vn_only_simplified_json_generated_data_vn_units_minified.json';
const OUT_PATH = path.join(__dirname, '..', 'web2', 'shared', 'data', 'vn-units.json');
const SOURCE_LABEL = 'thanglequoc/vietnamese-provinces-database (MIT)';
const DECREE = '30/2026/QH16 (hiệu lực 30/04/2026)';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, { headers: { 'User-Agent': 'n2store-gen-vn-address' } }, (res) => {
                if (
                    res.statusCode &&
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    return resolve(fetchJson(res.headers.location));
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }
                let buf = '';
                res.setEncoding('utf8');
                res.on('data', (c) => (buf += c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(buf));
                    } catch (e) {
                        reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
                    }
                });
            })
            .on('error', reject);
    });
}

// Upstream shape: [{ Code, FullName, Wards: [{ Code, FullName, ProvinceCode }] }]
function transform(raw) {
    if (!Array.isArray(raw)) throw new Error('Upstream data is not an array');
    let wardCount = 0;
    const provinces = raw
        .map((p) => {
            const code = String(p.Code || '').trim();
            const name = String(p.FullName || '').trim();
            const wards = (Array.isArray(p.Wards) ? p.Wards : [])
                .map((w) => ({
                    code: String(w.Code || '').trim(),
                    name: String(w.FullName || '').trim(),
                }))
                .filter((w) => w.code && w.name)
                .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
            wardCount += wards.length;
            return { code, name, wards };
        })
        .filter((p) => p.code && p.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return { provinces, wardCount };
}

async function main() {
    const localArg = process.argv[2];
    let raw;
    if (localArg) {
        console.log(`[gen-vn-address] Reading local file: ${localArg}`);
        raw = JSON.parse(fs.readFileSync(localArg, 'utf8'));
    } else {
        console.log(`[gen-vn-address] Downloading: ${UPSTREAM_URL}`);
        raw = await fetchJson(UPSTREAM_URL);
    }

    const { provinces, wardCount } = transform(raw);
    if (provinces.length < 30) {
        throw new Error(`Sanity check failed: only ${provinces.length} provinces (expected ~34)`);
    }
    if (wardCount < 2000) {
        throw new Error(`Sanity check failed: only ${wardCount} wards (expected ~3321)`);
    }

    // Version = số cấp + số đơn vị → đổi khi dataset đổi (frontend dùng để cache-bust).
    const version = `2tier-${provinces.length}p-${wardCount}w`;
    const out = {
        meta: {
            source: SOURCE_LABEL,
            sourceUrl: 'https://github.com/thanglequoc/vietnamese-provinces-database',
            license: 'MIT',
            decree: DECREE,
            tiers: 2,
            note: 'Việt Nam bỏ cấp Quận/Huyện từ 01/07/2025 — dữ liệu 2 cấp: Tỉnh/TP → Phường/Xã.',
            version,
            provinceCount: provinces.length,
            wardCount,
        },
        provinces,
    };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(out), 'utf8');
    const kb = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
    console.log(
        `[gen-vn-address] Wrote ${OUT_PATH}\n  provinces=${provinces.length} wards=${wardCount} version=${version} size=${kb}KB`
    );
}

main().catch((e) => {
    console.error('[gen-vn-address] FAILED:', e.message);
    process.exit(1);
});
