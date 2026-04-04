// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ADMIN RENDER - Render.com Services & Environment API
// =====================================================

const express = require('express');
const router = express.Router();

const RENDER_API = 'https://api.render.com/v1';

function getApiKey() {
    return process.env.RENDER_API_KEY;
}

async function renderFetch(path) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('RENDER_API_KEY not configured');

    const resp = await fetch(`${RENDER_API}${path}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        }
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Render API ${resp.status}: ${text}`);
    }

    return resp.json();
}

// =====================================================
// GET /services - List all services
// =====================================================
router.get('/services', async (req, res) => {
    try {
        const data = await renderFetch('/services?limit=50');

        const services = data.map(item => {
            const s = item.service;
            return {
                id: s.id,
                name: s.name,
                type: s.type,
                status: s.suspended || 'active',
                url: s.serviceDetails?.url || null,
                region: s.serviceDetails?.region || null,
                plan: s.serviceDetails?.plan || null,
                branch: s.serviceDetails?.buildCommand ? undefined : undefined,
                repo: s.repo,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt
            };
        });

        res.json({ success: true, services });
    } catch (error) {
        console.error('[ADMIN-RENDER] List services error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /services/:id/env - Get environment variables
// =====================================================
router.get('/services/:id/env', async (req, res) => {
    try {
        const data = await renderFetch(`/services/${req.params.id}/env-vars`);

        const envVars = data.map(item => {
            const ev = item.envVar;
            return {
                key: ev.key,
                value: ev.value,
                generateValue: ev.generateValue || false
            };
        });

        res.json({ success: true, envVars });
    } catch (error) {
        console.error('[ADMIN-RENDER] Get env vars error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /status - Check if Render API key is configured
// =====================================================
router.get('/status', (req, res) => {
    const hasKey = !!getApiKey();
    res.json({ success: true, configured: hasKey });
});

module.exports = router;
