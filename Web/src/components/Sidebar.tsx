import { NavLink } from 'react-router-dom';
import { Camera, FileVideo, BarChart2, Gamepad2, History, Settings, X } from 'lucide-react';
import cricketLogo from '../assets/cricket_logo.png';
import cricketSketch from '../assets/cricket_sketch.png';

const menuItems = [
    { name: 'Live Detection', icon: Camera, path: '/home' },
    { name: 'Detection Source', icon: FileVideo, path: '/source' },
    { name: 'Analytics', icon: BarChart2, path: '/analytics' },
    { name: 'Rule-Based Game', icon: Gamepad2, path: '/game' },
    { name: 'Match History', icon: History, path: '/match-history' },
    { name: 'Settings', icon: Settings, path: '/settings' },
];

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
    return (
        <>
            {/* Sidebar Container */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-zinc-900 border-r border-emerald-100 dark:border-white/5 flex flex-col shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {/* Logo Section */}
                <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src={cricketLogo} alt="Logo" className="w-10 h-10 object-contain" />
                        <div>
                            <h1 className="text-lg font-bold text-gray-800 dark:text-white leading-tight">Cricket Shot</h1>
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold tracking-wider uppercase">Detection System</p>
                        </div>
                    </div>
                    {/* Close button for mobile */}
                    <button onClick={onClose} className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="px-4 space-y-2 flex-1 overflow-y-auto">
                    {menuItems.map((item) => (
                        <NavLink
                            key={item.name}
                            to={item.path}
                            onClick={onClose}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group
                                ${isActive
                                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-lg shadow-emerald-200'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-white/5 hover:text-emerald-600 dark:hover:text-emerald-400'
                                }
                            `}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-semibold text-sm tracking-wide">{item.name}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Bottom Illustration */}
                <div className="relative mt-auto h-64 w-full overflow-hidden shrink-0">
                    <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-emerald-50 to-transparent dark:from-zinc-900 z-10" />
                    <img
                        src={cricketSketch}
                        alt="Cricket Illustration"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-56 opacity-80 mix-blend-multiply dark:mix-blend-normal drop-shadow-2xl"
                    />
                </div>
            </aside>

            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
                    onClick={onClose}
                />
            )}
        </>
    );
}
