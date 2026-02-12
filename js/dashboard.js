export function EnhancedDashboard({ data, user, activityLogs, onNavigate }) {
    const [dateMode, setDateMode] = useState('period');
    const [dateRange, setDateRange] = useState('30');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [selectedView, setSelectedView] = useState('overview');

    function useMemo(fn, deps) {
        const [memoizedValue, setMemoizedValue] = React.useState(() => fn());
        React.useEffect(() => {
            setMemoizedValue(fn());
        }, deps);
        return memoizedValue;
    }

    // Get date range for filtering
    const getChartDateRange = () => {
    const now = new Date();
    // Helper to get start/end of day
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    switch(dateMode) {
        case 'today':
            return { start: startOfDay(now), end: endOfDay(now) };
        case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
        case 'custom':
            return {
                start: customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now),
                end: customTo ? endOfDay(new Date(customTo)) : endOfDay(now)
            };
        default: // period
            const cutoff = new Date();
            cutoff.setDate(now.getDate() - parseInt(dateRange));
            return { start: startOfDay(cutoff), end: endOfDay(now) };
    }
};

    const { start: chartStart, end: chartEnd } = getChartDateRange();
    
    const filterDataByDateRange = (items, dateField = 'date') => {
        if (!items?.length) return [];
        return items.filter(item => {
            const itemDate = new Date(item[dateField]);
            return itemDate >= chartStart && itemDate <= chartEnd;
        });
    };

    // Filtered data
    const filteredDemos = filterDataByDateRange(data?.demos);
    const filteredRnD = filterDataByDateRange(data?.rnd);
    const filteredPurchases = filterDataByDateRange(data?.purchases);
    const filteredUsage = filterDataByDateRange(data?.usage);
    const filteredTaskLogs = filterDataByDateRange(activityLogs, 'created_at');

    // Calculate metrics
    const totalInventoryValue = data?.inventory?.reduce((sum, item) => 
        sum + (item.quantity * item.unit_cost || 0), 0
    ) || 0;
    
    const lowStockItems = data?.inventory?.filter(item => 
        item.quantity <= (item.reorder_level || 0)
    ) || [];
    const lowStockCount = lowStockItems.length;
    
    const totalDemoCost = filteredDemos.reduce((sum, demo) => sum + (demo.cost || 0), 0);
    const totalRnDCost = filteredRnD.reduce((sum, item) => sum + (item.cost || 0), 0);
    const totalPurchases = filteredPurchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);

    const virtualDemos = filteredDemos.filter(d => d.demo_type === 'virtual').length;
    const onsiteDemos = filteredDemos.filter(d => d.demo_type === 'onsite').length;

    // ==================== INVENTORY METRICS ====================
    const getInventoryMetrics = useMemo(() => {
        const totalItems = data?.inventory?.length || 0;
        const inStock = data?.inventory?.filter(item => item.quantity > item.reorder_level).length || 0;
        const outOfStock = totalItems - inStock;
        
        // Category breakdown from purchases
        const categoryBreakdown = {};
        filteredPurchases.forEach(purchase => {
            const category = purchase.category || 'Uncategorized';
            if (!categoryBreakdown[category]) {
                categoryBreakdown[category] = { items: 0, value: 0 };
            }
            categoryBreakdown[category].items++;
            categoryBreakdown[category].value += Number(purchase.total_amount) || 0;
        });
        
        // Supplier breakdown
        const supplierBreakdown = {};
        filteredPurchases.forEach(purchase => {
            const supplier = purchase.supplier_name || 'Unknown';
            if (!supplierBreakdown[supplier]) {
                supplierBreakdown[supplier] = { items: 0, value: 0 };
            }
            supplierBreakdown[supplier].items++;
            supplierBreakdown[supplier].value += Number(purchase.total_amount) || 0;
        });
        
        // Brand breakdown
        const brandBreakdown = {};
        data?.inventory?.forEach(item => {
            const brand = item.brand_name || 'Generic';
            if (!brandBreakdown[brand]) {
                brandBreakdown[brand] = { items: 0, value: 0 };
            }
            brandBreakdown[brand].items++;
            brandBreakdown[brand].value += (item.quantity * item.unit_cost) || 0;
        });
        
        // Usage distribution by purpose
        const usagePurposeBreakdown = {};
        filteredUsage.forEach(usage => {
            const purpose = usage.usage_purpose || 'Unknown';
            if (!usagePurposeBreakdown[purpose]) {
                usagePurposeBreakdown[purpose] = { quantity: 0, items: 0 };
            }
            usagePurposeBreakdown[purpose].items++;
            usagePurposeBreakdown[purpose].quantity += Number(usage.quantity) || 0;
        });
        
        // Issued by breakdown
        const issuedByBreakdown = {};
        filteredUsage.forEach(usage => {
            const issuedBy = usage.issued_by || 'Unknown';
            if (!issuedByBreakdown[issuedBy]) {
                issuedByBreakdown[issuedBy] = { items: 0, quantity: 0 };
            }
            issuedByBreakdown[issuedBy].items++;
            issuedByBreakdown[issuedBy].quantity += Number(usage.quantity) || 0;
        });
        
        return {
            totalItems,
            inStock,
            outOfStock,
            stockPercentage: totalItems > 0 ? ((inStock / totalItems) * 100).toFixed(1) : 0,
            categoryBreakdown: Object.entries(categoryBreakdown)
                .sort((a, b) => b[1].value - a[1].value)
                .slice(0, 5),
            supplierBreakdown: Object.entries(supplierBreakdown)
                .sort((a, b) => b[1].value - a[1].value)
                .slice(0, 5),
            brandBreakdown: Object.entries(brandBreakdown)
                .sort((a, b) => b[1].value - a[1].value)
                .slice(0, 5),
            usagePurposeBreakdown: Object.entries(usagePurposeBreakdown)
                .sort((a, b) => b[1].quantity - a[1].quantity),
            issuedByBreakdown: Object.entries(issuedByBreakdown)
                .sort((a, b) => b[1].quantity - a[1].quantity)
        };
    }, [data?.inventory, filteredPurchases, filteredUsage]);

    // ==================== RECIPE METRICS ====================
    const getRecipeMetrics = useMemo(() => {
        const allRecipes = data?.recipes || [];
        const totalRecipes = allRecipes.length;
        
        // Veg/Non-veg breakdown
        const vegRecipes = allRecipes.filter(r => r.veg_non_veg === 'VEG').length;
        const nonVegRecipes = allRecipes.filter(r => r.veg_non_veg === 'NON VEG').length;
        
        // Category breakdown
        const categoryBreakdown = {};
        allRecipes.forEach(recipe => {
            const category = recipe.category || 'Uncategorized';
            categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
        });
        
        // Cooking mode breakdown
        const cookingModeBreakdown = {};
        allRecipes.forEach(recipe => {
            const mode = recipe.cooking_mode || 'Unknown';
            cookingModeBreakdown[mode] = (cookingModeBreakdown[mode] || 0) + 1;
        });
        
        // Cost analysis
        const recipesWithCost = allRecipes.filter(r => r.total_cost > 0);
        const topCostRecipes = [...allRecipes]
            .filter(r => r.total_cost > 0)
            .sort((a, b) => b.total_cost - a.total_cost)
            .slice(0, 5);
        const lowestCostRecipes = [...allRecipes]
            .filter(r => r.total_cost > 0)
            .sort((a, b) => a.total_cost - b.total_cost)
            .slice(0, 5);
        const avgCost = recipesWithCost.length > 0 
            ? recipesWithCost.reduce((sum, r) => sum + r.total_cost, 0) / recipesWithCost.length
            : 0;
        
        // Time analysis
        const recipesWithTime = allRecipes.filter(r => r.cooking_time > 0);
        const avgTime = recipesWithTime.length > 0
            ? recipesWithTime.reduce((sum, r) => sum + r.cooking_time, 0) / recipesWithTime.length
            : 0;
        
        // Most used recipes in demos
        const recipeUsage = {};
        data?.demos?.forEach(demo => {
            if (demo.recipe_names && Array.isArray(demo.recipe_names)) {
                demo.recipe_names.forEach(recipeName => {
                    recipeUsage[recipeName] = (recipeUsage[recipeName] || 0) + 1;
                });
            }
        });
        const mostUsedRecipes = Object.entries(recipeUsage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return {
            totalRecipes,
            vegRecipes,
            nonVegRecipes,
            categoryBreakdown: Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]),
            cookingModeBreakdown: Object.entries(cookingModeBreakdown).sort((a, b) => b[1] - a[1]),
            topCostRecipes,
            lowestCostRecipes,
            avgCost,
            avgTime,
            mostUsedRecipes
        };
    }, [data?.recipes, data?.demos]);

    // ==================== DEMO METRICS ====================
    const getDemoMetrics = useMemo(() => {
        // Top clients
        const clientDemos = {};
        filteredDemos.forEach(demo => {
            const client = demo.client_name;
            if (!clientDemos[client]) {
                clientDemos[client] = { count: 0, totalCost: 0 };
            }
            clientDemos[client].count++;
            clientDemos[client].totalCost += Number(demo.cost) || 0;
        });
        const topClients = Object.entries(clientDemos)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);
        
        // Next scheduled demo
        const today = new Date();
        const upcomingDemos = (data?.demos || [])
            .filter(demo => new Date(demo.date) >= today)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const nextDemo = upcomingDemos[0] || null;
        
        // Chefs taking most demos
        const chefDemos = {};
        filteredDemos.forEach(demo => {
            const chef = demo.chef_name || 'Unassigned';
            if (!chefDemos[chef]) {
                chefDemos[chef] = { count: 0, totalCost: 0 };
            }
            chefDemos[chef].count++;
            chefDemos[chef].totalCost += Number(demo.cost) || 0;
        });
        const topChefs = Object.entries(chefDemos)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);
        
        // Sales members with most demos
        const salesDemos = {};
        filteredDemos.forEach(demo => {
            const sales = demo.sales_member || 'Unassigned';
            if (!salesDemos[sales]) {
                salesDemos[sales] = { count: 0, totalCost: 0 };
            }
            salesDemos[sales].count++;
            salesDemos[sales].totalCost += Number(demo.cost) || 0;
        });
        const topSalesMembers = Object.entries(salesDemos)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);
        
        // Demo completion rate (assuming demos in the past are completed)
        const pastDemos = (data?.demos || []).filter(demo => new Date(demo.date) < today);
        const plannedDemos = pastDemos.length;
        const completedDemos = plannedDemos; // Adjust if you have completion status
        const completionRate = plannedDemos > 0 ? ((completedDemos / plannedDemos) * 100).toFixed(1) : 100;
        
        return {
            totalDemos: filteredDemos.length,
            virtualDemos,
            onsiteDemos,
            totalCost: totalDemoCost,
            avgCost: filteredDemos.length > 0 ? totalDemoCost / filteredDemos.length : 0,
            topClients,
            nextDemo,
            topChefs,
            topSalesMembers,
            plannedDemos,
            completedDemos,
            completionRate
        };
    }, [filteredDemos, virtualDemos, onsiteDemos, totalDemoCost, data?.demos]);

    // ==================== R&D METRICS ====================
    const getRnDMetrics = useMemo(() => {
        const categoryBreakdown = {};
        filteredRnD.forEach(item => {
            const category = item.category || 'Uncategorized';
            if (!categoryBreakdown[category]) {
                categoryBreakdown[category] = { count: 0, cost: 0 };
            }
            categoryBreakdown[category].count++;
            categoryBreakdown[category].cost += Number(item.cost) || 0;
        });
        
        return {
            totalProjects: filteredRnD.length,
            totalCost: totalRnDCost,
            avgCost: filteredRnD.length > 0 ? totalRnDCost / filteredRnD.length : 0,
            categoryBreakdown: Object.entries(categoryBreakdown)
                .sort((a, b) => b[1].cost - a[1].cost)
        };
    }, [filteredRnD, totalRnDCost]);

    // ==================== TEAM METRICS ====================
    const teamComparison = useMemo(() => {
    const stats = {};

    // Grouping everything by Member Name
    filteredDemos.forEach(d => {
        const name = d.chef_name || 'Others';
        if (!stats[name]) stats[name] = { demos: 0, hours: 0, cost: 0 };
        stats[name].demos += 1;
        stats[name].cost += (Number(d.cost) || 0);
    });

    filteredTaskLogs.forEach(log => {
        const name = log.user_name || 'Others';
        if (!stats[name]) stats[name] = { demos: 0, hours: 0, cost: 0 };
        // Calculate hours from start/end
        const duration = (new Date(log.end_time) - new Date(log.start_time)) / 3600000;
        stats[name].hours += duration > 0 ? duration : 0;
    });

    return Object.entries(stats).map(([name, data]) => ({
        name,
        ...data,
        // Calculating "How much did each demo cost on average per person?"
        avgCost: data.demos > 0 ? (data.cost / data.demos).toFixed(0) : 0
    }));
}, [filteredDemos, filteredTaskLogs]);

    const getTeamMetrics = useMemo(() => {
    const teamStats = {};
    let totalHours = 0;
    
    // NEW: Task name hours breakdown
    const taskHoursBreakdown = {};
    
    filteredTaskLogs.forEach(log => {
        const member = log.user_name || log.username || 'Unknown';
        if (!teamStats[member]) {
            teamStats[member] = { 
                tasks: 0, 
                totalHours: 0, 
                taskBreakdown: {} 
            };
        }
        
        teamStats[member].tasks++;
        
        // Calculate hours if start and end time exist
        if (log.start_time && log.end_time) {
            const hours = (new Date(log.end_time) - new Date(log.start_time)) / (1000 * 60 * 60);
            if (hours > 0 && hours < 24) {
                teamStats[member].totalHours += hours;
                totalHours += hours;
                
                // NEW: Add to task hours breakdown
                const taskName = log.task_name || 'Unknown Task';
                if (!taskHoursBreakdown[taskName]) {
                    taskHoursBreakdown[taskName] = { hours: 0, count: 0 };
                }
                taskHoursBreakdown[taskName].hours += hours;
                taskHoursBreakdown[taskName].count++;
            }
        }
        
        // Task breakdown
        const task = log.task_name || 'Unknown Task';
        if (!teamStats[member].taskBreakdown[task]) {
            teamStats[member].taskBreakdown[task] = 0;
        }
        teamStats[member].taskBreakdown[task]++;
    });
    
    // Chef activity from demos
    const chefActivity = {};
    filteredDemos.forEach(demo => {
        const chef = demo.chef_name || 'Unassigned';
        if (!chefActivity[chef]) {
            chefActivity[chef] = { demos: 0, cost: 0, types: { virtual: 0, onsite: 0 } };
        }
        chefActivity[chef].demos++;
        chefActivity[chef].cost += Number(demo.cost) || 0;
        if (demo.demo_type === 'virtual') {
            chefActivity[chef].types.virtual++;
        } else {
            chefActivity[chef].types.onsite++;
        }
    });
    
    return {
        totalHours,
        teamStats: Object.entries(teamStats)
            .sort((a, b) => b[1].totalHours - a[1].totalHours),
        chefActivity: Object.entries(chefActivity)
            .sort((a, b) => b[1].demos - a[1].demos),
        taskHoursBreakdown: Object.entries(taskHoursBreakdown)
            .sort((a, b) => b[1].hours - a[1].hours)  // NEW
    };
}, [filteredTaskLogs, filteredDemos]);

    // ==================== WEEKLY ACTIVITY BY TEAM & TASKS ====================
    const getWeeklyActivityByTeam = useMemo(() => {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const teamActivity = {};
        
        filteredTaskLogs.forEach(log => {
            const member = log.user_name || 'Unknown';
            if (!teamActivity[member]) {
                teamActivity[member] = new Array(7).fill(0);
            }
            
            const logDate = new Date(log.created_at);
            const dayIndex = (logDate.getDay() + 6) % 7; // Mon = 0
            teamActivity[member][dayIndex]++;
        });
        
        return { days, teamActivity };
    }, [filteredTaskLogs]);

    //  COST TRENDS CHART
    const getTrendData = () => {
        const { start, end } = getChartDateRange();
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        let bucketCount, bucketSizeMs;
        if (diffDays <= 7) {
            bucketCount = diffDays;
            bucketSizeMs = 24 * 60 * 60 * 1000;
        } else if (diffDays <= 31) {
            bucketCount = Math.min(diffDays, 10);
            bucketSizeMs = Math.ceil(diffDays / bucketCount) * 24 * 60 * 60 * 1000;
        } else {
            bucketCount = 6;
            bucketSizeMs = Math.ceil(diffDays / 6) * 24 * 60 * 60 * 1000;
        }

        const demoCosts = new Array(bucketCount).fill(0);
        const rndCosts = new Array(bucketCount).fill(0);
        const purchaseCosts = new Array(bucketCount).fill(0);
        const periods = [];

        for (let i = 0; i < bucketCount; i++) {

            const labelDate = new Date(start.getTime() + (i * bucketSizeMs));
            if (diffDays <= 7) {
                periods.push(labelDate.toLocaleDateString('en-IN', { weekday: 'short' }));
            } else {
                periods.push(labelDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
            }
        }

        const getBucketIndex = (date) => {
            const itemTime = new Date(date).getTime();
            const bucketIndex = Math.floor((itemTime - start.getTime()) / bucketSizeMs);
            return Math.min(bucketCount - 1, Math.max(0, bucketIndex));
        };

        filteredDemos.forEach(demo => {
            const idx = getBucketIndex(demo.date);
            demoCosts[idx] += Number(demo.cost) || 0;
        });

        filteredRnD.forEach(item => {
            const idx = getBucketIndex(item.date);
            rndCosts[idx] += Number(item.cost) || 0;
        });

        filteredPurchases.forEach(purchase => {
            const idx = getBucketIndex(purchase.date);
            purchaseCosts[idx] += Number(purchase.total_amount) || 0;
        });

        const allValues = [...demoCosts, ...rndCosts, ...purchaseCosts].filter(v => v > 0);
        const maxValue = allValues.length ? Math.max(...allValues) : 1;

        return { periods, demoCosts, rndCosts, purchaseCosts, maxValue, bucketCount };
    };

    const trendData = getTrendData();

    //  COST BREAKDOWN CHART
    const categoryBreakdown = {
        'Demos': totalDemoCost,
        'R&D': totalRnDCost,
        'Purchases': totalPurchases
    };
    const totalCosts = totalDemoCost + totalRnDCost + totalPurchases;

    //  UPCOMING DEMOS
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);
    const upcomingDemos = (data?.demos || []).filter(demo => {
        const demoDate = new Date(demo.date);
        return demoDate >= today && demoDate <= weekFromNow;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    //  MONTHLY GOALS
    const monthlyGoals = {
        demos: { target: 120, current: filteredDemos.length, icon: '🎯' },
        spending: { target: 500000, current: totalCosts, icon: '💰' },
        recipes: { target: 500, current: data?.recipes?.length || 0, icon: '📖' },
        // efficiency: { target: 95, current: 87, icon: '⚡' }
    };

    //  EXPORT TO CSV
    const exportToCSV = (dataType) => {
        try {
            let csvContent = '', filename = '';
            const dateLabel = dateMode === 'today' ? 'today' : dateMode === 'yesterday' ? 'yesterday' : dateRange + 'days';
            
            if (dataType === 'demos' && data?.demos?.length) {
                csvContent = 'Client,Type,Date,Cost,Chef,Sales Member\n';
                data.demos.forEach(demo => {
                    csvContent += `"${demo.client_name || ''}","${demo.demo_type || ''}","${demo.date || ''}",${demo.cost || 0},"${demo.chef_name || ''}","${demo.sales_member || ''}"\n`;
                });
                filename = `demos_${dateLabel}_${new Date().toISOString().slice(0,10)}.csv`;
            } else if (dataType === 'inventory' && data?.inventory?.length) {
                csvContent = 'Product,Brand,Qty,Unit,UnitCost,Total,Status\n';
                data.inventory.forEach(item => {
                    const total = (item.quantity * item.unit_cost || 0).toFixed(2);
                    const status = item.quantity <= (item.reorder_level || 999) ? 'LOW STOCK' : 'OK';
                    csvContent += `"${item.product_name}","${item.brand_name}",${item.quantity},"${item.unit}",${item.unit_cost},${total},"${status}"\n`;
                });
                filename = `inventory_${new Date().toISOString().slice(0,10)}.csv`;
            }
            
            if (csvContent) {
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Export failed:', error);
        }
        setShowExportMenu(false);
    };

    return (
        <div className="enhanced-dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">Welcome back, {user?.name || 'Team'}! 👋</h1>
                    <p className="dashboard-subtitle">
                        {dateMode === 'today' ? "Today's" : 
                         dateMode === 'yesterday' ? "Yesterday's" : 
                         dateMode === 'custom' ? `Custom: ${customFrom || ''} to ${customTo || ''}` : 
                         `Last ${dateRange} days`} • {filteredDemos.length} demos • ₹{(totalCosts/1000).toFixed(1)}K spend
                    </p>
                </div>
                <div className="dashboard-controls">
                    <div className="timeline-controls">
                        <select 
                            className="timeline-select" 
                            value={dateMode} 
                            onChange={e => {
                                setDateMode(e.target.value);
                                if (e.target.value !== 'custom') {
                                    setCustomFrom('');
                                    setCustomTo('');
                                }
                            }}
                        >
                            <option value="period">Period</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="custom">Custom Range</option>
                        </select>
                        
                        {dateMode === 'period' && (
                            <select className="period-select" value={dateRange} onChange={e => setDateRange(e.target.value)}>
                                <option value="7">7 days</option>
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                                <option value="365">1 year</option>
                            </select>
                        )}
                        
                        {dateMode === 'custom' && (
                            <div className="custom-dates">
                                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                                <span>to</span>
                                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                            </div>
                        )}
                    </div>
                    
                    <div className="export-dropdown">
                        <button className="btn-export" onClick={() => setShowExportMenu(!showExportMenu)}>
                            📥 Export
                        </button>
                        {showExportMenu && (
                            <div className="export-menu">
                                <button onClick={() => exportToCSV('demos')}>Export Demos</button>
                                <button onClick={() => exportToCSV('inventory')}>Export Inventory</button>
                                <button onClick={() => window.print()}>Print Dashboard</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* View Switcher */}
            <div className="view-switcher-section">
                <div className="view-switcher">
                    <button className={`view-tab ${selectedView === 'overview' ? 'active' : ''}`} onClick={() => setSelectedView('overview')}>
                        📊 Overview
                    </button>
                    <button className={`view-tab ${selectedView === 'demos' ? 'active' : ''}`} onClick={() => setSelectedView('demos')}>
                        🎯 Demos
                    </button>
                    <button className={`view-tab ${selectedView === 'inventory' ? 'active' : ''}`} onClick={() => setSelectedView('inventory')}>
                        📦 Inventory
                    </button>
                    <button className={`view-tab ${selectedView === 'recipes' ? 'active' : ''}`} onClick={() => setSelectedView('recipes')}>
                        📖 Recipes
                    </button>
                    <button className={`view-tab ${selectedView === 'rnd' ? 'active' : ''}`} onClick={() => setSelectedView('rnd')}>
                        🔬 R&D
                    </button>
                    <button className={`view-tab ${selectedView === 'team' ? 'active' : ''}`} onClick={() => setSelectedView('team')}>
                        👥 Team
                    </button>
                </div>
            </div>

            {/* ==================== OVERVIEW VIEW ==================== */}
            {selectedView === 'overview' && (
                <>
                    {/* Key Metrics */}
                    <div className="metrics-grid">
                        <div className="metric-card primary">
                            <div className="metric-icon">💰</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Spend</div>
                                <div className="metric-value">₹{(totalCosts / 1000).toFixed(1)}K</div>
                                <div className="metric-trend positive">Last {dateRange} days</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">🎯</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Demos</div>
                                <div className="metric-value">{filteredDemos.length}</div>
                                <div className="metric-breakdown">
                                    {virtualDemos} Virtual • {onsiteDemos} Onsite
                                </div>
                            </div>
                        </div>
                        <div className="metric-card warning">
                            <div className="metric-icon">📦</div>
                            <div className="metric-content">
                                <div className="metric-label">Inventory</div>
                                <div className="metric-value">₹{(totalInventoryValue / 1000).toFixed(1)}K</div>
                                <div className="metric-breakdown">{lowStockCount} low stock</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">🔬</div>
                            <div className="metric-content">
                                <div className="metric-label">R&D</div>
                                <div className="metric-value">₹{(totalRnDCost / 1000).toFixed(1)}K</div>
                                <div className="metric-breakdown">{filteredRnD.length} projects</div>
                            </div>
                        </div>
                    </div>

                    {/* Monthly Goals */}
                    <div className="goals-section">
                        <h3 className="section-title">📈 Monthly Goals</h3>
                        <div className="goals-grid">
                            {Object.entries(monthlyGoals).map(([key, goal]) => {
                                const progress = Math.min((goal.current / goal.target) * 100, 100);
                                const isOnTrack = progress >= 70;
                                
                                return (
                                    <div key={key} className="goal-card">
                                        <div className="goal-header">
                                            <span className="goal-icon">{goal.icon}</span>
                                            <span className="goal-name">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                                            <span className={`goal-status ${isOnTrack ? 'on-track' : 'behind'}`}>
                                                {isOnTrack ? '✓' : '⚠'}
                                            </span>
                                        </div>
                                        <div className="goal-progress">
                                            <div className="progress-bar">
                                                <div 
                                                    className="progress-fill"
                                                    style={{
                                                        width: `${progress}%`,
                                                        background: isOnTrack ? 'linear-gradient(90deg, #ffffff 0%, #cccccc 100%)' : 'linear-gradient(90deg, #ff3333 0%, #cc0000 100%)'
                                                    }}
                                                ></div>
                                            </div>
                                            <div className="progress-text">
                                                {key === 'spending' ? 
                                                    `₹${(goal.current / 1000).toFixed(1)}K / ₹${(goal.target / 1000).toFixed(1)}K` :
                                                    `${goal.current} / ${goal.target}`
                                                }
                                            </div>
                                        </div>
                                        <div className="goal-percentage">{progress.toFixed(0)}%</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="charts-row">
                        {/* COST TRENDS CHART */}
                        <div className="chart-card large">
                            <div className="chart-header">
                                <h3>📈 Spending Trends</h3>
                                <div className="chart-legend">
                                    <span className="legend-item">
                                        <span className="legend-dot demo"></span> Demos ₹{(totalDemoCost/1000).toFixed(1)}K
                                    </span>
                                    <span className="legend-item">
                                        <span className="legend-dot rnd"></span> R&D ₹{(totalRnDCost/1000).toFixed(1)}K
                                    </span>
                                    <span className="legend-item">
                                        <span className="legend-dot purchase"></span> Purchases ₹{(totalPurchases/1000).toFixed(1)}K
                                    </span>
                                </div>
                            </div>
                            <div className="chart-body">
                                {trendData.periods.length === 0 || trendData.maxValue === 0 ? (
                                    <div className="no-data">No data in selected period</div>
                                ) : (
                                    <div className="simple-bar-chart">
                                        {trendData.periods.map((period, index) => {
                                            const demoHeight = trendData.demoCosts[index] > 0 
                                                ? (trendData.demoCosts[index] / trendData.maxValue) * 100 
                                                : 0;
                                            const rndHeight = trendData.rndCosts[index] > 0 
                                                ? (trendData.rndCosts[index] / trendData.maxValue) * 100 
                                                : 0;
                                            const purchaseHeight = trendData.purchaseCosts[index] > 0 
                                                ? (trendData.purchaseCosts[index] / trendData.maxValue) * 100 
                                                : 0;
                                            const totalCost = trendData.demoCosts[index] + trendData.rndCosts[index] + trendData.purchaseCosts[index];

                                            return (
                                                <div key={`${period}-${index}`} className="chart-column">
                                                    <div className="chart-bars">
                                                        {demoHeight > 0 && (
                                                            <div 
                                                                className="chart-bar demo"
                                                                style={{ height: `${demoHeight}%` }}
                                                                title={`Demo: ₹${trendData.demoCosts[index].toLocaleString()}`}
                                                            />
                                                        )}
                                                        {rndHeight > 0 && (
                                                            <div 
                                                                className="chart-bar rnd"
                                                                style={{ height: `${rndHeight}%` }}
                                                                title={`R&D: ₹${trendData.rndCosts[index].toLocaleString()}`}
                                                            />
                                                        )}
                                                        {purchaseHeight > 0 && (
                                                            <div 
                                                                className="chart-bar purchase"
                                                                style={{ height: `${purchaseHeight}%` }}
                                                                title={`Purchases: ₹${trendData.purchaseCosts[index].toLocaleString()}`}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="chart-label">{period}</div>
                                                    {totalCost > 0 && (
                                                        <div className="chart-value">₹{(totalCost/1000).toFixed(1)}K</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COST BREAKDOWN */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>💸 Spending Breakdown</h3>
                                <div className="chart-subtitle">Total: ₹{(totalCosts/1000).toFixed(1)}K</div>
                            </div>
                            <div className="chart-body">
                                {totalCosts === 0 ? (
                                    <div className="no-data">No costs in period</div>
                                ) : (
                                    <div className="cost-breakdown">
                                        {Object.entries(categoryBreakdown).map(([category, amount]) => {
                                            const percentage = totalCosts > 0 ? (amount / totalCosts) * 100 : 0;
                                            
                                            return (
                                                <div key={category} className="breakdown-item">
                                                    <div className="breakdown-header">
                                                        <span className="breakdown-name">
                                                            <span className="breakdown-dot" style={{
                                                                background: category === 'Demos' ? '#ff3333' : 
                                                                           category === 'R&D' ? '#ffffff' : '#666'
                                                            }}></span>
                                                            {category}
                                                        </span>
                                                        <span className="breakdown-value">₹{(amount/1000).toFixed(1)}K</span>
                                                    </div>
                                                    <div className="breakdown-bar">
                                                        <div 
                                                            className="breakdown-fill"
                                                            style={{ 
                                                                width: `${percentage}%`,
                                                                background: category === 'Demos' ? 'linear-gradient(90deg, #ff3333 0%, #cc0000 100%)' : 
                                                                           category === 'R&D' ? 'linear-gradient(90deg, #ffffff 0%, #cccccc 100%)' :
                                                                           'linear-gradient(90deg, #666 0%, #444 100%)'
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <div className="breakdown-percentage">{percentage.toFixed(1)}%</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Team Activity Section */}
                    {/* ==================== RECENT TASK LOGS ==================== */}
                    <div className="chart-card">
                        <div className="chart-header">
                            <div>
                            <h3 className="chart-title">Recent Task Logs</h3>
                            <div className="chart-subtitle">
                                Latest {Math.min(3, filteredTaskLogs.length)} activities
                            </div>
                            </div>
                        </div>

                        <div className="chart-body">
                            {filteredTaskLogs.length === 0 ? (
                            <div className="no-data">
                                <div className="no-data-icon">📝</div>
                                <div className="no-data-title">No task logs yet</div>
                                <div className="no-data-subtitle">
                                Log some tasks to see activity here
                                </div>
                            </div>
                            ) : (
                            <div className="task-logs-list">
                                {filteredTaskLogs.slice(0, 3).map((log, index) => {
                                const startDate = log.start_time ? new Date(log.start_time) : null;
                                const endDate = log.end_time ? new Date(log.end_time) : null;

                                const duration =
                                    endDate &&
                                    startDate &&
                                    !isNaN(endDate.getTime()) &&
                                    !isNaN(startDate.getTime())
                                    ? Math.floor((endDate - startDate) / 60000)
                                    : 0;

                                return (
                                    <div key={log.id || index} className="task-log-item">
                                    <div className="task-log-left">
                                        <div className="task-log-avatar">
                                        {(log.user_name || log.username || "U")
                                            .charAt(0)
                                            .toUpperCase()}
                                        </div>

                                        <div className="task-log-content">
                                        <div className="task-log-top">
                                            <span className="task-log-user">
                                            {log.user_name || log.username || "Unknown"}
                                            </span>
                                            <span className="task-log-rank">
                                            #{index + 1}
                                            </span>
                                        </div>

                                        <div className="task-log-task">
                                            {log.task_name || "Unnamed Task"}
                                        </div>

                                        <div className="task-log-time">
                                            {startDate ? formatTime(log.start_time) : "-"} –{" "}
                                            {endDate ? formatTime(log.end_time) : "Ongoing"}
                                        </div>

                                        {log.notes && (
                                            <div
                                            className="task-log-notes"
                                            title={log.notes}
                                            >
                                            📝 {log.notes}
                                            </div>
                                        )}
                                        </div>
                                    </div>

                                    <div className="task-log-duration">
                                        {formatDuration(duration)}
                                    </div>
                                    </div>
                                );
                                })}
                            </div>
                            )}
                        </div>
                        </div>



                    {/* Content Row */}
                    <div className="content-row">
                        {/* UPCOMING DEMOS */}
                        <div className="content-card">
                            <div className="content-header">
                                <h3>📅 Upcoming Demos</h3>
                                <button className="view-all-btn" onClick={() => setSelectedView('demos')}>
                                    View All →
                                </button>
                            </div>
                            <div className="content-body">
                                {upcomingDemos.length === 0 ? (
                                    <div className="empty-state-small">
                                        <div className="empty-icon">📅</div>
                                        <div className="empty-text">No upcoming demos</div>
                                    </div>
                                ) : (
                                    <div className="upcoming-list">
                                        {upcomingDemos.slice(0, 5).map((demo, idx) => (
                                            <div key={demo.id || idx} className="upcoming-item">
                                                <div className="upcoming-date">
                                                    <div className="date-day">{new Date(demo.date).getDate()}</div>
                                                    <div className="date-month">
                                                        {new Date(demo.date).toLocaleDateString('en-US', { month: 'short' })}
                                                    </div>
                                                </div>
                                                <div className="upcoming-details">
                                                    <div className="upcoming-client">{demo.client_name}</div>
                                                    <div className="upcoming-meta">
                                                        <span className={`type-badge ${demo.demo_type}`}>
                                                            {demo.demo_type === 'virtual' ? '💻' : '🏢'} {demo.demo_type}
                                                        </span>
                                                        <span className="demo-cost">₹{demo.cost?.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* QUICK ACTIONS */}
                        <div className="content-card">
                            <div className="content-header">
                                <h3>⚡ Quick Actions</h3>
                            </div>
                            <div className="content-body">
                                <div className="quick-actions">
                                    <button className="quick-action-btn" onClick={() => onNavigate('demos')}>
                                        <div className="action-icon">🎯</div>
                                        <div className="action-label">Schedule Demo</div>
                                    </button>
                                    <button className="quick-action-btn" onClick={() => onNavigate('recipes')}>
                                        <div className="action-icon">📖</div>
                                        <div className="action-label">Add Recipe</div>
                                    </button>
                                    <button className="quick-action-btn" onClick={() => onNavigate('purchases')}>
                                        <div className="action-icon">🛒</div>
                                        <div className="action-label">Record Purchase</div>
                                    </button>
                                    <button className="quick-action-btn" onClick={() => onNavigate('rnd')}>
                                        <div className="action-icon">🔬</div>
                                        <div className="action-label">Log R&D</div>
                                    </button>
                                    <button className="quick-action-btn" onClick={() => onNavigate('inventory')}>
                                        <div className="action-icon">📦</div>
                                        <div className="action-label">Check Stock</div>
                                    </button>
                                    <button className="quick-action-btn" onClick={() => onNavigate('logs')}>
                                        <div className="action-icon">⏱️</div>
                                        <div className="action-label">Log Time</div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ==================== DEMOS VIEW ==================== */}
            {selectedView === 'demos' && (
                <div className="analytics-view">
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">🎯</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Demos</div>
                                <div className="metric-value">{getDemoMetrics.totalDemos}</div>
                                <div className="metric-breakdown">{virtualDemos} Virtual • {onsiteDemos} Onsite</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">💰</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Cost</div>
                                <div className="metric-value">₹{(getDemoMetrics.totalCost / 1000).toFixed(1)}K</div>
                                <div className="metric-breakdown">Avg: ₹{getDemoMetrics.avgCost.toFixed(0)}</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon"></div>
                            <div className="metric-content">
                                <div className="metric-label">Completion Rate</div>
                                <div className="metric-value">{getDemoMetrics.completionRate}%</div>
                                <div className="metric-breakdown">{getDemoMetrics.completedDemos}/{getDemoMetrics.plannedDemos}</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">📅</div>
                            <div className="metric-content">
                                <div className="metric-label">Next Demo</div>
                                <div className="metric-value" style={{ fontSize: '16px' }}>
                                    {getDemoMetrics.nextDemo ? getDemoMetrics.nextDemo.client_name : 'None'}
                                </div>
                                <div className="metric-breakdown">
                                    {getDemoMetrics.nextDemo ? new Date(getDemoMetrics.nextDemo.date).toLocaleDateString() : '-'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Demo Type Distribution */}
                    <div className="chart-card" style={{ marginBottom: '24px' }}>
                        <div className="chart-header">
                            <h3>📊 Demo Type Distribution</h3>
                        </div>
                        <div className="chart-body">
                            <div className="demo-types-chart">
                                <div className="demo-type-item">
                                    <div className="type-icon">💻</div>
                                    <div className="type-info">
                                        <div className="type-label">Virtual Demos</div>
                                        <div className="type-value">{virtualDemos}</div>
                                    </div>
                                    <div className="type-percentage">
                                        {getDemoMetrics.totalDemos > 0 ? ((virtualDemos / getDemoMetrics.totalDemos) * 100).toFixed(0) : 0}%
                                    </div>
                                </div>
                                <div className="demo-type-item">
                                    <div className="type-icon">🏢</div>
                                    <div className="type-info">
                                        <div className="type-label">Onsite Demos</div>
                                        <div className="type-value">{onsiteDemos}</div>
                                    </div>
                                    <div className="type-percentage">
                                        {getDemoMetrics.totalDemos > 0 ? ((onsiteDemos / getDemoMetrics.totalDemos) * 100).toFixed(0) : 0}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="charts-row">
                        {/* Top Clients */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>👥 Top Clients</h3>
                            </div>
                            <div className="chart-body">
                                {getDemoMetrics.topClients.length === 0 ? (
                                    <div className="no-data">No client data</div>
                                ) : (
                                    <div className="top-items-list">
                                        {getDemoMetrics.topClients.map(([client, stats], index) => (
                                            <div key={client} className="top-item">
                                                <div className="item-rank">#{index + 1}</div>
                                                <div className="item-info">
                                                    <div className="item-name">{client}</div>
                                                    <div className="item-stats">
                                                        {stats.count} demos • ₹{(stats.totalCost/1000).toFixed(1)}K
                                                    </div>
                                                </div>
                                                <div className="item-badge">{stats.count}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Chefs with Most Demos */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>👨‍🍳 Chef Demo Analysis</h3>
                            </div>
                            <div className="chart-body">
                                {getDemoMetrics.topChefs.length === 0 ? (
                                    <div className="no-data">No chef data</div>
                                ) : (
                                    <div className="chef-performance-list">
                                        {getDemoMetrics.topChefs.map(([chef, stats], index) => {
                                            const maxCount = getDemoMetrics.topChefs[0][1].count;
                                            const percentage = (stats.count / maxCount) * 100;
                                            
                                            return (
                                                <div key={chef} className="chef-item">
                                                    <div className="chef-rank">#{index + 1}</div>
                                                    <div className="chef-details">
                                                        <div className="chef-name">{chef}</div>
                                                        <div className="chef-bar">
                                                            <div 
                                                                className="chef-bar-fill"
                                                                style={{ width: `${percentage}%` }}
                                                            ></div>
                                                        </div>
                                                        <div className="chef-stats">
                                                            {stats.count} demos • ₹{(stats.totalCost/1000).toFixed(1)}K
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sales Members */}
                    <div className="chart-card" style={{ marginTop: '24px' }}>
                        <div className="chart-header">
                            <h3>💼 Top Sales Members</h3>
                        </div>
                        <div className="chart-body">
                            {getDemoMetrics.topSalesMembers.length === 0 ? (
                                <div className="no-data">No sales data</div>
                            ) : (
                                <div className="top-items-list">
                                    {getDemoMetrics.topSalesMembers.map(([sales, stats], index) => (
                                        <div key={sales} className="top-item">
                                            <div className="item-rank">#{index + 1}</div>
                                            <div className="item-info">
                                                <div className="item-name">{sales}</div>
                                                <div className="item-stats">
                                                    {stats.count} demos • ₹{(stats.totalCost/1000).toFixed(1)}K
                                                </div>
                                            </div>
                                            <div className="item-badge">{stats.count}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== INVENTORY VIEW ==================== */}
            {selectedView === 'inventory' && (
                <div className="analytics-view">
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">📦</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Items</div>
                                <div className="metric-value">{getInventoryMetrics.totalItems}</div>
                                <div className="metric-breakdown">In inventory</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon"></div>
                            <div className="metric-content">
                                <div className="metric-label">In Stock</div>
                                <div className="metric-value">{getInventoryMetrics.inStock}</div>
                                <div className="metric-breakdown">{getInventoryMetrics.stockPercentage}%</div>
                            </div>
                        </div>
                        <div className="metric-card warning">
                            <div className="metric-icon">⚠️</div>
                            <div className="metric-content">
                                <div className="metric-label">Out of Stock</div>
                                <div className="metric-value">{getInventoryMetrics.outOfStock}</div>
                                <div className="metric-breakdown">Need restock</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">💰</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Value</div>
                                <div className="metric-value">₹{(totalInventoryValue / 1000).toFixed(1)}K</div>
                                <div className="metric-breakdown">Inventory worth</div>
                            </div>
                        </div>
                    </div>

                    {/* Category & Supplier Breakdown */}
                    <div className="charts-row">
                        {/* Category Breakdown */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>📂 Category Breakdown</h3>
                                <div className="chart-subtitle">From purchases</div>
                            </div>
                            <div className="chart-body">
                                {getInventoryMetrics.categoryBreakdown.length === 0 ? (
                                    <div className="no-data">No category data</div>
                                ) : (
                                    <div className="cost-breakdown">
                                        {getInventoryMetrics.categoryBreakdown.map(([category, data]) => {
                                            const maxValue = getInventoryMetrics.categoryBreakdown[0][1].value;
                                            const percentage = (data.value / maxValue) * 100;
                                            
                                            return (
                                                <div key={category} className="breakdown-item">
                                                    <div className="breakdown-header">
                                                        <span className="breakdown-name">
                                                            <span className="breakdown-dot" style={{ background: '#ff3333' }}></span>
                                                            {category}
                                                        </span>
                                                        <span className="breakdown-value">₹{(data.value/1000).toFixed(1)}K</span>
                                                    </div>
                                                    <div className="breakdown-bar">
                                                        <div 
                                                            className="breakdown-fill"
                                                            style={{ width: `${percentage}%` }}
                                                        ></div>
                                                    </div>
                                                    <div className="breakdown-percentage">{data.items} items</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Supplier Breakdown */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>🏪 Supplier Breakdown</h3>
                            </div>
                            <div className="chart-body">
                                {getInventoryMetrics.supplierBreakdown.length === 0 ? (
                                    <div className="no-data">No supplier data</div>
                                ) : (
                                    <div className="cost-breakdown">
                                        {getInventoryMetrics.supplierBreakdown.map(([supplier, data]) => {
                                            const maxValue = getInventoryMetrics.supplierBreakdown[0][1].value;
                                            const percentage = (data.value / maxValue) * 100;
                                            
                                            return (
                                                <div key={supplier} className="breakdown-item">
                                                    <div className="breakdown-header">
                                                        <span className="breakdown-name">
                                                            <span className="breakdown-dot" style={{ background: '#ffffff' }}></span>
                                                            {supplier}
                                                        </span>
                                                        <span className="breakdown-value">₹{(data.value/1000).toFixed(1)}K</span>
                                                    </div>
                                                    <div className="breakdown-bar">
                                                        <div 
                                                            className="breakdown-fill"
                                                            style={{ 
                                                                width: `${percentage}%`,
                                                                background: 'linear-gradient(90deg, #ffffff 0%, #cccccc 100%)'
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <div className="breakdown-percentage">{data.items} items</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Brand & Usage Breakdown */}
                    <div className="charts-row">
                        {/* Brand Breakdown */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>🏷️ Brand Breakdown</h3>
                            </div>
                            <div className="chart-body">
                                {getInventoryMetrics.brandBreakdown.length === 0 ? (
                                    <div className="no-data">No brand data</div>
                                ) : (
                                    <div className="top-items-list">
                                        {getInventoryMetrics.brandBreakdown.map(([brand, data], index) => (
                                            <div key={brand} className="top-item">
                                                <div className="item-rank">#{index + 1}</div>
                                                <div className="item-info">
                                                    <div className="item-name">{brand}</div>
                                                    <div className="item-stats">
                                                        {data.items} items • ₹{(data.value/1000).toFixed(1)}K
                                                    </div>
                                                </div>
                                                <div className="item-badge">{data.items}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Usage Purpose Breakdown */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>📊 Usage Distribution</h3>
                            </div>
                            <div className="chart-body">
                                {getInventoryMetrics.usagePurposeBreakdown.length === 0 ? (
                                    <div className="no-data">No usage data</div>
                                ) : (
                                    <div className="demo-types-chart">
                                        {getInventoryMetrics.usagePurposeBreakdown.map(([purpose, data]) => {
                                            const totalQty = getInventoryMetrics.usagePurposeBreakdown.reduce((sum, [, d]) => sum + d.quantity, 0);
                                            const percentage = totalQty > 0 ? ((data.quantity / totalQty) * 100).toFixed(0) : 0;
                                            
                                            return (
                                                <div key={purpose} className="demo-type-item">
                                                    <div className="type-icon">📦</div>
                                                    <div className="type-info">
                                                        <div className="type-label">{purpose}</div>
                                                        <div className="type-value">{data.items} items</div>
                                                    </div>
                                                    <div className="type-percentage">{percentage}%</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Issued By Breakdown */}
                    {getInventoryMetrics.issuedByBreakdown.length > 0 && (
                        <div className="chart-card" style={{ marginTop: '24px' }}>
                            <div className="chart-header">
                                <h3>👤 Issued By Breakdown</h3>
                            </div>
                            <div className="chart-body">
                                <div className="top-items-list">
                                    {getInventoryMetrics.issuedByBreakdown.map(([person, data], index) => (
                                        <div key={person} className="top-item">
                                            <div className="item-rank">#{index + 1}</div>
                                            <div className="item-info">
                                                <div className="item-name">{person}</div>
                                                <div className="item-stats">{data.items} items issued</div>
                                            </div>
                                            <div className="item-badge">{data.items}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ==================== RECIPES VIEW ==================== */}
            {selectedView === 'recipes' && (
                <div className="analytics-view">
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">📖</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Recipes</div>
                                <div className="metric-value">{getRecipeMetrics.totalRecipes}</div>
                                <div className="metric-breakdown">In database</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">🥗</div>
                            <div className="metric-content">
                                <div className="metric-label">Veg Recipes</div>
                                <div className="metric-value">{getRecipeMetrics.vegRecipes}</div>
                                <div className="metric-breakdown">
                                    {getRecipeMetrics.totalRecipes > 0 ? 
                                        ((getRecipeMetrics.vegRecipes / getRecipeMetrics.totalRecipes) * 100).toFixed(0) : 0}%
                                </div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">🍖</div>
                            <div className="metric-content">
                                <div className="metric-label">Non-Veg Recipes</div>
                                <div className="metric-value">{getRecipeMetrics.nonVegRecipes}</div>
                                <div className="metric-breakdown">
                                    {getRecipeMetrics.totalRecipes > 0 ? 
                                        ((getRecipeMetrics.nonVegRecipes / getRecipeMetrics.totalRecipes) * 100).toFixed(0) : 0}%
                                </div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">💰</div>
                            <div className="metric-content">
                                <div className="metric-label">Avg Cost</div>
                                <div className="metric-value">₹{getRecipeMetrics.avgCost.toFixed(0)}</div>
                                <div className="metric-breakdown">Per recipe</div>
                            </div>
                        </div>
                    </div>

                    {/* Recipe Categories & Cooking Modes */}
                    <div className="charts-row">
                        {/* Category Breakdown */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>📂 Recipe Categories</h3>
                            </div>
                            <div className="chart-body">
                                {getRecipeMetrics.categoryBreakdown.length === 0 ? (
                                    <div className="no-data">No category data</div>
                                ) : (
                                    <div className="demo-types-chart">
                                        {getRecipeMetrics.categoryBreakdown.slice(0, 5).map(([category, count]) => {
                                            const percentage = getRecipeMetrics.totalRecipes > 0 ? 
                                                ((count / getRecipeMetrics.totalRecipes) * 100).toFixed(0) : 0;
                                            
                                            return (
                                                <div key={category} className="demo-type-item">
                                                    <div className="type-icon">🍽️</div>
                                                    <div className="type-info">
                                                        <div className="type-label">{category}</div>
                                                        <div className="type-value">{count}</div>
                                                    </div>
                                                    <div className="type-percentage">{percentage}%</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Cooking Mode Breakdown */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>🔥 Cooking Modes</h3>
                            </div>
                            <div className="chart-body">
                                {getRecipeMetrics.cookingModeBreakdown.length === 0 ? (
                                    <div className="no-data">No cooking mode data</div>
                                ) : (
                                    <div className="demo-types-chart">
                                        {getRecipeMetrics.cookingModeBreakdown.slice(0, 5).map(([mode, count]) => {
                                            const percentage = getRecipeMetrics.totalRecipes > 0 ? 
                                                ((count / getRecipeMetrics.totalRecipes) * 100).toFixed(0) : 0;
                                            
                                            return (
                                                <div key={mode} className="demo-type-item">
                                                    <div className="type-icon">🔥</div>
                                                    <div className="type-info">
                                                        <div className="type-label">{mode}</div>
                                                        <div className="type-value">{count}</div>
                                                    </div>
                                                    <div className="type-percentage">{percentage}%</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Top & Bottom Cost Recipes */}
                    <div className="charts-row">
                        {/* Highest Cost Recipes */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>💎 Highest Cost Recipes</h3>
                            </div>
                            <div className="chart-body">
                                {getRecipeMetrics.topCostRecipes.length === 0 ? (
                                    <div className="no-data">No cost data</div>
                                ) : (
                                    <div className="top-items-list">
                                        {getRecipeMetrics.topCostRecipes.map((recipe, index) => (
                                            <div key={recipe.id} className="top-item">
                                                <div className="item-rank">#{index + 1}</div>
                                                <div className="item-info">
                                                    <div className="item-name">{recipe.name}</div>
                                                    <div className="item-stats">
                                                        {recipe.cooking_time ? `${recipe.cooking_time} mins` : 'Time N/A'}
                                                    </div>
                                                </div>
                                                <div className="item-badge">₹{recipe.total_cost.toFixed(0)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Lowest Cost Recipes */}
                        <div className="chart-card">
                            <div className="chart-header">
                                <h3>💵 Lowest Cost Recipes</h3>
                            </div>
                            <div className="chart-body">
                                {getRecipeMetrics.lowestCostRecipes.length === 0 ? (
                                    <div className="no-data">No cost data</div>
                                ) : (
                                    <div className="top-items-list">
                                        {getRecipeMetrics.lowestCostRecipes.map((recipe, index) => (
                                            <div key={recipe.id} className="top-item">
                                                <div className="item-rank">#{index + 1}</div>
                                                <div className="item-info">
                                                    <div className="item-name">{recipe.name}</div>
                                                    <div className="item-stats">
                                                        {recipe.cooking_time ? `${recipe.cooking_time} mins` : 'Time N/A'}
                                                    </div>
                                                </div>
                                                <div className="item-badge">₹{recipe.total_cost.toFixed(0)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Most Used Recipes */}
                    <div className="chart-card" style={{ marginTop: '24px' }}>
                        <div className="chart-header">
                            <h3>⭐ Most Used in Demos</h3>
                            <div className="chart-subtitle">Avg time: {getRecipeMetrics.avgTime.toFixed(0)} mins</div>
                        </div>
                        <div className="chart-body">
                            {getRecipeMetrics.mostUsedRecipes.length === 0 ? (
                                <div className="no-data">No usage data</div>
                            ) : (
                                <div className="top-items-list">
                                    {getRecipeMetrics.mostUsedRecipes.map(([recipe, count], index) => (
                                        <div key={recipe} className="top-item">
                                            <div className="item-rank">#{index + 1}</div>
                                            <div className="item-info">
                                                <div className="item-name">{recipe}</div>
                                                <div className="item-stats">Used in {count} demos</div>
                                            </div>
                                            <div className="item-badge">{count}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== R&D VIEW ==================== */}
            {selectedView === 'rnd' && (
                <div className="analytics-view">
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">🔬</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Projects</div>
                                <div className="metric-value">{getRnDMetrics.totalProjects}</div>
                                <div className="metric-breakdown">R&D initiatives</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">💰</div>
                            <div className="metric-content">
                                <div className="metric-label">Total Cost</div>
                                <div className="metric-value">₹{(getRnDMetrics.totalCost / 1000).toFixed(1)}K</div>
                                <div className="metric-breakdown">Avg: ₹{getRnDMetrics.avgCost.toFixed(0)}</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">📊</div>
                            <div className="metric-content">
                                <div className="metric-label">Categories</div>
                                <div className="metric-value">{getRnDMetrics.categoryBreakdown.length}</div>
                                <div className="metric-breakdown">Active areas</div>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">📈</div>
                            <div className="metric-content">
                                <div className="metric-label">This Period</div>
                                <div className="metric-value">{filteredRnD.length}</div>
                                <div className="metric-breakdown">Projects</div>
                            </div>
                        </div>
                    </div>

                    {/* R&D Category Breakdown */}
                    <div className="chart-card" style={{ marginBottom: '24px' }}>
                        <div className="chart-header">
                            <h3>📂 R&D Category Breakdown</h3>
                            <div className="chart-subtitle">By cost</div>
                        </div>
                        <div className="chart-body">
                            {getRnDMetrics.categoryBreakdown.length === 0 ? (
                                <div className="no-data">No R&D data</div>
                            ) : (
                                <div className="cost-breakdown">
                                    {getRnDMetrics.categoryBreakdown.map(([category, data]) => {
                                        const maxCost = getRnDMetrics.categoryBreakdown[0][1].cost;
                                        const percentage = maxCost > 0 ? (data.cost / maxCost) * 100 : 0;
                                        
                                        return (
                                            <div key={category} className="breakdown-item">
                                                <div className="breakdown-header">
                                                    <span className="breakdown-name">
                                                        <span className="breakdown-dot" style={{ background: '#ff3333' }}></span>
                                                        {category}
                                                    </span>
                                                    <span className="breakdown-value">₹{(data.cost/1000).toFixed(1)}K</span>
                                                </div>
                                                <div className="breakdown-bar">
                                                    <div 
                                                        className="breakdown-fill"
                                                        style={{ width: `${percentage}%` }}
                                                    ></div>
                                                </div>
                                                <div className="breakdown-percentage">{data.count} projects</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            

            {/* ==================== TEAM VIEW ==================== */}
              {/* ==================== TEAM VIEW ==================== */}
{selectedView === 'team' && (
    <div className="analytics-view team-view-enhanced">
        {/* METRICS GRID */}
        <div className="metrics-grid">
            <div className="metric-card">
                <div className="metric-icon">👥</div>
                <div className="metric-content">
                    <div className="metric-label">Team Members</div>
                    <div className="metric-value">{getTeamMetrics.teamStats?.length || 0}</div>
                    <div className="metric-breakdown">Active</div>
                </div>
            </div>
            <div className="metric-card">
                <div className="metric-icon">⏱️</div>
                <div className="metric-content">
                    <div className="metric-label">Total Hours</div>
                    <div className="metric-value">{(getTeamMetrics.totalHours || 0).toFixed(1)}</div>
                    <div className="metric-breakdown">Logged</div>
                </div>
            </div>
            <div className="metric-card">
                <div className="metric-icon">✅</div>
                <div className="metric-content">
                    <div className="metric-label">Tasks Completed</div>
                    <div className="metric-value">{filteredTaskLogs?.length || 0}</div>
                    <div className="metric-breakdown">This period</div>
                </div>
            </div>
            <div className="metric-card">
                <div className="metric-icon">👨‍🍳</div>
                <div className="metric-content">
                    <div className="metric-label">Active Chefs</div>
                    <div className="metric-value">{getTeamMetrics.chefActivity?.length || 0}</div>
                    <div className="metric-breakdown">In demos</div>
                </div>
            </div>
        </div>

        {/* MAIN CONTENT GRID - 2 COLUMN LAYOUT */}
        <div className="team-content-grid">
            
            {/* LEFT COLUMN */}
            <div className="team-column">
                
                {/* PERFORMANCE LEADERBOARD - COMPACT */}
                <div className="chart-card compact-card">
                    <div className="chart-header">
                        <h3>🏅 Team Leaderboard</h3>
                        <div className="chart-subtitle">By hours logged</div>
                    </div>
                    <div className="chart-body compact-body">
                        {!getTeamMetrics.teamStats || getTeamMetrics.teamStats.length === 0 ? (
                            <div className="no-data-small">
                                <div className="no-data-icon-small">👥</div>
                                <div className="no-data-text-small">No activity yet</div>
                            </div>
                        ) : (
                            <div className="compact-leaderboard">
                                {getTeamMetrics.teamStats.slice(0, 8).map(([member, stats], index) => (
                                    <div key={member} className="compact-leader-item">
                                        <div className="leader-left">
                                            <div className={`compact-rank ${index < 3 ? 'top-three' : ''}`}>
                                                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                            </div>
                                            <div className="leader-name">{member}</div>
                                        </div>
                                        <div className="leader-right">
                                            <div className="leader-hours">{(stats.totalHours || 0).toFixed(1)}h</div>
                                            <div className="leader-tasks">{stats.tasks || 0} tasks</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* TASK HOURS BREAKDOWN - COMPACT */}
                <div className="chart-card compact-card">
                    <div className="chart-header">
                        <h3>⏱️ Hours by Task</h3>
                        <div className="chart-subtitle">Time distribution</div>
                    </div>
                    <div className="chart-body compact-body">
                        {!getTeamMetrics.taskHoursBreakdown || getTeamMetrics.taskHoursBreakdown.length === 0 ? (
                            <div className="no-data-small">
                                <div className="no-data-icon-small">⏱️</div>
                                <div className="no-data-text-small">No task data</div>
                            </div>
                        ) : (
                            <div className="compact-breakdown">
                                {getTeamMetrics.taskHoursBreakdown.slice(0, 6).map(([taskName, stats]) => {
                                    const maxHours = getTeamMetrics.taskHoursBreakdown[0]?.[1]?.hours || 1;
                                    const percentage = Math.min(100, ((stats.hours || 0) / maxHours) * 100);
                                    
                                    return (
                                        <div key={taskName} className="compact-breakdown-item">
                                            <div className="breakdown-row">
                                                <span className="task-name-compact">{taskName}</span>
                                                <span className="task-hours-compact">{stats.hours.toFixed(1)}h</span>
                                            </div>
                                            <div className="compact-bar">
                                                <div className="compact-bar-fill" style={{ width: `${percentage}%` }}></div>
                                            </div>
                                            <div className="task-count-compact">{stats.count} tasks</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RECENT ACTIVITIES - COMPACT */}
                <div className="chart-card compact-card">
                    <div className="chart-header">
                        <h3>📋 Recent Activity</h3>
                        <div className="chart-subtitle">Latest {Math.min(8, filteredTaskLogs?.length || 0)} tasks</div>
                    </div>
                    <div className="chart-body compact-body scrollable-body">
                        {!filteredTaskLogs || filteredTaskLogs.length === 0 ? (
                            <div className="no-data-small">
                                <div className="no-data-icon-small">📝</div>
                                <div className="no-data-text-small">No recent logs</div>
                            </div>
                        ) : (
                            <div className="compact-activity-list">
                                {filteredTaskLogs.slice(0, 8).map((log) => {
                                    const startDate = log.start_time ? new Date(log.start_time) : null;
                                    const endDate = log.end_time ? new Date(log.end_time) : null;
                                    const duration = (endDate && startDate) ? Math.floor((endDate - startDate) / 60000) : 0;
                                    
                                    return (
                                        <div key={log.id} className="compact-activity-item">
                                            <div className="activity-avatar-small">
                                                {(log.user_name || log.username || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="activity-details-compact">
                                                <div className="activity-top-row">
                                                    <span className="activity-user-small">{log.user_name || log.username || 'Unknown'}</span>
                                                    <span className="activity-duration-small">{formatDuration(duration)}</span>
                                                </div>
                                                <div className="activity-task-small">{log.task_name || 'Unnamed Task'}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="team-column">
                
                {/* CHEF DEMO ANALYSIS - COMPACT */}
                <div className="chart-card compact-card">
                    <div className="chart-header">
                        <h3>👨‍🍳 Chef Performance</h3>
                        <div className="chart-subtitle">Demo breakdown</div>
                    </div>
                    <div className="chart-body compact-body">
                        {!getTeamMetrics.chefActivity || getTeamMetrics.chefActivity.length === 0 ? (
                            <div className="no-data-small">
                                <div className="no-data-icon-small">👨‍🍳</div>
                                <div className="no-data-text-small">No chef activity</div>
                            </div>
                        ) : (
                            <div className="compact-chef-list">
                                {getTeamMetrics.chefActivity.slice(0, 6).map(([chef, stats], index) => {
                                    const maxDemos = getTeamMetrics.chefActivity[0]?.[1]?.demos || 1;
                                    const percentage = Math.min(100, ((stats.demos || 0) / maxDemos) * 100);
                                    
                                    return (
                                        <div key={chef} className="compact-chef-item">
                                            <div className="chef-header-compact">
                                                <span className="chef-name-compact">{chef}</span>
                                                <span className="chef-demos-compact">{stats.demos || 0} demos</span>
                                            </div>
                                            <div className="compact-bar">
                                                <div className="compact-bar-fill chef-bar-fill" style={{ width: `${percentage}%` }}></div>
                                            </div>
                                            <div className="chef-meta-compact">
                                                {stats.types?.virtual || 0} Virtual • {stats.types?.onsite || 0} Onsite • ₹{((stats.cost || 0) / 1000).toFixed(1)}K
                                            </div>
                                        </div>
                                    );
                                })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* TASK DISTRIBUTION - COMPACT */}
                        <div className="chart-card compact-card">
                            <div className="chart-header">
                                <h3>📊 Task Distribution</h3>
                                <div className="chart-subtitle">Who's doing what</div>
                            </div>
                            <div className="chart-body compact-body scrollable-body">
                                {!getTeamMetrics.teamStats || getTeamMetrics.teamStats.length === 0 ? (
                                    <div className="no-data-small">
                                        <div className="no-data-icon-small">📊</div>
                                        <div className="no-data-text-small">No data</div>
                                    </div>
                                ) : (
                                    <div className="compact-distribution-list">
                                        {getTeamMetrics.teamStats.map(([member, stats]) => {
                                            const topTasks = Object.entries(stats.taskBreakdown || {})
                                                .sort((a, b) => b[1] - a[1])
                                                .slice(0, 3);
                                            
                                            return (
                                                <div key={member} className="compact-distribution-item">
                                                    <div className="distribution-header-compact">
                                                        <div className="dist-avatar-small">
                                                            {member.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="dist-info-small">
                                                            <div className="dist-name">{member}</div>
                                                            <div className="dist-stats">{stats.tasks} tasks • {stats.totalHours.toFixed(1)}h</div>
                                                        </div>
                                                    </div>
                                                    <div className="compact-task-tags">
                                                        {topTasks.map(([task, count]) => (
                                                            <span key={task} className="compact-task-tag">
                                                                {task} ({count})
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}


            {/* LOW STOCK ALERT */}
            {/* {lowStockCount > 0 && (
                <div className="alerts-section">
                    <div className="alert-card low-stock-alert">
                        <div className="alert-icon">⚠️</div>
                        <div className="alert-content">
                            <div className="alert-title">Low Stock Alert</div>
                            <div className="alert-message">
                                {lowStockCount} item{lowStockCount > 1 ? 's' : ''} need attention:
                            </div>
                            <div className="low-stock-list">
                                {lowStockItems.slice(0, 3).map((item, idx) => (
                                    <div key={item.id || idx} className="low-stock-item">
                                        <span className="stock-name">{item.product_name}</span>
                                        <span className="stock-qty">{item.quantity}/{item.reorder_level}</span>
                                    </div>
                                ))}
                                {lowStockItems.length > 3 && (
                                    <div className="more-items">+{lowStockItems.length - 3} more</div>
                                )}
                            </div>
                        </div>
                        <button className="alert-action" onClick={() => setSelectedView('inventory')}>
                            Fix Now
                        </button>
                    </div>
                </div>
            )} */}
        </div>
    );
}