import { useState } from 'react';
import { Eye, EyeOff, Lock, ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { resetPassword } from '../services/api';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!token) {
        return (
            <AuthLayout title="Invalid Link" subtitle="This password reset link is invalid or has expired.">
                <div className="flex justify-center mt-6">
                    <Link to="/forgot-password" className="text-emerald-700 font-bold hover:underline">
                        Request a new link
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    const handleSubmit = async () => {
        if (!password || !confirmPassword) {
            alert("Please fill in all fields");
            return;
        }
        if (password !== confirmPassword) {
            alert("Passwords do not match");
            return;
        }

        setIsLoading(true);
        try {
            await resetPassword(token, password);
            alert("Password reset successfully! You can now login.");
            navigate('/login');
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthLayout title="Reset Password" subtitle="Create a new secure password.">
            {/* Password */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-800 ml-1">New Password</label>
                <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a new password"
                        className="w-full pl-9 pr-10 py-2.5 border border-emerald-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm placeholder:text-gray-400 bg-emerald-50/10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5 mt-4">
                <label className="text-xs font-bold text-emerald-800 ml-1">Confirm Password</label>
                <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your new password"
                        className="w-full pl-9 pr-10 py-2.5 border border-emerald-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm placeholder:text-gray-400 bg-emerald-50/10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Reset Button */}
            <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-4 rounded-lg shadow-md shadow-emerald-900/10 hover:shadow-lg hover:shadow-emerald-900/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Resetting Password...' : 'Reset Password'}
            </button>

            <div className="flex justify-center mt-6">
                <Link to="/login" className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-emerald-700 transition-colors">
                    <ArrowLeft className="h-3 w-3" />
                    Back to Login
                </Link>
            </div>
        </AuthLayout>
    );
}
