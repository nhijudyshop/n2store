/**
 * MdSerializer - Converts structured data back to PROJECT-TRACKER.md format
 */

export class MdSerializer {
    static serialize(data) {
        const { modules, features, plans, goals, tasks, meta } = data;
        let md = '';

        // Header
        md += '# N2Store Project Tracker\n';
        md += `<!-- SYNC_VERSION: ${meta?.syncVersion || 1} -->\n`;
        md += `<!-- LAST_UPDATED: ${meta?.lastMdSync || new Date().toISOString().slice(0, 10)} -->\n\n`;
        md += '> Bảng mục lục tính năng chi tiết toàn bộ hệ thống N2Store.\n';
        md += '> Dùng cho team, stakeholders và AI agent theo dõi + phát triển.\n\n';
        md += '---\n\n';

        // Category mapping
        const catLabels = {
            auth: 'AUTH', warehouse: 'WAREHOUSE', live: 'LIVE',
            sales: 'SALES', customer: 'CUSTOMER', returns: 'RETURNS',
            finance: 'FINANCE', admin: 'ADMIN', system: 'SYSTEM',
            integration: 'INTEGRATION', report: 'REPORT', other: 'OTHER',
        };

        // Modules section
        md += '## MỤC LỤC TÍNH NĂNG CHI TIẾT\n\n---\n\n';

        const sortedModules = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));

        sortedModules.forEach(mod => {
            const catKey = catLabels[mod.category] || (mod.category || 'OTHER').toUpperCase();
            md += `### [${catKey}] ${mod.name || mod.id} {#${mod.id}}\n`;
            md += `- **Module**: \`${mod.folder || mod.id + '/'}\` | **Status**: ${mod.status || 'planned'} | **Completion**: ${mod.completionPercent || 0}%\n`;

            if (mod.dependencies && mod.dependencies.length > 0) {
                md += `- **Dependencies**: ${mod.dependencies.join(', ')}\n`;
            } else {
                md += `- **Dependencies**: none\n`;
            }
            if (mod.bpRelated) {
                md += `- **BP liên quan**: ${mod.bpRelated}\n`;
            }

            md += '\n#### Features\n\n';

            // Group features by section
            const modFeatures = features
                .filter(f => f.moduleId === mod.id)
                .sort((a, b) => (a.order || 0) - (b.order || 0));

            const sections = {};
            const noSection = [];
            modFeatures.forEach(f => {
                if (f.section) {
                    if (!sections[f.section]) sections[f.section] = [];
                    sections[f.section].push(f);
                } else {
                    noSection.push(f);
                }
            });

            // Features without section first
            noSection.forEach(f => {
                md += this._featureLine(f);
            });

            // Features grouped by section
            for (const [section, feats] of Object.entries(sections)) {
                md += `\n##### ${section}\n`;
                feats.forEach(f => {
                    md += this._featureLine(f);
                });
            }

            md += '\n---\n\n';
        });

        // Plans section
        if (plans.length > 0) {
            md += '## Kế Hoạch Phát Triển\n\n';

            const sortedPlans = [...plans].sort((a, b) => (a.order || 0) - (b.order || 0));
            sortedPlans.forEach(plan => {
                md += `### Phase: ${plan.name || plan.id} {#${plan.id}}\n`;
                md += `- **Status**: ${plan.status || 'planned'}`;
                if (plan.target) md += ` | **Target**: ${plan.target}`;
                md += '\n\n';

                const planGoals = goals
                    .filter(g => g.planId === plan.id)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                planGoals.forEach(goal => {
                    md += `#### Goal: ${goal.name || goal.id} {#${goal.id}}\n`;

                    const goalTasks = tasks
                        .filter(t => t.goalId === goal.id)
                        .sort((a, b) => (a.order || 0) - (b.order || 0));

                    goalTasks.forEach(t => {
                        md += this._taskLine(t);
                    });

                    md += '\n';
                });
            });
        }

        return md;
    }

    static _featureLine(f) {
        const check = this._statusToCheck(f.status, f.autoChecked);
        const priority = f.priority ? ` {priority:${f.priority}}` : '';
        const auto = f.autoChecked && f.autoAgent
            ? ` <!-- auto:${f.autoAgent}:${f.autoDate || new Date().toISOString().slice(0, 10)} -->`
            : '';
        return `- [${check}] ${f.name || f.id}${priority}${auto}\n`;
    }

    static _taskLine(t) {
        let check = ' ';
        if (t.status === 'done-manual') check = 'x';
        else if (t.status === 'done-auto') check = '✓';
        else if (t.status === 'in-progress') check = '~';

        const priority = t.priority ? ` {priority:${t.priority}}` : '';
        const auto = t.status === 'done-auto' && t.autoAgent
            ? ` <!-- auto:${t.autoAgent}:${t.autoDate || new Date().toISOString().slice(0, 10)} -->`
            : '';
        return `- [${check}] ${t.name || t.id}${priority}${auto}\n`;
    }

    static _statusToCheck(status, isAuto) {
        if (isAuto) return '✓';
        if (status === 'done') return 'x';
        if (status === 'in-progress') return '~';
        return ' ';
    }
}
