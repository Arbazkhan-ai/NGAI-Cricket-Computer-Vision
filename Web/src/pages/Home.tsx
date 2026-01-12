import { Play, Activity, Target, Shield } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { useRef, useState, useEffect } from 'react';
import { analyzeImage, type DetectionResult } from '../services/api';

export default function Home() {
    const { rules, gameActive, score } = useGame();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [lastDetection, setLastDetection] = useState<DetectionResult | null>(null);
    const [recentDetections, setRecentDetections] = useState<any[]>([]);
    const lastDetectionTimeRef = useRef<number>(0);

    // Fallback shot names if model returns Class 0-3
    const SHOT_NAMES: Record<number, string> = {
        0: 'Sweep',
        1: 'Drive',
        2: 'Pullshot',
        3: 'Leg Glance-Flick'
    };

    const startCamera = async () => {
        try {
            // Check if any cameras are available first
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length === 0) {
                alert("No camera devices found. Please connect a camera.");
                return;
            }

            console.log("Available cameras:", videoDevices);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsStreaming(true);

                // Attempt to set Zoom to 2x
                const track = stream.getVideoTracks()[0];
                const capabilities = track.getCapabilities() as any;

                // Check if zoom is supported
                if ('zoom' in capabilities) {
                    try {
                        const zoomCapabilities = capabilities.zoom;
                        if (zoomCapabilities) {
                            // Set to 2x, or max if max < 2, or min if min > 2 (unlikely but safe)
                            const minZoom = zoomCapabilities.min || 1;
                            const maxZoom = zoomCapabilities.max || 1;
                            const targetZoom = Math.min(Math.max(2, minZoom), maxZoom);

                            await track.applyConstraints({
                                advanced: [{ zoom: targetZoom } as any]
                            });
                            console.log(`Zoom set to ${targetZoom}x`);
                        }
                    } catch (zoomErr) {
                        console.warn("Failed to set zoom:", zoomErr);
                    }
                } else {
                    console.log("Zoom not supported by this camera/browser");
                }
            }
        } catch (err: any) {
            console.warn("HD camera access failed, trying default constraints...", err);

            // Specific handling for "device in use"
            if (err.name === 'NotReadableError' || err.message.includes('Could not start video source')) {
                alert("Camera appears to be in use by another application (Zoom, Teams, etc.). Please close other apps using the camera and try again.");
                return;
            }

            try {
                // Fallback: Try without specific resolution constraints
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setIsStreaming(true);
                }
            } catch (fallbackErr: any) {
                console.error("Error accessing camera:", fallbackErr);

                if (fallbackErr.name === 'NotReadableError' || fallbackErr.message.includes('Could not start video source')) {
                    alert("Camera is in use by another program. Please close other apps and reload.");
                } else if (fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError') {
                    alert("Camera permission denied. Please click the lock icon in your URL bar and 'Allow' camera access.");
                } else {
                    alert(`Camera Error: ${fallbackErr.message || "Unknown error"}. Check if camera is connected.`);
                }
            }
        }
    };

    useEffect(() => {
        let intervalId: any;

        if (isStreaming) {
            intervalId = setInterval(async () => {
                if (!videoRef.current || !canvasRef.current) return;

                const video = videoRef.current;
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Set canvas dimensions to match video
                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                // Draw current frame to hidden canvas for upload
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = video.videoWidth;
                tempCanvas.height = video.videoHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx?.drawImage(video, 0, 0);

                // Convert to blob and send
                tempCanvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });

                    try {
                        const response = await analyzeImage(file, 'mediapipe');

                        // Clear previous drawings
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        if (response.data && response.data.length > 0) {
                            const newDet = response.data[0];
                            setLastDetection(newDet); // Update UI with first detection

                            // Map Class ID to Name if missing
                            if (!newDet.class_name && newDet.class_id !== undefined) {
                                newDet.class_name = SHOT_NAMES[newDet.class_id] || `Shot ${newDet.class_id}`;
                            }

                            // Add to Recent Detections (Throttled: 1 second cooldown)
                            const now = Date.now();
                            if (now - lastDetectionTimeRef.current > 1000) {
                                setRecentDetections(prev => [
                                    {
                                        name: newDet.class_name || 'Unknown Shot',
                                        time: new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                                        result: 'Detected', // Placeholder logic for result
                                        color: 'text-emerald-600 bg-emerald-50 border-emerald-100'
                                    },
                                    ...prev
                                ].slice(0, 50)); // Keep last 50
                                lastDetectionTimeRef.current = now;
                            }

                            // Draw boxes and poses - DISABLED
                            // response.data.forEach(det => {
                            // });
                        }
                    } catch (e) {
                        console.error("Detection error", e);
                    }
                }, 'image/jpeg', 0.8);

            }, 500); // 2 FPS to prevent backend overload
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isStreaming]);

    // Filter active rules for display
    const activeRules = rules.filter(r => r.active);

    return (
        <div className="grid grid-cols-12 gap-6 h-full pb-8">
            {/* Left Column - Live Feed */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
                <div className="bg-gray-900 rounded-3xl overflow-hidden shadow-2xl relative aspect-video group border border-gray-800">
                    {/* Video Feed */}
                    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
                        {!isStreaming && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 bg-[url('../assets/cricket_sketch.png')] bg-cover bg-center opacity-50 mix-blend-overlay"></div>
                        )}
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className={`w-full h-full object-cover ${!isStreaming ? 'hidden' : ''}`}
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full pointer-events-none object-cover"
                        />
                    </div>

                    {!isStreaming && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                            <button
                                onClick={startCamera}
                                className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 cursor-pointer group-hover:scale-110 transition-transform hover:bg-white/20"
                            >
                                <Play className="w-8 h-8 text-white fill-current ml-1" />
                            </button>
                        </div>
                    )}

                    {/* Live Badge */}
                    <div className="absolute top-6 right-6 flex items-center gap-2 bg-red-600 px-4 py-1.5 rounded-full animate-pulse shadow-lg shadow-red-900/50">
                        <div className="w-2 h-2 bg-white rounded-full" />
                        <span className="text-white text-xs font-bold uppercase tracking-wider">Live</span>
                    </div>

                    {/* Overlays - Shot Detection */}
                    {/* Only show these overlays if needed, or keeping them static for demo */}
                    <div className="absolute top-6 left-6 flex flex-col gap-2">
                        <div className="bg-black/60 backdrop-blur-md text-white px-5 py-3 rounded-2xl border border-white/10 shadow-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <Target className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Shot Detection</span>
                            </div>
                        </div>
                        <div className="font-bold text-lg leading-none">
                            {lastDetection?.class_name || 'Waiting for Shot...'}
                        </div>
                    </div>

                </div>

                {/* Overlays - Status */}
                <div className="absolute bottom-6 left-6">
                    <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl border border-emerald-500 shadow-xl flex items-center gap-3">
                        <div className="bg-white/20 p-1.5 rounded-full">
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <div className="text-[10px] font-bold uppercase opacity-80">LBW Status</div>
                            <div className="font-bold text-lg leading-none">Not Out</div>
                        </div>
                    </div>
                </div>

                {/* Confidence or Current Score if Game Active */}
                <div className="absolute bottom-6 right-6">
                    {gameActive ? (
                        <div className="bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl border border-emerald-500/30 shadow-xl">
                            <div className="text-[10px] font-bold uppercase opacity-80 text-right text-emerald-400">Current Score</div>
                            <div className="font-bold text-3xl leading-none text-right">{score}</div>
                        </div>
                    ) : (
                        <div className="bg-black/80 backdrop-blur-md text-emerald-400 px-6 py-3 rounded-2xl border border-emerald-500/30 shadow-xl">
                            <div className="text-[10px] font-bold uppercase opacity-80 text-right">Confidence</div>
                            <div className="font-bold text-3xl leading-none">
                                {lastDetection ? `${(lastDetection.conf * 100).toFixed(0)}%` : '0%'}
                            </div>
                        </div>
                    )}
                </div>
                {/* Meta Data */}
                <div className="flex justify-between text-xs font-mono text-gray-400 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                    <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        Source: Live Camera Feed (Cam-01)
                    </span>
                    <span>Resolution: 1920x1080 @ 60fps</span>
                    <span className="text-emerald-600 font-bold">Latency: 45ms</span>
                </div>
            </div>

            {/* Right Column - Stats */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                {/* Current Detection */}
                <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-gray-800 text-lg">Current Detection</h3>
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-emerald-600" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {[
                            { label: 'Shot Type', value: lastDetection?.class_name || (lastDetection?.class_id !== undefined ? SHOT_NAMES[lastDetection.class_id] : 'Waiting...'), icon: Target },
                            { label: 'Confidence', value: lastDetection ? `${(lastDetection.conf * 100).toFixed(0)}%` : '-', icon: Activity },
                            { label: 'Result', value: gameActive ? 'Tracking...' : 'N/A', icon: Shield, hidden: !gameActive },
                        ].filter(item => !item.hidden).map((item: any, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl hover:bg-emerald-50/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className="bg-white p-2 rounded-xl shadow-sm text-gray-400 group-hover:text-emerald-600 transition-colors">
                                        <item.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{item.label}</div>
                                        <div className={`font-bold text-gray-800 ${item.color || ''}`}>{item.value}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-100 text-[10px] text-gray-400 text-center font-mono">
                        Last Update: 21:30:45
                    </div>
                </div>

                {/* Recent Detections List */}
                <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex-1 flex flex-col">
                    <h3 className="font-bold text-gray-800 mb-4 text-lg">Recent Detections</h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-100">
                        {recentDetections.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 transition-colors cursor-pointer group">
                                <div>
                                    <div className="font-bold text-sm text-gray-800 group-hover:text-emerald-700 transition-colors">{item.name}</div>
                                    <div className="text-[10px] text-gray-400 font-mono">{item.time}</div>
                                </div>
                                {gameActive && (
                                    <div className={`text-[10px] font-bold px-3 py-1 rounded-full border ${item.color}`}>
                                        {item.result}
                                    </div>
                                )}
                            </div>
                        ))}
                        {recentDetections.length === 0 && (
                            <div className="text-center text-gray-400 text-xs py-10">
                                No detections yet. Start performing shots!
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Row - Game Rules (Conditionally Rendered) */}
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
                                                {/* Generic Target icon since specific icons aren't passed strictly */}
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

                            <div className="mt-8 bg-black/20 backdrop-blur-sm p-4 rounded-2xl border border-white/5 flex items-start gap-4">
                                <div className="p-2 bg-white/10 rounded-full">
                                    <Activity className="w-4 h-4 text-emerald-200" />
                                </div>
                                <div>
                                    <span className="font-bold text-sm block mb-1 text-emerald-200">AI Detection Process</span>
                                    <p className="text-xs opacity-80 leading-relaxed max-w-4xl">
                                        The system uses computer vision and machine learning (YOLOv8 + OpenCV) to analyze the camera feed in real-time, tracking ball trajectory, bat position, and player stance to accurately detect shot types and determine outcomes based on professional cricket rules.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
