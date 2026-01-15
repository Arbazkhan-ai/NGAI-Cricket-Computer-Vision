
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StopCircle, ArrowLeft, Activity } from 'lucide-react';
import { startLiveDetection, stopLiveDetection } from '../services/api';

export default function LiveDetection() {
    const location = useLocation();
    const navigate = useNavigate();
    const { ipAddress, port, showLandmarks } = location.state || {};
    const [status, setStatus] = useState('Initializing...');
    const [streamError, setStreamError] = useState(false);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const start = async () => {
            try {
                setStatus('Starting Detection Service...');
                await startLiveDetection(ipAddress, port, showLandmarks);
                if (mounted) setStatus('Running');
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

    const handleStop = async () => {
        try {
            await stopLiveDetection();
            navigate('/source');
        } catch (err) {
            console.error('Failed to stop', err);
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

                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            </div>

            {/* Live Video Feed */}
            <div className="bg-white rounded-3xl border border-emerald-100 p-8 shadow-sm flex flex-col items-center">
                {status === 'Running' && !streamError ? (
                    <div className="w-full max-w-4xl relative rounded-2xl overflow-hidden shadow-lg border-4 border-emerald-500/20 bg-black aspect-video flex items-center justify-center">
                        <img
                            src={`http://localhost:8080/video_feed?t=${Date.now()}`}
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
                                <Activity className="w-12 h-12 mb-4 animate-bounce text-emerald-500" />
                                <p className="animate-pulse">{status}</p>
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
