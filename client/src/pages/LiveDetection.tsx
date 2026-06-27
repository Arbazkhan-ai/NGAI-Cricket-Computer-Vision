
import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StopCircle, ArrowLeft, Activity, PlayCircle, Crosshair } from 'lucide-react';
import { startLiveDetection, stopLiveDetection, startLbwLiveDetection, stopLbwLiveDetection, saveMatch } from '../services/api';
import { useGame } from '../context/GameContext';

export default function LiveDetection() {
    const location = useLocation();
    const navigate = useNavigate();
    const { ipAddress, port, showLandmarks, analysisType, manualPitch, initialSetup } = location.state || {};
    const [status, setStatus] = useState('Initializing...');
    const [streamError, setStreamError] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [liveScore, setLiveScore] = useState(0);
    const [lbwDecision, setLbwDecision] = useState<string | null>(null);
    const [firstContact, setFirstContact] = useState<string | null>(null);
    const [shotType, setShotType] = useState<{label: string, conf: number} | null>(null);
    const [streamKey, setStreamKey] = useState(Date.now());
    const [error, setError] = useState<string | null>(null);
    const [setupPhase, setSetupPhase] = useState<'manual' | 'running'>(
        initialSetup === 'manual' ? 'manual' : 'running'
    );
    const [manualPitchPts, setManualPitchPts] = useState<{x: number, y: number}[]>([]);
    const overlayRef = useRef<HTMLCanvasElement>(null);

    const { rules, gameActive, score, setScore } = useGame();
    const prevBackendScoreRef = useRef(0);
    const startTimeRef = useRef(Date.now());
    const pendingContactRef = useRef<string | null>(null);
    const pendingShotRef = useRef<string | null>(null);

    const runService = async (overridePitch?: number[][]) => {
        try {
            const fetchPort = (analysisType === 'lbw' || analysisType === 'unified') ? '8081' : '8080';
            await fetch(`http://127.0.0.1:${fetchPort}/reset_score`, { method: 'POST' }).catch(() => {});
            if (gameActive) setScore(0);
            setLiveScore(0);
            prevBackendScoreRef.current = 0;
            startTimeRef.current = Date.now();
            setLbwDecision(null);
            setFirstContact(null);
            setShotType(null);
            pendingContactRef.current = null;
            pendingShotRef.current = null;

            setStatus('Starting Detection Service...');
            let formattedIp = ipAddress;
            if (typeof ipAddress === 'string' && !ipAddress.startsWith('http') && !ipAddress.startsWith('rtsp') && !ipAddress.startsWith('/') && !ipAddress.startsWith('uploads') && port && ipAddress !== '0') {
                formattedIp = `http://${ipAddress}:${port}/video`;
            }

            if (analysisType === 'lbw' || analysisType === 'unified') {
                await startLbwLiveDetection(formattedIp, port, showLandmarks, overridePitch !== undefined ? overridePitch : manualPitch);
            } else {
                await startLiveDetection(formattedIp, port, showLandmarks, manualPitch);
            }
            setStatus('Running');
            setCountdown(3);
            setStreamKey(Date.now());
            setStreamError(false);
        } catch (err: any) {
            setError(err.message || 'Failed to start detection');
            setStatus('Error');
        }
    };

    useEffect(() => {
        // Run service immediately on mount
        runService();
    }, [ipAddress, port, showLandmarks]);

    useEffect(() => {
        if (countdown === null) return;
        
        if (countdown > 0) {
            const timer = setTimeout(() => {
                setCountdown(prev => (prev !== null ? prev - 1 : null));
            }, 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            // Stay on "GO!" for 1 second
            const timer = setTimeout(() => {
                setCountdown(-1); // Use -1 to indicate finished
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    useEffect(() => {
        if (status !== 'Running') return;

        const interval = setInterval(async () => {
            try {
                const fetchPort = (analysisType === 'lbw' || analysisType === 'unified') ? '8081' : '8080';
                const res = await fetch(`http://127.0.0.1:${fetchPort}/get_score`);
                const data = await res.json();
                
                if (analysisType === 'lbw' || analysisType === 'unified') {
                    setLbwDecision(data.decision);
                    setFirstContact(data.contact);
                }
                
                if (data.shot_label) {
                    setShotType({ label: data.shot_label, conf: data.shot_conf });
                }
                
                if (data.score > prevBackendScoreRef.current) {
                    const diff = data.score - prevBackendScoreRef.current;
                    prevBackendScoreRef.current = data.score;
                    
                    if (gameActive) {
                        const hitRule = rules.find(r => r.id === 1);
                        if (hitRule && hitRule.active) {
                            setScore((prev: number) => prev + diff);
                        }
                    } else {
                        setLiveScore(data.score);
                    }
                }
            } catch (err) {
                console.error("Score fetch error", err);
            }
        }, 500);

        return () => clearInterval(interval);
    }, [status, gameActive, rules, setScore]);
    const handleOverlayClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (setupPhase !== 'manual' || manualPitchPts.length >= 4) return;
        const canvas = overlayRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        setManualPitchPts(prev => {
            if (prev.length < 4) return [...prev, {x, y}];
            return prev;
        });
    };

    const applyManualPitch = async () => {
        setSetupPhase('running');
        const ptsArray = manualPitchPts.map(p => [Math.round(p.x), Math.round(p.y)]);
        await runService(ptsArray);
    };

    const clearPitchPts = () => setManualPitchPts([]);

    const handleAutoPitch = async () => {
        setSetupPhase('running');
        setManualPitchPts([]);
        if (overlayRef.current) {
            const ctx = overlayRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
        }
        await runService(undefined);
    };

    const handleManualMode = async () => {
        setSetupPhase('manual');
        setManualPitchPts([]);
        await runService(undefined); // Start preview stream
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

    const handleStop = async () => {
        try {
            // Save the match before stopping
            if (gameActive || liveScore > 0 || analysisType === 'lbw') {
                const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
                const minutes = Math.floor(durationSeconds / 60);
                const seconds = durationSeconds % 60;
                const durationStr = `${minutes}m ${seconds}s`;
                
                let details: any[] = [];
                try {
                    const fetchPort = (analysisType === 'lbw' || analysisType === 'unified') ? '8081' : '8080';
                    const res = await fetch(`http://127.0.0.1:${fetchPort}/get_log`);
                    const data = await res.json();
                    details = data.log || [];
                } catch (e) {
                    console.error("Could not fetch log:", e);
                }
                
                await saveMatch({
                    score: gameActive ? score : liveScore,
                    shots_count: liveScore, 
                    duration: durationStr,
                    details: details,
                    video_url: ipAddress?.includes('/uploads/') ? ipAddress : null
                }).catch((e: any) => console.error("Could not save match:", e));
            }

            if (analysisType === 'lbw' || analysisType === 'unified') {
                await stopLbwLiveDetection();
            } else {
                await stopLiveDetection();
            }
            setStatus('Stopped');
            const isVideo = typeof ipAddress === 'string' && (ipAddress.includes('/uploads/') || ipAddress.includes('uploads/'));
            navigate('/source', { state: { method: isVideo ? 'video' : 'live' } });
        } catch (err) {
            console.error('Failed to stop', err);
        }
    };

    const handleReplay = async () => {
        setSetupPhase('running');
        setStatus('Initializing...');
        setCountdown(null);
        runService();
    };

    return (
        <div className="space-y-8 pb-8 animate-in fade-in zoom-in duration-500">
            {/* ... (Header omitted for brevity if unchanged, but for safety I will include up to the render part if needed. Actually I can just target the specific return block or state definition) */}
            {/* Let's just update the return part for the video feed */}

            {/* Header Banner */}
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-lg shadow-emerald-200 relative overflow-hidden">
                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                            <Activity className="animate-pulse" />
                            Live Detection Active
                        </h1>
                        <p className="text-emerald-100 opacity-90 font-medium max-w-xl">
                            Real-time analysis running. The video feed is displayed below. Use the controls to stop.
                        </p>
                    </div>
                    <button
                        onClick={handleStop}
                        className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-3 rounded-xl transition-all"
                    >
                        <StopCircle className="w-8 h-8 text-white" />
                    </button>
                </div>

                {/* Score Panel (If Game Active) */}
                <div className="mt-6 flex flex-wrap items-center gap-6 animate-in slide-in-from-top-4 duration-700">
                    {(analysisType === 'lbw' || analysisType === 'unified') && (
                        <>
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1 min-w-[200px]">
                                <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">LBW Decision</div>
                                <div className={`text-3xl font-black ${lbwDecision === 'OUT' ? 'text-red-400' : lbwDecision === 'NOT OUT' ? 'text-green-400' : 'text-white'}`}>
                                    {lbwDecision || 'Waiting...'}
                                </div>
                            </div>
                            
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1 min-w-[200px]">
                                <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Impact Point</div>
                                <div className={`text-3xl font-black ${firstContact === 'BAT' ? 'text-green-400' : firstContact === 'PAD' ? 'text-red-400' : firstContact === 'Analyzing...' ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>
                                    {firstContact || '-'}
                                </div>
                            </div>
                        </>
                    )}
                    
                    {(analysisType === 'unified' || analysisType === 'shot') && (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1 min-w-[200px]">
                            <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Detected Shot</div>
                            <div className="text-3xl font-black text-blue-300">
                                {shotType ? (
                                    shotType.label === 'Analyzing...' ? (
                                        <span className="text-yellow-400 animate-pulse">Analyzing...</span>
                                    ) : (
                                        <span>{shotType.label} <span className="text-lg opacity-70">({Math.round(shotType.conf * 100)}%)</span></span>
                                    )
                                ) : (
                                    <span className="text-gray-400">-</span>
                                )}
                            </div>
                        </div>
                    )}

                    {gameActive && (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1 min-w-[200px]">
                            <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Game Score</div>
                            <div className="text-4xl font-black">{score}</div>
                        </div>
                    )}
                    {gameActive && (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1">
                            <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Active Rules</div>
                            <div className="text-xl font-bold">
                                {rules.filter(r => r.active).map(r => r.title).join(', ') || 'None'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            </div>

            {/* Live Video Feed */}
            <div className="bg-white rounded-3xl border border-emerald-100 p-8 shadow-sm flex flex-col items-center">
                {status === 'Running' && countdown === -1 && !streamError ? (
                    <div className="w-full max-w-4xl relative rounded-2xl overflow-hidden shadow-lg border-4 border-emerald-500/20 bg-black aspect-video flex items-center justify-center">
                        <img
                            src={`http://127.0.0.1:${(analysisType === 'lbw' || analysisType === 'unified') ? '8081' : '8080'}/video_feed?t=${streamKey}`}
                            alt="Live Detection Feed"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                console.error("Stream connection error", e);
                                setStreamError(true);
                            }}
                            onLoad={(e) => {
                                if (overlayRef.current) {
                                    overlayRef.current.width = e.currentTarget.naturalWidth || 1000;
                                    overlayRef.current.height = e.currentTarget.naturalHeight || 750;
                                }
                            }}
                        />
                        <canvas
                            ref={overlayRef}
                            onClick={handleOverlayClick}
                            className={`absolute inset-0 w-full h-full ${setupPhase === 'manual' ? 'z-10 pointer-events-auto cursor-crosshair' : 'pointer-events-none opacity-0'}`}
                        />
                    </div>
                ) : (
                    <div className="w-full max-w-4xl bg-gray-100 rounded-xl aspect-video flex flex-col items-center justify-center text-gray-400">
                        {status === 'Error' || streamError ? (
                            <div className="text-center p-6">
                                <div className="text-red-500 font-bold text-xl mb-2">
                                    {streamError ? 'Video Stream Unavailable' : (error || 'Connection Failed')}
                                </div>
                                <p className="text-gray-500 mb-4">
                                    {streamError
                                        ? 'The detection service is running but the video stream could not be loaded. Ensure port 8080 is free.'
                                        : 'Could not contact the backend service.'}
                                </p>
                                {streamError && (
                                    <button
                                        onClick={() => setStreamError(false)}
                                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
                                    >
                                        Retry Connection
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {countdown !== null && countdown > 0 ? (
                                    <div className="text-center">
                                        <div className="text-8xl font-black text-emerald-500 animate-pulse mb-4">
                                            {countdown}
                                        </div>
                                        <p className="text-xl font-bold text-gray-700">Prepare for Detection...</p>
                                    </div>
                                ) : countdown === 0 ? (
                                     <div className="text-center">
                                         <div className="text-8xl font-black text-emerald-600 animate-bounce mb-4">
                                             GO!
                                         </div>
                                     </div>
                                ) : (
                                    <>
                                        <Activity className="w-12 h-12 mb-4 animate-bounce text-emerald-500" />
                                        <p className="animate-pulse">{status}</p>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}

                {setupPhase === 'manual' && (
                    <div className="mt-6 w-full max-w-2xl bg-emerald-50 rounded-2xl p-6 border border-emerald-200 shadow-sm text-center">
                        <h4 className="font-bold text-emerald-800 text-xl mb-2">Draw Custom Pitch</h4>
                        <p className="text-md text-emerald-700 mb-4">Click 4 points on the live video above to manually draw the pitch.</p>
                        
                        <div className="flex flex-wrap gap-4 justify-center items-center">
                            <button 
                                onClick={clearPitchPts} 
                                disabled={manualPitchPts.length === 0}
                                className="px-6 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-colors disabled:opacity-50"
                            >
                                Clear Points
                            </button>
                            <button 
                                onClick={applyManualPitch} 
                                disabled={manualPitchPts.length !== 4} 
                                className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200"
                            >
                                Apply Custom Pitch
                            </button>
                            <button 
                                onClick={handleAutoPitch} 
                                className="px-6 py-3 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 transition-colors"
                            >
                                Cancel & Use Auto
                            </button>
                        </div>
                    </div>
                )}

                {/* Controls */}
                <div className="mt-8 flex flex-col items-center w-full">
                    <div className="flex gap-4 flex-wrap justify-center">
                        <button
                            onClick={() => navigate('/source')}
                            className="text-gray-500 hover:text-emerald-600 font-medium flex items-center gap-2 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </button>

                        <button
                            onClick={handleReplay}
                            className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <PlayCircle className="w-5 h-5" />
                            Restart Detection
                        </button>

                        {setupPhase === 'running' && (
                            <button
                                onClick={handleManualMode}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Crosshair className="w-5 h-5" />
                                Draw Manual Pitch
                            </button>
                        )}
                        {setupPhase === 'running' && manualPitchPts.length > 0 && (
                            <button
                                onClick={handleAutoPitch}
                                className="bg-purple-500 hover:bg-purple-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-purple-200 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Activity className="w-5 h-5" />
                                Switch to Auto
                            </button>
                        )}

                        <button
                            onClick={handleStop}
                            className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-red-200 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <StopCircle className="w-5 h-5" />
                            Stop Stream
                        </button>
                    </div>

                    {!error && status === 'Running' && (
                        <div className="text-gray-400 text-xs mt-4">
                            Stream Source: {ipAddress ? `IP Camera (${ipAddress})` : 'Local Webcam'} | Detections & Landmarks: {showLandmarks ? 'On' : 'Off'}
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
}
