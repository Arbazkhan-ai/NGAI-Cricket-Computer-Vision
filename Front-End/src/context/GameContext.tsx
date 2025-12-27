import { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of a Rule
export interface Rule {
    id: number;
    title: string;
    result: string;
    description: string;
    active: boolean;
    type: string;
}

// Define the context state
interface GameContextProps {
    rules: Rule[];
    setRules: (rules: Rule[]) => void;
    gameActive: boolean;
    setGameActive: (active: boolean) => void;
    score: number;
    setScore: (score: number) => void;
    toggleRule: (id: number) => void;
}

const GameContext = createContext<GameContextProps | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
    const [rules, setRules] = useState<Rule[]>([
        { id: 1, title: 'Ball Hits Bat', result: '+1 Runs', description: 'Valid shot connected, player scores one run.', active: true, type: 'success' },
        { id: 2, title: 'Ball Miss Bat', result: 'OUT', description: 'Valid delivery, beat the bat.', active: false, type: 'danger' },
        { id: 3, title: 'LBW (Leg Before)', result: 'OUT', description: 'Leg before wicket.', active: true, type: 'danger' },
        { id: 4, title: 'Wide Ball', result: '+1 Runs', description: 'Illegal delivery, too wide.', active: true, type: 'success' }
    ]);

    // We can default gameActive to false, so rules only show when user 'starts' the session
    // Or true if we want them always visible by default. The user request implies conditional showing.
    // "when i select option in rule base game then show on live detection"
    const [gameActive, setGameActive] = useState(false);
    const [score, setScore] = useState(42); // Example initial score

    const toggleRule = (id: number) => {
        setRules(prev => prev.map(rule =>
            rule.id === id ? { ...rule, active: !rule.active } : rule
        ));
    };

    return (
        <GameContext.Provider value={{ rules, setRules, gameActive, setGameActive, score, setScore, toggleRule }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};
