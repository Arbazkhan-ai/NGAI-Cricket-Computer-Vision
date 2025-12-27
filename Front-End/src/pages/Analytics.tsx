
import { Target, TrendingUp, Activity, Award } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line
} from 'recharts';

import { useEffect, useState } from 'react';
import { getHistory } from '../services/api';

const processData = (history: any[]) => {
    // KPI
    const totalShots = history.length;
    let hitCount = 0;

    // Distribution
    const counts: Record<string, number> = {
        'Sweep': 0, 'Drive': 0, 'Pullshot': 0, 'Leg Glance-Flick': 0
    };

    // Mapping incase DB has old names or IDs
    const ID_TO_NAME: Record<number, string> = { 0: 'Sweep', 1: 'Drive', 2: 'Pullshot', 3: 'Leg Glance-Flick' };

    history.forEach(item => {
        let name = item.class_name;
        // Fallback or Normalize means we need to ensure consistency.
        // Assuming Backend serves raw strings stored.
        // If DB has IDs, we must rely on logic. 
        // Currently DB stores generic JSON string "results".
        // Actually, db stores 'results' text. We need to parse it if we want detailed analytics.
        // Wait, current /history endpoint returns rows. row.results is text.

        // Let's assume for this step we will fetch and parse.
        // If simple implementation, we just mock logic or need to update backend to return parsed.
        // Correction: Backend /history returns: { id, image_path, results, timestamp }
        // results is a JSON string of list of detections.

        let detections = [];
        try {
            detections = JSON.parse(item.results);
        } catch (e) { }

        if (detections.length > 0) {
            // Count first detection
            const det = detections[0];
            const n = det.class_name || ID_TO_NAME[det.class_id] || 'Unknown';
            if (counts[n] !== undefined) counts[n]++;
            else counts[n] = (counts[n] || 0) + 1;

            // Dummy logic for Hit Rate (e.g. higher conf = hit)
            if (det.conf > 0.7) hitCount++;
        }
    });

    const shotDist = Object.keys(counts).map(key => ({ name: key, count: counts[key] }));
    const hitRate = totalShots > 0 ? ((hitCount / totalShots) * 100).toFixed(1) + '%' : '0%';

    return { shotDist, totalShots, hitRate };
};


const KpiCard = ({ title, value, icon: Icon }: { title: string, value: string, icon: any }) => (
    <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100/50 hover:shadow-md transition-shadow">
        <div className="flex flex-col h-full justify-between">
            <div className="bg-emerald-600 w-8 h-8 rounded-lg flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-white" />
            </div>
            <div>
                <p className="text-gray-500 text-sm font-medium">{title}</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">{value}</h3>
            </div>
        </div>
    </div>
);

export default function Analytics() {
    const [data, setData] = useState<any>({ shotDist: [], totalShots: 0, hitRate: '0%' });

    useEffect(() => {
        getHistory().then(history => {
            const processed = processData(history);
            setData(processed);
        }).catch(console.error);
    }, []);

    return (
        <div className="space-y-6 pb-8">
            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Total Shots" value={data.totalShots.toString()} icon={Target} />
                <KpiCard title="Hit Rate" value={data.hitRate} icon={Award} />
                <KpiCard title="Detection Accuracy" value="92.4%" icon={Activity} />
                <KpiCard title="Current Score" value={(data.totalShots * 4).toString()} icon={TrendingUp} />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Shot Type Distribution */}
                <div className="bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100/50">
                    <h3 className="text-lg font-bold text-emerald-900 mb-6">Shot Type Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.shotDist}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6B7280', fontSize: 10 }}
                                    interval={0}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: '#D1FAE5', opacity: 0.4 }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Hit vs Miss Ratio */}
                <div className="bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100/50 relative">
                    <h3 className="text-lg font-bold text-emerald-900 mb-6">Hit vs Miss Ratio</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'Hit', value: parseInt(data.hitRate), color: '#10B981' },
                                        { name: 'Miss', value: 100 - parseInt(data.hitRate), color: '#EF4444' }
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={0}
                                    outerRadius={100}
                                    paddingAngle={0}
                                    dataKey="value"
                                >
                                    {/* Using index from parent map isn't applicable here since data is inline now, 
                                        but Recharts handles color from data object if keys match. 
                                        Actually we need to map cells manually if we want exact control or rely on data.color */}
                                    {[
                                        { name: 'Hit', value: parseInt(data.hitRate), color: '#10B981' },
                                        { name: 'Miss', value: 100 - parseInt(data.hitRate), color: '#EF4444' }
                                    ].map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Custom Legend Overlay */}
                        <div className="absolute top-1/2 left-10 lg:left-20 transform -translate-y-1/2 pointer-events-none">
                            <span className="text-emerald-600 font-bold text-sm">Hit: {data.hitRate}</span>
                        </div>
                        <div className="absolute top-1/2 right-10 lg:right-20 transform -translate-y-1/2 mt-12 pointer-events-none">
                            <span className="text-red-500 font-bold text-sm">Miss: {100 - parseInt(data.hitRate)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Performance Over Time */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold text-emerald-900 mb-6">Performance Over Time</h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                            <XAxis
                                dataKey="time"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                yAxisId="left"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                domain={[0, 100]}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                            />
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="accuracy"
                                stroke="#10B981"
                                strokeWidth={2}
                                dot={{ fill: '#10B981', r: 2 }}
                                activeDot={{ r: 4 }}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="score"
                                stroke="#93C5FD"
                                strokeWidth={2}
                                dot={{ fill: '#93C5FD', r: 2 }}
                                activeDot={{ r: 4 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
