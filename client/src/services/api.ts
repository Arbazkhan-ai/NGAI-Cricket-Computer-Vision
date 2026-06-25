const API_URL = 'http://localhost:3000/api';

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

export const analyzeVideo = async (file: File, mode: string = 'mediapipe', onProgress?: (msg: string, frameData?: string) => void): Promise<any> => {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('mode', mode);

    const response = await fetch(`${API_URL}/analyze-video`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) throw new Error('Video analysis failed');

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let finalResult = null;

    while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.progress && onProgress) {
                        onProgress(data.progress);
                    }
                    if (data.frame && onProgress) {
                        onProgress('', data.frame);
                    }
                    if (data.video_url) {
                        finalResult = data;
                    }
                    if (data.error) {
                        throw new Error(data.error);
                    }
                } catch (e) {
                    console.error("Error parsing SSE data", e);
                }
            }
        }
    }

    return finalResult;
};

export const uploadVideoOnly = async (file: File): Promise<{ video_path: string, id: number }> => {
    const formData = new FormData();
    formData.append('video', file);
    const response = await fetch(`${API_URL}/upload-video-only`, {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) throw new Error('Video upload failed');
    return await response.json();
};

export const analyzeExistingVideo = async (id: number, type: 'shot' | 'lbw', sourceTable: 'matches' | 'detections' = 'detections', onProgress?: (msg: string) => void): Promise<any> => {
    const response = await fetch(`${API_URL}/analyze-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type, source_table: sourceTable }),
    });

    if (!response.ok) throw new Error('Existing video analysis failed');

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let finalResult = null;
    let buffer = '';

    while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.progress && onProgress) {
                        onProgress(data.progress);
                    }
                    if (data.frame && onProgress) {
                        onProgress('', data.frame);
                    }
                    if (data.video_url) {
                        finalResult = data;
                    }
                    if (data.error) {
                        throw new Error(data.error);
                    }
                } catch (e) {
                    console.error("Error parsing SSE data", e);
                }
            }
        }
    }

    return finalResult;
};

export const analyzeLbwVideo = async (file: File, mode: string = 'auto', onProgress?: (msg: string, frameData?: string) => void): Promise<any> => {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('mode', mode);

    const response = await fetch(`${API_URL}/analyze-lbw-video`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) throw new Error('LBW Video analysis failed');

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let finalResult = null;
    let buffer = '';

    while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.progress && onProgress) {
                        onProgress(data.progress);
                    }
                    if (data.frame && onProgress) {
                        onProgress('', data.frame);
                    }
                    if (data.video_url) {
                        finalResult = data;
                    }
                    if (data.error) {
                        throw new Error(data.error);
                    }
                } catch (e) {
                    console.error("Error parsing SSE data", e);
                }
            }
        }
    }

    return finalResult;
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

export const startLiveDetection = async (ip: string, port: string, showLandmarks: boolean, manualPitch?: number[][]) => {
    const response = await fetch(`${API_URL}/start_live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port, showLandmarks, manual_pitch: manualPitch }),
    });
    if (!response.ok) {
        let errData;
        try { errData = await response.json(); } catch(e) {}
        throw new Error((errData && errData.message) ? errData.message : 'Failed to start live detection');
    }
    return response.json();
};

export const stopLiveDetection = async () => {
    const response = await fetch(`${API_URL}/stop_live`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error('Failed to stop live detection');
    }
    return response.json();
};

export const startLbwLiveDetection = async (ip: string, port: string, showLandmarks: boolean, manualPitch?: number[][]) => {
    const response = await fetch(`${API_URL}/start_lbw_live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port, showLandmarks, manual_pitch: manualPitch }),
    });
    if (!response.ok) {
        let errData;
        try { errData = await response.json(); } catch(e) {}
        throw new Error((errData && errData.message) ? errData.message : 'Failed to start LBW live detection');
    }
    return response.json();
};

export const stopLbwLiveDetection = async () => {
    const response = await fetch(`${API_URL}/stop_lbw_live`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error('Failed to stop LBW live detection');
    }
    return response.json();
};

export const saveMatch = async (matchData: any): Promise<any> => {
    const response = await fetch(`${API_URL}/save-match`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(matchData),
    });
    if (!response.ok) {
        throw new Error('Failed to save match');
    }
    return response.json();
};

export const getMatches = async (): Promise<any[]> => {
    const response = await fetch(`${API_URL}/matches`);
    if (!response.ok) {
        throw new Error('Failed to fetch matches');
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

export const getProfile = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/profile`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        const result = await response.json();
        throw new Error(result.error || 'Failed to fetch profile');
    }
    return response.json();
};

export const updateProfile = async (profileData: any) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/profile/update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData),
    });
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        const result = await response.json();
        throw new Error(result.error || 'Failed to update profile');
    }
    return response.json();
};
