// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Todo System Tab - Plans > Goals > Tasks with manual + auto checkboxes
 */

export class TodoSystem {
    constructor(store, container) {
        this.store = store;
        this.container = container;
        this.expandedPlans = new Set();
        this.expandedGoals = new Set();
    }

    render() {
        const plans = this.store.getPlans();
        const goals = this.store.getGoals();
        const tasks = this.store.getTasks();

        const stats = {
            totalTasks: tasks.length,
            done: tasks.filter(t => t.status === 'done-manual' || t.status === 'done-auto').length,
            inProgress: tasks.filter(t => t.status === 'in-progress').length,
            todo: tasks.filter(t => t.status === 'todo' || t.status === 'planned').length,
        };
        stats.pct = stats.totalTasks > 0 ? Math.round((stats.done / stats.totalTasks) * 100) : 0;

        this.container.innerHTML = `
            <!-- Stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div class="stat-card">
                    <div class="stat-value text-blue-600">${stats.totalTasks}</div>
                    <div class="stat-label">Tổng Tasks</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value text-green-600">${stats.done}</div>
                    <div class="stat-label">Hoàn thành</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value text-amber-600">${stats.inProgress}</div>
                    <div class="stat-label">Đang làm</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value text-slate-500">${stats.todo}</div>
                    <div class="stat-label">Chờ làm</div>
                </div>
            </div>

            <!-- Overall Progress -->
            <div class="bg-white rounded-xl border border-slate-200 p-4 mb-6">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-semibold text-slate-700">Tiến độ Tasks</span>
                    <span class="text-sm font-bold text-green-600">${stats.pct}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill bg-green-500" style="width: ${stats.pct}%"></div>
                </div>
            </div>

            <!-- Plans Accordion -->
            <div class="space-y-3">
                ${plans.length > 0 ? plans.map(plan => this._renderPlan(plan, goals, tasks)).join('') : `
                    <div class="empty-state">
                        <span class="material-symbols-outlined">checklist</span>
                        <p class="text-lg font-medium">Chưa có kế hoạch</p>
                        <p class="text-sm mt-1">Đồng bộ từ MD để tải kế hoạch và tasks</p>
                    </div>
                `}
            </div>
        `;

        this._bindEvents();
    }

    _renderPlan(plan, allGoals, allTasks) {
        const planGoals = allGoals.filter(g => g.planId === plan.id);
        const planTasks = allTasks.filter(t => planGoals.some(g => g.id === t.goalId));
        const doneTasks = planTasks.filter(t => t.status === 'done-manual' || t.status === 'done-auto').length;
        const pct = planTasks.length > 0 ? Math.round((doneTasks / planTasks.length) * 100) : 0;
        const isExpanded = this.expandedPlans.has(plan.id);
        const statusBadge = plan.status ? `<span class="badge badge-${plan.status}">${plan.status}</span>` : '';

        return `
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div class="accordion-header" data-plan="${plan.id}">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="material-symbols-outlined text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}">expand_more</span>
                        <span class="material-symbols-outlined text-purple-500 text-[20px]">event_note</span>
                        <span class="font-semibold text-sm text-slate-800 truncate">${plan.name || plan.id}</span>
                        ${statusBadge}
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-slate-400">${doneTasks}/${planTasks.length} tasks</span>
                        <span class="text-xs font-semibold text-purple-600">${pct}%</span>
                        <div class="progress-bar w-16">
                            <div class="progress-fill bg-purple-500" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </div>
                ${isExpanded ? `
                    <div class="border-t border-slate-100">
                        ${plan.target ? `<div class="px-4 py-2 text-xs text-slate-400">Target: ${plan.target}</div>` : ''}
                        ${planGoals.length > 0 ? planGoals.map(goal => this._renderGoal(goal, allTasks)).join('') : '<div class="px-4 py-3 text-sm text-slate-300">Chưa có mục tiêu</div>'}
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderGoal(goal, allTasks) {
        const goalTasks = allTasks.filter(t => t.goalId === goal.id);
        const doneTasks = goalTasks.filter(t => t.status === 'done-manual' || t.status === 'done-auto').length;
        const pct = goalTasks.length > 0 ? Math.round((doneTasks / goalTasks.length) * 100) : 0;
        const isExpanded = this.expandedGoals.has(goal.id);

        return `
            <div class="border-b border-slate-50 last:border-0">
                <div class="accordion-header pl-8" data-goal="${goal.id}">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="material-symbols-outlined text-slate-300 text-[16px] transition-transform ${isExpanded ? '' : '-rotate-90'}">expand_more</span>
                        <span class="material-symbols-outlined text-blue-400 text-[18px]">flag</span>
                        <span class="text-sm font-medium text-slate-700 truncate">${goal.name || goal.id}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-400">${doneTasks}/${goalTasks.length}</span>
                        <div class="progress-bar w-12">
                            <div class="progress-fill bg-blue-400" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </div>
                ${isExpanded ? `
                    <div class="pl-12 pr-4 pb-2 space-y-1">
                        ${goalTasks.length > 0 ? goalTasks.map(t => this._renderTask(t)).join('') : '<div class="text-xs text-slate-300 py-1">Chưa có tasks</div>'}
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderTask(task) {
        const isDone = task.status === 'done-manual' || task.status === 'done-auto';
        const isInProgress = task.status === 'in-progress';
        const isAuto = task.status === 'done-auto';

        let checkboxClass = '';
        let checkIcon = '';
        if (isDone && isAuto) {
            checkboxClass = 'checked-auto';
            checkIcon = '<span class="material-symbols-outlined text-[14px]">auto_awesome</span>';
        } else if (isDone) {
            checkboxClass = 'checked';
            checkIcon = '<span class="material-symbols-outlined text-[14px]">check</span>';
        } else if (isInProgress) {
            checkboxClass = 'in-progress';
            checkIcon = '<span class="material-symbols-outlined text-[14px]">more_horiz</span>';
        }

        const textClass = isDone ? 'line-through text-slate-400' : 'text-slate-700';
        const priorityTag = task.priority ? `<span class="text-[10px] font-semibold priority-${task.priority} uppercase">${task.priority}</span>` : '';
        const dueTag = task.dueDate ? `<span class="text-[10px] text-slate-400">${task.dueDate}</span>` : '';
        const autoTag = isAuto && task.autoAgent ? `<span class="text-[10px] text-purple-400">by ${task.autoAgent}</span>` : '';

        return `
            <div class="flex items-center gap-2 py-1 group">
                <div class="todo-checkbox ${checkboxClass}" data-task-id="${task.id}" data-status="${task.status || 'todo'}" title="Click để đổi trạng thái">
                    ${checkIcon}
                </div>
                <span class="text-sm ${textClass} flex-1 min-w-0 truncate">${task.name || task.id}</span>
                ${priorityTag}
                ${dueTag}
                ${autoTag}
            </div>
        `;
    }

    _bindEvents() {
        // Plan accordion
        this.container.querySelectorAll('[data-plan]').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.plan;
                if (this.expandedPlans.has(id)) this.expandedPlans.delete(id); else this.expandedPlans.add(id);
                this.render();
            });
        });

        // Goal accordion
        this.container.querySelectorAll('[data-goal]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = el.dataset.goal;
                if (this.expandedGoals.has(id)) this.expandedGoals.delete(id); else this.expandedGoals.add(id);
                this.render();
            });
        });

        // Task checkbox toggle
        this.container.querySelectorAll('.todo-checkbox').forEach(el => {
            el.addEventListener('click', () => {
                const taskId = el.dataset.taskId;
                const current = el.dataset.status;
                const next = this._nextTaskStatus(current);
                this._updateTaskStatus(taskId, next);
            });
        });
    }

    _nextTaskStatus(current) {
        // Cycle: todo → in-progress → done-manual → todo
        // done-auto stays as done-auto (can only be reset to todo)
        if (current === 'done-auto') return 'todo';
        const cycle = { 'todo': 'in-progress', 'planned': 'in-progress', 'in-progress': 'done-manual', 'done-manual': 'todo' };
        return cycle[current] || 'in-progress';
    }

    async _updateTaskStatus(taskId, newStatus) {
        const tasks = this.store.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        task.status = newStatus;
        await this.store.saveTask(task);
        this.render();
    }
}
