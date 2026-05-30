import { Play, Activity, Target, Shield, Crosshair, StopCircle } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { useRef, useState, useEffect } from 'react';
import { startLbwLiveDetection, stopLbwLiveDetection } from '../services/api';

export default function Home() {
    const { rules, gameActive, score, setScore } = useGame();
    
    const [isStreaming, setIsStreaming] = useState(false);
    const [setupPhase, setSetupPhase] = useState<'pending' | 'manual' | 'running'>('pending');
    const [manualPitchPts, setManualPitchPts] = useState<{x: number, y: number}[]>([]);
    const [analysisType, setAnalysisType] = useState<'shot' | 'lbw' | 'both'>('both');
    
    const [lastDetection, setLastDetection] = useState<any>(null);
    const [recentDetections, setRecentDetections] = useState<any[]>([]);
    const [streamKey, setStreamKey] = useState(Date.now());
    
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const prevBackendScoreRef = useRef(0);
    const lastLogCountRef = useRef(0);

    const runService = async (overridePitch?: number[][]) => {
        try {
            await fetch(`http://127.0.0.1:8081/reset_score`, { method: 'POST' }).catch(() => {});
            if (gameActive) setScore(0);
            prevBackendScoreRef.current = 0;
            lastLogCountRef.current = 0;
            setRecentDetections([]);
            setLastDetection(null);

            await startLbwLiveDetection('', '', false, overridePitch !== undefined ? overridePitch : []);
            setStreamKey(Date.now());
            setIsStreaming(true);
        } catch (err) {
            console.error("Error starting service", err);
        }
    };

    const handleAutoPitch = async () => {
        setSetupPhase('running');
        setManualPitchPts([]);
        await runService(undefined);
    };

    const handleManualMode = async () => {
        setSetupPhase('manual');
        setManualPitchPts([]);
        await runService(undefined); // Start preview stream
    };
    
    const applyManualPitch = async () => {
        setSetupPhase('running');
        const ptsArray = manualPitchPts.map(p => [Math.round(p.x), Math.round(p.y)]);
        await stopLbwLiveDetection();
        await runService(ptsArray);
    };

    const handleStop = async () => {
        setIsStreaming(false);
        setSetupPhase('pending');
        await stopLbwLiveDetection();
    };

    const handleOverlayClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (setupPhase !== 'manual' || manualPitchPts.length >= 4) return;
        const canvas = overlayRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x_screen = (e.clientX - rect.left) * scaleX;
        const x = canvas.width - x_screen;
        const y = (e.clientY - rect.top) * scaleY;
        
        setManualPitchPts(prev => {
            if (prev.length < 4) return [...prev, {x, y}];
            return prev;
        });
    };

    useEffect(() => {
        if (setupPhase === 'manual' && overlayRef.current) {
            const canvas = overlayRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'yellow';
                manualPitchPts.forEach((pt, idx) => {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'black';
                    ctx.fillText(`${idx + 1}`, pt.x - 4, pt.y + 4);
                    ctx.fillStyle = 'yellow';
                });
                if (manualPitchPts.length > 1) {
                    ctx.strokeStyle = 'yellow';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(manualPitchPts[0].x, manualPitchPts[0].y);
                    for (let i=1; i<manualPitchPts.length; i++) {
                        ctx.lineTo(manualPitchPts[i].x, manualPitchPts[i].y);
                    }
                    if (manualPitchPts.length === 4) {
                        ctx.closePath();
                    }
                    ctx.stroke();
                }
            }
        }
    }, [manualPitchPts, setupPhase]);

    useEffect(() => {
        if (!isStreaming) return;
        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`http://127.0.0.1:8081/get_score`);
                const data = await res.json();
                
                if (data.score > prevBackendScoreRef.current) {
                    const diff = data.score - prevBackendScoreRef.current;
                    prevBackendScoreRef.current = data.score;
                    if (gameActive) {
                        const hitRule = rules.find(r => r.id === 1);
                        if (hitRule && hitRule.active) {
                            setScore((prev: number) => prev + diff);
                        }
                    }
                }
                
                const logRes = await fetch(`http://127.0.0.1:8081/get_log`);
                const logData = await logRes.json();
                const logs = logData.log || [];
                
                
                if (logs.length > lastLogCountRef.current) {
                    const newLogs = logs.slice(lastLogCountRef.current);
                    lastLogCountRef.current = logs.length;
                    
                    setRecentDetections(prev => {
                        const formatted = newLogs.reverse().map((l: any) => ({
                            name: l.type === 'shot' ? l.label : `LBW Check`,
                            time: l.time,
                            result: l.type === 'shot' ? 'Detected' : l.decision,
                            color: l.type === 'shot' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-purple-600 bg-purple-50 border-purple-100',
                            conf: l.conf || 0
                        }));
                        return [...formatted, ...prev].slice(0, 50);
                    });
                }
                
                // Directly set lastDetection to the latest score response
                setLastDetection({
                    decision: data.decision,
                    contact: data.contact,
                    shot_label: data.shot_label,
                    shot_conf: data.shot_conf
                });
            } catch (err) {}
        }, 1000);
        return () => clearInterval(intervalId);
    }, [isStreaming, gameActive, rules, setScore]);

    const activeRules = rules.filter(r => r.active);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full pb-8">
            <div className="col-span-1 lg:col-span-8 flex flex-col gap-4">
                <div className="bg-gray-900 rounded-3xl overflow-hidden shadow-2xl relative aspect-video group border border-gray-800">
                    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
                        {!isStreaming && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 bg-[url('../assets/cricket_sketch.png')] bg-cover bg-center opacity-50 mix-blend-overlay"></div>
                        )}
                        {isStreaming && (
                            <img 
                                src={`http://127.0.0.1:8081/video_feed?t=${streamKey}`} 
                                className="w-full h-full object-cover scale-x-[-1]" 
                                alt="Live Feed" 
                            />
                        )}
                        <canvas
                            ref={overlayRef}
                            width={640}
                            height={480}
                            onClick={handleOverlayClick}
                            className={`absolute inset-0 w-full h-full object-cover z-20 scale-x-[-1] ${setupPhase === 'manual' ? 'cursor-crosshair' : 'pointer-events-none'}`}
                        />
                    </div>

                    {!isStreaming && setupPhase === 'pending' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/60 backdrop-blur-sm gap-8">
                            <div className="flex bg-white/10 p-1.5 rounded-2xl gap-2 shadow-inner backdrop-blur-md border border-white/20">
                                <button
                                    onClick={() => setAnalysisType('shot')}
                                    className={`py-3 px-6 rounded-xl font-bold transition-all text-sm ${analysisType === 'shot' ? 'bg-white text-emerald-600 shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                >
                                    Shot Detection
                                </button>
                                <button
                                    onClick={() => setAnalysisType('lbw')}
                                    className={`py-3 px-6 rounded-xl font-bold transition-all text-sm ${analysisType === 'lbw' ? 'bg-white text-emerald-600 shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                >
                                    LBW Detection
                                </button>
                                <button
                                    onClick={() => setAnalysisType('both')}
                                    className={`py-3 px-6 rounded-xl font-bold transition-all text-sm ${analysisType === 'both' ? 'bg-white text-emerald-600 shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                >
                                    Both Models
                                </button>
                            </div>

                            <button
                                onClick={handleAutoPitch}
                                className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)] cursor-pointer hover:scale-110 transition-transform hover:bg-emerald-400"
                            >
                                <Play className="w-8 h-8 text-white fill-current ml-1" />
                            </button>
                            <span className="text-white/80 font-bold tracking-widest uppercase text-sm">Start Detection</span>
                        </div>
                    )}



                    {setupPhase === 'manual' && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl border border-purple-500/50 shadow-2xl z-30 flex items-center gap-4 animate-in slide-in-from-top-4">
                            <div>
                                <div className="font-bold text-lg text-purple-400">Manual Pitch Setup</div>
                                <div className="text-sm opacity-80">Click 4 corners of the pitch ({manualPitchPts.length}/4)</div>
                            </div>
                            <div className="flex gap-2 ml-4">
                                <button onClick={() => setManualPitchPts([])} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-bold transition-colors">Clear</button>
                                <button 
                                    onClick={applyManualPitch}
                                    disabled={manualPitchPts.length !== 4}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${manualPitchPts.length === 4 ? 'bg-purple-600 hover:bg-purple-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    )}

                    {isStreaming && setupPhase === 'running' && (
                        <div className="absolute top-4 right-4 z-30 flex gap-2">
                            <button onClick={handleManualMode} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                                <Crosshair className="w-4 h-4" /> Manual Pitch
                            </button>
                            {manualPitchPts.length > 0 && (
                                <button onClick={handleAutoPitch} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                                    <Activity className="w-4 h-4" /> Auto Pitch
                                </button>
                            )}
                            <button onClick={handleStop} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                                <StopCircle className="w-4 h-4" /> Stop
                            </button>
                        </div>
                    )}

                    {/* Removed On-Screen Floating Label */}

                    {isStreaming && setupPhase === 'running' && (
                        <div className="absolute bottom-4 right-4 lg:bottom-6 lg:right-6">
                            {gameActive ? (
                                <div className="bg-black/80 backdrop-blur-md text-white px-4 py-2 lg:px-6 lg:py-3 rounded-xl lg:rounded-2xl border border-emerald-500/30 shadow-xl">
                                    <div className="text-[8px] lg:text-[10px] font-bold uppercase opacity-80 text-right text-emerald-400">Score</div>
                                    <div className="font-bold text-xl lg:text-3xl leading-none text-right">{score}</div>
                                </div>
                            ) : (
                                <div className="bg-black/80 backdrop-blur-md text-emerald-400 px-4 py-2 lg:px-6 lg:py-3 rounded-xl lg:rounded-2xl border border-emerald-500/30 shadow-xl">
                                    <div className="text-[8px] lg:text-[10px] font-bold uppercase opacity-80 text-right">Confidence</div>
                                    <div className="font-bold text-xl lg:text-3xl leading-none">
                                        {lastDetection ? `${(lastDetection.conf * 100).toFixed(0)}%` : '0%'}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row justify-between gap-2 text-[10px] lg:text-xs font-mono text-gray-400 bg-white px-4 py-2 lg:py-3 rounded-xl shadow-sm border border-gray-100">
                    <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        Source: Unified Backend Stream
                    </span>
                    <span className="hidden md:inline text-center">Auto-Scaling</span>
                    <span className="text-emerald-600 font-bold text-right">Latency: ~45ms</span>
                </div>
            </div>

            <div className="col-span-1 lg:col-span-4 flex flex-col gap-4 lg:gap-6">
                <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-gray-800 text-lg">Current Status</h3>
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-emerald-600" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {(analysisType === 'lbw' || analysisType === 'both') && (
                            <>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl hover:bg-emerald-50/50 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-white p-2 rounded-xl shadow-sm text-gray-400 group-hover:text-emerald-600 transition-colors">
                                            <Target className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Impact Point</div>
                                            <div className="font-bold text-gray-800">{lastDetection?.contact || '-'}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl hover:bg-emerald-50/50 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-white p-2 rounded-xl shadow-sm text-gray-400 group-hover:text-emerald-600 transition-colors">
                                            <Activity className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">LBW Decision</div>
                                            <div className={`font-bold ${lastDetection?.decision === 'OUT' ? 'text-red-500' : 'text-emerald-600'}`}>
                                                {lastDetection?.decision || '-'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        {(analysisType === 'shot' || analysisType === 'both') && (
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl hover:bg-emerald-50/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className="bg-white p-2 rounded-xl shadow-sm text-gray-400 group-hover:text-emerald-600 transition-colors">
                                        <Crosshair className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Detected Shot</div>
                                        <div className="font-bold text-gray-800">
                                            {lastDetection?.shot_label ? `${lastDetection.shot_label} (${Math.round((lastDetection?.shot_conf || 0)*100)}%)` : '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl hover:bg-emerald-50/50 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="bg-white p-2 rounded-xl shadow-sm text-gray-400 group-hover:text-emerald-600 transition-colors">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Tracking Mode</div>
                                    <div className="font-bold text-gray-800">{gameActive ? 'Active Session' : 'Free Play'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex-1 flex flex-col">
                    <h3 className="font-bold text-gray-800 mb-4 text-lg">Recent Detections</h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-100 min-h-[200px]">
                        {recentDetections.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 transition-colors cursor-pointer group">
                                <div>
                                    <div className="font-bold text-sm text-gray-800 group-hover:text-emerald-700 transition-colors">{item.name}</div>
                                    <div className="text-[10px] text-gray-400 font-mono">{item.time}</div>
                                </div>
                                <div className={`text-[10px] font-bold px-3 py-1 rounded-full border ${item.color}`}>
                                    {item.result}
                                </div>
                            </div>
                        ))}
                        {recentDetections.length === 0 && (
                            <div className="text-center text-gray-400 text-xs py-10 h-full flex items-center justify-center">
                                No detections yet. Start throwing/hitting!
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {
                gameActive && (
                    <div className="col-span-12">
                        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-3xl p-8 text-white shadow-xl shadow-emerald-200 animate-in fade-in slide-in-from-bottom-6 duration-500">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                                    <Shield className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl">Current Game Rules</h3>
                                    <p className="text-emerald-100 text-sm opacity-90">Active detection rates for this session</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {activeRules.map((rule, i) => (
                                    <div key={i} className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:bg-white/20 transition-all duration-300 group cursor-default">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Target className="w-4 h-4 text-white" />
                                            </div>
                                        </div>
                                        <div className="mb-2">
                                            <div className="font-bold text-sm">{rule.title}</div>
                                        </div>
                                        <div className={`font-bold text-[10px] ${rule.type === 'success' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-200'} px-2 py-1 rounded-lg inline-block mb-2 uppercase tracking-wide`}>
                                            {rule.result}
                                        </div>
                                        <p className="text-[10px] opacity-70 leading-relaxed font-medium">{rule.description}</p>
                                    </div>
                                ))}
                                {activeRules.length === 0 && (
                                    <p className="col-span-4 text-center text-sm opacity-70 py-4">No active rules selected.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
