import { useState } from 'react';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import { LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DashboardLayoutProps {
    children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen bg-[#FAFAFA] dark:bg-zinc-950 overflow-hidden font-sans transition-colors duration-300">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
                {/* Top Header */}
                <header className="px-4 lg:px-8 py-4 lg:py-6 flex justify-between items-center bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10 border-b border-gray-100/50 dark:border-white/5 transition-colors duration-300">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="lg:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="flex flex-col">
                            <h2 className="text-xl lg:text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Cricket Shot Detection System</h2>
                            <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 font-medium hidden sm:block">AI-Powered Real-Time Analysis</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 lg:gap-6">
                        {/* System Status Pill */}
                        <div className="hidden sm:flex items-center gap-3 px-5 py-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-full border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest">System Status</span>
                            <div className="h-4 w-[1px] bg-emerald-200 dark:bg-emerald-500/30" />
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-500">Active</span>
                            </div>
                        </div>

                        {/* Logout Button */}
                        <button
                            onClick={() => navigate('/')}
                            className="flex items-center gap-2 px-3 lg:px-5 py-2 lg:py-2.5 bg-white dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-gray-600 dark:text-gray-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-all duration-300 font-semibold text-sm border border-gray-200 dark:border-zinc-700 hover:border-rose-200 shadow-sm hover:shadow-md"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
