
import { useState, useEffect } from 'react';
import { ArrowRight, Activity, Target, Zap, Smartphone, Play, Camera, Cpu, ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { startLbwLiveDetection, stopLbwLiveDetection } from '../services/api';
import cricketLogo from '../assets/cricket_logo.png';
import cricketSketch from '../assets/cricket_sketch.png';

export default function LandingPage() {
    const navigate = useNavigate();
    const [showDemo, setShowDemo] = useState(false);
    const [streamKey, setStreamKey] = useState(Date.now());
    const [demoStatus, setDemoStatus] = useState('Initializing...');
    const [lbwDecision, setLbwDecision] = useState<string | null>(null);
    const [firstContact, setFirstContact] = useState<string | null>(null);
    const [shotType, setShotType] = useState<{label: string, conf: number} | null>(null);
    const [recentDetections, setRecentDetections] = useState<string[]>([]);

    useEffect(() => {
        if (showDemo) {
            setDemoStatus('Starting models...');
            startLbwLiveDetection('0', '', true)
                .then(() => {
                    setDemoStatus('Running');
                    setStreamKey(Date.now());
                })
                .catch((e) => setDemoStatus('Error: ' + e.message));
        } else {
            stopLbwLiveDetection().catch(() => {});
            setLbwDecision(null);
            setFirstContact(null);
            setShotType(null);
            setRecentDetections([]);
        }
        return () => {
            if (showDemo) stopLbwLiveDetection().catch(() => {});
        };
    }, [showDemo]);

    useEffect(() => {
        if (demoStatus !== 'Running') return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`http://127.0.0.1:8081/get_score`);
                const data = await res.json();
                setLbwDecision(data.decision);
                setFirstContact(data.contact);
                if (data.shot_label && data.shot_label !== 'None' && data.shot_label !== 'Analyzing...') {
                    setShotType({ label: data.shot_label, conf: data.shot_conf });
                    setRecentDetections(prev => {
                        const logEntry = `${data.shot_label} (${Math.round(data.shot_conf * 100)}%)`;
                        if (!prev.includes(logEntry)) {
                            return [logEntry, ...prev].slice(0, 5);
                        }
                        return prev;
                    });
                }
            } catch (err) {}
        }, 500);
        return () => clearInterval(interval);
    }, [demoStatus]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden">
            {/* Navbar */}
            <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src={cricketLogo} alt="Logo" className="w-10 h-10 object-contain" />
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 leading-none">NGAI-Cricket</h1>
                            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Detection System</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/login')}
                            className="text-gray-600 font-bold text-sm hover:text-emerald-600 transition-colors"
                        >
                            Log In
                        </button>
                        <button
                            onClick={() => navigate('/signup')}
                            className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-gray-200 hover:shadow-emerald-200"
                        >
                            Sign Up
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-100/50 via-gray-50 to-white -z-10" />
                <div className="absolute top-20 right-0 w-[800px] h-[800px] bg-emerald-200/20 rounded-full blur-3xl -z-10 animate-pulse" />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-full text-emerald-700 font-bold text-xs uppercase tracking-wider mb-6">
                            <Zap className="w-4 h-4 fill-current" />
                            <span>AI-Powered 2.0 Now Live</span>
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-extrabold text-gray-900 tracking-tight mb-8 leading-[1.1]">
                            Master Your <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                                Cricket Shots
                            </span>
                        </h1>
                        <p className="text-xl text-gray-500 mb-10 leading-relaxed max-w-lg">
                            Elevate your game with professional-grade AI analysis. Track shots, analyze form, and get real-time feedback using just your camera.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => navigate('/login')}
                                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-emerald-200 hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2 group"
                            >
                                Start Analyzing
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </button>
                            <button onClick={() => setShowDemo(true)} className="px-8 py-4 bg-white text-gray-700 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2">
                                <Play className="w-5 h-5" />
                                Watch Demo
                            </button>
                        </div>
                        <div className="mt-10 flex items-center gap-6 text-sm font-medium text-gray-500">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                                Real-time Analysis
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                                No Hardware Needed
                            </div>
                        </div>
                    </div>

                    <div className="relative lg:h-[600px] flex items-center justify-center animate-in fade-in zoom-in duration-1000 delay-200">
                        <div className="relative w-full max-w-md aspect-square">
                            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full opacity-20 blur-3xl" />
                            <img
                                src={cricketSketch}
                                alt="Cricket Analysis"
                                className="relative z-10 w-full h-full object-contain drop-shadow-2xl"
                            />

                            {/* Floating Stats Cards */}
                            <div className="absolute top-10 -right-10 bg-white p-4 rounded-2xl shadow-xl shadow-black/5 border border-gray-100 flex items-center gap-4 animate-bounce delay-700">
                                <div className="bg-emerald-100 p-3 rounded-xl">
                                    <Target className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-gray-400 uppercase">Accuracy</div>
                                    <div className="text-xl font-bold text-gray-900">98.5%</div>
                                </div>
                            </div>

                            <div className="absolute bottom-20 -left-10 bg-white p-4 rounded-2xl shadow-xl shadow-black/5 border border-gray-100 flex items-center gap-4 animate-bounce delay-1000">
                                <div className="bg-blue-100 p-3 rounded-xl">
                                    <Activity className="w-6 h-6 text-blue-600" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-gray-400 uppercase">Analysis</div>
                                    <div className="text-xl font-bold text-gray-900">Real-time</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-4xl font-extrabold text-gray-900 mb-6">Pro-Level Stats. Pocket-Sized.</h2>
                        <p className="text-xl text-gray-500">Transform your smartphone into a high-performance cricket analysis tool using computer vision.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { title: 'Shot Detection', desc: 'Identify drives, pulls, cuts, and sweeps instantly with 98% accuracy.', icon: Target, color: 'emerald' },
                            { title: 'Form Analysis', desc: 'Get AI-driven feedback on your stance, bat swing, and footwork.', icon: Activity, color: 'blue' },
                            { title: 'Mobile First', desc: 'Record and analyze anywhere. Works seamlessly on iOS and Android.', icon: Smartphone, color: 'violet' },
                        ].map((feature, i) => (
                            <div key={i} className="group p-8 rounded-3xl bg-gray-50 hover:bg-white border border-gray-100 hover:border-emerald-100 hover:shadow-2xl hover:shadow-emerald-100/50 transition-all duration-300">
                                <div className={`w-14 h-14 rounded-2xl bg-${feature.color}-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                                    <feature.icon className={`w-7 h-7 text-${feature.color}-600`} />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                                <p className="text-gray-500 leading-relaxed">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-24 bg-gray-50 border-t border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-4xl font-extrabold text-gray-900 mb-6">How It Works</h2>
                        <p className="text-xl text-gray-500">Three simple steps to transform your cricket performance.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-12 relative">
                        {/* Connecting Line (visible on desktop) */}
                        <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-0.5 bg-emerald-100 -z-10" />

                        {[
                            { title: '1. Record or Upload', desc: 'Capture your batting session using any camera or upload existing footage.', icon: Camera },
                            { title: '2. AI Processing', desc: 'Our advanced computer vision models analyze posture, bat speed, and ball trajectory.', icon: Cpu },
                            { title: '3. Get Insights', desc: 'Receive instant visual feedback, biomechanical breakdowns, and score predictions.', icon: ShieldCheck },
                        ].map((step, i) => (
                            <div key={i} className="flex flex-col items-center text-center">
                                <div className="w-24 h-24 rounded-full bg-white border-4 border-emerald-50 flex items-center justify-center mb-8 shadow-xl shadow-emerald-100/50">
                                    <step.icon className="w-10 h-10 text-emerald-600" />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4">{step.title}</h3>
                                <p className="text-gray-500 leading-relaxed max-w-sm">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="bg-gray-900 rounded-[3rem] p-12 lg:p-20 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />

                        <div className="relative z-10">
                            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-8">Ready to transform your game?</h2>
                            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">Join thousands of cricketers improving their technique with our advanced AI analysis.</p>
                            <button
                                onClick={() => navigate('/signup')}
                                className="px-10 py-5 bg-emerald-500 hover:bg-emerald-400 text-gray-900 rounded-2xl font-bold text-lg shadow-xl shadow-emerald-900/50 hover:scale-105 transition-all"
                            >
                                Get Started for Free
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-100 pt-16 pb-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all">
                            <img src={cricketLogo} alt="Logo" className="w-8 h-8 object-contain" />
                            <span className="font-bold text-gray-900">Cricket Shot AI</span>
                        </div>
                        <div className="text-sm text-gray-400 font-medium">
                            &copy; 2025 AI Sports Analytics. All rights reserved.
                        </div>
                    </div>
                </div>
            </footer>

            {/* Live Demo Modal */}
            {showDemo && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl overflow-hidden w-full max-w-5xl shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    <Activity className="text-emerald-600 animate-pulse" />
                                    Live Model Integration Demo
                                </h3>
                                <p className="text-gray-500 text-sm mt-1">Testing LBW, Trajectory, Pose, and Shot Classification on Live Video (Unified Model)</p>
                            </div>
                            <button
                                onClick={() => setShowDemo(false)}
                                className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex flex-col lg:flex-row bg-gray-900 min-h-[500px] lg:min-h-[600px]">
                            {/* Video Feed */}
                            <div className="flex-1 p-8 flex items-center justify-center">
                                {demoStatus === 'Running' ? (
                                    <img
                                        src={`http://127.0.0.1:8081/video_feed?t=${streamKey}`}
                                        alt="Live Demo Stream"
                                        className="w-full h-full max-h-[600px] object-contain rounded-xl border border-gray-800 bg-black"
                                        onError={(e) => setDemoStatus('Error loading stream')}
                                    />
                                ) : (
                                    <div className="text-center text-white flex flex-col items-center">
                                        <Activity className="w-12 h-12 mb-4 animate-bounce text-emerald-500" />
                                        <p className="text-xl font-medium">{demoStatus}</p>
                                    </div>
                                )}
                            </div>

                            {/* Sidebar / Stats */}
                            {demoStatus === 'Running' && (
                                <div className="w-full lg:w-80 bg-gray-800 p-6 flex flex-col border-t lg:border-t-0 lg:border-l border-gray-700">
                                    <h4 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
                                        <Target className="w-5 h-5 text-emerald-500" />
                                        Current Status
                                    </h4>

                                    <div className="space-y-4 flex-1">
                                        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                                            <div className="text-gray-400 text-xs font-bold uppercase mb-1">Impact Point</div>
                                            <div className={`text-xl font-bold ${firstContact === 'BAT' ? 'text-emerald-400' : firstContact === 'PAD' ? 'text-red-400' : 'text-white'}`}>
                                                {firstContact || '-'}
                                            </div>
                                        </div>

                                        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                                            <div className="text-gray-400 text-xs font-bold uppercase mb-1">LBW Decision</div>
                                            <div className={`text-xl font-bold ${lbwDecision === 'OUT' ? 'text-red-400' : lbwDecision === 'NOT OUT' ? 'text-emerald-400' : 'text-white'}`}>
                                                {lbwDecision || '-'}
                                            </div>
                                        </div>

                                        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                                            <div className="text-gray-400 text-xs font-bold uppercase mb-1">Detected Shot</div>
                                            <div className="text-xl font-bold text-blue-400">
                                                {shotType ? `${shotType.label} (${Math.round(shotType.conf * 100)}%)` : '-'}
                                            </div>
                                        </div>

                                        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                                            <div className="text-gray-400 text-xs font-bold uppercase mb-1">Tracking Mode</div>
                                            <div className="text-lg font-bold text-emerald-500">Free Play</div>
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        <h4 className="text-white font-bold text-sm mb-3">Recent Detections</h4>
                                        <div className="space-y-2">
                                            {recentDetections.length > 0 ? (
                                                recentDetections.map((det, idx) => (
                                                    <div key={idx} className="bg-gray-900 rounded-lg p-2 text-xs text-gray-300 border border-gray-700">
                                                        {det}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-gray-500 text-xs">Waiting for activity...</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
