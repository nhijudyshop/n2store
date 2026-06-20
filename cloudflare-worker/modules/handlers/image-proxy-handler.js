// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Image Proxy Handler
 * Handles image proxy endpoints for CORS bypass
 *
 * @module cloudflare-worker/modules/handlers/image-proxy-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { errorResponse, CORS_HEADERS } from '../utils/cors-utils.js';

/**
 * Default SVG avatar for fallback
 */
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`;

/**
 * SSRF allowlist for /api/image-proxy ?url= target.
 * Only the image origins this endpoint legitimately needs to proxy.
 * Exact hostnames + suffix (*.domain) entries.
 */
const IMAGE_PROXY_ALLOWED_HOSTS = [
    'tomato.tpos.vn',
    'pancake.vn',
    'content.pancake.vn',
    'graph.facebook.com',
    'n2store-fallback.onrender.com',
];
const IMAGE_PROXY_ALLOWED_SUFFIXES = [
    '.tpos.vn',
    '.pancake.vn',
    '.fbcdn.net',
    '.b-cdn.net',
    '.onrender.com',
];

/**
 * Block obvious private / loopback / link-local / metadata hostnames to
 * mitigate SSRF when the target resolves to an internal address.
 * @param {string} hostname (lowercased)
 * @returns {boolean}
 */
function isPrivateOrLoopbackHost(hostname) {
    if (!hostname) return true;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
    // IPv6 loopback / unspecified / link-local / unique-local
    if (hostname === '::1' || hostname === '::') return true;
    if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd'))
        return true;
    // IPv4 dotted-quad ranges
    const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const a = +m[1],
            b = +m[2];
        if (a === 10) return true; // 10.0.0.0/8
        if (a === 127) return true; // 127.0.0.0/8 loopback
        if (a === 0) return true; // 0.0.0.0/8
        if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
        if (a === 192 && b === 168) return true; // 192.168.0.0/16
        if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    }
    return false;
}

/**
 * Validate an image-proxy target URL against scheme + hostname allowlist and
 * private-IP block. Returns { ok: true } or { ok: false, reason }.
 * @param {string} rawUrl
 */
function validateImageProxyTarget(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { ok: false, reason: 'Invalid url' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: 'Only http(s) URLs are allowed' };
    }
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLoopbackHost(host)) {
        return { ok: false, reason: 'Target host is not allowed' };
    }
    const allowed =
        IMAGE_PROXY_ALLOWED_HOSTS.includes(host) ||
        IMAGE_PROXY_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
    if (!allowed) {
        return { ok: false, reason: 'Target host is not allowed' };
    }
    return { ok: true };
}

/**
 * Handle GET /api/image-proxy
 * Proxies external images with caching
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleImageProxy(request, url) {
    const imageUrl = url.searchParams.get('url');

    if (!imageUrl) {
        return errorResponse('Missing url parameter', 400, {
            usage: '/api/image-proxy?url=<encoded_url>[&w=<px>][&q=<1-100>]',
        });
    }

    // Forward resize requests to Render (sharp lives there) — CF Workers can't
    // re-encode JPEG without a paid Image Resizing plan, so we proxy through.
    const wantResize = url.searchParams.has('w') || url.searchParams.has('q');
    if (wantResize) {
        const renderUrl = `https://n2store-fallback.onrender.com/api/image-proxy${url.search}`;
        console.log('[IMAGE-PROXY] Forwarding resize to Render:', renderUrl);
        try {
            const upstream = await fetchWithRetry(renderUrl, { method: 'GET' }, 3, 1000, 30000);
            if (!upstream.ok) {
                return errorResponse(
                    `Render image-proxy failed: ${upstream.status}`,
                    upstream.status
                );
            }
            const contentType = upstream.headers.get('content-type') || 'image/jpeg';
            return new Response(upstream.body, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                    ...CORS_HEADERS,
                },
            });
        } catch (error) {
            console.error('[IMAGE-PROXY] Render forward error:', error.message);
            return errorResponse('Render image-proxy error: ' + error.message, 500);
        }
    }

    // SSRF guard: only proxy known image origins, http(s) only, no private IPs.
    const validation = validateImageProxyTarget(imageUrl);
    if (!validation.ok) {
        console.warn('[IMAGE-PROXY] Rejected url:', imageUrl, '-', validation.reason);
        return errorResponse(validation.reason, 400, {
            usage: '/api/image-proxy?url=<encoded_url>[&w=<px>][&q=<1-100>]',
        });
    }

    console.log('[IMAGE-PROXY] Fetching:', imageUrl);

    try {
        const imageResponse = await fetchWithRetry(
            imageUrl,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'image/*,*/*',
                    Referer: 'https://tomato.tpos.vn/',
                },
            },
            3,
            1000,
            15000
        );

        if (!imageResponse.ok) {
            console.error('[IMAGE-PROXY] Failed:', imageResponse.status, imageResponse.statusText);
            return errorResponse(
                `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
                imageResponse.status
            );
        }

        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

        return new Response(imageResponse.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                ...CORS_HEADERS,
            },
        });
    } catch (error) {
        console.error('[IMAGE-PROXY] Error:', error.message);
        return errorResponse('Failed to proxy image: ' + error.message, 500);
    }
}

/**
 * Handle GET /api/fb-avatar
 * Proxies Facebook avatars via Pancake with fallback
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleFacebookAvatar(request, url) {
    const fbId = url.searchParams.get('id');
    const pageId = url.searchParams.get('page') || '270136663390370';
    const accessToken = url.searchParams.get('token');

    if (!fbId) {
        return errorResponse('Missing id parameter', 400, {
            usage: '/api/fb-avatar?id=<facebook_user_id>&page=<page_id>&token=<jwt_token>',
        });
    }

    // Use Pancake Avatar API
    let pancakeAvatarUrl = `https://pancake.vn/api/v1/pages/${pageId}/avatar/${fbId}`;
    if (accessToken) {
        pancakeAvatarUrl += `?access_token=${accessToken}`;
    }

    console.log('[FB-AVATAR] Fetching from Pancake:', pancakeAvatarUrl);

    try {
        const avatarResponse = await fetchWithRetry(
            pancakeAvatarUrl,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'image/*,*/*',
                    Referer: 'https://pancake.vn/',
                },
                redirect: 'follow',
            },
            3,
            1000,
            15000
        );

        if (!avatarResponse.ok) {
            console.error(
                '[FB-AVATAR] Pancake failed:',
                avatarResponse.status,
                '- falling back to Facebook'
            );

            // Fallback to Facebook Graph API
            const fbAvatarUrl = `https://graph.facebook.com/${fbId}/picture?width=80&height=80&type=normal`;
            const fbResponse = await fetchWithRetry(
                fbAvatarUrl,
                {
                    method: 'GET',
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        Accept: 'image/*,*/*',
                    },
                    redirect: 'follow',
                },
                3,
                1000,
                15000
            );

            if (fbResponse.ok) {
                const contentType = fbResponse.headers.get('content-type') || 'image/jpeg';
                return new Response(fbResponse.body, {
                    status: 200,
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=86400',
                        ...CORS_HEADERS,
                    },
                });
            }

            // Return default SVG avatar
            return new Response(DEFAULT_AVATAR_SVG, {
                status: 200,
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'public, max-age=3600',
                    ...CORS_HEADERS,
                },
            });
        }

        const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';

        return new Response(avatarResponse.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                ...CORS_HEADERS,
            },
        });
    } catch (error) {
        console.error('[FB-AVATAR] Error:', error.message);
        return new Response(DEFAULT_AVATAR_SVG, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600',
                ...CORS_HEADERS,
            },
        });
    }
}

/**
 * Handle GET /api/pancake-avatar
 * Proxies Pancake content CDN avatars
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handlePancakeAvatar(request, url) {
    const avatarHash = url.searchParams.get('hash');

    if (!avatarHash) {
        return errorResponse('Missing hash parameter', 400, {
            usage: '/api/pancake-avatar?hash=<avatar_hash>',
        });
    }

    const pancakeAvatarUrl = `https://content.pancake.vn/2.1-24/avatars/${avatarHash}`;
    console.log('[PANCAKE-AVATAR] Fetching:', pancakeAvatarUrl);

    try {
        const avatarResponse = await fetchWithRetry(
            pancakeAvatarUrl,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'image/*,*/*',
                    Referer: 'https://pancake.vn/',
                },
            },
            3,
            1000,
            15000
        );

        if (!avatarResponse.ok) {
            return new Response(DEFAULT_AVATAR_SVG, {
                status: 200,
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'public, max-age=3600',
                    ...CORS_HEADERS,
                },
            });
        }

        const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';

        return new Response(avatarResponse.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                ...CORS_HEADERS,
            },
        });
    } catch (error) {
        return new Response(DEFAULT_AVATAR_SVG, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                ...CORS_HEADERS,
            },
        });
    }
}

/**
 * imgbb API key (free tier - anonymous uploads)
 * Get free key at: https://api.imgbb.com/
 */
const IMGBB_API_KEY = '7e5f69e00afd2f0da71a994f3eb2f6c5';

/**
 * Handle POST /api/imgbb-upload
 * Uploads image to imgbb as a fallback when Pancake fails
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleImgbbUpload(request) {
    try {
        const body = await request.json();
        const { image } = body; // base64 encoded image

        if (!image) {
            return errorResponse('Missing image parameter (base64)', 400, {
                usage: 'POST /api/imgbb-upload with JSON body { image: "<base64>" }',
            });
        }

        console.log('[IMGBB-UPLOAD] Uploading image to imgbb...');

        // imgbb API expects form data
        const formData = new FormData();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', image);

        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('[IMGBB-UPLOAD] Failed:', data);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: data.error?.message || 'imgbb upload failed',
                    status_code: data.status_code || response.status,
                }),
                {
                    status: response.status || 500,
                    headers: {
                        'Content-Type': 'application/json',
                        ...CORS_HEADERS,
                    },
                }
            );
        }

        console.log('[IMGBB-UPLOAD] Success:', data.data?.url);

        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    url: data.data.url,
                    display_url: data.data.display_url,
                    delete_url: data.data.delete_url,
                    thumb_url: data.data.thumb?.url,
                    width: data.data.width,
                    height: data.data.height,
                },
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...CORS_HEADERS,
                },
            }
        );
    } catch (error) {
        console.error('[IMGBB-UPLOAD] Error:', error);
        return errorResponse('imgbb upload error: ' + error.message, 500);
    }
}
