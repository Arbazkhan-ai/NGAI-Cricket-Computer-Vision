import numpy as np

# -------------------------
# SPEED ESTIMATION
# -------------------------
def estimate_speed(track, fps=30):
    if len(track) < 2:
        return 0

    dist = 0
    for i in range(1, len(track)):
        p1 = track[i - 1]
        p2 = track[i]
        dist += np.linalg.norm(np.array(p2) - np.array(p1))

    time_sec = len(track) / fps

    speed_px_s = dist / time_sec if time_sec > 0 else 0

    # rough conversion (tunable)
    speed_kmh = speed_px_s * 0.05

    return round(speed_kmh, 2)


# -------------------------
# SWING MODEL
# -------------------------
def swing_amount(track):
    if len(track) < 5:
        return 0

    x = [p[0] for p in track]
    return round(x[-1] - x[0], 2)


# -------------------------
# SPIN / CURVE INTENSITY
# -------------------------
def spin_intensity(track):
    if len(track) < 5:
        return 0

    y = [p[1] for p in track]

    curvature = 0
    for i in range(2, len(y)):
        curvature += abs(y[i] - 2*y[i-1] + y[i-2])

    return round(curvature, 2)


# -------------------------
# COMPREHENSIVE BALL CLASSIFICATION
# -------------------------
def get_ball_type(track, speed_kmh):
    """
    Classifies the delivery based on trajectory and speed.
    """
    if len(track) < 5:
        return "ANALYZING..."
    
    pts = np.array(track)
    x, y = pts[:, 0], pts[:, 1]
    
    # Smooth the y coordinates slightly to avoid false bounces from noise
    y_smooth = y.copy()
    if len(y) > 4:
        for i in range(1, len(y) - 1):
            y_smooth[i] = (y[i-1] + y[i] + y[i+1]) / 3.0

    # 1. Detect Bounce
    bounce_idx = -1
    for i in range(2, len(y_smooth) - 2):
        if y_smooth[i] > y_smooth[i - 1] and y_smooth[i] > y_smooth[i + 1]:
            # Also require a minimum prominence
            if y_smooth[i] - y_smooth[i-2] > 2 and y_smooth[i] - y_smooth[i+2] > 2:
                bounce_idx = i
                break
    
    # 2. Trajectory Analysis
    if bounce_idx != -1:
        # Movement before bounce (Swing)
        dx_pre = x[bounce_idx] - x[0]
        # Movement after bounce (Spin)
        dx_post = x[-1] - x[bounce_idx]
        # Bounce height (normalized by frame)
        bounce_y = y[bounce_idx]
        
        # --- Length Classification ---
        if bounce_y < 300: length = "SHORT"
        elif bounce_y < 500: length = "GOOD LENGTH"
        elif bounce_y < 700: length = "FULL"
        else: length = "YORKER"
        
        # --- Spin/Swing Classification ---
        if abs(dx_post) > 25:
            spin_type = "LEG SPIN" if dx_post > 0 else "OFF SPIN"
            return f"{length} {spin_type}"
        elif abs(dx_pre) > 35:
            swing_type = "OUT-SWING" if dx_pre > 0 else "IN-SWING"
            return f"{length} {swing_type}"
        
        if speed_kmh > 120: return f"FAST {length} BALL"
        return f"{length} BALL"
    
    else:
        # No bounce detected -> Full Toss or hasn't bounced yet
        dx_total = x[-1] - x[0]
        if abs(dx_total) > 35:
            swing_type = "OUT-SWING" if dx_total > 0 else "IN-SWING"
            return f"FULL TOSS {swing_type}"

        if speed_kmh > 130: return "FAST FULL TOSS"
        return "FULL TOSS"