import numpy as np

class TrajectoryPredictor:
    def __init__(self, frames_to_predict=30):
        self.frames_to_predict = frames_to_predict
        
    def predict(self, trajectory):
        """
        Predict future path using 2nd-degree Polynomial Regression.
        Fits a parabola (y = ax^2 + bx + c) to the trajectory data.
        """
        if len(trajectory) < 5:
            return []
            
        # Use recent history for regression (last 12 frames or all available)
        # More points = smoother fit, fewer points = more reactive
        history = np.array(trajectory[-12:])
        n = len(history)
        
        # Time indices for the known points (0, 1, 2, ...)
        t_known = np.arange(n)
        
        # Coordinates
        x_known = history[:, 0]
        y_known = history[:, 1]
        
        # Fit 2nd-degree polynomials (parabolas)
        # x(t) = at^2 + bt + c
        # y(t) = dt^2 + et + f
        poly_x = np.polyfit(t_known, x_known, 2)
        poly_y = np.polyfit(t_known, y_known, 2)
        
        # Create functions from the coefficients
        fx = np.poly1d(poly_x)
        fy = np.poly1d(poly_y)
        
        predicted_path = []
        # Predict future time steps starting from the last known frame
        for t_future in range(n, n + self.frames_to_predict):
            px = int(fx(t_future))
            py = int(fy(t_future))
            
            # Boundary check
            if -200 < px < 2000 and -200 < py < 1500:
                predicted_path.append((px, py))
            else:
                break
                
        return predicted_path
