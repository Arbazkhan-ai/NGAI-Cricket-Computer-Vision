
import { User, Bell, Shield, Sliders, Save, Camera, Moon, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Settings() {
    const [activeSection, setActiveSection] = useState('profile');
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [profileData, setProfileData] = useState({
        name: "Arbaz Khan",
        email: "arbaz@example.com",
        phone: "+92 98765 43210",
        location: "Murree, Pakistan",
        image: "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop"
    });

    useEffect(() => {
        // Check initial dark mode preference
        if (document.documentElement.classList.contains('dark')) {
            setIsDarkMode(true);
        }

        // Load user data from localStorage
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setProfileData(prev => ({
                    ...prev,
                    name: user.name || prev.name,
                    email: user.email || prev.email,
                }));
            } catch (e) {
                console.error("Failed to parse user data", e);
            }
        }
    }, []);

    const toggleDarkMode = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        if (newMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileData(prev => ({ ...prev, image: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        console.log('Saving settings:', profileData);
        alert('Settings saved successfully!');
    };

    return (
        <div className="space-y-8 pb-8">

            {/* Header Banner */}
            <div className="bg-emerald-500 rounded-3xl p-8 text-white shadow-lg shadow-emerald-200">
                <h1 className="text-2xl font-bold mb-2">Settings</h1>
                <p className="text-emerald-50 opacity-90 font-medium">Manage your account and application preferences</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Sidebar Navigation */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 shadow-sm border border-emerald-100 dark:border-white/5 transition-colors duration-300">
                        <nav className="space-y-1">
                            {[
                                { id: 'profile', label: 'Profile Settings', icon: User },
                                { id: 'app', label: 'App Preferences', icon: Sliders },
                                { id: 'notifications', label: 'Notifications', icon: Bell },
                                { id: 'security', label: 'Security', icon: Shield },
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left font-medium transition-all ${activeSection === item.id
                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                                        : 'text-emerald-900 dark:text-emerald-400 bg-emerald-50 dark:bg-white/5 hover:bg-emerald-100 dark:hover:bg-white/10'
                                        }`}
                                >
                                    <item.icon className={`w-5 h-5 ${activeSection === item.id ? 'text-white' : 'text-emerald-600 dark:text-emerald-500'}`} />
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-3xl p-6 text-white shadow-lg shadow-emerald-200">
                        <h3 className="font-bold text-lg mb-2">Upgrade to Pro</h3>
                        <p className="text-emerald-100 text-xs mb-4">Get access to advanced analytics and unlimited cloud storage.</p>
                        <button className="w-full bg-white text-emerald-600 py-3 rounded-xl font-bold text-sm hover:bg-emerald-50 transition-colors">
                            View Plans
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Profile Section */}
                    {activeSection === 'profile' && (
                        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500 transition-colors duration-300">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                                <User className="w-6 h-6 text-emerald-500" />
                                Profile Information
                            </h2>

                            <div className="flex items-center gap-6 mb-8">
                                <div className="relative">
                                    <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden border-4 border-emerald-50 dark:border-emerald-500/20">
                                        <img src={profileData.image} alt="Profile" className="w-full h-full object-cover" />
                                    </div>
                                    <label htmlFor="profile-upload" className="absolute bottom-0 right-0 p-2 bg-emerald-500 rounded-full text-white shadow-lg hover:bg-emerald-600 transition-colors cursor-pointer">
                                        <Camera className="w-4 h-4" />
                                        <input
                                            id="profile-upload"
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleImageUpload}
                                        />
                                    </label>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{profileData.name}</h3>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">Pro Member</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Full Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={profileData.name}
                                        onChange={handleProfileChange}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Email Address</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={profileData.email}
                                        onChange={handleProfileChange}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Phone Number</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={profileData.phone}
                                        onChange={handleProfileChange}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Location</label>
                                    <input
                                        type="text"
                                        name="location"
                                        value={profileData.location}
                                        onChange={handleProfileChange}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* App Preferences */}
                    {activeSection === 'app' && (
                        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500 transition-colors duration-300">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                                <Sliders className="w-6 h-6 text-emerald-500" />
                                Application Settings
                            </h2>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl transition-colors duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-sm text-gray-600 dark:text-gray-300"><Moon className="w-5 h-5" /></div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 dark:text-white">Dark Mode</h4>
                                            <p className="text-xs text-gray-400">Reduce eye strain in low light</p>
                                        </div>
                                    </div>
                                    <div
                                        onClick={toggleDarkMode}
                                        className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-300 ${isDarkMode ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-zinc-700'}`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full shadow-md absolute top-1 transition-transform duration-300 ${isDarkMode ? 'left-7' : 'left-1'}`} />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl transition-colors duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-sm text-gray-600 dark:text-gray-300"><Globe className="w-5 h-5" /></div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 dark:text-white">Language</h4>
                                            <p className="text-xs text-gray-400">Change application language</p>
                                        </div>
                                    </div>
                                    <select className="bg-transparent font-bold text-gray-600 dark:text-gray-300 outline-none cursor-pointer">
                                        <option>English</option>
                                        <option>Hindi</option>
                                        <option>Spanish</option>
                                    </select>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl transition-colors duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-sm text-gray-600 dark:text-gray-300"><Save className="w-5 h-5" /></div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 dark:text-white">Auto-Save Recordings</h4>
                                            <p className="text-xs text-gray-400">Automatically save match highlights</p>
                                        </div>
                                    </div>
                                    <div className="w-12 h-6 bg-emerald-500 rounded-full relative cursor-pointer">
                                        <div className="w-4 h-4 bg-white rounded-full shadow-md absolute top-1 right-1" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Placeholder for other sections */}
                    {(activeSection !== 'profile' && activeSection !== 'app') && (
                        <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                                <Shield className="w-10 h-10 text-emerald-200" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Coming Soon</h3>
                            <p className="text-gray-400 max-w-sm mx-auto">This section is currently under development. Stay tuned for future updates!</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <button className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                        <button
                            onClick={handleSave}
                            className="px-8 py-3 rounded-xl font-bold bg-emerald-500 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all transform active:scale-95 flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
