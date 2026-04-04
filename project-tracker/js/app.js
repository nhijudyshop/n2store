// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Project Tracker - Complete inline app (no ES modules)
 * Features: Dashboard, Feature Catalog, Todo System, Module Map
 */
(function() {
    'use strict';

    // ============================================
    // DATA STORE
    // ============================================
    var storeData = {
        modules: [], features: [], plans: [], goals: [], tasks: [],
        meta: { syncVersion: 0, lastMdSync: null }
    };
    var collapsedModules = {};  // track collapsed state for feature catalog
    var collapsedPlans = {};    // track collapsed state for todo plans
    var fcFilter = { module: '', status: '', search: '' };

    function loadFromLocal() {
        try {
            var saved = localStorage.getItem('project_tracker_data');
            if (saved) storeData = JSON.parse(saved);
        } catch(e) {}
    }

    function saveToLocal() {
        try { localStorage.setItem('project_tracker_data', JSON.stringify(storeData)); } catch(e) {}
    }

    function saveToFirestore() {
        if (typeof firebase === 'undefined' || !firebase.firestore) return;
        var db = firebase.firestore();
        var batch = db.batch();
        batch.set(db.collection('project_tracker').doc('_meta'), storeData.meta);
        ['modules','features','plans','goals','tasks'].forEach(function(col) {
            storeData[col].forEach(function(item) {
                batch.set(db.collection('project_tracker').doc('data').collection(col).doc(item.id), item);
            });
        });
        batch.commit().catch(function(err) { console.warn('[PT] Firestore save:', err.message); });
    }

    function getStats() {
        var t = storeData.tasks, f = storeData.features;
        return {
            modules: storeData.modules.length,
            totalFeatures: f.length,
            completedFeatures: f.filter(function(x) { return x.status === 'done'; }).length,
            totalTasks: t.length,
            completedTasks: t.filter(function(x) { return x.status === 'done-manual' || x.status === 'done-auto'; }).length,
            inProgressTasks: t.filter(function(x) { return x.status === 'in-progress'; }).length,
        };
    }

    // ============================================
    // MD PARSER
    // ============================================
    function parseMd(mdText) {
        var lines = mdText.split('\n');
        var result = { modules: [], features: [], plans: [], goals: [], tasks: [] };
        var curModule = null, curPlan = null, curGoal = null;
        var curSection = null, curSubSection = null;
        var featOrder = 0, taskOrder = 0;
        var catMap = { AUTH:'auth', WAREHOUSE:'warehouse', LIVE:'live', SALES:'sales', CUSTOMER:'customer', RETURNS:'returns', FINANCE:'finance', ADMIN:'admin', SYSTEM:'system', INTEGRATION:'integration', REPORT:'report' };

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();

            var mm = line.match(/^###\s+\[([A-Z]+)\]\s+(.+?)\s*\{#([\w-]+)\}/);
            if (mm) {
                curSection = 'module'; curSubSection = null; curPlan = null; curGoal = null; featOrder = 0;
                curModule = { id: mm[3], name: mm[2].trim(), category: catMap[mm[1]] || mm[1].toLowerCase(), status: 'planned', completionPercent: 0, dependencies: [], order: result.modules.length };
                result.modules.push(curModule);
                continue;
            }

            if (curModule && curSection === 'module') {
                var meta = line.match(/^\-\s+\*\*Module\*\*:\s*`([^`]*)`\s*\|\s*\*\*Status\*\*:\s*(\w[\w-]*)\s*\|\s*\*\*Completion\*\*:\s*(\d+)%/);
                if (meta) { curModule.folder = meta[1]; curModule.status = meta[2]; curModule.completionPercent = parseInt(meta[3]); continue; }
                var dep = line.match(/^\-\s+\*\*Dependencies\*\*:\s*(.+)/);
                if (dep) { var d = dep[1].trim(); if (d !== 'none' && d !== 'None') curModule.dependencies = d.split(',').map(function(s){return s.trim();}); continue; }
            }

            var pm = line.match(/^###\s+Phase:\s+(.+?)\s*\{#([\w-]+)\}/);
            if (pm) {
                curModule = null; curSection = 'plans'; curGoal = null; taskOrder = 0;
                curPlan = { id: pm[2], name: pm[1].trim(), status: 'planned', target: null, order: result.plans.length };
                result.plans.push(curPlan);
                continue;
            }

            if (curPlan && !curGoal) {
                var pMeta = line.match(/^\-\s+\*\*Status\*\*:\s*(\w[\w-]*)\s*\|\s*\*\*Target\*\*:\s*(.+)/);
                if (pMeta) { curPlan.status = pMeta[1]; curPlan.target = pMeta[2].trim(); continue; }
            }

            var gm = line.match(/^####\s+Goal:\s+(.+?)\s*\{#([\w-]+)\}/);
            if (gm && curPlan) {
                taskOrder = 0;
                curGoal = { id: gm[2], name: gm[1].trim(), planId: curPlan.id, order: result.goals.length };
                result.goals.push(curGoal);
                continue;
            }

            if (line.match(/^####\s+Features\s*$/i) && curModule) { curSection = 'features'; curSubSection = null; continue; }
            var sub = line.match(/^#{5,6}\s+(.+)/);
            if (sub && curModule && curSection === 'features') { curSubSection = sub[1].trim(); continue; }

            var cb = line.match(/^-\s+\[([ x~✓])\]\s+(.+)/);
            if (cb) {
                var check = cb[1], rest = cb[2];
                var name = rest.replace(/\{[^}]*\}/g,'').replace(/<!--.*?-->/g,'').trim();
                var priMatch = rest.match(/\{priority:(high|medium|low)\}/);
                var pri = priMatch ? priMatch[1] : null;

                if (curGoal) {
                    var ts = 'todo';
                    if (check==='x') ts='done-manual'; else if (check==='✓') ts='done-auto'; else if (check==='~') ts='in-progress';
                    result.tasks.push({ id: curGoal.id+'_task_'+taskOrder, name: name, goalId: curGoal.id, status: ts, priority: pri, order: taskOrder++ });
                } else if (curModule) {
                    var fs = 'planned';
                    if (check==='x'||check==='✓') fs='done'; else if (check==='~') fs='in-progress';
                    result.features.push({ id: curModule.id+'_feat_'+featOrder, name: name, moduleId: curModule.id, status: fs, priority: pri, section: curSubSection, autoChecked: check==='✓', order: featOrder++ });
                }
            }
        }
        return result;
    }

    // ============================================
    // MD SERIALIZER
    // ============================================
    function serializeToMd() {
        var catLabels = { auth:'AUTH', warehouse:'WAREHOUSE', live:'LIVE', sales:'SALES', customer:'CUSTOMER', returns:'RETURNS', finance:'FINANCE', admin:'ADMIN', system:'SYSTEM', integration:'INTEGRATION', report:'REPORT', other:'OTHER' };
        var md = '# N2Store Project Tracker\n<!-- SYNC_VERSION: '+(storeData.meta.syncVersion||1)+' -->\n<!-- LAST_UPDATED: '+new Date().toISOString().slice(0,10)+' -->\n\n';
        md += '> Bảng mục lục tính năng chi tiết toàn bộ hệ thống N2Store.\n> Dùng cho team, stakeholders và AI agent theo dõi + phát triển.\n\n---\n\n';
        md += '## MỤC LỤC TÍNH NĂNG CHI TIẾT\n\n---\n\n';

        storeData.modules.forEach(function(mod) {
            var catKey = catLabels[mod.category] || (mod.category||'OTHER').toUpperCase();
            md += '### ['+catKey+'] '+(mod.name||mod.id)+' {#'+mod.id+'}\n';
            md += '- **Module**: `'+(mod.folder||mod.id+'/')+'` | **Status**: '+(mod.status||'planned')+' | **Completion**: '+(mod.completionPercent||0)+'%\n';
            md += '- **Dependencies**: '+(mod.dependencies&&mod.dependencies.length ? mod.dependencies.join(', ') : 'none')+'\n\n';
            md += '#### Features\n\n';
            var mf = storeData.features.filter(function(f){ return f.moduleId === mod.id; }).sort(function(a,b){ return (a.order||0)-(b.order||0); });
            var lastSec = null;
            mf.forEach(function(f) {
                if (f.section && f.section !== lastSec) { md += '\n##### '+f.section+'\n'; lastSec = f.section; }
                var c = f.autoChecked ? '✓' : f.status==='done' ? 'x' : f.status==='in-progress' ? '~' : ' ';
                md += '- ['+c+'] '+f.name+(f.priority ? ' {priority:'+f.priority+'}' : '')+'\n';
            });
            md += '\n---\n\n';
        });

        if (storeData.plans.length > 0) {
            md += '## Kế Hoạch Phát Triển\n\n';
            storeData.plans.forEach(function(plan) {
                md += '### Phase: '+(plan.name||plan.id)+' {#'+plan.id+'}\n';
                md += '- **Status**: '+(plan.status||'planned')+(plan.target ? ' | **Target**: '+plan.target : '')+'\n\n';
                storeData.goals.filter(function(g){ return g.planId === plan.id; }).forEach(function(goal) {
                    md += '#### Goal: '+(goal.name||goal.id)+' {#'+goal.id+'}\n';
                    storeData.tasks.filter(function(t){ return t.goalId === goal.id; }).forEach(function(t) {
                        var c = t.status==='done-manual' ? 'x' : t.status==='done-auto' ? '✓' : t.status==='in-progress' ? '~' : ' ';
                        md += '- ['+c+'] '+t.name+(t.priority ? ' {priority:'+t.priority+'}' : '')+'\n';
                    });
                    md += '\n';
                });
            });
        }
        return md;
    }

    // ============================================
    // RENDERERS
    // ============================================
    var activeTab = 'dashboard';
    var catLabels = { sales:'Bán Hàng', warehouse:'Kho & Nhập Hàng', admin:'Quản Trị', system:'Hệ Thống', live:'Live', customer:'Khách Hàng', finance:'Tài Chính', returns:'Hoàn & CSKH', integration:'Tích Hợp', auth:'Xác Thực', report:'Báo Cáo', other:'Khác' };

    // --- DASHBOARD ---
    function renderDashboard() {
        var el = document.getElementById('tab-dashboard');
        if (!el) return;
        var stats = getStats();
        var modules = storeData.modules.slice().sort(function(a,b){ return (a.order||0)-(b.order||0); });
        var total = modules.length > 0 ? Math.round(modules.reduce(function(s,m){return s+(m.completionPercent||0);},0)/modules.length) : 0;
        var featPct = stats.totalFeatures > 0 ? Math.round(stats.completedFeatures/stats.totalFeatures*100) : 0;

        var groups = {};
        modules.forEach(function(m) { var c = m.category||'other'; if(!groups[c]) groups[c]=[]; groups[c].push(m); });

        var modHtml = '';
        Object.keys(groups).forEach(function(cat) {
            modHtml += '<div class="category-header">'+(catLabels[cat]||cat)+'</div>';
            groups[cat].forEach(function(m) {
                var pct = m.completionPercent||0;
                var color = pct >= 90 ? '#16a34a' : pct >= 50 ? '#d97706' : pct > 0 ? '#3b82f6' : '#94a3b8';
                var mf = storeData.features.filter(function(f){ return f.moduleId === m.id; });
                var done = mf.filter(function(f){ return f.status === 'done'; }).length;
                modHtml += '<div class="module-row" onclick="window._ptShowModule(\''+m.id+'\')">' +
                    '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
                    '<span style="font-weight:500;font-size:0.875rem;color:#1e293b">'+(m.name||m.id)+'</span>' +
                    '<span class="badge badge-'+(m.status||'planned')+'">'+(m.status||'planned')+'</span>' +
                    '<span style="font-size:0.7rem;color:#94a3b8">'+done+'/'+mf.length+' features</span>' +
                    '</div><div style="font-size:0.7rem;color:#b0b8c4;margin-top:2px">'+(m.folder||m.id+'/')+'</div></div>' +
                    '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' +
                    '<span style="font-size:0.8rem;font-weight:700;color:'+color+'">'+pct+'%</span>' +
                    '<div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:'+pct+'%;background:'+color+'"></div></div></div></div>';
            });
        });

        el.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">' +
            _statCard(stats.modules, 'Modules', '#7c3aed') +
            _statCard(stats.completedFeatures + '/' + stats.totalFeatures, 'Features (' + featPct + '%)', '#16a34a') +
            _statCard(stats.totalTasks, 'Tổng Tasks', '#2563eb') +
            _statCard(stats.inProgressTasks, 'Đang làm', '#d97706') +
            '</div>' +
            '<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:16px;margin-bottom:24px">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:0.875rem;font-weight:600;color:#334155">Tiến độ tổng thể</span><span style="font-size:0.875rem;font-weight:700;color:#7c3aed">'+total+'%</span></div>' +
            '<div class="progress-bar"><div class="progress-fill" style="width:'+total+'%;background:#7c3aed"></div></div></div>' +
            (storeData.meta.lastMdSync ? '<div style="font-size:0.75rem;color:#94a3b8;margin-bottom:12px">Lần đồng bộ cuối: '+new Date(storeData.meta.lastMdSync).toLocaleString('vi-VN')+'</div>' : '') +
            '<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">' +
            '<div style="padding:12px 16px;border-bottom:1px solid #f1f5f9"><h3 style="font-size:0.875rem;font-weight:600;color:#334155">Modules theo nhóm ('+modules.length+')</h3></div>' +
            (modHtml || '<div style="padding:16px;font-size:0.875rem;color:#94a3b8">Không có modules</div>') +
            '</div>' +
            (modules.length === 0 ? '<div class="empty-state" style="margin-top:32px"><span class="material-symbols-outlined">sync</span><p style="font-size:1.1rem;font-weight:600">Chưa có dữ liệu</p><p style="font-size:0.875rem;margin-top:4px">Bấm <strong>"Đồng bộ từ MD"</strong> để tải dữ liệu từ file PROJECT-TRACKER.md</p></div>' : '');
    }

    function _statCard(val, label, color) {
        return '<div class="stat-card"><div class="stat-value" style="color:'+color+'">'+val+'</div><div class="stat-label">'+label+'</div></div>';
    }

    // Click module → switch to Feature Catalog filtered
    window._ptShowModule = function(modId) {
        fcFilter.module = modId; fcFilter.status = ''; fcFilter.search = '';
        switchTab('feature-catalog');
    };

    // --- FEATURE CATALOG ---
    function renderFeatureCatalog() {
        var el = document.getElementById('tab-feature-catalog');
        if (!el) return;
        var modules = storeData.modules.slice().sort(function(a,b){ return (a.order||0)-(b.order||0); });
        var allFeatures = storeData.features;

        // Filter bar
        var modOpts = '<option value="">Tất cả modules</option>';
        modules.forEach(function(m) { modOpts += '<option value="'+m.id+'"'+(fcFilter.module===m.id?' selected':'')+'>'+m.name+'</option>'; });

        var html = '<div class="filter-bar">' +
            '<select id="fc-mod" style="flex:1;min-width:120px">'+modOpts+'</select>' +
            '<select id="fc-status"><option value="">Tất cả status</option><option value="done"'+(fcFilter.status==='done'?' selected':'')+'>Done</option><option value="in-progress"'+(fcFilter.status==='in-progress'?' selected':'')+'>In Progress</option><option value="planned"'+(fcFilter.status==='planned'?' selected':'')+'>Planned</option></select>' +
            '<input type="text" id="fc-search" placeholder="Tìm kiếm..." value="'+esc(fcFilter.search)+'" style="flex:1;min-width:150px">' +
            '</div>';

        // Filter modules
        var filteredMods = fcFilter.module ? modules.filter(function(m){ return m.id === fcFilter.module; }) : modules;

        // Count
        var filteredFeats = _filterFeatures(allFeatures);
        html += '<div style="font-size:0.75rem;color:#94a3b8;margin-bottom:12px">'+filteredFeats.length+' / '+allFeatures.length+' tính năng</div>';

        if (modules.length === 0) {
            html += '<div class="empty-state"><span class="material-symbols-outlined">category</span><p style="font-size:1.1rem;font-weight:600">Chưa có tính năng</p><p style="font-size:0.875rem;margin-top:4px">Đồng bộ từ MD để tải danh mục tính năng</p></div>';
        } else {
            html += '<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">';
            filteredMods.forEach(function(mod) {
                var mf = allFeatures.filter(function(f){ return f.moduleId === mod.id; });
                var filtMf = _filterFeatures(mf);
                if ((fcFilter.search || fcFilter.status) && filtMf.length === 0) return;

                var done = mf.filter(function(f){ return f.status === 'done'; }).length;
                var pct = mod.completionPercent || 0;
                var isCollapsed = collapsedModules[mod.id];
                var arrow = isCollapsed ? 'chevron_right' : 'expand_more';

                html += '<div class="accordion-header" style="border-bottom:1px solid #f1f5f9" data-fc-toggle="'+mod.id+'">' +
                    '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span class="material-symbols-outlined" style="font-size:18px;color:#94a3b8">'+arrow+'</span>' +
                    '<span style="font-weight:600;font-size:0.875rem;color:#1e293b">'+(mod.name||mod.id)+'</span>' +
                    '<span class="badge badge-'+(mod.status||'planned')+'">'+(mod.status||'planned')+'</span>' +
                    '<span style="font-size:0.7rem;color:#94a3b8">'+done+'/'+mf.length+'</span></div>' +
                    '<span style="font-size:0.8rem;font-weight:600;color:#7c3aed">'+pct+'%</span></div>';

                if (!isCollapsed) {
                    // Group by section
                    var sections = {};
                    var noSec = [];
                    filtMf.forEach(function(f) {
                        if (f.section) { if(!sections[f.section]) sections[f.section]=[]; sections[f.section].push(f); }
                        else noSec.push(f);
                    });

                    noSec.forEach(function(f) { html += _featureRow(f); });
                    Object.keys(sections).forEach(function(sec) {
                        html += '<div style="padding:6px 16px 4px 40px;font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">'+sec+'</div>';
                        sections[sec].forEach(function(f) { html += _featureRow(f); });
                    });
                }
            });
            html += '</div>';
        }
        el.innerHTML = html;

        // Bind filter events
        var selMod = document.getElementById('fc-mod');
        var selStatus = document.getElementById('fc-status');
        var inpSearch = document.getElementById('fc-search');
        if (selMod) selMod.onchange = function() { fcFilter.module = selMod.value; renderFeatureCatalog(); };
        if (selStatus) selStatus.onchange = function() { fcFilter.status = selStatus.value; renderFeatureCatalog(); };
        if (inpSearch) { var timer; inpSearch.oninput = function() { clearTimeout(timer); timer = setTimeout(function() { fcFilter.search = inpSearch.value; renderFeatureCatalog(); }, 300); }; }

        // Bind toggle
        el.querySelectorAll('[data-fc-toggle]').forEach(function(h) {
            h.onclick = function() { var id = h.getAttribute('data-fc-toggle'); collapsedModules[id] = !collapsedModules[id]; renderFeatureCatalog(); };
        });

        // Bind status click
        el.querySelectorAll('[data-feat-status]').forEach(function(icon) {
            icon.onclick = function(e) {
                e.stopPropagation();
                var fid = icon.getAttribute('data-feat-status');
                var feat = storeData.features.find(function(f){ return f.id === fid; });
                if (!feat) return;
                var cycle = { planned: 'in-progress', 'in-progress': 'done', done: 'planned' };
                feat.status = cycle[feat.status] || 'in-progress';
                // Update module completion
                _recalcModuleCompletion(feat.moduleId);
                saveToLocal();
                renderFeatureCatalog();
            };
        });
    }

    function _featureRow(f) {
        var icons = { done: 'check_circle', 'in-progress': 'pending', planned: 'radio_button_unchecked' };
        var colors = { done: '#16a34a', 'in-progress': '#d97706', planned: '#cbd5e1' };
        var status = f.status || 'planned';
        var priHtml = f.priority ? '<span style="font-size:0.65rem;font-weight:700;color:'+(f.priority==='high'?'#dc2626':f.priority==='medium'?'#d97706':'#94a3b8')+';text-transform:uppercase">'+f.priority+'</span>' : '';
        return '<div style="padding:5px 16px 5px 40px;font-size:0.85rem;color:#475569;border-bottom:1px solid #f8fafc;display:flex;align-items:center;gap:8px">' +
            '<span class="material-symbols-outlined" style="font-size:18px;color:'+(colors[status]||'#cbd5e1')+';cursor:pointer" data-feat-status="'+f.id+'">'+(icons[status]||'radio_button_unchecked')+'</span>' +
            '<span style="flex:1">'+(f.autoChecked?'<span style="font-size:0.65rem;background:#ede9fe;color:#7c3aed;padding:1px 5px;border-radius:4px;margin-right:4px">AUTO</span>':'')+f.name+'</span>' +
            priHtml + '</div>';
    }

    function _filterFeatures(features) {
        var res = features;
        if (fcFilter.status) res = res.filter(function(f){ return f.status === fcFilter.status; });
        if (fcFilter.search) { var q = fcFilter.search.toLowerCase(); res = res.filter(function(f){ return (f.name||'').toLowerCase().indexOf(q) >= 0; }); }
        return res;
    }

    function _recalcModuleCompletion(modId) {
        var mod = storeData.modules.find(function(m){ return m.id === modId; });
        if (!mod) return;
        var mf = storeData.features.filter(function(f){ return f.moduleId === modId; });
        if (mf.length === 0) return;
        var done = mf.filter(function(f){ return f.status === 'done'; }).length;
        mod.completionPercent = Math.round(done / mf.length * 100);
        mod.status = mod.completionPercent >= 100 ? 'done' : mod.completionPercent > 0 ? 'in-progress' : 'planned';
    }

    // --- TODO SYSTEM ---
    function renderTodoSystem() {
        var el = document.getElementById('tab-todo-system');
        if (!el) return;
        var plans = storeData.plans, goals = storeData.goals, tasks = storeData.tasks;
        var done = tasks.filter(function(t){ return t.status==='done-manual'||t.status==='done-auto'; }).length;
        var inProg = tasks.filter(function(t){ return t.status==='in-progress'; }).length;
        var pct = tasks.length > 0 ? Math.round(done/tasks.length*100) : 0;

        var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">' +
            _statCard(tasks.length, 'Tổng Tasks', '#2563eb') +
            _statCard(done, 'Hoàn thành', '#16a34a') +
            _statCard(inProg, 'Đang làm', '#d97706') +
            _statCard(tasks.length - done - inProg, 'Chờ làm', '#94a3b8') +
            '</div>' +
            '<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:16px;margin-bottom:24px">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:0.875rem;font-weight:600;color:#334155">Tiến độ Tasks</span><span style="font-size:0.875rem;font-weight:700;color:#16a34a">'+pct+'%</span></div>' +
            '<div class="progress-bar"><div class="progress-fill" style="width:'+pct+'%;background:#16a34a"></div></div></div>';

        if (plans.length === 0) {
            html += '<div class="empty-state"><span class="material-symbols-outlined">checklist</span><p style="font-size:1.1rem;font-weight:600">Chưa có kế hoạch</p><p style="font-size:0.875rem;margin-top:4px">Đồng bộ từ MD để tải kế hoạch và tasks</p></div>';
        } else {
            plans.forEach(function(plan) {
                var pg = goals.filter(function(g){ return g.planId === plan.id; });
                var pt = tasks.filter(function(t){ return pg.some(function(g){ return g.id === t.goalId; }); });
                var pd = pt.filter(function(t){ return t.status==='done-manual'||t.status==='done-auto'; }).length;
                var pp = pt.length > 0 ? Math.round(pd/pt.length*100) : 0;
                var isCollapsed = collapsedPlans[plan.id];
                var arrow = isCollapsed ? 'chevron_right' : 'expand_more';

                html += '<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:12px">' +
                    '<div class="accordion-header" data-plan-toggle="'+plan.id+'">' +
                    '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span class="material-symbols-outlined" style="font-size:18px;color:#94a3b8">'+arrow+'</span>' +
                    '<span class="material-symbols-outlined" style="color:#7c3aed;font-size:20px">event_note</span>' +
                    '<span style="font-weight:600;font-size:0.875rem;color:#1e293b">'+(plan.name||plan.id)+'</span>' +
                    (plan.target ? '<span style="font-size:0.7rem;color:#94a3b8">Target: '+plan.target+'</span>' : '') +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span style="font-size:0.75rem;color:#94a3b8">'+pd+'/'+pt.length+'</span>' +
                    '<span style="font-size:0.8rem;font-weight:600;color:#7c3aed">'+pp+'%</span>' +
                    '<div class="progress-bar" style="width:60px"><div class="progress-fill" style="width:'+pp+'%;background:#7c3aed"></div></div>' +
                    '</div></div>';

                if (!isCollapsed) {
                    pg.forEach(function(goal) {
                        var gt = tasks.filter(function(t){ return t.goalId === goal.id; });
                        var gd = gt.filter(function(t){ return t.status==='done-manual'||t.status==='done-auto'; }).length;
                        html += '<div style="padding:10px 16px 6px 32px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #f1f5f9">' +
                            '<div style="display:flex;align-items:center;gap:6px"><span class="material-symbols-outlined" style="font-size:16px;color:#3b82f6">flag</span>' +
                            '<span style="font-size:0.85rem;font-weight:600;color:#334155">'+(goal.name||goal.id)+'</span></div>' +
                            '<span style="font-size:0.7rem;color:#94a3b8">'+gd+'/'+gt.length+'</span></div>';
                        gt.forEach(function(t) {
                            html += _taskRow(t);
                        });
                    });
                }
                html += '</div>';
            });
        }
        el.innerHTML = html;

        // Bind plan toggle
        el.querySelectorAll('[data-plan-toggle]').forEach(function(h) {
            h.onclick = function() { var id = h.getAttribute('data-plan-toggle'); collapsedPlans[id] = !collapsedPlans[id]; renderTodoSystem(); };
        });

        // Bind task checkboxes
        el.querySelectorAll('[data-task-check]').forEach(function(cb) {
            cb.onclick = function() {
                var tid = cb.getAttribute('data-task-check');
                var task = storeData.tasks.find(function(t){ return t.id === tid; });
                if (!task) return;
                var cycle = { todo: 'in-progress', planned: 'in-progress', 'in-progress': 'done-manual', 'done-manual': 'todo', 'done-auto': 'todo' };
                task.status = cycle[task.status] || 'in-progress';
                saveToLocal();
                renderTodoSystem();
                // Also update dashboard stats if visible
                if (activeTab === 'dashboard') renderDashboard();
            };
        });
    }

    function _taskRow(t) {
        var isDone = t.status === 'done-manual' || t.status === 'done-auto';
        var isAuto = t.status === 'done-auto';
        var isInProg = t.status === 'in-progress';
        var cbStyle = 'width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:12px;';
        if (isDone && isAuto) cbStyle += 'background:#7c3aed;border:2px solid #7c3aed;color:white;';
        else if (isDone) cbStyle += 'background:#16a34a;border:2px solid #16a34a;color:white;';
        else if (isInProg) cbStyle += 'background:#fbbf24;border:2px solid #f59e0b;color:white;';
        else cbStyle += 'background:white;border:2px solid #cbd5e1;';

        var checkIcon = isDone ? (isAuto ? '★' : '✓') : isInProg ? '•' : '';
        var textStyle = isDone ? 'text-decoration:line-through;color:#94a3b8' : 'color:#475569';
        var priHtml = t.priority ? '<span style="font-size:0.65rem;font-weight:700;color:'+(t.priority==='high'?'#dc2626':t.priority==='medium'?'#d97706':'#94a3b8')+';text-transform:uppercase">'+t.priority+'</span>' : '';

        return '<div style="padding:4px 16px 4px 48px;display:flex;align-items:center;gap:8px">' +
            '<div style="'+cbStyle+'" data-task-check="'+t.id+'">'+checkIcon+'</div>' +
            '<span style="flex:1;font-size:0.825rem;'+textStyle+'">'+(isAuto?'<span style="font-size:0.65rem;background:#ede9fe;color:#7c3aed;padding:1px 5px;border-radius:4px;margin-right:4px">AI</span>':'')+t.name+'</span>' +
            priHtml + '</div>';
    }

    // --- MODULE MAP ---
    function renderModuleMap() {
        var el = document.getElementById('tab-module-map');
        if (!el) return;
        var modules = storeData.modules;

        if (modules.length === 0) {
            el.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">hub</span><p style="font-size:1.1rem;font-weight:600">Chưa có dữ liệu module</p><p style="font-size:0.875rem;margin-top:4px">Đồng bộ từ MD để tạo sơ đồ</p></div>';
            return;
        }

        var groups = {};
        modules.forEach(function(m) { var c = m.category||'other'; if(!groups[c]) groups[c]=[]; groups[c].push(m); });

        // Stats row
        var totalPct = Math.round(modules.reduce(function(s,m){return s+(m.completionPercent||0);},0)/modules.length);
        var doneCount = modules.filter(function(m){ return (m.completionPercent||0) >= 90; }).length;

        var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">' +
            _statCard(modules.length, 'Modules', '#7c3aed') +
            _statCard(doneCount, 'Hoàn thành (≥90%)', '#16a34a') +
            _statCard(totalPct + '%', 'Trung bình', '#3b82f6') +
            '</div>';

        // Category grid
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">';
        Object.keys(groups).forEach(function(cat) {
            var catMods = groups[cat];
            var catPct = Math.round(catMods.reduce(function(s,m){return s+(m.completionPercent||0);},0)/catMods.length);
            var catColor = catPct >= 90 ? '#16a34a' : catPct >= 50 ? '#d97706' : '#3b82f6';

            html += '<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">' +
                '<div style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">' +
                '<span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">'+(catLabels[cat]||cat)+' ('+catMods.length+')</span>' +
                '<span style="font-size:0.8rem;font-weight:700;color:'+catColor+'">'+catPct+'%</span></div>';

            catMods.forEach(function(m) {
                var pct = m.completionPercent||0;
                var color = pct >= 90 ? '#16a34a' : pct >= 50 ? '#d97706' : pct > 0 ? '#3b82f6' : '#94a3b8';
                var deps = m.dependencies && m.dependencies.length ? m.dependencies.join(', ') : '';
                html += '<div style="padding:10px 16px;border-bottom:1px solid #f1f5f9">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center">' +
                    '<div><span style="font-size:0.85rem;font-weight:500;color:#334155">'+(m.name||m.id)+'</span>' +
                    (deps ? '<div style="font-size:0.7rem;color:#b0b8c4;margin-top:1px">→ '+deps+'</div>' : '') +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span style="font-size:0.8rem;font-weight:600;color:'+color+'">'+pct+'%</span>' +
                    '<div class="progress-bar" style="width:64px"><div class="progress-fill" style="width:'+pct+'%;background:'+color+'"></div></div></div></div></div>';
            });
            html += '</div>';
        });
        html += '</div>';

        // Legend
        html += '<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:16px;margin-top:16px">' +
            '<div style="font-size:0.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">Chú thích</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:0.8rem">' +
            '<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:50%;background:#16a34a"></div> Done (≥90%)</div>' +
            '<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:50%;background:#d97706"></div> In Progress (≥50%)</div>' +
            '<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:50%;background:#3b82f6"></div> Started (<50%)</div>' +
            '<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:50%;background:#94a3b8"></div> Planned (0%)</div>' +
            '<div style="display:flex;align-items:center;gap:4px">→ Dependencies</div></div></div>';

        el.innerHTML = html;
    }

    // ============================================
    // TAB SWITCHING
    // ============================================
    function switchTab(tab) {
        activeTab = tab;
        localStorage.setItem('project-tracker-tab', tab);
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            var isActive = btn.getAttribute('data-tab') === tab;
            btn.style.borderColor = isActive ? '#7c3aed' : 'transparent';
            btn.style.color = isActive ? '#6d28d9' : '#64748b';
        });
        document.querySelectorAll('.tab-content').forEach(function(el) {
            el.style.display = (el.id === 'tab-' + tab) ? 'block' : 'none';
        });
        renderTab(tab);
    }

    function renderTab(tab) {
        if (tab === 'dashboard') renderDashboard();
        else if (tab === 'feature-catalog') renderFeatureCatalog();
        else if (tab === 'todo-system') renderTodoSystem();
        else if (tab === 'module-map') renderModuleMap();
    }

    // ============================================
    // SYNC & EXPORT
    // ============================================
    function syncFromMd() {
        var btn = document.getElementById('btnSyncMd');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; btn.textContent = 'Đang tải...'; }
        fetch('../docs/PROJECT-TRACKER.md')
            .then(function(resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.text(); })
            .then(function(mdText) {
                var parsed = parseMd(mdText);
                storeData.modules = parsed.modules;
                storeData.features = parsed.features;
                storeData.plans = parsed.plans;
                storeData.goals = parsed.goals;
                storeData.tasks = parsed.tasks;
                storeData.meta.syncVersion = (storeData.meta.syncVersion||0) + 1;
                storeData.meta.lastMdSync = new Date().toISOString();
                saveToLocal();
                saveToFirestore();
                renderTab(activeTab);
                showToast('Đồng bộ thành công! ' + parsed.modules.length + ' modules, ' + parsed.features.length + ' features, ' + parsed.tasks.length + ' tasks', 'success');
            })
            .catch(function(err) { showToast('Lỗi đồng bộ: ' + err.message, 'error'); })
            .finally(function() {
                if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">sync</span> Đồng bộ từ MD'; }
            });
    }

    function exportToMd() {
        var mdText = serializeToMd();
        // Create modal
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = '<div class="modal-card">' +
            '<div class="modal-header"><h3 style="font-weight:600;font-size:1.1rem">Xuất ra Markdown</h3>' +
            '<span class="material-symbols-outlined" style="cursor:pointer;color:#94a3b8" id="modalClose">close</span></div>' +
            '<div class="modal-body"><textarea readonly style="width:100%;min-height:400px;font-family:Consolas,monospace;font-size:0.8rem;padding:12px;border:1px solid #e2e8f0;border-radius:8px;resize:vertical">' + esc(mdText) + '</textarea></div>' +
            '<div class="modal-footer">' +
            '<button onclick="this.closest(\'.modal-overlay\').remove()" style="padding:8px 16px;background:#f1f5f9;color:#334155;border-radius:8px;font-size:0.875rem;border:1px solid #e2e8f0;cursor:pointer">Đóng</button>' +
            '<button id="btnCopyMd" style="padding:8px 16px;background:#7c3aed;color:white;border-radius:8px;font-size:0.875rem;border:none;cursor:pointer">Copy to Clipboard</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        overlay.querySelector('#modalClose').onclick = function() { overlay.remove(); };
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
        overlay.querySelector('#btnCopyMd').onclick = function() {
            navigator.clipboard.writeText(mdText).then(function() { showToast('Đã copy vào clipboard!', 'success'); });
        };
    }

    function showToast(msg, type) {
        var bg = type === 'success' ? '#16a34a' : type === 'error' ? '#ef4444' : '#3b82f6';
        var toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:16px;right:16px;background:'+bg+';color:white;padding:10px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:0.875rem;font-weight:500;z-index:9999;transition:opacity 0.3s;max-width:400px';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 3000);
    }

    function esc(str) { return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // ============================================
    // INIT
    // ============================================
    function init() {
        console.log('[PT] init()');
        loadFromLocal();

        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { switchTab(btn.getAttribute('data-tab')); });
        });

        var btnSync = document.getElementById('btnSyncMd');
        if (btnSync) btnSync.addEventListener('click', syncFromMd);
        var btnExport = document.getElementById('btnExportMd');
        if (btnExport) btnExport.addEventListener('click', exportToMd);

        var saved = localStorage.getItem('project-tracker-tab');
        switchTab(saved || 'dashboard');
        console.log('[PT] init done, modules:', storeData.modules.length);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
