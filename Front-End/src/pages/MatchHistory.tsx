
import { Eye } from 'lucide-react';

const matchHistoryData = [
    { id: 1, date: '2025-11-13', time: '14:30', duration: '45 mint', totalShots: 87, hitRate: '87.0%', score: 43, accuracy: '88.45%' },
    { id: 2, date: '2025-11-13', time: '14:30', duration: '45 mint', totalShots: 87, hitRate: '87.0%', score: 43, accuracy: '88.45%' },
    { id: 3, date: '2025-11-13', time: '14:30', duration: '45 mint', totalShots: 87, hitRate: '87.0%', score: 43, accuracy: '88.45%' },
    { id: 4, date: '2025-11-13', time: '14:30', duration: '45 mint', totalShots: 87, hitRate: '87.0%', score: 43, accuracy: '88.45%' },
    { id: 5, date: '2025-11-13', time: '14:30', duration: '45 mint', totalShots: 87, hitRate: '87.0%', score: 43, accuracy: '88.45%' },
    { id: 6, date: '2025-11-13', time: '14:30', duration: '45 mint', totalShots: 87, hitRate: '87.0%', score: 43, accuracy: '88.45%' },
];

const SummaryCard = ({ title, value }: { title: string, value: string }) => (
    <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-center h-32">
        <h3 className="text-emerald-600 font-bold mb-2">{title}</h3>
        <p className="text-4xl font-bold text-gray-900">{value}</p>
    </div>
);

export default function MatchHistory() {
    return (
        <div className="space-y-8 pb-8">
            {/* Main History Card */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-emerald-100">
                {/* Header */}
                <div className="bg-emerald-500 p-6">
                    <h2 className="text-2xl font-bold text-white">Match History</h2>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-emerald-50/50 border-b border-emerald-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-bold text-emerald-700">Date & Time</th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-emerald-700">Duration</th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-emerald-700">Total Shots</th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-emerald-700">Hit Rate</th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-emerald-700">Score</th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-emerald-700">Accuracy</th>
                                <th className="px-6 py-4 text-right text-sm font-bold text-emerald-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {matchHistoryData.map((match) => (
                                <tr key={match.id} className="hover:bg-emerald-50/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{match.date}</div>
                                        <div className="text-xs text-gray-500 font-medium">{match.time}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="font-bold text-gray-800">{match.duration}</span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-600">
                                        {match.totalShots}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-800">
                                        {match.hitRate}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-800">
                                        {match.score}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-800">
                                        {match.accuracy}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="inline-flex items-center gap-1 text-emerald-500 hover:text-emerald-700 font-bold text-sm transition-colors">
                                            <span>View Details</span>
                                            {/* <Eye className="w-4 h-4" /> */}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard title="Total Matches" value="45" />
                <SummaryCard title="Average Score" value="34.3%" />
                <SummaryCard title="Average Accuracy" value="98.0%" />
            </div>
        </div>
    );
}
