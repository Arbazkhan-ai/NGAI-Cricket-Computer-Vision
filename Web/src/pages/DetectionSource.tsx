
import { Camera, Video, Image as ImageIcon, Smartphone, MonitorPlay, UploadCloud, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { analyzeImage, type DetectionResult } from '../services/api';

export default function DetectionSource() {
    const [selectedMethod, setSelectedMethod] = useState<string>('live');
    const [selectedCameraType, setSelectedCameraType] = useState<string>('mobile');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any[] | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);

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
                // Simple rounded-like rect
                ctx.roundRect(labelX, labelY - bgHeight, bgWidth, bgHeight, 8);
                ctx.fill();

                // Draw Text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(shotName, labelX + padding, labelY - (padding * 0.4));
            }
        });
    };

    // Effect to draw on Image when result changes



    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Preview
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setAnalysisResult(null);

        // Analyze Image
        if (selectedMethod === 'image') {
            setIsAnalyzing(true);
            try {
                const response = await analyzeImage(file);
                if (response.data) {
                    setAnalysisResult(response.data.map(mapDetection));
                }
            } catch (error) {
                console.error('Analysis failed', error);
                alert('Analysis failed. Check backend console.');
            } finally {
                setIsAnalyzing(false);
            }
        } else if (selectedMethod === 'video') {
            // For video, we just set the preview up. The analysis will happen via effect or manual trigger on playback.
            // We can auto-start playing.
        }
    };

    // Draw effect for Image
    // eslint-disable-next-line
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

    // Video Processing Effect

    const processVideoFrame = async () => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) return;

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
                const response = await analyzeImage(file);
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
                }
            } catch (e) {
                console.error(e);
            }
            // Continue loop
            if (!video.paused && !video.ended) {
                requestAnimationFrame(() => setTimeout(processVideoFrame, 200)); // Faster 5fps
            }
        }, 'image/jpeg', 0.8);
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="space-y-8 pb-8">
            {/* Header Banner */}
            <div className="bg-emerald-500 rounded-3xl p-8 text-white shadow-lg shadow-emerald-200">
                <h1 className="text-2xl font-bold mb-2">Detection Source</h1>
                <p className="text-emerald-50 opacity-90 font-medium">Choose your input method for shot detection</p>
            </div>

            {/* Input Methods */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { id: 'live', title: 'Live Camera', desc: 'Real-Time Detection', icon: Camera },
                    { id: 'video', title: 'Video Upload', desc: 'Fast-Time Detection', icon: Video },
                    { id: 'image', title: 'Image', desc: 'Analyze Single Frame', icon: ImageIcon },
                ].map((method) => (
                    <div
                        key={method.id}
                        onClick={() => setSelectedMethod(method.id)}
                        className={`
                            relative bg-white p-8 rounded-3xl border transition-all cursor-pointer group flex flex-col items-center justify-center text-center gap-4 h-48
                            ${selectedMethod === method.id
                                ? 'border-emerald-500 shadow-lg shadow-emerald-100 ring-4 ring-emerald-50'
                                : 'border-emerald-100 hover:border-emerald-300 hover:shadow-md'
                            }
                        `}
                    >
                        <div className={`
                            p-4 rounded-2xl transition-colors
                            ${selectedMethod === method.id ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white'}
                        `}>
                            <method.icon className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className={`font-bold text-lg mb-1 ${selectedMethod === method.id ? 'text-emerald-900' : 'text-gray-700'}`}>
                                {method.title}
                            </h3>
                            <p className="text-xs text-emerald-600/70 font-medium uppercase tracking-wide">{method.desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Content Section based on Selection */}
            <div className={`
                border border-emerald-200 rounded-3xl p-8 transition-all duration-500 bg-emerald-50/30
            `}>

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
                                        bg-white p-6 rounded-2xl border transition-all cursor-pointer flex flex-col items-center gap-4 py-8
                                        ${selectedCameraType === type.id
                                            ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                                            : 'border-emerald-100 hover:border-emerald-300'
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

                        <div className="flex justify-center">
                            <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 flex items-center gap-3 active:scale-95">
                                <Camera className="w-5 h-5" />
                                <span>Connect Camera</span>
                            </button>
                        </div>
                    </div>
                )}

                {(selectedMethod === 'video' || selectedMethod === 'image') && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center py-8">
                        <div
                            onClick={triggerFileInput}
                            className="w-full max-w-2xl border-2 border-dashed border-emerald-300 rounded-3xl p-12 flex flex-col items-center justify-center bg-white/50 hover:bg-white/80 transition-colors cursor-pointer group"
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept={selectedMethod === 'video' ? "video/*" : "image/*"}
                                onChange={handleFileChange}
                            />

                            {previewUrl && selectedMethod === 'image' ? (
                                <div className="mb-6 flex justify-center w-full">
                                    <div className="relative inline-block">
                                        <img
                                            ref={imageRef}
                                            src={previewUrl}
                                            alt="Preview"
                                            className="max-h-[60vh] max-w-full h-auto rounded-lg shadow-md block"
                                            onLoad={() => {
                                                if (analysisResult && overlayRef.current && imageRef.current) {
                                                    const ctx = overlayRef.current.getContext('2d');
                                                    if (ctx) drawDetections(ctx, analysisResult, imageRef.current);
                                                }
                                            }}
                                        />
                                        <canvas
                                            ref={overlayRef}
                                            className="absolute inset-0 w-full h-full pointer-events-none"
                                        />
                                        {isAnalyzing && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                                                <Loader2 className="w-10 h-10 text-white animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : selectedMethod === 'video' && previewUrl ? (
                                <div className="mb-6 flex justify-center w-full">
                                    <div className="relative inline-block">
                                        <video
                                            ref={videoRef}
                                            src={previewUrl}
                                            controls
                                            autoPlay
                                            muted
                                            className="max-h-[60vh] max-w-full h-auto rounded-lg shadow-md block"
                                            onPlay={() => {
                                                processVideoFrame();
                                            }}
                                        />
                                        <canvas
                                            ref={overlayRef}
                                            className="absolute inset-0 w-full h-full pointer-events-none"
                                        />
                                        <canvas ref={canvasRef} className="hidden" />
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-emerald-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                                    <UploadCloud className="w-8 h-8 text-emerald-600" />
                                </div>
                            )}

                            <h3 className="text-xl font-bold text-gray-800 mb-2">
                                {selectedMethod === 'video' ? 'Upload Video File' : 'Upload Image File'}
                            </h3>
                            <p className="text-gray-500 text-center text-sm mb-6 max-w-sm">
                                {selectedMethod === 'video'
                                    ? 'Drag and drop your cricket match video here, or click to browse. Supports MP4, MOV, AVI.'
                                    : 'Drag and drop your image here, or click to browse. Supports JPG, PNG, WEBP.'
                                }
                            </p>
                            <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 active:scale-95">
                                {isAnalyzing ? 'Analyzing...' : 'Browse Files'}
                            </button>
                        </div>

                        {analysisResult && analysisResult.length > 0 && (
                            <div className="mt-8 w-full max-w-2xl bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm text-center">
                                <h3 className="font-bold text-emerald-800 mb-2">Detected Shot</h3>
                                <div className="text-3xl font-bold text-gray-800">
                                    {analysisResult[0].class_name || 'Unknown Shot'}
                                </div>
                                <div className="text-sm text-emerald-600 font-bold mt-1">
                                    Confidence: {(analysisResult[0].conf * 100).toFixed(0)}%
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
