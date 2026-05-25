import { Camera, Video, Image as ImageIcon, Smartphone, MonitorPlay, UploadCloud, Loader2, Zap } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeImage, uploadVideoOnly, type DetectionResult } from '../services/api';



export default function DetectionSource() {
    const navigate = useNavigate();
    const [selectedMethod, setSelectedMethod] = useState<string>('live');
    const [selectedCameraType, setSelectedCameraType] = useState<string>('mobile');
    const [analysisType, setAnalysisType] = useState<'shot' | 'lbw'>('shot');

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any[] | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const [isPitchSetup, setIsPitchSetup] = useState(false);
    const [manualPitchPts, setManualPitchPts] = useState<{x: number, y: number}[]>([]);

    const [ipAddress, setIpAddress] = useState('');
    const [port, setPort] = useState('');
    const [showLandmarks, setShowLandmarks] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);

    const [useCustomUrl, setUseCustomUrl] = useState(false);


    // Shot Names
    const SHOT_NAMES: Record<number, string> = {
        0: 'Sweep',
        1: 'Drive',
        2: 'Pullshot',
        3: 'Leg Glance-Flick'
    };

    const mapDetection = (det: DetectionResult) => {
        if (!det.class_name && det.class_id !== undefined) {
            // @ts-ignore
            det.class_name = SHOT_NAMES[det.class_id] || `Shot ${det.class_id}`;
        }
        return det;
    };

    const drawDetections = (
        ctx: CanvasRenderingContext2D,
        detections: DetectionResult[],
        element: HTMLVideoElement | HTMLImageElement
    ) => {
        if (selectedMethod === 'video') return; // Hide all labels/boxes for video upload
        const naturalWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
        const naturalHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;

        if (ctx.canvas.width !== naturalWidth || ctx.canvas.height !== naturalHeight) {
            ctx.canvas.width = naturalWidth;
            ctx.canvas.height = naturalHeight;
        }

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        detections.forEach(det => {
            if (det.xyxy) {
                const [x1, y1] = det.xyxy;

                const shotName = det.class_name || 'Shot';

                // Calculate responsive font size
                const fontSize = Math.max(20, naturalWidth / 35);
                ctx.font = `bold ${fontSize}px sans-serif`;

                // Measure text for background
                const metrics = ctx.measureText(shotName);
                const padding = fontSize * 0.4;
                const bgWidth = metrics.width + (padding * 2);
                const bgHeight = fontSize + padding;
                const labelX = x1;
                const labelY = y1 - 10;

                // Draw Background Badge (Emerald)
                ctx.fillStyle = '#10b981';
                ctx.beginPath();
                ctx.roundRect(labelX, labelY - bgHeight, bgWidth, bgHeight, 8);
                ctx.fill();

                // Draw Text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(shotName, labelX + padding, labelY - (padding * 0.4));
            }

            // Draw Skeleton if available
            if (det.keypoints) {
                // MediaPipe Pose Connections (Simplified set)
                const connections = [
                    [11, 12], [11, 13], [13, 15], // Left Arm
                    [12, 14], [14, 16],           // Right Arm
                    [11, 23], [12, 24], [23, 24], // Torso
                    [23, 25], [25, 27],           // Left Leg
                    [24, 26], [26, 28]            // Right Leg
                ];

                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                // Draw Lines
                ctx.strokeStyle = '#f57542'; // Orange
                ctx.lineWidth = 3;
                ctx.beginPath();
                connections.forEach(([i, j]) => {
                    const kp1 = det.keypoints![i];
                    const kp2 = det.keypoints![j];
                    if (kp1 && kp2) {
                        ctx.moveTo(kp1[0] * w, kp1[1] * h);
                        ctx.lineTo(kp2[0] * w, kp2[1] * h);
                    }
                });
                ctx.stroke();

                // Draw Points
                ctx.fillStyle = '#f542e6'; // Pink
                det.keypoints.forEach((kp) => {
                    if (kp) {
                        ctx.beginPath();
                        ctx.arc(kp[0] * w, kp[1] * h, 4, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                });
            }
        });
    };

    const processVideoFrame = async () => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended || selectedMethod === 'video') return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
            try {
                const response = await analyzeImage(file, 'mediapipe');
                if (response.data && response.data.length > 0) {
                    const mapped = response.data.map(mapDetection);
                    setAnalysisResult(mapped);

                    // Draw on overlay
                    if (overlayRef.current) {
                        const overlayCtx = overlayRef.current.getContext('2d');
                        if (overlayCtx) {
                            drawDetections(overlayCtx, mapped, video);
                        }
                    }
                } else {
                    if (overlayRef.current) {
                        const overlayCtx = overlayRef.current.getContext('2d');
                        overlayCtx?.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);
                    }
                }
            } catch (e) {
                console.error(e);
            }
            // Continue loop
            if (!video.paused && !video.ended) {
                requestAnimationFrame(() => setTimeout(processVideoFrame, 150)); // Approx 6-7 FPS
            }
        }, 'image/jpeg', 0.6);
    };

    const handleOverlayClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isPitchSetup || manualPitchPts.length >= 4) return;
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

    const confirmLbwSetup = async (isAuto: boolean) => {
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        setAnalysisProgress('Uploading video...');
        try {
            const uploadRes = await uploadVideoOnly(file);
            const videoPath = uploadRes.video_path;
            const ptsArray = isAuto ? undefined : manualPitchPts.map(p => [Math.round(p.x), Math.round(p.y)]);
            
            navigate('/live', {
                state: {
                    ipAddress: videoPath,
                    port: '',
                    showLandmarks: showLandmarks,
                    analysisType: analysisType,
                    manualPitch: ptsArray
                }
            });
        } catch (e) {
            console.error(e);
            alert('Upload failed');
            setIsAnalyzing(false);
            setAnalysisProgress('');
        }
    };

    const [analysisProgress, setAnalysisProgress] = useState<string>('');

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setAnalysisResult(null);
        setPreviewUrl(null);
        setIsPitchSetup(false);
        setManualPitchPts([]);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
    };

    const startAnalysis = async () => {
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;

        if (selectedMethod === 'video') {
            setIsPitchSetup(true);
            return;
        }

        setIsAnalyzing(true);
        setAnalysisResult(null);
        setAnalysisProgress('Starting AI Analysis...');

        try {
            if (selectedMethod === 'image') {
                const response = await analyzeImage(file, 'yolo');
                if (response.data) {
                    setAnalysisResult(response.data.map(mapDetection));
                }
            }
        } catch (error) {
            console.error('Analysis failed', error);
            alert('Analysis failed. Check backend console.');
        } finally {
            setIsAnalyzing(false);
            setAnalysisProgress('');
        }
    };
    


    // Effect to draw on Image when result changes
    useEffect(() => {
        if (selectedMethod === 'image' && analysisResult && imageRef.current && overlayRef.current) {
            const ctx = overlayRef.current.getContext('2d');
            if (ctx && imageRef.current) {
                if (imageRef.current.complete) {
                    drawDetections(ctx, analysisResult, imageRef.current);
                }
            }
        }
    }, [analysisResult, selectedMethod]);

    useEffect(() => {
        if (isPitchSetup && overlayRef.current && videoRef.current) {
            const canvas = overlayRef.current;
            const video = videoRef.current;
            
            // For LBW, backend resizes to width=1000. We must match this.
            // For Shot Detection, it uses original width.
            const targetWidth = analysisType === 'lbw' ? 1000 : (video.videoWidth || 640);
            const targetHeight = analysisType === 'lbw' 
                ? (video.videoWidth > 0 ? (video.videoHeight * (1000 / video.videoWidth)) : 750)
                : (video.videoHeight || 480);
            
            if (canvas.width !== targetWidth) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
            }
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
    }, [manualPitchPts, isPitchSetup]);

    // Force video reload when previewUrl changes
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [previewUrl]);

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleAnalysisTypeChange = (type: 'shot' | 'lbw') => {
        setAnalysisType(type);
        setPreviewUrl(null);
        setAnalysisResult(null);
        setIsPitchSetup(false);
        setManualPitchPts([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-8 pb-8">
            {/* Header Banner */}
            <div className="bg-emerald-500 rounded-3xl p-8 text-white shadow-lg shadow-emerald-200 mb-8">
                <h1 className="text-2xl font-bold mb-2">Detection Source</h1>
                <p className="text-emerald-50 opacity-90 font-medium">Choose your input method for shot detection</p>
            </div>

            {/* Analysis Type Toggle */}
            <div className="flex justify-center mb-8">
                <div className="bg-gray-100 p-1.5 rounded-2xl flex gap-2 w-full max-w-md shadow-inner">
                    <button
                        onClick={() => handleAnalysisTypeChange('shot')}
                        className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all ${
                            analysisType === 'shot' ? 'bg-white text-emerald-600 shadow-md' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Shot Detection
                    </button>
                    <button
                        onClick={() => handleAnalysisTypeChange('lbw')}
                        className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all ${
                            analysisType === 'lbw' ? 'bg-white text-emerald-600 shadow-md' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        LBW Analysis
                    </button>
                </div>
            </div>

            {/* Method Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {[
                    { id: 'live', name: 'Live Camera', desc: 'Real-time detection from your webcam or mobile camera', icon: Camera, color: 'emerald' },
                    { id: 'video', name: 'Video Upload', desc: 'Batch process recorded match footage with physics stats', icon: Video, color: 'blue' },
                    { id: 'image', name: 'Static Image', desc: 'Analyze batting stance and form from single photos', icon: ImageIcon, color: 'violet' },
                ].map((method) => (
                    <button
                        key={method.id}
                        onClick={() => {
                            setSelectedMethod(method.id);
                            setPreviewUrl(null);
                            setAnalysisResult(null);
                        }}
                        className={`
                            relative p-4 lg:p-6 rounded-[2rem] border-2 transition-all duration-300 text-left group overflow-hidden
                            ${selectedMethod === method.id
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-xl shadow-emerald-100'
                                : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'
                            }
                        `}
                    >
                        <div className={`p-3 rounded-2xl w-fit ${selectedMethod === method.id ? 'bg-white/20' : 'bg-gray-50'}`}>
                            <method.icon className="w-6 h-6" />
                        </div>
                        <div className="mt-4">
                            <h3 className="font-bold text-lg">{method.name}</h3>
                            <p className={`text-sm mt-1 ${selectedMethod === method.id ? 'text-white/80' : 'text-gray-400'}`}>
                                {method.desc}
                            </p>
                        </div>
                    </button>
                ))}
            </div>

            {/* Content Section based on Selection */}
            <div className="border border-emerald-200 rounded-3xl p-4 lg:p-8 transition-all duration-500 bg-emerald-50/30">
                {selectedMethod === 'live' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h3 className="text-gray-700 font-bold mb-6">Select Camera Type</h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            {[
                                { id: 'mobile', title: 'Mobile Camera', desc: 'Phone/Tablet', icon: Smartphone },
                                { id: 'umpire', title: 'Umpire Position', desc: 'Field Camera', icon: Camera },
                                { id: 'pro', title: 'Professional', desc: 'Broadcast Camera', icon: MonitorPlay },
                            ].map((type) => (
                                <div
                                    key={type.id}
                                    onClick={() => setSelectedCameraType(type.id)}
                                    className={`
                                        p-6 rounded-2xl border transition-all cursor-pointer flex flex-col items-center gap-4 py-8
                                        ${selectedCameraType === type.id
                                            ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 shadow-md'
                                            : 'bg-white border-emerald-100 hover:border-emerald-300'
                                        }
                                    `}
                                >
                                    <type.icon className={`w-8 h-8 ${selectedCameraType === type.id ? 'text-emerald-600' : 'text-gray-400'}`} />
                                    <div className="text-center">
                                        <div className={`font-bold ${selectedCameraType === type.id ? 'text-emerald-900' : 'text-gray-600'}`}>
                                            {type.title}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">{type.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-center mb-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useCustomUrl}
                                    onChange={(e) => setUseCustomUrl(e.target.checked)}
                                    className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500"
                                />
                                <span className="text-gray-700 font-medium">Use Custom Stream URL</span>
                            </label>
                        </div>

                        {useCustomUrl ? (
                            <div className="mb-8 max-w-2xl mx-auto">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Full Stream URL</label>
                                    <input
                                        type="text"
                                        placeholder="http://192.168.1.5:8080/video or rtsp://..."
                                        value={ipAddress}
                                        onChange={(e) => setIpAddress(e.target.value)}
                                        className="border border-emerald-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full bg-white"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-2xl mx-auto">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">IP Address (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="192.168.1.x"
                                        value={ipAddress}
                                        onChange={(e) => setIpAddress(e.target.value)}
                                        className="border border-emerald-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Port (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="8080"
                                        value={port}
                                        onChange={(e) => setPort(e.target.value)}
                                        className="border border-emerald-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex justify-center mb-8">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className={`w-12 h-6 rounded-full p-1 transition-colors ${showLandmarks ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                    onClick={() => setShowLandmarks(!showLandmarks)}>
                                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${showLandmarks ? 'translate-x-6' : ''}`} />
                                </div>
                                <span className="font-semibold text-gray-700 group-hover:text-emerald-600 transition-colors">Show Landmarks</span>
                            </label>
                        </div>

                        <div className="flex justify-center">
                            <button
                                onClick={() => navigate('/live', {
                                    state: {
                                        ipAddress,
                                        port: useCustomUrl ? '' : port,
                                        showLandmarks,
                                        analysisType
                                    }
                                })}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 flex items-center gap-3 active:scale-95">
                                <Camera className="w-5 h-5" />
                                <span>Start Live {analysisType === 'lbw' ? 'LBW' : 'Shot'} Detection</span>
                            </button>
                        </div>
                    </div>
                )}

                {(selectedMethod === 'video' || selectedMethod === 'image') && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center py-8">
                        <div
                            onClick={(!isAnalyzing && !previewUrl) ? triggerFileInput : undefined}
                            className={`
                                w-full max-w-2xl border-2 border-dashed border-emerald-300 rounded-[2.5rem] p-8 lg:p-12 flex flex-col items-center justify-center 
                                ${(!isAnalyzing && !previewUrl) ? 'bg-emerald-50/50 hover:bg-emerald-100/50 cursor-pointer shadow-inner' : 'bg-white shadow-sm'} 
                                transition-all duration-300 group relative overflow-hidden
                            `}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept={selectedMethod === 'video' ? "video/*" : "image/*"}
                                onChange={handleFileChange}
                                disabled={isAnalyzing}
                            />

                            {/* Preview Area */}
                            {previewUrl && (
                                <div className="relative w-full max-w-2xl mx-auto mb-8">
                                    <div className="relative rounded-2xl overflow-hidden border-4 border-white shadow-2xl">
                                        {selectedMethod === 'image' ? (
                                            <img
                                                ref={imageRef}
                                                src={previewUrl}
                                                alt="Preview"
                                                className="max-h-[60vh] rounded-lg shadow-md block"
                                                onLoad={() => {
                                                    if (analysisResult && overlayRef.current && imageRef.current) {
                                                        const ctx = overlayRef.current.getContext('2d');
                                                        if (ctx) drawDetections(ctx, analysisResult, imageRef.current);
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <video
                                                ref={videoRef}
                                                src={previewUrl}
                                                controls
                                                className="max-h-[60vh] rounded-lg shadow-md block"
                                                onPlay={() => processVideoFrame()}
                                            />
                                        )}
                                        <canvas
                                            ref={overlayRef}
                                            onClick={handleOverlayClick}
                                            className={`absolute inset-0 w-full h-full ${isPitchSetup ? 'z-10 pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
                                        />
                                        <canvas ref={canvasRef} className="hidden" />
                                    </div>
                                </div>
                            )}

                            {/* Pitch Setup UI */}
                            {isPitchSetup && (
                                <div className="mt-2 w-full max-w-2xl bg-emerald-50 rounded-2xl p-6 border border-emerald-200 shadow-sm text-center mb-6">
                                    <h4 className="font-bold text-emerald-800 text-lg mb-1">Pitch Setup</h4>
                                    <p className="text-sm text-emerald-600 mb-4">Click 4 points on the video above to manually draw the pitch, or choose Auto Detect.</p>
                                    
                                    <div className="flex justify-center mb-6 mt-4">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className={`w-12 h-6 rounded-full p-1 transition-colors ${showLandmarks ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                                onClick={(e) => { e.stopPropagation(); setShowLandmarks(!showLandmarks); }}>
                                                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${showLandmarks ? 'translate-x-6' : ''}`} />
                                            </div>
                                            <span className="font-semibold text-gray-700 group-hover:text-emerald-600 transition-colors">Show Pose Landmarks</span>
                                        </label>
                                    </div>

                                    <div className="flex flex-wrap gap-4 justify-center">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setManualPitchPts([]); }} 
                                            className="px-6 py-2 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-colors"
                                        >
                                            Clear Points
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); confirmLbwSetup(true); }} 
                                            className="px-6 py-2 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-md shadow-blue-200"
                                        >
                                            Auto Detect Pitch
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); confirmLbwSetup(false); }} 
                                            disabled={manualPitchPts.length !== 4} 
                                            className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200"
                                        >
                                            Start with Custom Pitch
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Loading / Empty State */}
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center text-emerald-600 w-full px-8">
                                    <Loader2 className="w-12 h-12 animate-spin mb-4" />
                                    <h3 className="text-xl font-bold">Processing...</h3>
                                    <p className="text-sm opacity-70 mb-6">Running AI Models...</p>
                                    
                                    {selectedMethod === 'video' && analysisProgress && (
                                        <div className="w-full bg-emerald-100 rounded-full h-12 flex items-center justify-center relative overflow-hidden border border-emerald-200 shadow-inner">
                                            <div className="absolute inset-0 bg-emerald-500/10 animate-pulse" />
                                            <span className="relative z-10 font-mono text-emerald-800 font-bold">
                                                {analysisProgress}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                !previewUrl && (
                                    <div className="text-center">
                                        <div className="bg-emerald-100 p-4 rounded-full mb-4 w-fit mx-auto group-hover:scale-110 transition-transform">
                                            <UploadCloud className="w-8 h-8 text-emerald-600" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">
                                            Upload {selectedMethod === 'video' ? 'Video' : 'Image'}
                                        </h3>
                                        <p className="text-gray-500 text-sm mb-6 max-w-sm">
                                            Select your file to start the analysis process.
                                        </p>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); triggerFileInput(); }}
                                            className="bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all"
                                        >
                                            Select File
                                        </button>
                                    </div>
                                )
                            )}

                            {previewUrl && !isAnalyzing && !isPitchSetup && (
                                <div className="flex flex-col items-center gap-4 w-full">
                                    <button
                                        onClick={startAnalysis}
                                        className="bg-emerald-600 text-white px-12 py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                                    >
                                        <Zap className="w-6 h-6 fill-white" />
                                        <span>START AI ANALYSIS</span>
                                    </button>
                                    
                                    <button
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            setPreviewUrl(null); 
                                            setAnalysisResult(null);
                                            if (fileInputRef.current) fileInputRef.current.value = ''; // Reset memory
                                        }}
                                        className="text-gray-400 text-sm hover:text-emerald-600 transition-colors"
                                    >
                                        Choose Different File
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Results */}
                        {analysisResult && analysisResult.length > 0 && (
                            <div className="mt-8 w-full max-w-2xl bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm text-center">
                                <h3 className="font-bold text-emerald-800 mb-2 uppercase text-xs tracking-widest">Analysis Result</h3>
                                <div className="text-3xl font-black text-gray-900">
                                    {analysisResult[0].class_name || 'Unknown'}
                                </div>
                                <div className="text-sm text-emerald-600 font-bold mt-1">
                                    {(analysisResult[0].conf * 100).toFixed(0)}% Confidence
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
