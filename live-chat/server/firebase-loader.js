// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// FIREBASE (read Pancake tokens from Firestore)
// Side-effect-free on require: initFirebase() (called by the entry) is what
// initializes the admin app + returns the firestore handle (or null). Requiring
// this module does NOT touch Firebase. loadTokensFromFirebase takes the firestore
// handle so it has no module-level state.
// =====================================================

function initFirebase() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        console.log('[FIREBASE] Not configured (missing env vars)');
        return null;
    }

    try {
        const admin = require('firebase-admin');
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
        const firestore = admin.firestore();
        console.log('[FIREBASE] Initialized');
        return firestore;
    } catch (err) {
        console.error('[FIREBASE] Init error:', err.message);
        return null;
    }
}

async function loadTokensFromFirebase(firestore) {
    if (!firestore) return [];

    try {
        const doc = await firestore.collection('pancake_tokens').doc('accounts').get();
        if (!doc.exists) {
            console.log('[FIREBASE] No pancake_tokens/accounts document found');
            return [];
        }

        const data = doc.data()?.data;
        if (!data) return [];

        const accounts = Object.entries(data)
            .filter(([, info]) => info.token && info.uid)
            .filter(([, info]) => {
                // Skip expired tokens
                if (info.exp && info.exp < Date.now() / 1000) {
                    console.log(
                        `[FIREBASE] Skipping expired token: ${info.name} (exp: ${new Date(info.exp * 1000).toISOString()})`
                    );
                    return false;
                }
                return true;
            })
            .map(([uid, info]) => ({
                userId: info.uid || uid,
                token: info.token,
                name: info.name || 'unknown',
                cookie: info.cookie || `jwt=${info.token}`,
            }));

        console.log(
            `[FIREBASE] Loaded ${accounts.length} accounts: ${accounts.map((a) => a.name).join(', ')}`
        );
        return accounts;
    } catch (err) {
        console.error('[FIREBASE] Load error:', err.message);
        return [];
    }
}

module.exports = { initFirebase, loadTokensFromFirebase };
