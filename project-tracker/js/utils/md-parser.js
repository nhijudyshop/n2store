/**
 * MdParser - Parses PROJECT-TRACKER.md into structured data
 *
 * MD Format conventions:
 * - ### [CATEGORY] Module Name {#module-id}
 * - **Module**: `folder/` | **Status**: done | **Completion**: 90%
 * - **Dependencies**: mod1, mod2
 * - #### Features
 * - ##### Sub-section Name
 * - - [x] Feature name {priority:high}
 * - - [ ] Planned feature {priority:medium}
 * - - [~] In-progress feature
 * - - [✓] Auto-completed feature <!-- auto:agent-name:date -->
 *
 * Plans section:
 * - ### Phase: Plan Name {#plan-id}
 * - **Status**: planned | **Target**: 2026-04-01
 * - #### Goal: Goal Name {#goal-id}
 * - - [ ] Task description
 */

export class MdParser {
    static parse(mdText) {
        const lines = mdText.split('\n');
        const result = {
            modules: [],
            features: [],
            plans: [],
            goals: [],
            tasks: [],
        };

        let currentModule = null;
        let currentSection = null;     // e.g., "features", "plans"
        let currentSubSection = null;  // h5 section name within features
        let currentPlan = null;
        let currentGoal = null;
        let featureOrder = 0;
        let taskOrder = 0;

        const catMap = {
            'AUTH': 'auth', 'WAREHOUSE': 'warehouse', 'LIVE': 'live',
            'SALES': 'sales', 'CUSTOMER': 'customer', 'RETURNS': 'returns',
            'FINANCE': 'finance', 'ADMIN': 'admin', 'SYSTEM': 'system',
            'INTEGRATION': 'integration', 'REPORT': 'report',
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // --- Module header: ### [CATEGORY] Module Name {#module-id} ---
            const moduleMatch = trimmed.match(/^###\s+\[([A-Z]+)\]\s+(.+?)\s*\{#([\w-]+)\}/);
            if (moduleMatch) {
                currentSection = 'module';
                currentSubSection = null;
                currentPlan = null;
                currentGoal = null;
                featureOrder = 0;

                const [, catKey, name, id] = moduleMatch;
                currentModule = {
                    id,
                    name: name.trim(),
                    category: catMap[catKey] || catKey.toLowerCase(),
                    status: 'planned',
                    completionPercent: 0,
                    dependencies: [],
                    order: result.modules.length,
                };
                result.modules.push(currentModule);
                continue;
            }

            // --- Module metadata: - **Module**: `folder/` | **Status**: done | **Completion**: 90% ---
            if (currentModule && currentSection === 'module') {
                const metaMatch = trimmed.match(/^\-\s+\*\*Module\*\*:\s*`([^`]*)`\s*\|\s*\*\*Status\*\*:\s*(\w[\w-]*)\s*\|\s*\*\*Completion\*\*:\s*(\d+)%/);
                if (metaMatch) {
                    const [, folder, status, pct] = metaMatch;
                    currentModule.folder = folder;
                    currentModule.status = status;
                    currentModule.completionPercent = parseInt(pct, 10);
                    continue;
                }

                const depMatch = trimmed.match(/^\-\s+\*\*Dependencies\*\*:\s*(.+)/);
                if (depMatch) {
                    const deps = depMatch[1].trim();
                    if (deps !== 'none' && deps !== 'None') {
                        currentModule.dependencies = deps.split(',').map(d => d.trim()).filter(Boolean);
                    }
                    continue;
                }

                const bpMatch = trimmed.match(/^\-\s+\*\*BP liên quan\*\*:\s*(.+)/);
                if (bpMatch) {
                    currentModule.bpRelated = bpMatch[1].trim();
                    continue;
                }
            }

            // --- Plan header: ### Phase: Plan Name {#plan-id} ---
            const planMatch = trimmed.match(/^###\s+Phase:\s+(.+?)\s*\{#([\w-]+)\}/);
            if (planMatch) {
                currentModule = null;
                currentSection = 'plans';
                currentSubSection = null;
                currentGoal = null;
                taskOrder = 0;

                const [, name, id] = planMatch;
                currentPlan = {
                    id,
                    name: name.trim(),
                    status: 'planned',
                    target: null,
                    order: result.plans.length,
                };
                result.plans.push(currentPlan);
                continue;
            }

            // --- Plan metadata ---
            if (currentPlan && currentSection === 'plans' && !currentGoal) {
                const planMetaMatch = trimmed.match(/^\-\s+\*\*Status\*\*:\s*(\w[\w-]*)\s*\|\s*\*\*Target\*\*:\s*(.+)/);
                if (planMetaMatch) {
                    currentPlan.status = planMetaMatch[1];
                    currentPlan.target = planMetaMatch[2].trim();
                    continue;
                }
            }

            // --- Goal header: #### Goal: Goal Name {#goal-id} ---
            const goalMatch = trimmed.match(/^####\s+Goal:\s+(.+?)\s*\{#([\w-]+)\}/);
            if (goalMatch && currentPlan) {
                const [, name, id] = goalMatch;
                taskOrder = 0;
                currentGoal = {
                    id,
                    name: name.trim(),
                    planId: currentPlan.id,
                    order: result.goals.length,
                };
                result.goals.push(currentGoal);
                continue;
            }

            // --- Feature section: #### Features ---
            if (trimmed.match(/^####\s+Features\s*$/i) && currentModule) {
                currentSection = 'features';
                currentSubSection = null;
                continue;
            }

            // --- Feature sub-section: ##### Sub-section Name ---
            const subSecMatch = trimmed.match(/^#{5,6}\s+(.+)/);
            if (subSecMatch && currentModule && currentSection === 'features') {
                currentSubSection = subSecMatch[1].trim();
                continue;
            }

            // --- Feature checkbox line ---
            const checkboxMatch = trimmed.match(/^-\s+\[([ x~✓])\]\s+(.+)/);
            if (checkboxMatch) {
                const [, check, rest] = checkboxMatch;

                // If in plans/goals section → task
                if (currentGoal) {
                    const taskName = rest.replace(/\{[^}]*\}/g, '').replace(/<!--.*?-->/g, '').trim();
                    const priority = this._extractPriority(rest);
                    const autoMatch = rest.match(/<!--\s*auto:([\w-]+):([\d-]+)\s*-->/);

                    let status = 'todo';
                    if (check === 'x') status = 'done-manual';
                    else if (check === '✓') status = 'done-auto';
                    else if (check === '~') status = 'in-progress';

                    const task = {
                        id: `${currentGoal.id}_task_${taskOrder++}`,
                        name: taskName,
                        goalId: currentGoal.id,
                        status,
                        priority,
                        order: taskOrder,
                    };
                    if (autoMatch) {
                        task.autoAgent = autoMatch[1];
                        task.autoDate = autoMatch[2];
                    }
                    result.tasks.push(task);
                    continue;
                }

                // If in module features section → feature
                if (currentModule) {
                    const featureName = rest.replace(/\{[^}]*\}/g, '').replace(/<!--.*?-->/g, '').trim();
                    const priority = this._extractPriority(rest);
                    const autoMatch = rest.match(/<!--\s*auto:([\w-]+):([\d-]+)\s*-->/);

                    let status = 'planned';
                    if (check === 'x') status = 'done';
                    else if (check === '✓') { status = 'done'; }
                    else if (check === '~') status = 'in-progress';

                    const feature = {
                        id: `${currentModule.id}_feat_${featureOrder++}`,
                        name: featureName,
                        moduleId: currentModule.id,
                        status,
                        priority,
                        section: currentSubSection || null,
                        autoChecked: check === '✓',
                        order: featureOrder,
                    };
                    if (autoMatch) {
                        feature.autoAgent = autoMatch[1];
                        feature.autoDate = autoMatch[2];
                    }
                    result.features.push(feature);
                    continue;
                }
            }

            // --- Horizontal rule or new top-level section resets ---
            if (trimmed === '---') {
                if (currentSection === 'module' || currentSection === 'features') {
                    currentModule = null;
                    currentSection = null;
                    currentSubSection = null;
                }
            }
        }

        return result;
    }

    static _extractPriority(text) {
        const match = text.match(/\{priority:(high|medium|low)\}/);
        return match ? match[1] : null;
    }
}
