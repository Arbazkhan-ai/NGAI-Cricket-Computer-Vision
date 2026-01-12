const API_URL = 'http://localhost:3000/api';
const FASTAPI_URL = 'http://localhost:8000';

export interface DetectionResult {
    type: string;
    class_id?: number;
    class_name?: string;
    conf: number;
    xyxy?: number[];
    keypoints?: number[][];
    model?: string;
}

export interface AnalysisResponse {
    message: string;
    data: DetectionResult[];
    db_id: number;
}

export const analyzeImage = async (file: File, mode: 'mediapipe' | 'yolo' = 'mediapipe'): Promise<AnalysisResponse> => {
    const formData = new FormData();
    formData.append('image', file); // Changed 'file' to 'image' to match server.js multer
    formData.append('mode', mode);

    const response = await fetch(`${API_URL}/analyze`, { // Changed from FASTAPI_URL to API_URL
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error('Failed to analyze image');
    }

    return response.json();
};

// Auth
export const signup = async (data: any) => {
    const response = await fetch(`${API_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Signup failed');
    return result;
};

export const login = async (data: any) => {
    const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Login failed');
    return result;
};

export const getHistory = async () => {
    const response = await fetch(`${API_URL}/history`);
    if (!response.ok) {
        throw new Error('Failed to fetch history');
    }
    return response.json();
};
export const forgotPassword = async (email: string) => {
    const response = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to send reset link');
    return result;
};
export const resetPassword = async (token: string, newPassword: string) => {
    const response = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to reset password');
    return result;
};
