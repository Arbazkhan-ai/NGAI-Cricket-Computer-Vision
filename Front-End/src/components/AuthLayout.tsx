import { type ReactNode } from 'react';
import cricketSketch from '../assets/cricket_sketch.png';
import cricketLogo from '../assets/cricket_logo.png';

interface AuthLayoutProps {
    children: ReactNode;
    title: string;
    subtitle: string;
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
    return (
        <div className="min-h-screen w-full flex bg-[#F0FAF4] font-sans text-gray-800">
            {/* Left Side - Illustration */}
            <div className="hidden lg:flex w-1/2 items-center justify-center p-0 relative">
                <img
                    src={cricketSketch}
                    alt="Cricket Fever"
                    className="w-full h-full object-contain drop-shadow-xl opacity-90 mix-blend-multiply"
                />
            </div>

            {/* Right Side - Form Container */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center -pb-20 p-4 lg:p-12 relative">

                {/* Top Logo Section */}
                <div className="text-center mb-8">
                    <img src={cricketLogo} alt="NGAI Logo" className="h-32 w-auto mx-auto mb-6 drop-shadow-sm" />
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">NGAI(Cricket)</h1>
                    <p className="text-emerald-600 font-medium mt-1 text-sm tracking-wide">AI-Powered Real-Time Analysis</p>
                </div>

                {/* Card */}
                <div className="w-full max-w-md bg-white rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] overflow-hidden border border-emerald-50/50">
                    {/* Card Header */}
                    <div className="bg-emerald-600 p-6 text-white">
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <p className="text-emerald-100 text-xs mt-1 opacity-90">{subtitle}</p>
                    </div>

                    {/* Card Body */}
                    <div className="p-8 space-y-5">
                        {children}
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center text-emerald-800/60 text-[10px] font-medium tracking-wide">
                    &copy; 2025 NGAI(Cricket). All rights reserved.
                </div>
            </div>
        </div>
    );
}
