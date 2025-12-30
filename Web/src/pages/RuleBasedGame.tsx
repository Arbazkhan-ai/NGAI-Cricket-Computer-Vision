import { Plus, Edit2, Trash2, Info } from 'lucide-react';
import { useGame } from '../context/GameContext';

export default function RuleBasedGame() {
    const { rules, toggleRule, gameActive, setGameActive } = useGame();

    const handleStartGame = () => {
        setGameActive(!gameActive);
    };

    return (
        <div className="space-y-6 pb-8">
            {/* Header Banner */}
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-lg shadow-emerald-200 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold mb-2">Rule-Based Game Configuration</h1>
                    <p className="text-emerald-100 opacity-90">Customize detection rules for your match format</p>
                </div>
                <button
                    onClick={handleStartGame}
                    className={`px-8 py-3 rounded-xl font-bold shadow-lg transition-all transform active:scale-95 ${gameActive
                        ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-900/20'
                        : 'bg-white text-emerald-600 hover:bg-emerald-50 shadow-black/10'
                        }`}
                >
                    {gameActive ? 'Stop Game' : 'Start Game'}
                </button>
            </div>

            {/* About Section */}
            <div className="bg-sky-50 border border-sky-100 rounded-3xl p-6 flex gap-4 items-start">
                <div className="bg-sky-100 p-2 rounded-xl text-sky-600 mt-1">
                    <Info className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-sky-900 mb-2">About Rule-Based System</h3>
                    <p className="text-sky-700 text-sm leading-relaxed max-w-4xl">
                        This system uses customizable rules independent of traditional cricket match formats. You can define your own scoring system, penalties, and detection criteria based on your specific requirements. Perfect for training sessions, practice matches, or custom game formats.
                    </p>
                </div>
            </div>



            {/* Detection Rules */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <div>
                        <h3 className="text-lg font-bold text-emerald-900">Detection Rules</h3>
                        <p className="text-xs text-emerald-600">Configure how the system should respond to different events</p>
                    </div>
                    <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                        <span>Add New Rule</span>
                    </button>
                </div>

                <div className="space-y-3">
                    {rules.map((rule) => {
                        // We may not find the icon in Context if we didn't store it properly.
                        // But we didn't store the icon component itself in context state usually (serialized JSON).
                        // However, for this simple generic Context, it holds the object. 
                        // But wait, in GameContext.tsx I removed the 'icon' property from initialRules to simplify types or I forgot.
                        // Let's check GameContext again. I defined Rule interface without 'icon'.
                        // So I cannot render `rule.icon` unless I map it back or add it to interface.
                        // For now, I'll use a default icon or re-add it to interface if possible but context updates are expensive.
                        // Actually, I can just hardcode icons based on ID or type for now to avoid complexity or import them.
                        return (
                            <div key={rule.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgb(0,0,0,0.02)] flex items-center gap-6 group hover:border-emerald-200 transition-all">
                                {/* Toggle Switch */}
                                <button
                                    onClick={() => toggleRule(rule.id)}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${rule.active ? 'bg-emerald-500' : 'bg-gray-200'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${rule.active ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>

                                {/* Icon - using generic for now since context doesn't have it or I need to update context */}
                                {/* Actually, let's just use Info or similar if icon missing */}
                                <div className={`p-3 rounded-xl ${rule.active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                                    {/* <rule.icon className="w-6 h-6" /> - removed rule.icon usage */}
                                    <Info className="w-6 h-6" />
                                </div>

                                {/* Content */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h4 className={`font-bold ${rule.active ? 'text-gray-800' : 'text-gray-400'}`}>{rule.title}</h4>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${rule.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                            }`}>
                                            {rule.result}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400">{rule.description}</p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>




        </div>
    );
}
