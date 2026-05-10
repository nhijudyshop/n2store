// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — shared preset enums (scene presets, shot types, slider tiers,
// bulk presets). Dùng trong frontend + backend (Node require sẽ work sau khi
// strip global wrap nếu cần).
//
// Source: extracted từ Tikreel SCENE_PRESETS + shot_type enum + tier label
// patterns (verified 09/05/2026).
(function (global) {
    'use strict';

    // 12 scene presets cho gen image/video. id → label + prompt fragment để
    // backend inject vào directive (Gemini compose + Kling buildPrompt).
    const SCENE_PRESETS = [
        {
            id: 'living_room',
            label: 'Living room (sofa + decor)',
            prompt: 'a modern living room with a comfortable sofa, soft warm decor, natural daylight through large windows',
        },
        {
            id: 'bedroom',
            label: 'Bedroom (clean bed, soft daylight)',
            prompt: 'a clean modern bedroom with a neatly made bed, soft daylight, minimal decor, neutral palette',
        },
        {
            id: 'kitchen',
            label: 'Modern kitchen (marble counter)',
            prompt: 'a modern kitchen with a marble counter, stainless steel appliances, natural daylight',
        },
        {
            id: 'hotel_suite',
            label: 'Hotel suite (luxury + neutral palette)',
            prompt: 'a luxury hotel suite with neutral cream palette, elegant furniture, ambient warm lighting',
        },
        {
            id: 'studio_backdrop',
            label: 'Studio backdrop (seamless paper)',
            prompt: 'a clean photo studio with seamless paper backdrop, professional softbox lighting, no distractions',
        },
        {
            id: 'outdoor_cafe',
            label: 'Outdoor café terrace',
            prompt: 'an outdoor café terrace with wooden table, latte glass, ambient afternoon light, blurred urban background',
        },
        {
            id: 'garden',
            label: 'Garden / outdoor patio',
            prompt: 'a sunny garden patio with green plants, wooden deck, golden hour soft natural light',
        },
        {
            id: 'balcony',
            label: 'City balcony / terrace',
            prompt: 'a high-rise city balcony at golden hour, skyline view, modern railing, warm sunset light',
        },
        {
            id: 'library',
            label: 'Library (warm wood + books)',
            prompt: 'a warm library with wooden shelves, rows of books, leather armchair, soft amber reading lamp',
        },
        {
            id: 'rooftop',
            label: 'Rooftop (sunset, skyline)',
            prompt: 'a rooftop terrace at sunset, city skyline silhouette, warm orange-pink sky, ambient string lights',
        },
        {
            id: 'beach',
            label: 'Beach / coastal',
            prompt: 'a sandy beach with turquoise ocean, soft sunset light, gentle waves, palm shadows on sand',
        },
        {
            id: 'art_gallery',
            label: 'Art gallery (white walls)',
            prompt: 'a clean modern art gallery with bright white walls, polished concrete floor, museum-style spotlights',
        },
    ];

    // 5 framing modes — directive cho output composition (Gemini honors clearly).
    const SHOT_TYPES = [
        {
            id: 'auto',
            label: 'Theo clip gốc (auto — close-up / waist-up / full body theo ref)',
            prompt: '',
        },
        {
            id: 'full_body',
            label: 'Full body (full outfit visible)',
            prompt: 'Full body shot, the entire outfit from head to toe is visible in frame.',
        },
        {
            id: 'three_quarter',
            label: '3/4 (mid-thigh up)',
            prompt: '3/4 framing, subject visible from mid-thigh up.',
        },
        {
            id: 'waist_up',
            label: 'Waist-up (skirt cropped)',
            prompt: 'Waist-up shot, framing crops at the waistline.',
        },
        {
            id: 'portrait',
            label: 'Portrait (face / shoulders)',
            prompt: 'Portrait shot, focused on face and shoulders only.',
        },
    ];

    // Tier labels cho 3 sliders — show meaningful word thay vì 0-100.
    function similarityTier(v) {
        v = Number(v) || 0;
        if (v >= 90) return 'EXACTLY match';
        if (v >= 70) return 'Strict';
        if (v >= 50) return 'Balanced';
        if (v >= 30) return 'Loose interpretation';
        return 'Very loose';
    }
    function creativityTier(v) {
        v = Number(v) || 0;
        if (v >= 80) return 'Bold';
        if (v >= 60) return 'Adventurous';
        if (v >= 40) return 'Balanced';
        if (v >= 20) return 'Conservative';
        return 'Minimal';
    }
    function styleStrengthTier(v) {
        v = Number(v) || 0;
        if (v >= 80) return 'Strong scene mood';
        if (v >= 60) return 'Pronounced';
        if (v >= 40) return 'Balanced';
        if (v >= 20) return 'Subtle';
        return 'Minimal';
    }

    // Bulk presets — 4 nút quick start.
    const BULK_PRESETS = [
        {
            id: 'fashion',
            icon: '👗',
            label: 'Fashion mass-produce',
            sub: '100 outfits, 1 variation, 9:16',
            config: { kind: 'image', variations: 1, image_size: '9:16', shot_type: 'full_body' },
        },
        {
            id: 'lookbook',
            icon: '📸',
            label: 'Lookbook (3 variations)',
            sub: '3 takes/clip, slight variations',
            config: { kind: 'image', variations: 3, image_size: '9:16', shot_type: 'auto' },
        },
        {
            id: 'video_std',
            icon: '🎬',
            label: 'Video clones (Kling std)',
            sub: '720p Kling std · ~$0.28/clip',
            config: {
                kind: 'video',
                engine: 'kling',
                kling_mode: 'std',
                duration_seconds: 5,
                image_size: '9:16',
            },
        },
        {
            id: 'video_pro',
            icon: '💎',
            label: 'Video clones (Kling pro)',
            sub: '1080p — ~3× cost · ~$0.84/clip',
            config: {
                kind: 'video',
                engine: 'kling',
                kling_mode: 'pro',
                duration_seconds: 5,
                image_size: '9:16',
            },
        },
    ];

    const presetById = (id) => SCENE_PRESETS.find((p) => p.id === id) || null;
    const shotTypeById = (id) => SHOT_TYPES.find((s) => s.id === id) || null;

    const api = {
        SCENE_PRESETS,
        SHOT_TYPES,
        BULK_PRESETS,
        similarityTier,
        creativityTier,
        styleStrengthTier,
        presetById,
        shotTypeById,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (global) global.AikolPresets = api;
})(typeof window !== 'undefined' ? window : globalThis);
