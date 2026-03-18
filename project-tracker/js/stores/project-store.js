/**
 * ProjectStore - Data layer for project tracker
 * Manages modules, features, plans, goals, tasks in Firestore
 */

const COLLECTION = 'project_tracker';

export class ProjectStore {
    constructor() {
        this.db = null;
        this.data = {
            modules: [],
            features: [],
            plans: [],
            goals: [],
            tasks: [],
            meta: { syncVersion: 0, lastMdSync: null }
        };
        this._listeners = [];
    }

    async init() {
        // Always load local first for instant rendering
        this.loadFromLocal();

        if (typeof firebase !== 'undefined' && firebase.firestore) {
            this.db = firebase.firestore();
            // Load Firestore with timeout to prevent hanging
            try {
                await Promise.race([
                    this.loadAll(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 8000))
                ]);
            } catch (err) {
                console.warn('Firestore load failed, using local data:', err.message);
            }
        } else {
            console.warn('Firebase not available, using local data only');
        }
    }

    // --- Load ---

    async loadAll() {
        try {
            const [modules, features, plans, goals, tasks, meta] = await Promise.all([
                this._loadCollection('modules'),
                this._loadCollection('features'),
                this._loadCollection('plans'),
                this._loadCollection('goals'),
                this._loadCollection('tasks'),
                this._loadDoc('_meta'),
            ]);
            this.data = { modules, features, plans, goals, tasks, meta: meta || this.data.meta };
            this.saveToLocal();
            this._notify();
        } catch (err) {
            console.warn('Firestore load failed, using local:', err);
            this.loadFromLocal();
        }
    }

    async _loadCollection(name) {
        if (!this.db) return [];
        const snap = await this.db.collection(COLLECTION).doc('data').collection(name).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async _loadDoc(name) {
        if (!this.db) return null;
        const doc = await this.db.collection(COLLECTION).doc(name).get();
        return doc.exists ? doc.data() : null;
    }

    // --- Save ---

    async saveModule(mod) {
        mod.updatedAt = new Date().toISOString();
        if (this.db) {
            await this.db.collection(COLLECTION).doc('data').collection('modules').doc(mod.id).set(mod);
        }
        this._upsert('modules', mod);
        this.saveToLocal();
        this._notify();
    }

    async saveFeature(feat) {
        feat.updatedAt = new Date().toISOString();
        if (this.db) {
            await this.db.collection(COLLECTION).doc('data').collection('features').doc(feat.id).set(feat);
        }
        this._upsert('features', feat);
        this.saveToLocal();
        this._notify();
    }

    async savePlan(plan) {
        plan.updatedAt = new Date().toISOString();
        if (this.db) {
            await this.db.collection(COLLECTION).doc('data').collection('plans').doc(plan.id).set(plan);
        }
        this._upsert('plans', plan);
        this.saveToLocal();
        this._notify();
    }

    async saveGoal(goal) {
        goal.updatedAt = new Date().toISOString();
        if (this.db) {
            await this.db.collection(COLLECTION).doc('data').collection('goals').doc(goal.id).set(goal);
        }
        this._upsert('goals', goal);
        this.saveToLocal();
        this._notify();
    }

    async saveTask(task) {
        task.updatedAt = new Date().toISOString();
        if (this.db) {
            await this.db.collection(COLLECTION).doc('data').collection('tasks').doc(task.id).set(task);
        }
        this._upsert('tasks', task);
        this.saveToLocal();
        this._notify();
    }

    // --- Import from parsed MD ---

    async importFromParsed(parsed) {
        this.data = { ...this.data, ...parsed };
        this.data.meta.syncVersion = (this.data.meta.syncVersion || 0) + 1;
        this.data.meta.lastMdSync = new Date().toISOString();

        if (this.db) {
            const batch = this.db.batch();
            // Save meta
            batch.set(this.db.collection(COLLECTION).doc('_meta'), this.data.meta);

            // Save each collection
            for (const name of ['modules', 'features', 'plans', 'goals', 'tasks']) {
                for (const item of this.data[name]) {
                    const ref = this.db.collection(COLLECTION).doc('data').collection(name).doc(item.id);
                    batch.set(ref, item);
                }
            }
            await batch.commit();
        }
        this.saveToLocal();
        this._notify();
    }

    // --- Getters ---

    getAllData() { return this.data; }
    getModules() { return this.data.modules; }
    getFeatures(moduleId) {
        if (!moduleId) return this.data.features;
        return this.data.features.filter(f => f.moduleId === moduleId);
    }
    getPlans() { return this.data.plans; }
    getGoals(planId) {
        if (!planId) return this.data.goals;
        return this.data.goals.filter(g => g.planId === planId);
    }
    getTasks(goalId) {
        if (!goalId) return this.data.tasks;
        return this.data.tasks.filter(t => t.goalId === goalId);
    }

    getStats() {
        const tasks = this.data.tasks;
        const features = this.data.features;
        return {
            totalTasks: tasks.length,
            completedTasks: tasks.filter(t => t.status === 'done-manual' || t.status === 'done-auto').length,
            inProgressTasks: tasks.filter(t => t.status === 'in-progress').length,
            plannedTasks: tasks.filter(t => t.status === 'todo' || t.status === 'planned').length,
            totalFeatures: features.length,
            completedFeatures: features.filter(f => f.status === 'done').length,
            modules: this.data.modules.length,
        };
    }

    // --- Local storage ---

    saveToLocal() {
        try {
            localStorage.setItem('project_tracker_data', JSON.stringify(this.data));
        } catch (e) { /* quota exceeded */ }
    }

    loadFromLocal() {
        try {
            const saved = localStorage.getItem('project_tracker_data');
            if (saved) this.data = JSON.parse(saved);
        } catch (e) { /* parse error */ }
    }

    // --- Helpers ---

    _upsert(collection, item) {
        const idx = this.data[collection].findIndex(x => x.id === item.id);
        if (idx >= 0) {
            this.data[collection][idx] = item;
        } else {
            this.data[collection].push(item);
        }
    }

    subscribe(fn) {
        this._listeners.push(fn);
        return () => { this._listeners = this._listeners.filter(f => f !== fn); };
    }

    _notify() {
        this._listeners.forEach(fn => fn(this.data));
    }
}
