const { useState, useEffect } = React;

// Main App Component
function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        const loggedInUser = localStorage.getItem('culinary_user');
        if (loggedInUser) {
            setUser(JSON.parse(loggedInUser));
        }
        setLoading(false);
    };

    const handleLogin = (userData) => {
        localStorage.setItem('culinary_user', JSON.stringify(userData));
        setUser(userData);
    };

    const handleLogout = () => {
        localStorage.removeItem('culinary_user');
        setUser(null);
    };

    if (loading) {
        return (
            <div className="loading-spinner">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!user) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return <Dashboard user={user} onLogout={handleLogout} />;
}

// Main Dashboard Component
function Dashboard({ user, onLogout }) {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [data, setData] = useState({
        inventory: [],
        purchases: [],
        usage: [],
        recipes: [],
        demos: [],
        rnd: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [inventory, purchases, usage, recipes, demos, rnd] = await Promise.all([
                supabase.from(TABLES.INVENTORY).select('*'),
                supabase.from(TABLES.PURCHASES).select('*'),
                supabase.from(TABLES.USAGE).select('*'),
                supabase.from(TABLES.RECIPES).select('*'),
                supabase.from(TABLES.DEMOS).select('*'),
                supabase.from(TABLES.RND).select('*')
            ]);

            setData({
                inventory: inventory.data || [],
                purchases: purchases.data || [],
                usage: usage.data || [],
                recipes: recipes.data || [],
                demos: demos.data || [],
                rnd: rnd.data || []
            });
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

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
                onLogout={onLogout}
            />
            <div className="main-content">
                {currentPage === 'dashboard' && <DashboardHome data={data} />}
                {currentPage === 'inventory' && <Inventory data={data} setData={setData} />}
                {currentPage === 'purchases' && <Purchases data={data} setData={setData} />}
                {currentPage === 'usage' && <Usage data={data} setData={setData} />}
                {currentPage === 'recipes' && <Recipes data={data} setData={setData} />}
                {currentPage === 'demos' && <Demos data={data} setData={setData} />}
                {currentPage === 'rnd' && <RnD data={data} setData={setData} />}
            </div>
        </div>
    );
}

// Render the app
ReactDOM.render(<App />, document.getElementById('root'));