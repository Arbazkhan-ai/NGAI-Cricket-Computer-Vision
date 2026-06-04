import { useEffect, useState } from 'react';
import { getHistory, getMatches, analyzeExistingVideo } from '../services/api';
import { Eye, Calendar, Clock, Trophy, Target, X, PlayCircle, Activity } from 'lucide-react';

const SummaryCard = ({ title, value, icon: Icon }: { title: string, value: string, icon: any }) => (
    <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
        <div className="p-3 bg-emerald-50 rounded-xl">
            <Icon className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
            <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</h3>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    </div>
);

export default function MatchHistory() {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState('');

    const handleAnalyzeVideo = async (type: 'shot' | 'lbw', sourceTable: 'matches' | 'detections' = 'detections') => {
        if (!selectedMatch) return;
        setIsAnalyzing(true);
        setAnalysisProgress(`Starting ${type === 'lbw' ? 'LBW' : 'Shot'} Analysis...`);
        try {
            const response = await analyzeExistingVideo(selectedMatch.id, type, sourceTable, (progress) => {
                setAnalysisProgress(progress);
            });
            if (response.video_url) {
                const updatedMatch = {
                    ...selectedMatch,
                    ...(sourceTable === 'matches' ? { video_url: response.video_url } : { image_path: response.video_url, results: JSON.stringify(response.data || []) })
                };
                setSelectedMatch(updatedMatch);
                setHistory(prev => prev.map(m => (m.id === selectedMatch.id && m.type === (sourceTable === 'matches' ? 'match' : 'detection')) ? updatedMatch : m));
            }
        } catch (error) {
            console.error('Analysis failed', error);
            alert('Analysis failed. Check console.');
        } finally {
            setIsAnalyzing(false);
            setAnalysisProgress('');
        }
    };

    const parseUtcDate = (ts: string) => {
        if (!ts) return new Date();
        const clean = ts.endsWith('Z') || ts.includes('GMT') || ts.includes('UTC') ? ts : `${ts.replace(' ', 'T')}Z`;
        return new Date(clean);
    };

    useEffect(() => {
        Promise.all([getHistory(), getMatches()])
            .then(([historyData, matchesData]) => {
                // Add a type flag to distinguish them
                const formattedHistory = historyData.map((d: any) => ({ ...d, type: 'detection' }));
                const formattedMatches = matchesData.map((m: any) => ({ ...m, type: 'match' }));
                
                const combined = [...formattedHistory, ...formattedMatches].sort((a, b) => 
                    parseUtcDate(b.timestamp).getTime() - parseUtcDate(a.timestamp).getTime()
                );
                
                setHistory(combined);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const formatTime = (ts: string) => {
        const d = parseUtcDate(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (ts: string) => {
        const d = parseUtcDate(ts);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getPrimaryResult = (match: any) => {
        if (match.type === 'match') {
            return `Score: ${match.score} | Shots: ${match.shots_count}`;
        }
        try {
            const results = JSON.parse(match.results);
            if (Array.isArray(results) && results.length > 0) {
                return results[0].class_name || 'N/A';
            }
        } catch (e) { }
        return 'N/A';
    };

    const getResultsArray = (resultsStr: string) => {
        try {
            const results = JSON.parse(resultsStr);
            return Array.isArray(results) ? results : [];
        } catch (e) {
            return [];
        }
    };

    const getMediaPath = (path: string) => {
        if (!path) return '';
        const cleanPath = path.replace(/\\/g, '/');
        if (cleanPath.startsWith('http')) return cleanPath;
        if (cleanPath.startsWith('/')) return `http://localhost:3000${cleanPath}`;
        return `http://localhost:3000/${cleanPath}`;
    };

    return (
        <div className="space-y-8 pb-8 animate-in fade-in duration-700 relative">
            {/* Header */}
            <div className="bg-emerald-500 rounded-3xl p-8 text-white shadow-lg shadow-emerald-200">
                <h1 className="text-2xl font-bold mb-2">Match History</h1>
                <p className="text-emerald-50 opacity-90 font-medium">Review your past performances and AI analysis</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard title="Total Sessions" value={history.length.toString()} icon={Trophy} />
                <SummaryCard title="Recent Activity" value={history.length > 0 ? getPrimaryResult(history[0]) : 'None'} icon={Target} />
                <SummaryCard title="Best Confidence" value="98.2%" icon={Clock} />
            </div>

            {/* Main History Table */}
            <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-emerald-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-emerald-50/50 border-b border-emerald-100">
                            <tr>
                                <th className="px-8 py-5 text-left text-xs font-bold text-emerald-700 uppercase tracking-widest">Session Date</th>
                                <th className="px-8 py-5 text-left text-xs font-bold text-emerald-700 uppercase tracking-widest">Analysis Type</th>
                                <th className="px-8 py-5 text-left text-xs font-bold text-emerald-700 uppercase tracking-widest">Primary Result</th>
                                <th className="px-8 py-5 text-left text-xs font-bold text-emerald-700 uppercase tracking-widest">Status</th>
                                <th className="px-8 py-5 text-right text-xs font-bold text-emerald-700 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-8 py-6 h-20 bg-gray-50/50" />
                                    </tr>
                                ))
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center text-gray-400">
                                        <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p className="font-medium">No sessions recorded yet</p>
                                    </td>
                                </tr>
                            ) : (
                                history.map((match) => (
                                    <tr key={match.id} className="hover:bg-emerald-50/30 transition-all group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-emerald-100 p-2 rounded-lg group-hover:scale-110 transition-transform">
                                                    <Calendar className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900">{formatDate(match.timestamp)}</div>
                                                    <div className="text-xs text-gray-500 font-medium">{formatTime(match.timestamp)}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                match.type === 'match' ? 'bg-amber-100 text-amber-700' :
                                                match.image_path?.includes('.mp4') ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                                            }`}>
                                                {match.type === 'match' ? 'Live Match' : match.image_path?.includes('.mp4') ? 'Video Analysis' : 'Image Analysis'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 font-black text-gray-700">
                                            {getPrimaryResult(match)}
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                                {match.type === 'match' ? match.duration || 'Completed' : 'Processed'}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button 
                                                onClick={() => {
                                                    console.log("Selected Match:", match);
                                                    setSelectedMatch(match);
                                                }}
                                                className="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ml-auto"
                                            >
                                                <Eye className="w-4 h-4" />
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Details Modal */}
            {selectedMatch && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 lg:p-12 overflow-hidden">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedMatch(null)} />
                    <div className="bg-white dark:bg-zinc-900 w-full max-w-5xl rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col lg:flex-row animate-in zoom-in duration-300 max-h-[90vh]">
                        
                        {/* Media Section / Timeline Section */}
                        <div className={`lg:w-2/3 flex flex-col items-center justify-center relative group min-h-[300px] ${selectedMatch.type === 'match' ? 'bg-gray-50 dark:bg-zinc-800' : 'bg-black'}`}>
                            {selectedMatch.type === 'match' ? (
                                <div className="w-full h-full flex flex-col">
                                    {selectedMatch.video_url && (
                                        <div className="flex-none bg-black border-b border-gray-200 dark:border-white/5">
                                            <video 
                                                src={getMediaPath(selectedMatch.video_url)}
                                                autoPlay
                                                controls 
                                                className="max-h-[45vh] w-full"
                                            />
                                        </div>
                                    )}
                                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                                        <h3 className="text-xl font-black text-emerald-600 mb-6 flex items-center gap-2">
                                            <Activity className="w-6 h-6 animate-pulse" />
                                            Session Timeline
                                        </h3>
                                    {getResultsArray(selectedMatch.details).length === 0 ? (
                                        <div className="text-gray-400 font-medium italic text-center py-12">
                                            No detailed events logged for this session.
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {getResultsArray(selectedMatch.details).map((event: any, idx: number) => (
                                                <div key={idx} className="bg-white dark:bg-zinc-700 p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-emerald-100 dark:border-white/5">
                                                    <div className="text-sm font-bold text-emerald-500 w-24">
                                                        {event.time}
                                                    </div>
                                                    <div className="flex-1">
                                                        {event.type === 'shot' ? (
                                                            <>
                                                                <div className="font-bold text-gray-800 dark:text-white">{event.label}</div>
                                                                <div className="text-xs text-gray-500 font-medium">Conf: {(event.conf * 100).toFixed(1)}% | Speed: {event.speed} | Type: {event.ball_type}</div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="font-bold text-gray-800 dark:text-white">LBW Decision: {event.decision}</div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    </div>
                                </div>
                            ) : selectedMatch.image_path?.includes('.mp4') ? (
                                <video 
                                    src={getMediaPath(selectedMatch.image_path)}
                                    autoPlay
                                    controls 
                                    className="max-h-[70vh] w-full"
                                />
                            ) : (
                                <img 
                                    src={getMediaPath(selectedMatch.image_path)}
                                    alt="Result"
                                    className="max-h-[70vh] object-contain"
                                />
                            )}
                            
                            {selectedMatch.type !== 'match' && (
                                <div className="absolute top-6 left-6 px-4 py-2 bg-emerald-500 text-white rounded-full text-xs font-bold shadow-lg flex items-center gap-2 z-10">
                                    <PlayCircle className="w-4 h-4" />
                                    AI Processed Media
                                </div>
                            )}
                        </div>

                        {/* Info Section */}
                        <div className="lg:w-1/3 p-8 lg:p-10 flex flex-col border-l border-gray-100 dark:border-white/5 bg-white dark:bg-zinc-900/50 overflow-hidden">
                            <button 
                                onClick={() => setSelectedMatch(null)}
                                className="absolute top-6 right-6 p-2 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-full transition-colors z-20"
                            >
                                <X className="w-6 h-6 text-gray-400" />
                            </button>

                            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Session Summary</h2>
                            <p className="text-gray-500 text-sm mb-8">Quick facts about this session</p>

                            <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                {selectedMatch.type === 'match' ? (
                                    <div className="space-y-4">
                                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                            <div className="text-emerald-600 font-bold text-xs uppercase mb-1">Score</div>
                                            <div className="text-3xl font-black text-emerald-700">{selectedMatch.score}</div>
                                        </div>
                                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                            <div className="text-emerald-600 font-bold text-xs uppercase mb-1">Total Hits</div>
                                            <div className="text-3xl font-black text-emerald-700">{selectedMatch.shots_count}</div>
                                        </div>
                                        
                                        {selectedMatch.video_url && !selectedMatch.video_url.includes('_processed') && (
                                            <div className="mt-6 pt-6 border-t border-emerald-100">
                                                <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3">Batch Processing</h4>
                                                {isAnalyzing ? (
                                                    <div className="flex flex-col items-center gap-3 bg-emerald-50/50 p-4 rounded-2xl">
                                                        <Activity className="w-8 h-8 animate-spin text-emerald-500" />
                                                        <div className="text-emerald-700 font-bold text-sm bg-white px-4 py-2 rounded-full shadow-sm text-center">
                                                            {analysisProgress}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-3">
                                                        <button
                                                            onClick={() => handleAnalyzeVideo('shot', 'matches')}
                                                            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-emerald-700 transition-colors"
                                                        >
                                                            Analyze Shot
                                                        </button>
                                                        <button
                                                            onClick={() => handleAnalyzeVideo('lbw', 'matches')}
                                                            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors"
                                                        >
                                                            Check LBW
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3">Detections</h4>
                                        {selectedMatch.type === 'detection' && selectedMatch.image_path?.includes('.mp4') ? (
                                            <div className="space-y-4 mt-4">
                                                {getResultsArray(selectedMatch.results).length > 0 && (
                                                    <div className="space-y-3 mb-4">
                                                        {getResultsArray(selectedMatch.results).map((res: any, idx: number) => (
                                                            <div key={idx} className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border border-emerald-100 dark:border-white/5 shadow-sm">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="font-bold text-gray-800 dark:text-white">{res.class_name || 'Detection'}</span>
                                                                    <span className="text-emerald-500 font-bold text-sm">{(res.conf * 100).toFixed(1)}%</span>
                                                                </div>
                                                                <div className="w-full bg-gray-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                                                                    <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${res.conf * 100}%` }} />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 text-center">
                                                    {isAnalyzing ? (
                                                        <div className="flex flex-col items-center gap-3">
                                                            <Activity className="w-8 h-8 animate-spin text-emerald-500" />
                                                            <div className="text-emerald-700 font-bold text-sm bg-white px-4 py-2 rounded-full shadow-sm">
                                                                {analysisProgress}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <p className="text-sm text-gray-500 font-medium mb-4">
                                                                {getResultsArray(selectedMatch.results).length > 0 ? "Start a new analysis on this video:" : "This video has not been analyzed yet."}
                                                            </p>
                                                            <div className="grid grid-cols-1 gap-3">
                                                                <button
                                                                    onClick={() => handleAnalyzeVideo('shot')}
                                                                    className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-emerald-700 transition-colors"
                                                                >
                                                                    Analyze Shot
                                                                </button>
                                                                <button
                                                                    onClick={() => handleAnalyzeVideo('lbw')}
                                                                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors"
                                                                >
                                                                    Check LBW
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {getResultsArray(selectedMatch.results).map((res: any, idx: number) => (
                                                    <div key={idx} className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border border-emerald-100 dark:border-white/5 shadow-sm">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className="font-bold text-gray-800 dark:text-white">{res.class_name || 'Detection'}</span>
                                                            <span className="text-emerald-500 font-bold text-sm">{(res.conf * 100).toFixed(1)}%</span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                                                            <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${res.conf * 100}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Time</div>
                                        <div className="text-sm font-bold dark:text-white">{formatTime(selectedMatch.timestamp)}</div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Date</div>
                                        <div className="text-sm font-bold dark:text-white">{formatDate(selectedMatch.timestamp)}</div>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => setSelectedMatch(null)}
                                className="mt-8 w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-colors shadow-lg"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
