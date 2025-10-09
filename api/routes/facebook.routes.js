const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");

// Facebook API Config
const FACEBOOK_API_URL = "https://tomato.tpos.vn/api/facebook-graph/livevideo";
const FACEBOOK_TOKEN =
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiZmMwZjQ0MzktOWNmNi00ZDg4LWE4YzctNzU5Y2E4Mjk1MTQyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6Im52MjAiLCJEaXNwbGF5TmFtZSI6IlTDuiIsIkF2YXRhclVybCI6IiIsIlNlY3VyaXR5U3RhbXAiOiI1ZjY1NjQwMy01NjdmLTRmYzAtYjYxNy0yODJhYzgxZGY1ZWQiLCJDb21wYW55SWQiOiIxIiwiVGVuYW50SWQiOiJ0b21hdG8udHBvcy52biIsIlJvbGVJZHMiOiI0MmZmYzk5Yi1lNGY2LTQwMDAtYjcyOS1hZTNmMDAyOGEyODksNmExZDAwMDAtNWQxYS0wMDE1LTBlNmMtMDhkYzM3OTUzMmU5LDc2MzlhMDQ4LTdjZmUtNDBiNS1hNDFkLWFlM2YwMDNiODlkZiw4YmM4ZjQ1YS05MWY4LTQ5NzMtYjE4Mi1hZTNmMDAzYWI4NTUsYTljMjAwMDAtNWRiNi0wMDE1LTQ1YWItMDhkYWIxYmZlMjIyIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjpbIlF14bqjbiBMw70gTWFpIiwiQ8OSSSIsIkNTS0ggLSBMw6BpIiwiS2hvIFBoxrDhu5tjLSBLaeG7h3QiLCJRdeG6o24gTMO9IEtobyAtIEJvIl0sImp0aSI6IjYxMDI0MTA5LTdmOGEtNDk3Zi05NGYxLTY3YzIwMjZiZWUyNCIsImlhdCI6IjE3NTk4MTI1MzAiLCJuYmYiOjE3NTk4MTI1MzAsImV4cCI6MTc2MTEwODUzMCwiaXNzIjoiaHR0cHM6Ly90b21hdG8udHBvcy52biIsImF1ZCI6Imh0dHBzOi8vdG9tYXRvLnRwb3Mudm4saHR0cHM6Ly90cG9zLnZuIn0.OVAcmG1fPovK8rJ65dkNlEADtnyWu-d6BUKP0wxZuXk";

/**
 * GET /facebook/livevideo - Lấy danh sách live video từ Facebook
 * Query params:
 * - pageid: Facebook Page ID (default: 117267091364524)
 * - limit: Số lượng video (default: 10)
 * - facebook_Type: Loại (default: page)
 */
router.get("/facebook/livevideo", async (req, res) => {
    try {
        const {
            pageid = "117267091364524",
            limit = 10,
            facebook_Type = "page",
        } = req.query;

        console.log(`📥 Fetching Facebook live videos...`);

        const url = `${FACEBOOK_API_URL}?pageid=${pageid}&limit=${limit}&facebook_Type=${facebook_Type}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: FACEBOOK_TOKEN,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Facebook API error: ${response.status}`);
        }

        const data = await response.json();

        console.log(`✅ Retrieved ${data?.data?.length || 0} videos`);

        res.json({
            success: true,
            status: response.status,
            data: data,
        });
    } catch (error) {
        console.error("❌ Facebook API error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /facebook/health - Health check cho Facebook API
 */
router.get("/facebook/health", (req, res) => {
    res.json({
        status: "OK",
        service: "Facebook Live Video API",
        timestamp: new Date().toISOString(),
    });
});

/**
 * GET /facebook/comments - Lấy comments của một video
 * Query params:
 * - pageid: Facebook Page ID
 * - postId: Post ID (objectId từ video)
 * - limit: Số lượng comment (default: 50)
 */
router.get("/facebook/comments", async (req, res) => {
    try {
        const { pageid = "117267091364524", postId, limit = 50 } = req.query;

        if (!postId) {
            return res.status(400).json({
                success: false,
                error: "Missing required parameter: postId",
            });
        }

        console.log(`📥 Fetching comments for post ${postId}...`);

        const url = `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${pageid}&facebook_type=Page&postId=${postId}&limit=${limit}&order=reverse_chronological`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: FACEBOOK_TOKEN,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Facebook API error: ${response.status}`);
        }

        const data = await response.json();

        console.log(`✅ Retrieved ${data?.data?.length || 0} comments`);

        res.json({
            success: true,
            status: response.status,
            data: data,
        });
    } catch (error) {
        console.error("❌ Facebook Comments API error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

module.exports = router;
