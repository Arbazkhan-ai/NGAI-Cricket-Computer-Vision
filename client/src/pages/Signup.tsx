import { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { signup } from '../services/api';

const countryCodes = [
    { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
    { code: '+91', name: 'India', flag: '🇮🇳' },
    { code: '+1', name: 'United States', flag: '🇺🇸' },
    { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
    { code: '+61', name: 'Australia', flag: '🇦🇺' },
    { code: '+971', name: 'UAE', flag: '🇦🇪' },
    { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
    { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
    { code: '+27', name: 'South Africa', flag: '🇿🇦' },
    { code: '+64', name: 'New Zealand', flag: '🇳🇿' },
];

export default function Signup() {
    const navigate = useNavigate();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        countryCode: '+92',
        phone: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        setError('');
        if (formData.password !== formData.confirmPassword) {
            return setError("Passwords don't match");
        }
        setLoading(true);
        try {
            const combinedPhone = `${formData.countryCode} ${formData.phone}`.trim();
            await signup({
                name: formData.name,
                email: formData.email,
                password: formData.password,
                mobile_number: combinedPhone || null
            });
            alert('Account created! Please sign in.');
            navigate('/login');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Start Your Journey" subtitle="Create your new account">
            {/* Full Name */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-800 ml-1">Full Name</label>
                <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        className="w-full pl-9 pr-4 py-2.5 border border-emerald-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm placeholder:text-gray-400 bg-emerald-50/10"
                    />
                </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-800 ml-1">Email Address</label>
                <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="your.email@example.com"
                        className="w-full pl-9 pr-4 py-2.5 border border-emerald-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm placeholder:text-gray-400 bg-emerald-50/10"
                    />
                </div>
            </div>

            {/* Mobile Number */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-800 ml-1">Mobile Number</label>
                <div className="flex gap-2">
                    {/* Country Code Dropdown */}
                    <div className="relative w-1/3">
                        <select
                            name="countryCode"
                            value={formData.countryCode}
                            onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                            className="w-full pl-3 pr-6 py-2.5 border border-emerald-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm bg-emerald-50/10 appearance-none font-semibold text-emerald-950 cursor-pointer"
                        >
                            {countryCodes.map((c) => (
                                <option key={c.code} value={c.code} className="text-gray-900 bg-white">
                                    {c.flag} {c.code}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-emerald-600">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                        </div>
                    </div>

                    {/* Phone Number Input */}
                    <div className="relative group flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                        <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            placeholder="3001234567"
                            className="w-full pl-9 pr-4 py-2.5 border border-emerald-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm placeholder:text-gray-400 bg-emerald-50/10 font-semibold"
                        />
                    </div>
                </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-800 ml-1">Password</label>
                <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Create a password"
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
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-800 ml-1">Confirm Password</label>
                <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/60 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Confirm your password"
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

            {/* Error Message */}
            {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}

            {/* Sign Up Button */}
            <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-4 rounded-lg shadow-md shadow-emerald-900/10 hover:shadow-lg hover:shadow-emerald-900/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm mt-4 disabled:opacity-50"
            >
                {loading ? 'Creating...' : 'Create Account'}
            </button>



            {/* Sign In Link */}
            <p className="text-center text-xs text-gray-500 mt-4">
                Already have an account? <Link to="/login" className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline">Sign in</Link>
            </p>
        </AuthLayout>
    );
}
