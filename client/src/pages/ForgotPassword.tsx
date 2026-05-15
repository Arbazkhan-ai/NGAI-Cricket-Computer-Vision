import { Mail, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

import { forgotPassword } from '../services/api';

export default function ForgotPassword() {

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleReset = async () => {
        if (!email) {
            alert("Please enter your email address.");
            return;
        }
        setIsLoading(true);
        try {
            const res = await forgotPassword(email);
            alert(`${res.message}`);
            setEmail('');
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthLayout title="Forgot Password?" subtitle="No worries, we'll send you reset instructions.">

            {/* Email */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-800 ml-1">Email Address</label>
                <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="w-full pl-9 pr-4 py-2.5 border border-emerald-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm placeholder:text-gray-400 bg-emerald-50/10"
                    />
                </div>
            </div>

            {/* Reset Button */}
            <button
                onClick={handleReset}
                disabled={isLoading}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-4 rounded-lg shadow-md shadow-emerald-900/10 hover:shadow-lg hover:shadow-emerald-900/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Sending Link...' : 'Send Reset Link'}
            </button>

            {/* Back to Login */}
            <div className="flex justify-center mt-6">
                <Link to="/" className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-emerald-700 transition-colors">
                    <ArrowLeft className="h-3 w-3" />
                    Back to Sign in
                </Link>
            </div>
        </AuthLayout>
    );
}
