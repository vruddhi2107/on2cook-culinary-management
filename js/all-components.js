const { useState, useEffect } = React;


// ==================== CONFIGURATION ====================
const SUPABASE_CONFIG = {
    url: 'https://ytevkudzdbphkpuxleex.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0ZXZrdWR6ZGJwaGtwdXhsZWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTk3MTcsImV4cCI6MjA4NTIzNTcxN30.gzD9R095yW8Addl3hantgTfw593wQMJJ_5oh-vWKErE'
};

const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

const TABLES = {
    INVENTORY: 'inventory',
    PURCHASES: 'purchases',
    USAGE: 'usage',
    RECIPES: 'recipes',
    DEMOS: 'demos',
    RND: 'rnd',
    USERS: 'users',
    ROLES: 'roles', 
    task_logs: 'task_logs',
    TASK_LOGS: 'task_logs'  
};




// ==================== HELPER FUNCTIONS ====================
function getLatestPurchase(productName, purchases) {
  const filtered = purchases
    .filter(p => p.product_name?.toLowerCase() === productName?.toLowerCase())
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return filtered[0] || null;
}

function calculateIngredientCost(ingredient, purchases) {
  const purchase = getLatestPurchase(ingredient.name, purchases);
  if (!purchase || !purchase.net_weight || !purchase.price) return 0;
  const costPerUnit = purchase.price / purchase.net_weight;
  return (ingredient.quantity || 0) * costPerUnit;
}

function formatDuration(minutes) {
  if (!minutes) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
const formatDateLabel = (utcDateString) => {
    if (!utcDateString) return '';
    const date = new Date(utcDateString);
    // Returns format like: 11 Feb 2026
    return date.toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short',
        year: 'numeric'
    });
};

const formatTime = (utcDateString) => {
    if (!utcDateString) return '';
    
    //  CONVERT UTC TO LOCAL IST TIME
    const date = new Date(utcDateString);
    return date.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',  //  IST timezone
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
};


const formatDayLabel = (utcDateString) => {
    if (!utcDateString) return '';
    
    const date = new Date(utcDateString);
    const localDate = new Date(date.toLocaleString("en-US", {timeZone: 'Asia/Kolkata'}));
    const today = new Date();
    const todayLocal = new Date(today.toLocaleString("en-US", {timeZone: 'Asia/Kolkata'}));
    const yesterday = new Date(todayLocal);
    yesterday.setDate(todayLocal.getDate() - 1);
    
    if (localDate.toDateString() === todayLocal.toDateString()) return 'Today';
    if (localDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return localDate.toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short' 
    });
};



function parseOutputToGrams(outputStr) {
  if (!outputStr) return 0;
  const str = outputStr.toLowerCase().trim();
  
  // Match patterns like "600g", "600 g", "600gm", "1kg", "10pcs", "8 portions"
  const match = str.match(/(\d+(?:\.\d+)?)\s*(g|gm|gram|grams|kg|kilogram|kilograms|pc|pcs|piece|pieces|portion|portions|nos|no)?/i);
  
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();
  
  // Convert to grams
  if (unit.startsWith('kg') || unit.startsWith('kilogram')) {
    return value * 1000;
  } else if (unit.startsWith('g') || unit.startsWith('gram')) {
    return value;
  } else if (unit.startsWith('pc') || unit.startsWith('piece') || unit.startsWith('no') || unit.startsWith('portion')) {
    // For pieces/portions, assume 100g per piece as default
    return value * 100;
  }
  
  // Default: assume grams
  return value;
}

function calculatePortionCost(recipe, purchases, portionSize, totalOutput) {
  const totalCost = (recipe.parsed_ingredients || recipe.ingredients || [])
    .reduce((sum, ing) => sum + calculateIngredientCost(ing, purchases), 0);
  
  const totalGrams = parseOutputToGrams(totalOutput);
  const portionGrams = parseOutputToGrams(portionSize);
  
  if (totalGrams === 0 || portionGrams === 0) {
    return totalCost; // Fallback to full recipe cost
  }
  
  return (totalCost * portionGrams) / totalGrams;
}

// ==================== ACTIVITY LOGGER HOOK ====================
function useActivityLogger(user, setActivityLogs) {
  const logActivity = async (activityType, description, metadata = {}) => {
    // ← NEW: Now accepts activityType, description, and metadata separately
    // ← Changed from single notes parameter
    const activity = {
      user_id: user.id,
      user_name: user.name,
      activity_type: activityType,  // ← NEW
      description: description,      // ← NEW
      metadata: metadata,            // ← NEW
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from(TABLES.TASK_LOGS)
        .insert([activity])
        .select();

      if (error) {
        console.error('Activity log error:', error);
        // Fallback to local storage
        const localLogs = JSON.parse(localStorage.getItem('task_logs') || '[]');
        const localActivity = { ...activity, id: Date.now().toString() };
        localLogs.push(localActivity);
        localStorage.setItem('task_logs', JSON.stringify(localLogs));
        if (setActivityLogs) {
          setActivityLogs(prev => [...prev, localActivity]);
        }
        return localActivity;
      }

      if (setActivityLogs && data && data[0]) {
        setActivityLogs(prev => [...prev, data[0]]);
      }
      return data ? data[0] : activity;
    } catch (err) {
      console.error('Activity log failed:', err);
      return activity;
    }
  };

  return { logActivity};
}

// ==================== USER PROFILE COMPONENT ====================
function UserProfile({ user, activityLogs, onClose }) {
    const [activeTab, setActiveTab] = useState('activities');
    const userActivities = activityLogs.filter(log => log.user_id === user.id);
    
    const totalTimeLogged = userActivities.reduce((sum, act) => sum + (act.duration_minutes || 0), 0);
    const activitiesThisWeek = userActivities.filter(act => {
        const actDate = new Date(act.created_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return actDate >= weekAgo;
    }).length;

    const activitiesThisMonth = userActivities.filter(act => {
        const actDate = new Date(act.created_at);
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        return actDate >= monthStart;
    }).length;

    const activityStats = {
        inventory: userActivities.filter(a => a.activity_type?.includes('Inventory')).length,
        purchases: userActivities.filter(a => a.activity_type?.includes('Purchase')).length,
        usage: userActivities.filter(a => a.activity_type?.includes('Usage')).length,
        recipes: userActivities.filter(a => a.activity_type?.includes('Recipe')).length,
        demos: userActivities.filter(a => a.activity_type?.includes('Demo')).length,
        rnd: userActivities.filter(a => a.activity_type?.includes('R&D')).length
    };

    const getActivityIcon = (type) => {
        if (type?.includes('Inventory')) return '📦';
        if (type?.includes('Purchase')) return '🛒';
        if (type?.includes('Usage')) return '📝';
        if (type?.includes('Recipe')) return '📖';
        if (type?.includes('Demo')) return '🎯';
        if (type?.includes('R&D')) return '🔬';
        if (type?.includes('Login')) return '🔐';
        if (type?.includes('Task')) return '⏱️';
        return '📋';
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header profile-header">
                    <div className="profile-header-content">
                        <div className="profile-avatar-large">
                            {user.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="profile-header-info">
                            <h2 className="profile-name">{user.name}</h2>
                            <p className="profile-email">{user.email}</p>
                            <span className="role-badge-large">{user.role}</span>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="profile-stats-grid">
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">📊</div>
                        <div className="profile-stat-value">{userActivities.length}</div>
                        <div className="profile-stat-label">Total Activities</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">⏱️</div>
                        <div className="profile-stat-value">{formatDuration(totalTimeLogged)}</div>
                        <div className="profile-stat-label">Time Logged</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">📅</div>
                        <div className="profile-stat-value">{activitiesThisWeek}</div>
                        <div className="profile-stat-label">This Week</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">📆</div>
                        <div className="profile-stat-value">{activitiesThisMonth}</div>
                        <div className="profile-stat-label">This Month</div>
                    </div>
                </div>

                <div className="profile-tabs">
                    <button 
                        className={`profile-tab ${activeTab === 'activities' ? 'active' : ''}`}
                        onClick={() => setActiveTab('activities')}
                    >
                        <span className="tab-icon">📋</span>
                        Activities
                    </button>
                    <button 
                        className={`profile-tab ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        <span className="tab-icon">📊</span>
                        Statistics
                    </button>
                </div>

                <div className="modal-body profile-content">
                    {activeTab === 'activities' && (
                        <div className="activity-list-container">
                            {userActivities.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">📝</div>
                                    <div className="empty-state-title">No activities yet</div>
                                    <div className="empty-state-text">Your activities will appear here</div>
                                </div>
                            ) : (
                                userActivities
                                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                                    .slice(0, 50)
                                    .map((activity, idx) => (
                                        <div key={activity.id || idx} className="profile-activity-item">
                                            <div className="profile-activity-icon">
                                                {getActivityIcon(activity.activity_type)}
                                            </div>
                                            <div className="profile-activity-content">
                                                <div className="profile-activity-type">{activity.activity_type}</div>
                                                <div className="profile-activity-description">{activity.description}</div>
                                                <div className="profile-activity-meta">
                                                    <span className="profile-activity-time">
                                                        {formatDateTime(activity.created_at)}
                                                    </span>
                                                    {activity.duration_minutes && (
                                                        <span className="profile-activity-duration">
                                                            ⏱️ {formatDuration(activity.duration_minutes)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    )}

                    {activeTab === 'stats' && (
                        <div className="stats-breakdown">
                            <h3 className="stats-title">Activity Breakdown</h3>
                            <div className="stat-bars">
                                {Object.entries(activityStats).map(([key, value]) => {
                                    const maxValue = Math.max(...Object.values(activityStats), 1);
                                    const percentage = (value / maxValue) * 100;
                                    
                                    return (
                                        <div key={key} className="stat-bar-item">
                                            <div className="stat-bar-header">
                                                <span className="stat-bar-label">
                                                    {key.charAt(0).toUpperCase() + key.slice(1)}
                                                </span>
                                                <span className="stat-bar-value">{value}</span>
                                            </div>
                                            <div className="stat-bar-container">
                                                <div 
                                                    className="stat-bar-fill"
                                                    style={{ 
                                                        width: `${percentage}%`,
                                                        backgroundColor: getColorForType(key)
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer profile-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                    <button className="btn btn-danger" onClick={onLogout}>
                        🚪 Logout
                    </button>
                </div>
            </div>
        </div>
    );
}

function getColorForType(type) {
    const colors = {
        inventory: '#4299e1',
        purchases: '#48bb78',
        usage: '#ed8936',
        recipes: '#9f7aea',
        demos: '#f56565',
        rnd: '#38b2ac'
    };
    return colors[type] || '#718096';
}

// ==================== SIDEBAR ====================
function Sidebar({ currentPage, setCurrentPage, user, activityCount }) {
    //  Show ALL nav items - no permissions needed
    const allNavItems = [
        { id: 'dashboard', icon: '📊', label: 'Dashboard', section: 'Overview' },
        { id: 'logs', icon: '⏱️', label: 'Task Logs', section: 'Overview' },
        { id: 'inventory', icon: '📦', label: 'Inventory', section: 'Inventory Management' },
        { id: 'purchases', icon: '🛒', label: 'Purchases', section: 'Inventory Management' },
        { id: 'usage', icon: '📉', label: 'Usage Tracking', section: 'Inventory Management' },
        { id: 'recipes', icon: '🍳', label: 'Recipe Database', section: 'Recipe Management' },
        { id: 'demos', icon: '🎤', label: 'Demo Management', section: 'Operations' },
        { id: 'rnd', icon: '🔬', label: 'R&D Cost Tracking', section: 'Operations' }
    ];

    const navItems = allNavItems; //  All items visible
    const sections = [...new Set(navItems.map(item => item.section))];

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">Culinary</div>
                <div className="sidebar-subtitle">Management System</div>
            </div>

            <div className="sidebar-nav">
                {sections.map(section => (
                    <div key={section} className="nav-section">
                        <div className="nav-section-title">{section}</div>
                        {navItems
                            .filter(item => item.section === section)
                            .map(item => (
                                <div 
                                    key={item.id} 
                                    className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                                    onClick={() => setCurrentPage(item.id)}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </div>
                            ))
                        }
                    </div>
                ))}
            </div>

            {/*  NO LOGOUT - Just user info */}
            <div className="sidebar-footer">
                <div className="user-info">
                    <div className="user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
                    <div className="user-details">
                        <div className="user-name">{user.name}</div>
                        <div className="user-role">User</div>
                    </div>
                    {activityCount > 0 && (
                        <div className="activity-badge-count">{activityCount}</div>
                    )}
                </div>
            </div>
        </div>
    );
}


// ==================== TASK LOGS ====================
function TaskLogs({ user, logActivity }) {
    const [taskLogs, setTaskLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editLog, setEditLog] = useState(null);
    const [filterUser, setFilterUser] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const convertLocalToUTC = (localString) => {
    // Parse local datetime-local string and convert to UTC properly
    const date = new Date(localString);
    return date.toISOString();  // Converts local → UTC correctly
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        
        //  Parse date properly - handles both ISO and datetime-local
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        
        // Display as LOCAL time (matches input)
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };



    const formatDuration = (minutes) => {
        if (!minutes || minutes === 0) return '0m';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const formatDayLabel = (utcDateString) => {
    if (!utcDateString) return '';
    
    const date = new Date(utcDateString);
    const localDate = new Date(date.toLocaleString("en-US", {timeZone: 'Asia/Kolkata'}));
    const today = new Date();
    const todayLocal = new Date(today.toLocaleString("en-US", {timeZone: 'Asia/Kolkata'}));
    const yesterday = new Date(todayLocal);
    yesterday.setDate(todayLocal.getDate() - 1);
    
    if (localDate.toDateString() === todayLocal.toDateString()) return 'Today';
    if (localDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return localDate.toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short' 
    });
};


    useEffect(() => {
        fetchTaskLogs();
    }, []);

    const fetchTaskLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('task_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (error) throw error;
            setTaskLogs(data || []);
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (newLog) => {
    const toUTC = (localStr) => {
        if (!localStr) return null;
        const date = new Date(localStr);
        return date.toISOString();
    };

    const logData = {
        task_name: newLog.task_name || 'Unknown Task',
        start_time: toUTC(newLog.start_time),
        end_time: newLog.end_time ? toUTC(newLog.end_time) : null,
        notes: newLog.notes || null,
        user_name: newLog.user_name || 'Anonymous User'  // ✅ FIXED: was checking newLog.username
    };

    console.log('INSERTING:', logData);

    try {
        if (editLog) {
            const { data, error } = await supabase
                .from('task_logs')
                .update(logData)
                .eq('id', editLog.id)
                .select()
                .single();
            if (error) throw error;
            setTaskLogs(taskLogs.map(l => l.id === editLog.id ? data : l));
        } else {
            const { data, error } = await supabase
                .from('task_logs')
                .insert([logData])
                .select()
                .single();
            if (error) throw error;
            setTaskLogs([data, ...taskLogs]);
        }
        setModalOpen(false);
        setEditLog(null);
    } catch (error) {
        console.error('ERROR:', error);
        alert('Save failed: ' + error.message);
    }
};

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this task log?')) {
            await supabase.from('task_logs').delete().eq('id', id);  //  Fixed table name
            setTaskLogs(taskLogs.filter(log => log.id !== id));
        }
    };

    const uniqueUsers = [...new Set(taskLogs.map(log => log.user_name || 'Unknown'))];
    // Add this state at the top with your others
    const [filterDate, setFilterDate] = useState(''); 

    const filteredLogs = taskLogs.filter(log => {
        const matchesUser = filterUser === 'all' || log.user_name === filterUser;
        const matchesSearch = searchTerm === '' || 
            log.task_name?.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Check if the log's date matches the selected filter date
        const logDate = new Date(log.start_time).toISOString().split('T')[0];
        const matchesDate = filterDate === '' || logDate === filterDate;

        return matchesUser && matchesSearch && matchesDate;
    });

 
    if (loading) {
        return <div className="loading-spinner"><div className="spinner"></div></div>;
    }

    return (
        <div>
            <div className="page-header">
                <div className="page-title-section">
                    <h1>Task Logs</h1>
                    <p className="page-subtitle">Track time spent on various tasks</p>
                </div>
                <button 
                    className="btn btn-primary" 
                    onClick={() => { setModalOpen(true); setEditLog(null); }}
                >
                    + Log Task
                </button>
            </div>

            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search tasks..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
    
    <div className="filter-group" style={{ display: 'flex', gap: '8px' }}>
    <input 
        type="date"
        className="form-input"
        value={filterDate}
        onChange={(e) => setFilterDate(e.target.value)}
        style={{ width: 'auto', minWidth: '160px' }}
    />
 

        <select 
            value={filterUser} 
            onChange={(e) => setFilterUser(e.target.value)}
            className="form-select" 
            style={{ minWidth: '150px' }}
        >
            <option value="all">All Users</option>
            {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
            ))}
        </select>
        
        {/* Clear Filters Button */}
        {(filterUser !== 'all' || searchTerm || filterDate) && (
            <button 
                className="btn btn-secondary" 
                onClick={() => {setFilterUser('all'); setSearchTerm(''); setFilterDate('');}}
                style={{ padding: '8px 12px' }}
            >
                Clear
            </button>
        )}
    </div>
</div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">All Task Logs ({filteredLogs.length})</h2>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>User</th>
                                <th>Task Name</th>
                                <th>Start Time</th>
                                <th>End Time</th>
                                <th>Duration</th>
                                <th>Notes</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            alignItems: 'center', 
                                            gap: '12px' 
                                        }}>
                                            <div style={{ fontSize: '48px' }}>⏱️</div>
                                            <div style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                                                No task logs yet
                                            </div>
                                            <div style={{ color: '#6b7280', fontSize: '14px' }}>
                                                Click "Log Task" to get started
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map(log => {
                                    const startDate = new Date(log.start_time);
                                    const endDate = log.end_time ? new Date(log.end_time) : null;
                                    const duration = endDate && startDate 
                                        ? Math.floor((endDate - startDate) / 60000) 
                                        : 0;

                                    return (
                                        <tr key={log.id}>
                                            <td style={{ color: '#6b7280', fontWeight: '500' }}>
                                                {formatDateLabel(log.start_time)}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div className="user-avatar" style={{ 
                                                        width: '32px', 
                                                        height: '32px', 
                                                        fontSize: '14px' 
                                                    }}>
                                                        {(log.user_name || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <span>{log.user_name || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td><strong>{log.task_name}</strong></td>
                                            <td>{formatTime(log.start_time)}</td>
                                            <td>{log.end_time ? formatTime(log.end_time) : 'Ongoing'}</td>
                                            <td>{formatDuration(duration)}</td>
                                            <td>{log.notes || '-'}</td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button 
                                                        className="btn-icon" 
                                                        onClick={() => { setEditLog(log); setModalOpen(true); }}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button 
                                                        className="btn-icon" 
                                                        onClick={() => handleDelete(log.id)}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                                </tbody>
                        </table>
                </div>
            </div>

            {modalOpen && (
                <TaskLogModal
                    log={editLog}
                    user={user}
                    onClose={() => { setModalOpen(false); setEditLog(null); }}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}




function TaskLogModal({ log, user, onClose, onSave }) {
    const [formData, setFormData] = useState(log || {
        task_name: '',
        start_time: new Date().toLocaleString('sv').slice(0, 16),  // ✅ LOCAL time format
        end_time: '',
        notes: ''
    });
    
    const [taskType, setTaskType] = useState(log?.task_name ? log.task_name : '');
    const [subCategory, setSubCategory] = useState('');
    const [customTask, setCustomTask] = useState('');
    const [selectedUsername, setSelectedUsername] = useState(
        log?.user_name || user.name || ''  // ✅ FIXED: was log?.username
    );
    //  CATEGORIES WITH SUB-CATEGORIES
    const taskCategories = [
        { 
            name: 'Demo', 
            subcategories: ['Virtual', 'Onsite'],
            standalone: false
        },
        { 
            name: 'Deployment', 
            subcategories: ['Onsite','Virtual','Investor Demo'],
            standalone: false
        },
        { 
            name: 'Events/Exhibition', 
            standalone: true 
        },
        { 
            name: 'Recipe Trials (Head Chef)', 
            standalone: true 
        },
        { 
            name: 'RND', 
            subcategories: ['Antunes','O2C Recipe Development','Custom Recipe Development(Client)'],
            standalone: false 
        },
        { 
            name: 'Device Testing', 
            standalone: true 
        },
        { 
            name: 'Firmware Trials', 
            standalone: true 
        },
        { 
            name: 'AI Trials', 
            standalone: true 
        },
        { 
            name: 'Kitchen Deep Cleaning', 
            standalone: true 
        },
        { 
            name: 'Store Inventory', 
            standalone: true 
        },
        { 
            name: 'Chicken Cleaning/Cutting/Packaging', 
            standalone: true 
        },
        { 
            name: 'Mise en Place', 
            standalone: true 
        },
        { 
            name: 'Vegetable Cleaning/Cutting/Packaging', 
            standalone: true 
        },
        { 
            name: 'Device & Accessories Packaging', 
            standalone: true 
        },
    ];

    const commonUsers = [
        "Bikas", "Bikram", "Chef Mandeep", "Chef Rishi", "Ganesh", "Krishna", "Prankrishna", "Shahid", "Uttam", "Vijay"
    ];

    const handleTaskTypeChange = (e) => {
    const value = e.target.value;
    setTaskType(value);
    setSubCategory('');
    setCustomTask('');
    
    // ✅ IMMEDIATELY set task_name
    setFormData(prev => ({ ...prev, task_name: value }));
};

const handleSubCategoryChange = (e) => {
    const value = e.target.value;
    setSubCategory(value);
    
    // ✅ IMMEDIATELY set task_name to sub-category
    setFormData(prev => ({ ...prev, task_name: value }));
};

const handleCustomTaskChange = (e) => {
    const value = e.target.value;
    setCustomTask(value);
    
    // ✅ IMMEDIATELY set task_name
    setFormData(prev => ({ ...prev, task_name: value }));
};

const handleSubmit = (e) => {
    e.preventDefault();
    
    // ✅ VALIDATE task_name (not taskType)
    if (!formData.task_name?.trim()) {
        alert('Please select a task or enter custom task name');
        return;
    }
    
    if (!selectedUsername?.trim()) {
        alert('Please select a username');
        return;
    }

    const finalData = {
        task_name: formData.task_name.trim(),  
        start_time: formData.start_time,
        end_time: formData.end_time || null,
        notes: formData.notes || null,
        user_name: selectedUsername  // ✅ FIXED: was 'username', now 'user_name'
    };
    
    console.log('SAVING:', finalData);
    onSave(finalData);
};


    const currentCategory = taskCategories.find(cat => cat.name === taskType);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal task-log-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">{log ? '✏️ Edit' : '⏱️ Log'} Task</h2>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Track your work time and activities
                        </p>
                    </div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* USERNAME */}
                        <div className="form-group" style={{gridColumn: '1 / -1', marginBottom: '16px'}}>
                            <label className="form-label form-label-required">👤 Username</label>
                            
                            <select
                                className="form-select"
                                value={selectedUsername}
                                onChange={(e) => setSelectedUsername(e.target.value)}
                                required
                                style={{ 
                                    fontSize: '14px',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: '2px solid #e5e7eb'
                                }}
                            >
                                <option value="">Select user...</option>
                                
                                {/* 👑 HEAD CHEFS */}
                                <optgroup label="👑 Head Chefs">
                                    <option value="Chef Mandeep">👨‍🍳 Chef Mandeep</option>
                                    <option value="Chef Rishi">👨‍🍳 Chef Rishi</option>
                                </optgroup>
                                
                                {/* 👨‍🍳 JR CHEFS */}
                                <optgroup label="👨‍🍳 Junior Chefs">
                                    <option value="Prankrishna">👨‍🍳 Prankrishna</option>
                                    <option value="Shahid">👨‍🍳 Shahid</option>
                                </optgroup>
                                
                                {/* 🛠️ SUPPORT STAFF */}
                                <optgroup label="🛠️ Support Staff">
                                    <option value="Bikas">👤 Bikas</option>
                                    <option value="Bikram">👤 Bikram</option>
                                    <option value="Ganesh">👤 Ganesh</option>
                                    <option value="Krishna">👤 Krishna</option>
                                    <option value="Uttam">👤 Uttam</option>
                                    <option value="Vijay">👤 Vijay</option>
                                </optgroup>
                            </select>

                            {/* Selected preview */}
                            {selectedUsername && (
                                <div style={{
                                    marginTop: '8px',
                                    padding: '8px 12px',
                                    background: '#f8fafc',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    color: '#374151',
                                    borderLeft: '3px solid #3b82f6'
                                }}>
                                     {selectedUsername}
                                </div>
                            )}
                        </div>



                        {/* MAIN CATEGORY */}
                        <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: '12px' }}>
                            <label className="form-label form-label-required">📋 Main Category</label>
                            <select
                                className="form-select"
                                value={taskType}
                                onChange={handleTaskTypeChange}
                                required
                            >
                                <option value="">-- Select category --</option>
                                {taskCategories.map(category => (
                                    <option key={category.name} value={category.name}>
                                        {category.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* SUB-CATEGORY */}
                        {currentCategory && !currentCategory.standalone && currentCategory.subcategories?.length > 0 && (
                            <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
                                <label className="form-label form-label-required">🔽 Sub-category</label>
                                <select
                                    className="form-select"
                                    value={subCategory}
                                    onChange={handleSubCategoryChange}
                                    required
                                >
                                    <option value="">-- Select sub-category --</option>
                                    {currentCategory.subcategories.map(sub => (
                                        <option key={sub} value={sub}>{sub}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* CUSTOM TASK */}
                        {taskType === 'Other' && (
                            <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
                                <label className="form-label form-label-required">✍️ Custom Task</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={customTask}
                                    onChange={handleCustomTaskChange}
                                    placeholder="Enter custom task name..."
                                    required
                                    autoFocus
                                />
                            </div>
                        )}

                        {/* START TIME */}
                        <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
                            <label className="form-label form-label-required">🕐 Start Time</label>
                            <input
                                type="datetime-local"
                                className="form-input"
                                value={formData.start_time}
                                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                required
                            />
                        </div>

                        {/* END TIME */}
                        <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
                            <label className="form-label">🕐 End Time (Optional)</label>
                            <input
                                type="datetime-local"
                                className="form-input"
                                value={formData.end_time}
                                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                            />
                            <span className="form-helper-text" style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                                Leave empty if task is ongoing
                            </span>
                        </div>

                        {/* NOTES */}
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">📝 Notes (Optional)</label>
                            <textarea
                                className="form-textarea"
                                rows="4"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Additional details..."
                            />
                        </div>
                    </div>
                    
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="btn btn-primary"
                            disabled={!taskType || !selectedUsername || (taskType === 'Other' && !customTask)}
                        >
                            💾 Save Task
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}



// ==================== INVENTORY ====================
function Inventory({ data, setData, logActivity }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);

    const filteredInventory = data.inventory.filter(item =>
        item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.brand_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAdd = () => {
        setEditItem(null);
        setModalOpen(true);
    };

    const handleEdit = (item) => {
        setEditItem(item);
        setModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this item?')) {
            const item = data.inventory.find(i => i.id === id);
            await supabase.from(TABLES.INVENTORY).delete().eq('id', id);
            setData({
                ...data,
                inventory: data.inventory.filter(item => item.id !== id)
            });
            
            const activity = await logActivity(
                'Inventory Delete',
                `Deleted inventory item: ${item?.product_name}`,
                { item_id: id, item_name: item?.product_name }
            );
        }
    };

    const handleSave = async (newItem) => {
        if (editItem) {
            setData({
                ...data,
                inventory: data.inventory.map(i => i.id === newItem.id ? newItem : i)
            });
            const activity = await logActivity(
                'Inventory Update',
                `Updated inventory item: ${newItem.product_name}`,
                { item_id: newItem.id, item_name: newItem.product_name }
            );
        } else {
            setData({
                ...data,
                inventory: [...data.inventory, newItem]
            });
            const activity = await logActivity(
                'Inventory Add',
                `Added new inventory item: ${newItem.product_name}`,
                { item_id: newItem.id, item_name: newItem.product_name }
            );
        }
        setModalOpen(false);
    };

    return (
        <div>
            <div className="page-header">
                <div className="page-title-section">
                    <h1>Inventory Management</h1>
                    <p className="page-subtitle">Track stock levels and manage items</p>
                </div>
                <button className="btn btn-primary" onClick={handleAdd}>
                    + Add Item
                </button>
            </div>

            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search inventory..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">All Items ({filteredInventory.length})</h2>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Brand</th>
                                <th>Net Weight</th>
                                <th>Unit</th>
                                <th>Current Stock</th>
                                <th>Reorder Level</th>
                                <th>Unit Cost</th>
                                <th>Total Value</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInventory.length === 0 ? (
                                <tr>
                                    <td colSpan="10">
                                        <div className="empty-state">
                                            <div className="empty-state-icon">📦</div>
                                            <div className="empty-state-title">No inventory items</div>
                                            <div className="empty-state-text">Add your first item to get started</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredInventory.map(item => (
                                    <tr key={item.id}>
                                        <td><strong>{item.product_name}</strong></td>
                                        <td>{item.brand_name}</td>
                                        <td>{item.net_weight}</td>
                                        <td>{item.unit}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.reorder_level}</td>
                                        <td>₹{item.unit_cost}</td>
                                        <td><strong>₹{((item.quantity || 0) * (item.unit_cost || 0)).toLocaleString()}</strong></td>
                                        <td>
                                            {item.quantity <= item.reorder_level ? (
                                                <span className="badge badge-low-stock">Low Stock</span>
                                            ) : (
                                                <span className="badge badge-in-stock">In Stock</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                <button className="btn-icon" onClick={() => handleEdit(item)}>✏️</button>
                                                <button className="btn-icon" onClick={() => handleDelete(item.id)}>🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && (
                <InventoryModal
                    item={editItem}
                    onClose={() => setModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}

// ==================== PURCHASES ====================
function Purchases({ data, setData, logActivity }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);

    const filteredPurchases = data.purchases.filter(purchase =>
        purchase.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = async (newPurchase) => {
        const inventoryItem = data.inventory.find(
            item => item.product_name?.toLowerCase() === newPurchase.product_name?.toLowerCase() &&
                   item.brand_name?.toLowerCase() === newPurchase.brand_name?.toLowerCase()
        );

        if (inventoryItem) {
            const updatedQuantity = (inventoryItem.quantity || 0) + (newPurchase.quantity || 0);
            const updatedNetWeight = newPurchase.net_weight;
            const updatedUnitCost = newPurchase.price / newPurchase.net_weight;

            await supabase
                .from(TABLES.INVENTORY)
                .update({ 
                    quantity: updatedQuantity,
                    net_weight: updatedNetWeight,
                    unit_cost: updatedUnitCost
                })
                .eq('id', inventoryItem.id);

            setData({
                ...data,
                purchases: [...data.purchases, newPurchase],
                inventory: data.inventory.map(item => 
                    item.id === inventoryItem.id 
                        ? { ...item, quantity: updatedQuantity, net_weight: updatedNetWeight, unit_cost: updatedUnitCost }
                        : item
                )
            });
        } else {
            setData({
                ...data,
                purchases: [...data.purchases, newPurchase]
            });
        }
        
        const activity = await logActivity(
            'Purchase Add',
            `Added purchase: ${newPurchase.product_name} (₹${newPurchase.total_amount})`,
            { purchase_id: newPurchase.id, product: newPurchase.product_name, amount: newPurchase.total_amount }
        );
        
        setModalOpen(false);
    };

    return (
        <div>
            <div className="page-header">
                <div className="page-title-section">
                    <h1>Purchases</h1>
                    <p className="page-subtitle">Track all inventory purchases</p>
                </div>
                <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    + Add Purchase
                </button>
            </div>

            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search purchases..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">All Purchases ({filteredPurchases.length})</h2>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Invoice</th>
                                <th>Product</th>
                                <th>Brand</th>
                                <th>Weight</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Total</th>
                                <th>Supplier</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases.length === 0 ? (
                                <tr>
                                    <td colSpan="9">
                                        <div className="empty-state">
                                            <div className="empty-state-icon">🛒</div>
                                            <div className="empty-state-title">No purchases recorded</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredPurchases.map(purchase => (
                                    <tr key={purchase.id}>
                                        <td>{purchase.date}</td>
                                        <td>{purchase.invoice_number}</td>
                                        <td><strong>{purchase.product_name}</strong></td>
                                        <td>{purchase.brand_name}</td>
                                        <td>{purchase.net_weight} {purchase.unit}</td>
                                        <td>{purchase.quantity}</td>
                                        <td>₹{purchase.price}</td>
                                        <td><strong>₹{purchase.total_amount?.toLocaleString()}</strong></td>
                                        <td>{purchase.supplier_name}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && (
                <PurchaseModal
                    onClose={() => setModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}

// ==================== USAGE ====================
function Usage({ data, setData, logActivity }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);

    const filteredUsage = data.usage.filter(usage =>
        usage.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = async (newUsage) => {
        const inventoryItem = data.inventory.find(
            item => item.product_name?.toLowerCase() === newUsage.product_name?.toLowerCase() &&
                   item.brand_name?.toLowerCase() === newUsage.brand_name?.toLowerCase()
        );

        if (inventoryItem) {
            const updatedQuantity = (inventoryItem.quantity || 0) - (newUsage.quantity || 0);

            await supabase
                .from(TABLES.INVENTORY)
                .update({ quantity: updatedQuantity })
                .eq('id', inventoryItem.id);

            setData({
                ...data,
                usage: [...data.usage, newUsage],
                inventory: data.inventory.map(item => 
                    item.id === inventoryItem.id 
                        ? { ...item, quantity: updatedQuantity }
                        : item
                )
            });
        } else {
            setData({
                ...data,
                usage: [...data.usage, newUsage]
            });
        }
        
        const activity = await logActivity(
            'Usage Record',
            `Recorded usage: ${newUsage.quantity} ${newUsage.unit} of ${newUsage.product_name} for ${newUsage.usage_purpose}`,
            { usage_id: newUsage.id, product: newUsage.product_name, quantity: newUsage.quantity, purpose: newUsage.usage_purpose }
        );
        
        setModalOpen(false);
    };

    return (
        <div>
            <div className="page-header">
                <div className="page-title-section">
                    <h1>Usage Tracking</h1>
                    <p className="page-subtitle">Monitor inventory consumption</p>
                </div>
                <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    + Add Usage
                </button>
            </div>

            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search usage..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">Usage Records ({filteredUsage.length})</h2>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Product</th>
                                <th>Brand</th>
                                <th>Weight</th>
                                <th>Unit</th>
                                <th>Quantity</th>
                                <th>Issued By</th>
                                <th>Purpose</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsage.length === 0 ? (
                                <tr>
                                    <td colSpan="8">
                                        <div className="empty-state">
                                            <div className="empty-state-icon">📝</div>
                                            <div className="empty-state-title">No usage records</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsage.map(usage => (
                                    <tr key={usage.id}>
                                        <td>{usage.date}</td>
                                        <td><strong>{usage.product_name}</strong></td>
                                        <td>{usage.brand_name}</td>
                                        <td>{usage.net_weight}</td>
                                        <td>{usage.unit}</td>
                                        <td>{usage.quantity}</td>
                                        <td>{usage.issued_by}</td>
                                        <td>{usage.usage_purpose}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && (
                <UsageModal
                    inventory={data.inventory}
                    purchases={data.purchases}
                    onClose={() => setModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}

// ==================== RECIPES ====================
function Recipes({ data, setData, logActivity }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  const filteredRecipes = data.recipes.filter(recipe =>
    recipe.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBulkUpload = async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const originalButton = document.querySelector('.btn-primary');
        const originalText = originalButton.textContent;
        originalButton.textContent = 'Uploading...';
        originalButton.disabled = true;
        const recipes = JSON.parse(await file.text());
        const result = await window.IngredientParser.bulkImportRecipes(
          recipes, supabase, (progress) => {
            console.log(`Bulk progress: ${progress.percentage}% (${progress.current}/${progress.total})`);
          }
        );
        originalButton.textContent = originalText;
        originalButton.disabled = false;
        alert(
          ` Bulk upload complete!\n` +
          `Success: ${result.success}\n` +
          `Failed: ${result.failed}\n\n` +
          `${result.failed > 0 ? 'Check console for error details.' : 'All recipes uploaded successfully!'}` 
        );
        const { data: recipesData } = await supabase.from(TABLES.RECIPES).select();
        setData({...data, recipes: recipesData || []});
        
        const activity = await logActivity(
          'Recipe Bulk Upload',
          `Bulk uploaded ${result.success} recipes`,
          { success: result.success, failed: result.failed }
        );
      } catch (err) {
        console.error('Bulk upload error:', err);
        alert('Error processing file:\n' + err.message);
      }
    };
    fileInput.click();
  };

  const handleSave = async (newRecipe) => {
    if (editRecipe) {
      setData({
        ...data,
        recipes: data.recipes.map(r => r.id === newRecipe.id ? newRecipe : r)
      });
      const activity = await logActivity(
        'Recipe Update',
        `Updated recipe: ${newRecipe.name}`,
        { recipe_id: newRecipe.id, recipe_name: newRecipe.name }
      );
    } else {
      setData({
        ...data,
        recipes: [...data.recipes, newRecipe]
      });
      const activity = await logActivity(
        'Recipe Add',
        `Added new recipe: ${newRecipe.name}`,
        { recipe_id: newRecipe.id, recipe_name: newRecipe.name }
      );
    }
    setModalOpen(false);
    setEditRecipe(null);
  };

  const handleEdit = (recipe) => {
    setModalOpen(true);
    setEditRecipe(recipe);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this recipe?')) {
      const recipe = data.recipes.find(r => r.id === id);
      await supabase.from(TABLES.RECIPES).delete().eq('id', id);
      setData({
        ...data,
        recipes: data.recipes.filter(r => r.id !== id)
      });
      
      const activity = await logActivity(
        'Recipe Delete',
        `Deleted recipe: ${recipe?.name}`,
        { recipe_id: id, recipe_name: recipe?.name }
      );
    }
  };

  const calculateRecipeCost = (recipe) => {
    return (recipe.parsed_ingredients || recipe.ingredients || [])
      .reduce((sum, ing) => sum + calculateIngredientCost(ing, data.purchases), 0);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-section">
          <h1>Recipe Database</h1>
          <p className="page-subtitle">Manage recipes with cost mapping</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setModalOpen(true); setEditRecipe(null); }}>
          + Add Recipe
        </button>
      </div>

      <div className="toolbar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input type="text" className="search-input" 
            placeholder="Search recipes..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
        <button className="btn btn-secondary" onClick={handleBulkUpload}>
          Bulk Upload
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">All Recipes ({filteredRecipes.length})</h2>
        </div>
        {filteredRecipes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <div className="empty-state-title">No recipes yet</div>
            <div className="empty-state-text">Create your first recipe</div>
          </div>
        ) : (
          <div className="recipe-grid">
            {filteredRecipes.map(recipe => {
              const recipeCost = calculateRecipeCost(recipe);
              return (
                <div key={recipe.id} className="recipe-card">
                  <div className="recipe-image">
                    {recipe.image_url ? (
                      <img src={recipe.image_url} alt={recipe.name} />
                    ) : (
                      '🍳'
                    )}
                  </div>
                  <div className="recipe-name">{recipe.name}</div>
                  <div className="recipe-category">{recipe.category}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="recipe-cost">
                        ₹{recipeCost.toFixed(0)}
                    </div>

                    <div className="recipe-cost">
                        {recipe.total_output}
                    </div>
                </div>


                  {recipe.parsed_ingredients && recipe.parsed_ingredients.length > 0 ? (
                    <ul className="ingredient-list">
                      {recipe.parsed_ingredients.slice(0, 3).map((ing, idx) => (
                        <li key={idx} className="ingredient-item">
                          <span className="ingredient-name">{ing.name || ing.original}</span>
                          {ing.quantity > 0 && (
                            <span className="ingredient-details">
                              {ing.quantity} {ing.unit}
                            </span>
                          )}
                        </li>
                      ))}
                      {recipe.parsed_ingredients.length > 3 && (
                        <li className="ingredient-item more-items">
                          +{recipe.parsed_ingredients.length - 3} more...
                        </li>
                      )}
                    </ul>
                  ) : recipe.ingredients?.length > 0 ? (
                    <ul className="ingredient-list">
                      {recipe.ingredients.slice(0, 3).map((ing, idx) => (
                        <li key={idx} className="ingredient-item">
                          <span className="ingredient-name">{typeof ing === 'string' ? ing : ing.name || 'Ingredient'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="no-ingredients">No ingredients</div>
                  )}
                  <div className="action-buttons" style={{marginTop: '16px'}}>
                    <button className="btn btn-secondary" style={{flex: 1}} onClick={() => setSelectedRecipe(recipe)}>
                      👁️ View Details
                    </button>
                    <button className="btn-icon" title="Edit" onClick={() => handleEdit(recipe)}>✏️</button>
                    <button className="btn-icon" title="Delete" onClick={() => handleDelete(recipe.id)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <RecipeModal
          onClose={() => { setModalOpen(false); setEditRecipe(null); }}
          onSave={handleSave}
          inventoryItems={data.inventory}
          purchases={data.purchases}
          recipe={editRecipe}
        />
      )}

      {selectedRecipe && (
        <div className="modal-overlay" onClick={() => setSelectedRecipe(null)}>
          <div className="modal" style={{maxWidth: '600px', width: '90%'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedRecipe.name}</h2>
              <button className="modal-close" onClick={() => setSelectedRecipe(null)}>×</button>
            </div>
            <div className="modal-body" style={{maxHeight: '70vh', overflowY: 'auto'}}>
              <div className="recipe-meta" style={{marginBottom: '20px'}}>
                <span className="badge" style={{background: '#48bb78'}}>{selectedRecipe.veg_non_veg}</span>
                <span className="badge" style={{background: '#ed8936'}}>{selectedRecipe.cuisine}</span>
                <span className="badge" style={{background: '#667eea'}}>{selectedRecipe.category}</span>
              </div>
              <h3>Ingredients ({selectedRecipe.parsed_ingredients?.length || selectedRecipe.ingredients?.length || 0})</h3>
              <ul className="full-ingredient-list">
                {(selectedRecipe.parsed_ingredients || selectedRecipe.ingredients || []).map((ing, idx) => {
                  const cost = calculateIngredientCost(ing, data.purchases);
                  return (
                    <li key={idx} className="full-ingredient-item">
                      <span className="ingredient-name">{ing.name || ing.original || ing}</span>
                      {ing.quantity > 0 && (
                        <span className="ingredient-details">
                          {ing.quantity} {ing.unit} {cost > 0 && <span className="cost-badge">₹{cost.toFixed(0)}</span>}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="recipe-cost" style={{marginTop: '20px', padding: '16px', background: '#f7fafc', borderRadius: '8px'}}>
                💰 <strong>Total Cost: ₹{calculateRecipeCost(selectedRecipe).toFixed(0)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== DEMOS ====================
// ==================== DEMOS ====================
function Demos({ data, setData, logActivity }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [modalOpen, setModalOpen] = useState(false);
    const [viewDetailsModal, setViewDetailsModal] = useState(null);

    const filteredDemos = data.demos.filter(demo => {
        const matchesSearch = demo.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            demo.chef_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            demo.recipe_names?.some(r => r.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesFilter = filterType === 'all' || demo.demo_type?.toLowerCase() === filterType;
        return matchesSearch && matchesFilter;
    });

    const handleSave = async (newDemo) => {
        setData({
            ...data,
            demos: [...data.demos, newDemo]
        });
        
        await logActivity(
            'Demo Schedule',
            `Scheduled demo for ${newDemo.client_name} (${newDemo.demo_type})`,
            { demo_id: newDemo.id, client: newDemo.client_name, type: newDemo.demo_type, cost: newDemo.cost }
        );
        
        setModalOpen(false);
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this demo?')) {
            const demo = data.demos.find(d => d.id === id);
            await supabase.from(TABLES.DEMOS).delete().eq('id', id);
            setData({
                ...data,
                demos: data.demos.filter(d => d.id !== id)
            });
            await logActivity('Demo Delete', `Deleted demo for ${demo?.client_name}`);
        }
    };

    const totalDemoCost = filteredDemos.reduce((sum, demo) => sum + (demo.cost || 0), 0);
    const virtualDemos = filteredDemos.filter(d => d.demo_type === 'virtual').length;
    const onsiteDemos = filteredDemos.filter(d => d.demo_type === 'onsite').length;

    return (
        <div>
            <div className="page-header">
                <div className="page-title-section">
                    <h1>Demo Management</h1>
                    <p className="page-subtitle">Track virtual and onsite demonstrations</p>
                </div>
                <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    + Schedule Demo
                </button>
            </div>

            <div className="stats-grid" style={{marginBottom: '24px'}}>
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">Total Demo Cost</div>
                            <div className="stat-value">₹{(totalDemoCost / 1000).toFixed(1)}K</div>
                        </div>
                        <div className="stat-icon">💰</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">Virtual Demos</div>
                            <div className="stat-value">{virtualDemos}</div>
                        </div>
                        <div className="stat-icon">💻</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">Onsite Demos</div>
                            <div className="stat-value">{onsiteDemos}</div>
                        </div>
                        <div className="stat-icon">🏢</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">Total Demos</div>
                            <div className="stat-value">{filteredDemos.length}</div>
                        </div>
                        <div className="stat-icon">🎯</div>
                    </div>
                </div>
            </div>

            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search by client, chef, or recipe..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-group">
                    <div className={`filter-chip ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>
                        All ({data.demos.length})
                    </div>
                    <div className={`filter-chip ${filterType === 'virtual' ? 'active' : ''}`} onClick={() => setFilterType('virtual')}>
                        💻 Virtual ({data.demos.filter(d => d.demo_type === 'virtual').length})
                    </div>
                    <div className={`filter-chip ${filterType === 'onsite' ? 'active' : ''}`} onClick={() => setFilterType('onsite')}>
                        🏢 Onsite ({data.demos.filter(d => d.demo_type === 'onsite').length})
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">All Demos ({filteredDemos.length})</h2>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Client</th>
                                <th>Type</th>
                                <th>Date</th>
                                <th>Recipes</th>
                                <th>Cost</th>
                                <th>Chef</th>
                                <th>Sales</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDemos.length === 0 ? (
                                <tr>
                                    <td colSpan="8">
                                        <div className="empty-state">
                                            <div className="empty-state-icon">🎯</div>
                                            <div className="empty-state-title">No demos scheduled</div>
                                            <div className="empty-state-text">Schedule your first demo to get started</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredDemos
                                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                                    .map(demo => (
                                    <tr key={demo.id}>
                                        <td>
                                            <div style={{fontWeight: '600', color: '#2d3748'}}>
                                                {demo.client_name}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${demo.demo_type === 'virtual' ? 'badge-virtual' : 'badge-onsite'}`}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                {demo.demo_type === 'virtual' ? '💻 VIRTUAL' : '🏢 ONSITE'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{fontSize: '14px', color: '#4a5568'}}>
                                                {new Date(demo.date).toLocaleDateString('en-IN', { 
                                                    day: '2-digit', 
                                                    month: 'short', 
                                                    year: 'numeric' 
                                                })}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{maxWidth: '300px'}}>
                                                {demo.recipe_details && demo.recipe_details.length > 0 ? (
                                                    <div>
                                                        <div style={{fontWeight: '500', color: '#2d3748', marginBottom: '4px'}}>
                                                            {demo.recipe_details.length === 1 
                                                                ? demo.recipe_details[0].recipe_name
                                                                : `${demo.recipe_details.length} Recipes`}
                                                        </div>
                                                        {demo.recipe_details.length > 1 && (
                                                            <div style={{fontSize: '12px', color: '#718096'}}>
                                                                {demo.recipe_details.slice(0, 2).map(r => r.recipe_name).join(', ')}
                                                                {demo.recipe_details.length > 2 && ` +${demo.recipe_details.length - 2} more`}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : Array.isArray(demo.recipe_names) ? (
                                                    <div>
                                                        <div style={{fontWeight: '500', color: '#2d3748'}}>
                                                            {demo.recipe_names.length === 1 
                                                                ? demo.recipe_names[0]
                                                                : `${demo.recipe_names.length} Recipes`}
                                                        </div>
                                                        {demo.recipe_names.length > 1 && (
                                                            <div style={{fontSize: '12px', color: '#718096'}}>
                                                                {demo.recipe_names.slice(0, 2).join(', ')}
                                                                {demo.recipe_names.length > 2 && ` +${demo.recipe_names.length - 2} more`}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{color: '#a0aec0'}}>-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{
                                                fontWeight: '700',
                                                fontSize: '16px',
                                                color: '#2f855a',
                                                background: '#f0fff4',
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                display: 'inline-block',
                                                border: '1px solid #9ae6b4'
                                            }}>
                                                ₹{demo.cost?.toLocaleString()}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{fontSize: '14px', color: '#4a5568'}}>
                                                {demo.chef_name}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{fontSize: '14px', color: '#4a5568'}}>
                                                {demo.sales_member || <span style={{color: '#a0aec0'}}>-</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                <button 
                                                    className="btn-icon" 
                                                    onClick={() => setViewDetailsModal(demo)}
                                                    title="View Details"
                                                    style={{fontSize: '18px'}}
                                                >
                                                    👁️
                                                </button>
                                                <button 
                                                    className="btn-icon" 
                                                    onClick={() => handleDelete(demo.id)}
                                                    title="Delete"
                                                    style={{fontSize: '18px'}}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && (
                <DemoModal
                    onClose={() => setModalOpen(false)}
                    onSave={handleSave}
                    recipes={data.recipes}
                    purchases={data.purchases}
                />
            )}

            {viewDetailsModal && (
                <DemoDetailsModal
                    demo={viewDetailsModal}
                    onClose={() => setViewDetailsModal(null)}
                />
            )}
        </div>
    );
}

// ==================== DEMO DETAILS MODAL ====================
function DemoDetailsModal({ demo, onClose }) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{maxWidth: '700px'}} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">{demo.client_name}</h2>
                        <p style={{color: '#718096', fontSize: '14px', marginTop: '4px'}}>
                            Demo scheduled for {new Date(demo.date).toLocaleDateString('en-IN', { 
                                day: '2-digit', 
                                month: 'long', 
                                year: 'numeric' 
                            })}
                        </p>
                    </div>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                
                <div className="modal-body" style={{maxHeight: '70vh', overflowY: 'auto'}}>
                    {/* Demo Info */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '16px',
                        marginBottom: '24px',
                        padding: '16px',
                        background: '#f7fafc',
                        borderRadius: '8px'
                    }}>
                        <div>
                            <div style={{fontSize: '12px', color: '#718096', marginBottom: '4px'}}>Demo Type</div>
                            <span className={`badge ${demo.demo_type === 'virtual' ? 'badge-virtual' : 'badge-onsite'}`}
                                style={{padding: '6px 12px', fontSize: '13px', fontWeight: '600'}}>
                                {demo.demo_type === 'virtual' ? '💻 VIRTUAL' : '🏢 ONSITE'}
                            </span>
                        </div>
                        <div>
                            <div style={{fontSize: '12px', color: '#718096', marginBottom: '4px'}}>Total Cost</div>
                            <div style={{fontSize: '24px', fontWeight: '700', color: '#2f855a'}}>
                                ₹{demo.cost?.toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <div style={{fontSize: '12px', color: '#718096', marginBottom: '4px'}}>Chef</div>
                            <div style={{fontSize: '15px', fontWeight: '500', color: '#2d3748'}}>
                                {demo.chef_name}
                            </div>
                        </div>
                        <div>
                            <div style={{fontSize: '12px', color: '#718096', marginBottom: '4px'}}>Sales Member</div>
                            <div style={{fontSize: '15px', fontWeight: '500', color: '#2d3748'}}>
                                {demo.sales_member || '-'}
                            </div>
                        </div>
                    </div>

                    {/* Recipe Details */}
                    <div>
                        <h3 style={{fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#2d3748'}}>
                            📖 Recipes ({demo.recipe_details?.length || demo.recipe_names?.length || 0})
                        </h3>
                        
                        {demo.recipe_details && demo.recipe_details.length > 0 ? (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                                {demo.recipe_details.map((recipe, index) => (
                                    <div key={index} style={{
                                        background: 'white',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{flex: 1}}>
                                            <div style={{fontWeight: '600', fontSize: '15px', color: '#2d3748', marginBottom: '6px'}}>
                                                {recipe.recipe_name}
                                            </div>
                                            <div style={{fontSize: '13px', color: '#718096'}}>
                                                Portion: <span style={{fontWeight: '500', color: '#4a5568'}}>{recipe.portion_size}</span>
                                            </div>
                                        </div>
                                        <div style={{
                                            background: '#f0fff4',
                                            padding: '12px 20px',
                                            borderRadius: '8px',
                                            border: '1px solid #9ae6b4',
                                            textAlign: 'center',
                                            minWidth: '100px'
                                        }}>
                                            <div style={{fontSize: '11px', color: '#2f855a', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                                                Cost
                                            </div>
                                            <div style={{fontSize: '20px', fontWeight: '700', color: '#22543d'}}>
                                                ₹{recipe.portion_cost?.toFixed(0)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                
                                {/* Total Summary */}
                                <div style={{
                                    marginTop: '8px',
                                    padding: '16px',
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    color: 'white',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{fontSize: '16px', fontWeight: '600'}}>
                                        Total Demo Cost
                                    </div>
                                    <div style={{fontSize: '24px', fontWeight: '700'}}>
                                        ₹{demo.cost?.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        ) : demo.recipe_names && demo.recipe_names.length > 0 ? (
                            <div style={{
                                background: '#fff5f5',
                                border: '1px solid #fc8181',
                                borderRadius: '8px',
                                padding: '16px'
                            }}>
                                <div style={{fontSize: '14px', color: '#c53030', marginBottom: '8px'}}>
                                    ⚠️ Legacy demo format - no detailed breakdown available
                                </div>
                                <div style={{fontSize: '13px', color: '#742a2a'}}>
                                    Recipes: {demo.recipe_names.join(', ')}
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                textAlign: 'center',
                                padding: '24px',
                                background: '#f7fafc',
                                borderRadius: '8px',
                                color: '#718096'
                            }}>
                                No recipe information available
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    {demo.notes && (
                        <div style={{marginTop: '24px'}}>
                            <h3 style={{fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#2d3748'}}>
                                📝 Notes
                            </h3>
                            <div style={{
                                background: '#fffaf0',
                                border: '1px solid #fbd38d',
                                borderRadius: '8px',
                                padding: '16px',
                                fontSize: '14px',
                                color: '#744210',
                                lineHeight: '1.6'
                            }}>
                                {demo.notes}
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// ==================== R&D ====================
function RnD({ data, setData, logActivity }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [modalOpen, setModalOpen] = useState(false);

    const filteredRnD = data.rnd.filter(item => {
        const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterCategory === 'all' || item.category === filterCategory;
        return matchesSearch && matchesFilter;
    });

    const costByCategory = {
        'B2C': data.rnd.filter(i => i.category === 'B2C').reduce((s, i) => s + (i.cost || 0), 0),
        'B2B NPD': data.rnd.filter(i => i.category === 'B2B NPD').reduce((s, i) => s + (i.cost || 0), 0),
        'Antunes': data.rnd.filter(i => i.category === 'Antunes').reduce((s, i) => s + (i.cost || 0), 0),
        'Antunes Toaster': data.rnd.filter(i => i.category === 'Antunes Toaster').reduce((s, i) => s + (i.cost || 0), 0),
        'Antunes Steamer': data.rnd.filter(i => i.category === 'Antunes Steamer').reduce((s, i) => s + (i.cost || 0), 0),
        'Antunes Egg Station': data.rnd.filter(i => i.category === 'Antunes Egg Station').reduce((s, i) => s + (i.cost || 0), 0),
        'AI Team': data.rnd.filter(i => i.category === 'AI Team').reduce((s, i) => s + (i.cost || 0), 0)
    };
    
    const antunesCategories = [
        'Antunes',
        'Antunes Steamer',
        'Antunes Toaster',
        'Antunes Egg station',
    ];

    const antunesTotal = antunesCategories.reduce(
        (sum, category) => sum + (costByCategory[category] || 0),
        0
    );

    const handleSave = async (newRnD) => {
        setData({
            ...data,
            rnd: [...data.rnd, newRnD]
        });
        
        const activity = await logActivity(
            'R&D Entry Add',
            `Added R&D activity: ${newRnD.name} (${newRnD.category}) - ₹${newRnD.cost}`,
            { rnd_id: newRnD.id, name: newRnD.name, category: newRnD.category, cost: newRnD.cost }
        );
        
        setModalOpen(false);
    };

    return (
        <div>
            <div className="page-header">
                <div className="page-title-section">
                    <h1>R&D Cost Tracking</h1>
                    <p className="page-subtitle">Research and development expense management</p>
                </div>
                <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    + Add R&D Entry
                </button>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">B2C Testing</div>
                            <div className="stat-value">₹{(costByCategory['B2C'] / 1000).toFixed(1)}K</div>
                        </div>
                        <div className="stat-icon">🛒</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">B2B New Product Development</div>
                            <div className="stat-value">₹{(costByCategory['B2B NPD'] / 1000).toFixed(1)}K</div>
                        </div>
                        <div className="stat-icon">🏢</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">Antunes Testing</div>
                            <div className="stat-value">₹{(antunesTotal / 1000).toFixed(1)}K</div>
                        </div>
                        <div className="stat-icon">⚙️</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div>
                            <div className="stat-label">AI Team Testing</div>
                            <div className="stat-value">₹{(costByCategory['AI Team'] / 1000).toFixed(1)}K</div>
                        </div>
                        <div className="stat-icon">🧪</div>
                    </div>
                </div>
            </div>

            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search R&D activities..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-group">
                    <div className={`filter-chip ${filterCategory === 'all' ? 'active' : ''}`} onClick={() => setFilterCategory('all')}>All</div>
                    <div className={`filter-chip ${filterCategory === 'B2C' ? 'active' : ''}`} onClick={() => setFilterCategory('B2C')}>B2C</div>
                    <div className={`filter-chip ${filterCategory === 'B2B NPD' ? 'active' : ''}`} onClick={() => setFilterCategory('B2B NPD')}>B2B NPD</div>
                    <div className={`filter-chip ${filterCategory === 'Antunes Steamer' ? 'active' : ''}`} onClick={() => setFilterCategory('Antunes Steamer')}>Antunes Steamer</div>
                    <div className={`filter-chip ${filterCategory === 'Antunes Egg Station' ? 'active' : ''}`} onClick={() => setFilterCategory('Antunes Egg Station')}>Antunes Egg Station</div>
                    <div className={`filter-chip ${filterCategory === 'Antunes Toaster' ? 'active' : ''}`} onClick={() => setFilterCategory('Antunes Toaster')}>Antunes Toaster</div>
                    <div className={`filter-chip ${filterCategory === 'Antunes' ? 'active' : ''}`} onClick={() => setFilterCategory('Antunes')}>Antunes</div>
                    <div className={`filter-chip ${filterCategory === 'AI Team' ? 'active' : ''}`} onClick={() => setFilterCategory('AI Team')}>AI Team</div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">R&D Activities ({filteredRnD.length})</h2>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Activity</th>
                                <th>Category</th>
                                <th>Date</th>
                                <th>Cost</th>
                                <th>Description</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRnD.length === 0 ? (
                                <tr>
                                    <td colSpan="6">
                                        <div className="empty-state">
                                            <div className="empty-state-icon">🔬</div>
                                            <div className="empty-state-title">No R&D activities</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredRnD.map(item => (
                                    <tr key={item.id}>
                                        <td><strong>{item.name}</strong></td>
                                        <td><span className={`badge badge-${item.category.toLowerCase()}`}>{item.category}</span></td>
                                        <td>{item.date}</td>
                                        <td><strong>₹{item.cost?.toLocaleString()}</strong></td>
                                        <td>{item.description}</td>
                                        <td>
                                            <div className="action-buttons">
                                                <button className="btn-icon">👁️</button>
                                                <button className="btn-icon">✏️</button>
                                                <button className="btn-icon">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && (
                <RnDModal
                    onClose={() => setModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}

// ==================== MODAL COMPONENTS ====================

// Inventory Modal
function InventoryModal({ item, onClose, onSave }) {
    const [formData, setFormData] = useState(item || {
        product_name: '',
        brand_name: '',
        quantity: 0,
        unit: '',
        net_weight: 0,
        reorder_level: 0,
        unit_cost: 0
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (item) {
            const { data } = await supabase
                .from(TABLES.INVENTORY)
                .update(formData)
                .eq('id', item.id)
                .select();
            onSave(data[0]);
        } else {
            const { data } = await supabase
                .from(TABLES.INVENTORY)
                .insert([formData])
                .select();
            onSave(data[0]);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{item ? 'Edit' : 'Add'} Inventory Item</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Product Name</label>
                                <input type="text" className="form-input" value={formData.product_name} onChange={(e) => setFormData({...formData, product_name: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Brand Name</label>
                                <input type="text" className="form-input" value={formData.brand_name} onChange={(e) => setFormData({...formData, brand_name: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Current Quantity</label>
                                <input type="number" step="0.01" className="form-input" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value)})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Unit</label>
                                <input type="text" className="form-input" placeholder="kg, liters, pieces" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Net Weight</label>
                                <input type="number" step="0.01" className="form-input" value={formData.net_weight} onChange={(e) => setFormData({...formData, net_weight: parseFloat(e.target.value)})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Reorder Level</label>
                                <input type="number" step="0.01" className="form-input" value={formData.reorder_level} onChange={(e) => setFormData({...formData, reorder_level: parseFloat(e.target.value)})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Unit Cost (₹)</label>
                                <input type="number" step="0.01" className="form-input" value={formData.unit_cost} onChange={(e) => setFormData({...formData, unit_cost: parseFloat(e.target.value)})} required />
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Save Item</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Purchase Modal
function PurchaseModal({ onClose, onSave }) {
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        invoice_number: '',
        product_name: '',
        brand_name: '',
        unit: '',
        net_weight: 0,
        price: 0,
        quantity: 0,
        total_amount: 0,
        category: '',
        supplier_name: ''
    });

    useEffect(() => {
        const total = formData.price * formData.quantity;
        setFormData(prev => ({...prev, total_amount: total}));
    }, [formData.price, formData.quantity]);

    const handleSubmit = async (e) => {
    e.preventDefault();
    
    const { data, error } = await supabase
        .from(TABLES.PURCHASES)
        .insert([formData])
        .select();
    
    if (error) {
        console.error('Error:', error);
        alert('Failed to save: ' + error.message);
        return;
    }
    
    if (data && data[0]) {
        onSave(data[0]);
    }
};

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Add Purchase</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Date</label>
                                <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Invoice Number</label>
                                <input type="text" className="form-input" value={formData.invoice_number} onChange={(e) => setFormData({...formData, invoice_number: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Product Name</label>
                                <input type="text" className="form-input" value={formData.product_name} onChange={(e) => setFormData({...formData, product_name: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Brand Name</label>
                                <input type="text" className="form-input" value={formData.brand_name} onChange={(e) => setFormData({...formData, brand_name: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Unit</label>
                                <input type="text" className="form-input" placeholder="kg, liters, pieces" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Net Weight</label>
                                <input type="number" step="0.01" className="form-input" value={formData.net_weight} onChange={(e) => setFormData({...formData, net_weight: parseFloat(e.target.value)})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Price (₹)</label>
                                <input type="number" step="0.01" className="form-input" value={formData.price} onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value)})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Quantity</label>
                                <input type="number" step="0.01" className="form-input" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value)})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Total Amount (₹)</label>
                                <input type="number" step="0.01" className="form-input" value={formData.total_amount} readOnly />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                <input type="text" className="form-input" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Supplier Name</label>
                                <input type="text" className="form-input" value={formData.supplier_name} onChange={(e) => setFormData({...formData, supplier_name: e.target.value})} required />
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Save Purchase</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Usage Modal
function UsageModal({ inventory, purchases, onClose, onSave }) {
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        product_name: '',
        brand_name: '',
        unit: '',
        net_weight: 0,
        uom: '',
        quantity: 0,
        issued_by: '',
        usage_purpose: ''
    });
    const [error, setError] = useState('');
    const [maxQuantity, setMaxQuantity] = useState(0);

    const availableProducts = React.useMemo(() => {
        const productSet = new Set();
        inventory.forEach(item => { if (item.product_name) productSet.add(item.product_name); });
        purchases.forEach(item => { if (item.product_name) productSet.add(item.product_name); });
        return Array.from(productSet).sort();
    }, [inventory, purchases]);

    const availableBrands = React.useMemo(() => {
        if (!formData.product_name) return [];
        const brandSet = new Set();
        inventory.forEach(item => {
            if (item.product_name?.toLowerCase() === formData.product_name?.toLowerCase() && item.brand_name) {
                brandSet.add(item.brand_name);
            }
        });
        purchases.forEach(item => {
            if (item.product_name?.toLowerCase() === formData.product_name?.toLowerCase() && item.brand_name) {
                brandSet.add(item.brand_name);
            }
        });
        return Array.from(brandSet).sort();
    }, [formData.product_name, inventory, purchases]);

    const handleProductChange = (e) => {
        const productName = e.target.value;
        setFormData({ ...formData, product_name: productName, brand_name: '', quantity: 0 });
        setError('');
        setMaxQuantity(0);
    };

    const handleBrandChange = (e) => {
        const brandName = e.target.value;
        const inventoryItem = inventory.find(
            item => item.product_name?.toLowerCase() === formData.product_name?.toLowerCase() &&
                   item.brand_name?.toLowerCase() === brandName?.toLowerCase()
        );

        if (inventoryItem) {
            setMaxQuantity(inventoryItem.quantity || 0);
            setFormData({
                ...formData,
                brand_name: brandName,
                unit: inventoryItem.unit || '',
                net_weight: inventoryItem.net_weight || 0,
                uom: inventoryItem.unit || '',
                quantity: 0
            });
        } else {
            const purchaseItem = purchases.find(
                item => item.product_name?.toLowerCase() === formData.product_name?.toLowerCase() &&
                       item.brand_name?.toLowerCase() === brandName?.toLowerCase()
            );
            if (purchaseItem) {
                setMaxQuantity(0);
                setFormData({
                    ...formData,
                    brand_name: brandName,
                    unit: purchaseItem.unit || '',
                    net_weight: purchaseItem.net_weight || 0,
                    uom: purchaseItem.unit || '',
                    quantity: 0
                });
            }
        }
        setError('');
    };

    const handleQuantityChange = (e) => {
        const quantity = parseFloat(e.target.value) || 0;
        if (quantity > maxQuantity && maxQuantity > 0) {
            setError(`Maximum available quantity is ${maxQuantity} Units`);
        } else {
            setError('');
        }
        setFormData({...formData, quantity});
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.quantity > maxQuantity && maxQuantity > 0) {
            setError(`Cannot use more than ${maxQuantity} ${formData.unit}`);
            return;
        }
        const { data } = await supabase.from(TABLES.USAGE).insert([formData]).select();
        onSave(data[0]);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Add Usage Record</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && <div className="alert alert-error" style={{marginBottom: '16px'}}>⚠️ {error}</div>}
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Date</label>
                                <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Product</label>
                                <select className="form-select" value={formData.product_name} onChange={handleProductChange} required>
                                    <option value="">Select Product</option>
                                    {availableProducts.map(product => <option key={product} value={product}>{product}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Brand</label>
                                <select className="form-select" value={formData.brand_name} onChange={handleBrandChange} disabled={!formData.product_name} required>
                                    <option value="">Select Brand</option>
                                    {availableBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Unit</label>
                                <input type="text" className="form-input" value={formData.unit} readOnly />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Net Weight</label>
                                <input type="number" step="0.01" className="form-input" value={formData.net_weight} readOnly />
                            </div>
                            <div className="form-group">
                                <label className="form-label">UOM</label>
                                <input type="text" className="form-input" value={formData.uom} readOnly />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Quantity {maxQuantity > 0 && <span style={{color: '#718096'}}>(Max: {maxQuantity})</span>}</label>
                                <input type="number" step="0.01" className="form-input" value={formData.quantity} onChange={handleQuantityChange} disabled={!formData.brand_name} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Issued By</label>
                                <select className="form-input" value={formData.issued_by} onChange={(e) => setFormData({ ...formData, issued_by: e.target.value })} required>
                                    <option value="">Select issuer</option>
                                    <option value="Bikas">Bikas</option>
                                    <option value="Ganesh">Ganesh</option>
                                    <option value="Krishna">Krishna</option>
                                    <option value="Manish">Manish</option>
                                    <option value="Sanjay">Sanjay</option>
                                    <option value="Shahid">Shahid</option>
                                    <option value="Uttam">Uttam</option>
                                    <option value="Vikram">Vikram</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                                <label className="form-label">Purpose</label>
                                <select className="form-input" value={formData.usage_purpose} onChange={(e) => setFormData({ ...formData, usage_purpose: e.target.value })} required>
                                    <option value="">Select purpose</option>
                                    <option value="New Product Development">New Product Development</option>
                                    <option value="Client Demo">Client Demo</option>
                                    <option value="Training">Training</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={!!error}>Save Usage</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Recipe Modal
function RecipeModal({ onClose, onSave, inventoryItems, purchases, recipe }) {
  const [formData, setFormData] = useState(recipe || {
    name: '',
    veg_non_veg: 'Veg',
    cooking_mode: '',
    cuisine: '',
    category: '',
    cooking_time: '',
    image_url: '',
    popup_image_url: '',
    ingredients: [],
    accessories: '',
    total_output: '',
    on2cook_time: '',
    normal_cooking_time: '',
    total_cost: 0
  });
  const [ingredientsError, setIngredientsError] = useState('');

  const handleIngredientsChange = (e) => {
    const value = e.target.value.trim();
    setIngredientsError('');
    if (!value) {
      setFormData({...formData, ingredients: []});
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        setFormData({...formData, ingredients: parsed});
      } else {
        throw new Error('Must be an array');
      }
    } catch (err) {
      const lines = value.split('\n').map(line => line.trim()).filter(Boolean);
      const parsedIngredients = lines.map(line => {
        const match = line.match(/(\d+(?:\.\d+)?)\s*([a-z]+)\s*(.*)/i);
        if (match) {
          return { name: match[3].trim(), quantity: parseFloat(match[1]), unit: match[2].toLowerCase(), cost: 0 };
        }
        return { name: line, quantity: 0, unit: '', cost: 0 };
      });
      setFormData({...formData, ingredients: parsedIngredients});
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.ingredients.length === 0) {
      setIngredientsError('At least one ingredient required');
      return;
    }
    const totalCost = (formData.ingredients || []).reduce(
      (sum, ing) => sum + calculateIngredientCost(ing, purchases), 0
    );
    const recipeToSave = { ...formData, parsed_ingredients: formData.ingredients, total_cost: totalCost };

    try {
      let data, error;
      if (recipe) {
        ({ data, error } = await supabase.from(TABLES.RECIPES).update(recipeToSave).eq('id', recipe.id).select());
      } else {
        ({ data, error } = await supabase.from(TABLES.RECIPES).insert([recipeToSave]).select());
      }
      if (error) {
        alert(`Save failed: ${error.message}`);
        return;
      }
      onSave(data[0]);
    } catch (err) {
      alert('Failed to save recipe. Check console for details.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{recipe ? 'Edit' : 'Add'} Recipe</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Recipe Name</label>
                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Veg/Non-Veg</label>
                <select className="form-select" value={formData.veg_non_veg} onChange={e => setFormData({...formData, veg_non_veg: e.target.value})}>
                  <option>Veg</option>
                  <option>Non-Veg</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cuisine</label>
                <input type="text" className="form-input" value={formData.cuisine} onChange={e => setFormData({...formData, cuisine: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <input type="text" className="form-input" placeholder="Main Course, Appetizer" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Cooking Time</label>
                <input type="text" className="form-input" value={formData.cooking_time} onChange={e => setFormData({...formData, cooking_time: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Image URL</label>
                <input type="url" className="form-input" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} />
              </div>
              <div className="form-group" style={{gridColumn: '1 / -1'}}>
                <label className="form-label">Ingredients (JSON or line-by-line)</label>
                <textarea className="form-textarea" rows="6" 
                  placeholder='[{"name": "Flour", "quantity": 500, "unit": "gm"}]'
                  value={JSON.stringify(formData.ingredients, null, 2)}
                  onChange={handleIngredientsChange} />
                {ingredientsError && <div className="alert alert-error">{ingredientsError}</div>}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Recipe</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Demo Modal
function DemoModal({ onClose, onSave, recipes, purchases }) {
    const [formData, setFormData] = useState({
        client_name: '', 
        demo_type: 'virtual', 
        date: new Date().toISOString().split('T')[0],
        recipe_ids: [],
        recipe_names: [],
        portion_size: '', 
        cost: 0, 
        chef_name: '', 
        sales_member: '',
        notes: ''
    });
    const [selectedRecipes, setSelectedRecipes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [recipePortionSizes, setRecipePortionSizes] = useState([]);
    const [calculatePortionCosts, setCalculatePortionCosts] = useState([]);

    const filteredRecipes = recipes.filter(r => 
        r.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedRecipes.find(sr => sr.id === r.id)
    );

    const calculateTotalCost = () => {
        return selectedRecipes.reduce((sum, recipe, index) => {
            const portionSize = recipePortionSizes[index] || recipe.total_output;
            const portionCost = calculatePortionCost(recipe, purchases, portionSize, recipe.total_output);
            return sum + portionCost;
        }, 0);
    };

    const totalDemoCost = calculateTotalCost();

    const addRecipe = (recipe) => {
        const newSelectedRecipes = [...selectedRecipes, recipe];
        setSelectedRecipes(newSelectedRecipes);
        
        // Add default portion size (full recipe)
        setRecipePortionSizes([...recipePortionSizes, recipe.total_output || '']);
        
        // Calculate initial cost for the new recipe
        const newCosts = [...calculatePortionCosts, calculatePortionCost(recipe, purchases, recipe.total_output, recipe.total_output)];
        setCalculatePortionCosts(newCosts);
        
        setSearchTerm('');
    };

    const removeRecipe = (index) => {
        setSelectedRecipes(selectedRecipes.filter((_, i) => i !== index));
        setRecipePortionSizes(recipePortionSizes.filter((_, i) => i !== index));
        setCalculatePortionCosts(calculatePortionCosts.filter((_, i) => i !== index));
    };

    const updatePortionSize = (index, portionSize) => {
        const newSizes = [...recipePortionSizes];
        newSizes[index] = portionSize;
        setRecipePortionSizes(newSizes);
        
        // Recalculate costs
        const newCosts = selectedRecipes.map((recipe, i) => 
            calculatePortionCost(recipe, purchases, newSizes[i] || recipe.total_output, recipe.total_output)
        );
        setCalculatePortionCosts(newCosts);
    };

    useEffect(() => {
        if (selectedRecipes.length > 0) {
            const newCost = calculateTotalCost();
            setFormData(prev => ({ ...prev, cost: newCost }));
        } else {
            setFormData(prev => ({ ...prev, cost: 0 }));
        }
    }, [selectedRecipes, recipePortionSizes]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const recipeDetails = selectedRecipes.map((recipe, index) => ({
            recipe_id: recipe.id,
            recipe_name: recipe.name,
            portion_size: recipePortionSizes[index] || 'Full Recipe',
            portion_cost: calculatePortionCosts[index] || 0,
            total_recipe_cost: recipe.total_cost || 0
        }));

        const demoData = {
            client_name: formData.client_name,
            demo_type: formData.demo_type,
            date: formData.date,
            recipe_ids: selectedRecipes.map(r => r.id),
            recipe_names: selectedRecipes.map(r => r.name),
            recipe_details: recipeDetails,
            portion_size: formData.portion_size || null,
            cost: totalDemoCost,
            chef_name: formData.chef_name,
            sales_member: formData.sales_member || null,
            notes: formData.notes || null
        };
        
        console.log('Submitting demo data:', demoData);
        
        try {
            const { error } = await supabase
                .from(TABLES.DEMOS)
                .insert([demoData]); 
            
            if (error) {
                console.error('Demo insert error:', error);
                alert('Failed to save demo: ' + error.message);
                return;
            }

            const savedDemo = {
                ...demoData,
                id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
                created_at: new Date().toISOString()
            };

            console.log('Demo saved successfully');
            onSave(savedDemo);
            
            setTimeout(async () => {
                const { data: allDemos } = await supabase
                    .from(TABLES.DEMOS)
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (allDemos && allDemos[0]) {
                    console.log('Real demo from DB:', allDemos[0]);
                }
            }, 500);
            
        } catch (err) {
            console.error('Demo save error:', err);
            alert('Failed to save demo. Check console for details.');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{maxWidth: '900px'}} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Add Demo</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Client Name</label>
                                <input type="text" className="form-input" value={formData.client_name} onChange={(e) => setFormData({...formData, client_name: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Demo Type</label>
                                <select className="form-select" value={formData.demo_type} onChange={(e) => setFormData({...formData, demo_type: e.target.value})} required>
                                    <option value="virtual">Virtual</option>
                                    <option value="onsite">Onsite</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Date</label>
                                <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Chef Name</label>
                                <select className="form-input" value={formData.chef_name} onChange={(e) => setFormData({ ...formData, chef_name: e.target.value })} required>
                                    <option value="">Select a chef</option>
                                    <option value="Rishi Thapa">Rishi Thapa</option>
                                    <option value="Mandeep">Mandeep Sabherwal</option>
                                    <option value="Akshay">Akshay Chavan</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Sales Team Member</label>
                                <select className="form-input" value={formData.sales_member} onChange={(e) => setFormData({ ...formData, sales_member: e.target.value })}>
                                    <option value="">Select a team member</option>
                                    <option value="Anil">Anil</option>
                                    <option value="Ankit">Ankit</option>
                                    <option value="Bhavith">Bhavith</option>
                                    <option value="Brijraj">Brijraj</option>
                                    <option value="Devashish">Devashish</option>
                                    <option value="Rohit">Rohit</option>
                                    <option value="Sachin">Sachin</option>
                                    <option value="Salim">Salim</option>
                                    <option value="Sapan">Sapan</option>
                                    <option value="Sneha">Sneha</option>
                                    <option value="Tejas">Tejas</option>
                                    <option value="Vruddhi">Vruddhi</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                                <label className="form-label">Notes</label>
                                <textarea 
                                    className="form-textarea" 
                                    value={formData.notes} 
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Any additional notes about this demo..."
                                    rows="2"
                                />
                            </div>
                        </div>

                        <div style={{marginTop: '24px', borderTop: '2px solid #e2e8f0', paddingTop: '24px'}}>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label className="form-label" style={{fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'block'}}>
                                    📖 Add Recipes
                                </label>
                                <div style={{position: 'relative'}}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="🔍 Search and add recipes..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{paddingLeft: '12px'}}
                                    />
                                    {searchTerm && filteredRecipes.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            border: '2px solid #667eea',
                                            borderRadius: '8px',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            marginTop: '4px',
                                            background: 'white',
                                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                            zIndex: 1000
                                        }}>
                                            {filteredRecipes.slice(0, 8).map(recipe => (
                                                <div
                                                    key={recipe.id}
                                                    style={{
                                                        padding: '12px 16px',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid #f0f0f0',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onClick={() => addRecipe(recipe)}
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.background = '#f7fafc';
                                                        e.currentTarget.style.paddingLeft = '20px';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.background = 'white';
                                                        e.currentTarget.style.paddingLeft = '16px';
                                                    }}
                                                >
                                                    <div style={{fontWeight: '500', color: '#2d3748'}}>{recipe.name}</div>
                                                    <div style={{fontSize: '12px', color: '#718096', marginTop: '4px'}}>
                                                        Output: {recipe.total_output} • Cost: ₹{recipe.total_cost?.toFixed(0) || '0'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {searchTerm && filteredRecipes.length === 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            padding: '12px',
                                            background: '#fff5f5',
                                            border: '1px solid #fc8181',
                                            borderRadius: '8px',
                                            marginTop: '4px',
                                            color: '#c53030',
                                            fontSize: '14px'
                                        }}>
                                            No recipes found
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {selectedRecipes.length > 0 && (
                                <div style={{marginTop: '20px'}}>
                                    <label className="form-label" style={{fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'block'}}>
                                         Selected Recipes ({selectedRecipes.length})
                                    </label>
                                    <div style={{
                                        background: '#f8fafc',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        border: '2px solid #e2e8f0'
                                    }}>
                                        {selectedRecipes.map((recipe, index) => (
                                            <div key={recipe.id} style={{
                                                background: 'white',
                                                borderRadius: '8px',
                                                padding: '16px',
                                                marginBottom: index < selectedRecipes.length - 1 ? '12px' : '0',
                                                border: '1px solid #e2e8f0',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                            }}>
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '2fr 2fr 1fr auto',
                                                    gap: '16px',
                                                    alignItems: 'center'
                                                }}>
                                                    <div>
                                                        <div style={{fontWeight: '600', color: '#2d3748', marginBottom: '6px'}}>
                                                            {recipe.name}
                                                        </div>
                                                        <div style={{fontSize: '12px', color: '#a0aec0'}}>
                                                            Output: {recipe.total_output}
                                                        </div>
                                                    </div>
                                                    
                                                    <div>
                                                        <label style={{
                                                            display: 'block',
                                                            fontSize: '12px',
                                                            fontWeight: '500',
                                                            color: '#4a5568',
                                                            marginBottom: '6px'
                                                        }}>
                                                            Portion Size
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g., 100g, 2 portions"
                                                            value={recipePortionSizes[index] || ''}
                                                            onChange={(e) => updatePortionSize(index, e.target.value)}
                                                            className="form-input"
                                                            style={{
                                                                margin: 0,
                                                                fontSize: '14px',
                                                                padding: '8px 12px'
                                                            }}
                                                        />
                                                    </div>
                                                    
                                                    <div style={{
                                                        textAlign: 'center',
                                                        padding: '8px 12px',
                                                        background: '#f0fff4',
                                                        borderRadius: '6px',
                                                        border: '1px solid #9ae6b4'
                                                    }}>
                                                        <div style={{fontSize: '11px', color: '#2f855a', marginBottom: '2px'}}>Cost</div>
                                                        <div style={{fontWeight: '700', fontSize: '16px', color: '#22543d'}}>
                                                            ₹{calculatePortionCosts[index]?.toFixed(0) || '0'}
                                                        </div>
                                                    </div>
                                                    
                                                    <button 
                                                        type="button"
                                                        onClick={() => removeRecipe(index)}
                                                        style={{
                                                            background: '#fed7d7',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            width: '36px',
                                                            height: '36px',
                                                            cursor: 'pointer',
                                                            fontSize: '18px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseOver={(e) => {
                                                            e.currentTarget.style.background = '#fc8181';
                                                            e.currentTarget.style.transform = 'scale(1.1)';
                                                        }}
                                                        onMouseOut={(e) => {
                                                            e.currentTarget.style.background = '#fed7d7';
                                                            e.currentTarget.style.transform = 'scale(1)';
                                                        }}
                                                        title="Remove recipe"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        <div style={{
                                            marginTop: '16px',
                                            padding: '16px',
                                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            color: 'white',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            boxShadow: '0 4px 6px rgba(102, 126, 234, 0.3)'
                                        }}>
                                            <div>
                                                <div style={{fontSize: '14px', opacity: 0.9}}>Total Demo Cost</div>
                                                <div style={{fontSize: '28px', fontWeight: '700', marginTop: '4px'}}>
                                                    ₹{totalDemoCost.toFixed(0)}
                                                </div>
                                            </div>
                                            <div style={{
                                                background: 'rgba(255,255,255,0.2)',
                                                padding: '12px 20px',
                                                borderRadius: '6px',
                                                fontSize: '14px'
                                            }}>
                                                {selectedRecipes.length} {selectedRecipes.length === 1 ? 'Recipe' : 'Recipes'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedRecipes.length === 0 && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px 20px',
                                    background: '#f7fafc',
                                    borderRadius: '12px',
                                    border: '2px dashed #cbd5e0',
                                    marginTop: '16px'
                                }}>
                                    <div style={{fontSize: '48px', marginBottom: '12px'}}>📖</div>
                                    <div style={{fontSize: '16px', color: '#4a5568', fontWeight: '500'}}>
                                        No recipes selected yet
                                    </div>
                                    <div style={{fontSize: '14px', color: '#718096', marginTop: '8px'}}>
                                        Search and add recipes above to get started
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="modal-footer" style={{borderTop: '2px solid #e2e8f0'}}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            disabled={selectedRecipes.length === 0}
                            style={{
                                minWidth: '180px',
                                fontSize: '16px',
                                fontWeight: '600'
                            }}
                        >
                            💾 Save Demo • ₹{totalDemoCost.toFixed(0)}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// R&D Modal
function RnDModal({ onClose, onSave }) {
    const [formData, setFormData] = useState({
        name: '', category: 'B2C', date: new Date().toISOString().split('T')[0],
        cost: 0, description: '', recipes: []
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { data } = await supabase.from(TABLES.RND).insert([formData]).select();
        onSave(data[0]);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Add R&D Activity</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Activity Name</label>
                                <input type="text" className="form-input" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                <select className="form-select" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} required>
                                    <option value="B2C">B2C</option>
                                    <option value="B2B NPD">B2B</option>
                                    <option value="Antunes">Antunes</option>
                                    <option value="AI Team">AI Team</option>
                                    <option value="Antunes Steamer">Antunes Steamer</option>
                                    <option value="Antunes Toaster">Antunes Toaster</option>
                                    <option value="Antunes Egg Station">Antunes Egg Station</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Date</label>
                                <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Budget (₹)</label>
                                <input type="number" step="0.01" className="form-input" value={formData.cost} onChange={(e) => setFormData({...formData, cost: parseFloat(e.target.value)})} required />
                            </div>
                            <div className="form-group" style={{gridColumn: '1 / -1'}}>
                                <label className="form-label">Description</label>
                                <textarea className="form-textarea" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Save R&D Entry</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ==================== MAIN APP ====================
// Replace the entire App function
// SIMPLIFIED - NO AUTH, NO LOGIN, NO LOGOUT
function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [data, setData] = useState({
    inventory: [], purchases: [], usage: [], recipes: [], demos: [], rnd: []
  });
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({ id: 'demo', name: 'Team' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [inventory, purchases, usage, recipes, demos, rnd, logs] = await Promise.all([
        supabase.from('inventory').select(),
        supabase.from('purchases').select(),
        supabase.from('usage').select(), 
        supabase.from('recipes').select(),
        supabase.from('demos').select(),
        supabase.from('rnd').select(),
        supabase.from('task_logs').select().order('created_at', { ascending: false }).limit(100)
      ]);
      
      setData({
        inventory: inventory.data || [],
        purchases: purchases.data || [],
        usage: usage.data || [],
        recipes: recipes.data || [],
        demos: demos.data || [],
        rnd: rnd.data || []
      });
      
      setActivityLogs(logs.data || []);
    } catch (error) {
      console.error('Error fetching data', error);
    } finally {
      setLoading(false);
    }
  };

  const logActivity = async (activityType, description) => {
    // PASSWORD PROMPT FOR TASK LOGGING ONLY
    const password = prompt('Enter password to verify identity:');
    if (!password || password !== 'your_secret_password') {  // Change this password
      alert('❌ Invalid password. Task not logged.');
      return null;
    }

    const activity = {
      user_id: user.id,
      username: user.name,
      user_email: user.email,
      task_name: activityType,
      description: description,
      start_time: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('task_logs')
        .insert(activity)
        .select();
      
      if (error) throw error;
      setActivityLogs(prev => [data[0], ...prev]);
      return data[0];
    } catch (err) {
      console.error('Activity log failed', err);
      return activity;
    }
  };

  if (loading) {
    return <div className="loading-spinner"><div className="spinner"></div></div>;
  }

  return (
    <div className="app-container">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        user={user} 
        activityCount={activityLogs.filter(log => log.user_id === user.id).length}
      />
      <div className="main-content">
        {currentPage === 'dashboard' && <EnhancedDashboard 
            data={data} 
            user={user} 
            activityLogs={activityLogs} 
            onNavigate={setCurrentPage} 
        />}
        {currentPage === 'logs' && <TaskLogs user={user} logActivity={logActivity} taskLogs={activityLogs} />}
        {currentPage === 'inventory' && <Inventory data={data} setData={setData} logActivity={logActivity} />}
        {currentPage === 'purchases' && <Purchases data={data} setData={setData} logActivity={logActivity} />}
        {currentPage === 'usage' && <Usage data={data} setData={setData} logActivity={logActivity} />}
        {currentPage === 'recipes' && <Recipes data={data} setData={setData} logActivity={logActivity} />}
        {currentPage === 'demos' && <Demos data={data} setData={setData} logActivity={logActivity} />}
        {currentPage === 'rnd' && <RnD data={data} setData={setData} logActivity={logActivity} />}
      </div>
    </div>
  );
}





// ==================== DASHBOARD ====================
function Dashboard({ user }) {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [data, setData] = useState({
        inventory: [],
        purchases: [],
        usage: [],
        recipes: [],
        demos: [],
        rnd: []
    });
    const [activityLogs, setActivityLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showProfile, setShowProfile] = useState(false);
    const { logActivity } = useActivityLogger(user, setActivityLogs);
    useEffect(() => {
        fetchData();
        // logLoginActivity();
    }, []);

    // const logLoginActivity = async () => {
    //     await logActivity('Login', `${user.name} logged in as ${user.role}`, { role: user.role });
    // };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [inventory, purchases, usage, recipes, demos, rnd, logs] = await Promise.all([
                supabase.from(TABLES.INVENTORY).select('*'),
                supabase.from(TABLES.PURCHASES).select('*'),
                supabase.from(TABLES.USAGE).select('*'),
                supabase.from(TABLES.RECIPES).select('*'),
                supabase.from(TABLES.DEMOS).select('*'),
                supabase.from(TABLES.RND).select('*'),
                supabase.from(TABLES.task_logs).select('*').order('created_at', { ascending: false }).limit(100)
            ]);

            setData({
                inventory: inventory.data || [],
                purchases: purchases.data || [],
                usage: usage.data || [],
                recipes: recipes.data || [],
                demos: demos.data || [],
                rnd: rnd.data || []
            });

            // Merge with local logs
            const localLogs = JSON.parse(localStorage.getItem('task_logs') || '[]');
            const allLogs = [...(logs.data || []), ...localLogs];
            setActivityLogs(allLogs);
        } catch (error) {
            console.error('Error fetching data:', error);
            // Try to load from local storage
            const localLogs = JSON.parse(localStorage.getItem('task_logs') || '[]');
            setActivityLogs(localLogs);
        } finally {
            setLoading(false);
        }
    };
   

    const userActivityCount = activityLogs.filter(log => log.user_id === user.id).length;

    if (loading) {
        return (
            <div className="loading-spinner">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Sidebar
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                user={user}
                // onLogout={onLogout}
                onProfileClick={() => setShowProfile(true)}
                activityCount={userActivityCount}
            />
            <div className="main-content">
                {currentPage === 'dashboard' && <EnhancedDashboard data={data} user={user} activityLogs={activityLogs} onNavigate={setCurrentPage} />}
                {currentPage === 'logs' && <TaskLogs user={user} logActivity={logActivity} />}
                {currentPage === 'inventory' && <Inventory data={data} setData={setData} logActivity={logActivity} />}
                {currentPage === 'purchases' && <Purchases data={data} setData={setData} logActivity={logActivity}/>}
                {currentPage === 'usage' && <Usage data={data} setData={setData} logActivity={logActivity} />}
                {currentPage === 'recipes' && <Recipes data={data} setData={setData} logActivity={logActivity} />}
                {currentPage === 'demos' && <Demos data={data} setData={setData} logActivity={logActivity} />}
                {currentPage === 'rnd' && <RnD data={data} setData={setData} logActivity={logActivity} />}
            </div>

            {showProfile && (
                <UserProfile
                    user={user}
                    activityLogs={activityLogs}
                    onClose={() => setShowProfile(false)}
                    // onLogout={onLogout}
                />
            )}
        </div>
    );
}

// Render the app
ReactDOM.render(<App />, document.getElementById('root'));