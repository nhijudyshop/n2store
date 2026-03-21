// =====================================================
// ADMIN FIREBASE - Firestore Data Browser API
// =====================================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Initialize Firebase Admin (singleton)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}

const db = admin.firestore();

// =====================================================
// GET /collections - List top-level collections
// =====================================================
router.get('/collections', async (req, res) => {
    try {
        const collections = await db.listCollections();
        const result = [];

        for (const col of collections) {
            result.push({ id: col.id, path: col.path });
        }

        res.json({ success: true, collections: result });
    } catch (error) {
        console.error('[ADMIN-FIREBASE] List collections error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /subcollections/:path - List subcollections of a document
// path format: collection/docId (encoded)
// =====================================================
router.get('/subcollections/*', async (req, res) => {
    try {
        const docPath = req.params[0];
        if (!docPath) return res.status(400).json({ success: false, error: 'Document path required' });

        const docRef = db.doc(docPath);
        const collections = await docRef.listCollections();
        const result = collections.map(col => ({ id: col.id, path: col.path }));

        res.json({ success: true, collections: result });
    } catch (error) {
        console.error('[ADMIN-FIREBASE] List subcollections error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /browse/:collectionPath - Browse documents in a collection
// Supports: ?limit=20&startAfter=docId&orderBy=__name__
// collectionPath can be nested: collection/doc/subcollection
// =====================================================
router.get('/browse/*', async (req, res) => {
    try {
        const collectionPath = req.params[0];
        if (!collectionPath) return res.status(400).json({ success: false, error: 'Collection path required' });

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const startAfter = req.query.startAfter || null;

        let query = db.collection(collectionPath).orderBy(admin.firestore.FieldPath.documentId());

        if (startAfter) {
            query = query.startAfter(startAfter);
        }

        // Get total count (approximate)
        const countSnapshot = await db.collection(collectionPath).count().get();
        const total = countSnapshot.data().count;

        // Get documents
        const snapshot = await query.limit(limit).get();
        const docs = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Convert Timestamps to ISO strings for JSON serialization
            const serialized = serializeFirestoreData(data);
            docs.push({
                _id: doc.id,
                ...serialized
            });
        }

        // Check if there are more documents
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const hasMore = snapshot.docs.length === limit;

        res.json({
            success: true,
            collectionPath,
            total,
            docs,
            hasMore,
            lastDocId: lastDoc ? lastDoc.id : null
        });
    } catch (error) {
        console.error('[ADMIN-FIREBASE] Browse collection error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// GET /document/:path - Get a single document + subcollections
// path format: collection/docId
// =====================================================
router.get('/document/*', async (req, res) => {
    try {
        const docPath = req.params[0];
        if (!docPath) return res.status(400).json({ success: false, error: 'Document path required' });

        const docRef = db.doc(docPath);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        // Get subcollections
        const subcollections = await docRef.listCollections();
        const subs = subcollections.map(col => ({ id: col.id, path: col.path }));

        const data = serializeFirestoreData(doc.data());

        res.json({
            success: true,
            document: {
                id: doc.id,
                path: docPath,
                data,
                subcollections: subs
            }
        });
    } catch (error) {
        console.error('[ADMIN-FIREBASE] Get document error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// DELETE /document/:path - Delete a document
// =====================================================
router.delete('/document/*', async (req, res) => {
    try {
        const docPath = req.params[0];
        if (!docPath) return res.status(400).json({ success: false, error: 'Document path required' });

        await db.doc(docPath).delete();

        res.json({ success: true, message: `Document ${docPath} deleted` });
    } catch (error) {
        console.error('[ADMIN-FIREBASE] Delete document error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// HELPER: Serialize Firestore data for JSON
// =====================================================
function serializeFirestoreData(data) {
    if (data === null || data === undefined) return data;

    if (data instanceof admin.firestore.Timestamp) {
        return data.toDate().toISOString();
    }

    if (data instanceof admin.firestore.GeoPoint) {
        return { _type: 'GeoPoint', latitude: data.latitude, longitude: data.longitude };
    }

    if (data instanceof admin.firestore.DocumentReference) {
        return { _type: 'Reference', path: data.path };
    }

    if (Buffer.isBuffer(data)) {
        return { _type: 'Bytes', length: data.length };
    }

    if (Array.isArray(data)) {
        return data.map(item => serializeFirestoreData(item));
    }

    if (typeof data === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = serializeFirestoreData(value);
        }
        return result;
    }

    return data;
}

module.exports = router;
