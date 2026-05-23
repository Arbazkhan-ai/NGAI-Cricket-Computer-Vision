
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StopCircle, ArrowLeft, Activity, PlayCircle } from 'lucide-react';
import { startLiveDetection, stopLiveDetection, startLbwLiveDetection, stopLbwLiveDetection } from '../services/api';

export default function LiveDetection() {
    const location = useLocation();
    const navigate = useNavigate();
    const { ipAddress, port, showLandmarks, analysisType, manualPitch } = location.state || {};
    const [status, setStatus] = useState('Initializing...');
    const [streamError, setStreamError] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [liveScore, setLiveScore] = useState(0);
    const [lbwDecision, setLbwDecision] = useState<string | null>(null);
    const [streamKey, setStreamKey] = useState(Date.now());

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const start = async () => {
            try {
                setStatus('Starting Detection Service...');
                if (analysisType === 'lbw') {
                    await startLbwLiveDetection(ipAddress, port, showLandmarks, manualPitch);
                } else {
                    await startLiveDetection(ipAddress, port, showLandmarks, manualPitch);
                }
                if (mounted) {
                    setStatus('Running');
                    setCountdown(3);
                }
            } catch (err: any) {
                if (mounted) {
                    setError(err.message || 'Failed to start detection');
                    setStatus('Error');
                }
            }
        };

        start();

        return () => {
            mounted = false;
            // Optional: Auto-stop on unmount?
            // stopLiveDetection().catch(console.error);
        };
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
                const fetchPort = analysisType === 'lbw' ? '8081' : '8080';
                const res = await fetch(`http://127.0.0.1:${fetchPort}/get_score`);
                const data = await res.json();
                
                if (analysisType === 'lbw') {
                    setLbwDecision(data.decision);
                }
                
                setLiveScore(data.score);
            } catch (err) {
                console.error("Score fetch error", err);
            }
        }, 500);

        return () => clearInterval(interval);
    }, [status]);
    const handleStop = async () => {
        try {
            if (analysisType === 'lbw') {
                await stopLbwLiveDetection();
            } else {
                await stopLiveDetection();
            }
            navigate('/source');
        } catch (err) {
            console.error('Failed to stop', err);
        }
    };

    const handleReplay = async () => {
        try {
            setStatus('Restarting Detection Service...');
            if (analysisType === 'lbw') {
                await startLbwLiveDetection(ipAddress, port, showLandmarks, manualPitch);
            } else {
                await startLiveDetection(ipAddress, port, showLandmarks, manualPitch);
            }
            setStatus('Running');
            setCountdown(3);
            setLiveScore(0);
            if (analysisType === 'lbw') setLbwDecision(null);
            setStreamKey(Date.now());
            setStreamError(false);
        } catch (err: any) {
            setError(err.message || 'Failed to restart detection');
            setStatus('Error');
        }
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
                <div className="mt-6 flex items-center gap-6 animate-in slide-in-from-top-4 duration-700">
                    {analysisType === 'lbw' ? (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1">
                            <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">LBW Decision</div>
                            <div className={`text-3xl font-black ${lbwDecision === 'OUT' ? 'text-red-400' : 'text-white'}`}>
                                {lbwDecision || 'Waiting...'}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1">
                            <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Game Score</div>
                            <div className="text-4xl font-black">{liveScore}</div>
                        </div>
                    )}
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex-1">
                        <div className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Active Rules</div>
                        <div className="text-xl font-bold">Rule-Based Active</div>
                    </div>
                </div>

                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            </div>

            {/* Live Video Feed */}
            <div className="bg-white rounded-3xl border border-emerald-100 p-8 shadow-sm flex flex-col items-center">
                {status === 'Running' && countdown === -1 && !streamError ? (
                    <div className="w-full max-w-4xl relative rounded-2xl overflow-hidden shadow-lg border-4 border-emerald-500/20 bg-black aspect-video flex items-center justify-center">
                        <img
                            src={`http://127.0.0.1:${analysisType === 'lbw' ? '8081' : '8080'}/video_feed?t=${streamKey}`}
                            alt="Live Detection Feed"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                console.error("Stream connection error", e);
                                setStreamError(true);
                            }}
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

                {/* Controls */}
                <div className="mt-8 flex flex-col items-center w-full">
                    <div className="flex gap-4">
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
                            Replay Video
                        </button>

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
                            Stream Source: {ipAddress ? `IP Camera (${ipAddress})` : 'Local Webcam'} | Landmarks: {showLandmarks ? 'On' : 'Off'}
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
}
