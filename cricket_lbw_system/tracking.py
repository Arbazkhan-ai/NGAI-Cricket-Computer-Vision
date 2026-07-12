import numpy as np

class BallTracker:
    def __init__(self, max_history=30, smoothing_factor=0.7, jump_threshold=300):
        self.trajectory = []
        self.max_history = max_history
        self.smoothing_factor = smoothing_factor
        self.jump_threshold = jump_threshold
        self.last_point = None
        
    def update(self, center):
        if center is None:
            return self.trajectory

        # 1. Outlier Filtering: Ignore sudden large jumps
        if self.last_point:
            dist = np.sqrt((center[0] - self.last_point[0])**2 + (center[1] - self.last_point[1])**2)
            if dist > self.jump_threshold:
                # Potential misdetection, ignore this frame
                return self.trajectory

        # 2. Smoothing: Exponential Moving Average
        if self.last_point:
            smoothed_x = int(self.smoothing_factor * center[0] + (1 - self.smoothing_factor) * self.last_point[0])
            smoothed_y = int(self.smoothing_factor * center[1] + (1 - self.smoothing_factor) * self.last_point[1])
            center = (smoothed_x, smoothed_y)

        self.trajectory.append(center)
        self.last_point = center

        if len(self.trajectory) > self.max_history:
            self.trajectory.pop(0)
            
        return self.trajectory

    def clear(self):
        self.trajectory = []
        self.last_point = None
