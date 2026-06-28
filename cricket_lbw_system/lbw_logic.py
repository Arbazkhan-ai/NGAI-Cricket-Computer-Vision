from utils import calculate_distance

class LBWLogic:
    def __init__(self):
        self.reset()
        
    def check_collision(self, trajectory, bat_zone, pad_zone, stump_rect=None):
        if not trajectory or len(trajectory) < 1:
            return None
            
        # We check the trajectory points to see if any point entered the zones.
        # This is more robust than checking just the current frame.
        for ball_center in trajectory[-3:]: # Check the last 3 positions for collision
            cx, cy = ball_center
            
            # 1. Check Bat Zone Collision (Higher priority)
            if bat_zone:
                bx1, by1, bx2, by2 = bat_zone
                if bx1 <= cx <= bx2 and by1 <= cy <= by2:
                    if self.first_contact is None:
                        self.first_contact = "BAT"
                        self.impact_point = ball_center
                        self.decision = "NOT OUT"
                        self.reason = "Ball touched bat first"
                        print(f"[COLLISION] BAT hit detected at {ball_center}")
                    return "BAT"
                    
            # 2. Check Pad Zone Collision
            if pad_zone:
                px1, py1, px2, py2 = pad_zone
                if px1 <= cx <= px2 and py1 <= cy <= py2:
                    if self.first_contact is None:
                        self.first_contact = "PAD"
                        self.impact_point = ball_center
                        self.decision = "CHECK LBW"
                        self.reason = "Ball touched pad"
                        print(f"[COLLISION] PAD hit detected at {ball_center}")
                    return "PAD"
            # 3. Check Stump Collision (Bowled)
            if stump_rect:
                sx1, sy1, sx2, sy2 = stump_rect
                if sx1 <= cx <= sx2 and sy1 <= cy <= sy2:
                    if self.first_contact is None:
                        self.first_contact = "STUMPS"
                        self.impact_point = ball_center
                        self.decision = "OUT"
                        self.reason = "Direct hit to stumps"
                        print(f"[COLLISION] STUMPS hit detected at {ball_center}")
                    return "STUMPS"
                
        return None
        
    def judge_lbw(self, predicted_path, stump_rect, ball_lost=False):
        if self.first_contact == "BAT":
            self.decision = "NOT OUT"
            return self.decision
            
        if self.first_contact == "STUMPS":
            self.decision = "OUT"
            return self.decision

        sx_min, sy_min, sx_max, sy_max = (0,0,0,0)
        if stump_rect:
            sx_min, sy_min, sx_max, sy_max = stump_rect

        if self.first_contact != "PAD":
            if ball_lost and stump_rect and predicted_path:
                for pt in predicted_path:
                    px, py = pt
                    if sx_min <= px <= sx_max and sy_min <= py <= sy_max:
                        self.first_contact = "STUMPS"
                        self.decision = "OUT"
                        return self.decision
                self.decision = "NOT OUT"
                return self.decision
            return "TRACKING..."
            
        # Check if any predicted point enters the stump rectangle
        for pt in predicted_path:
            px, py = pt
            if sx_min <= px <= sx_max and sy_min <= py <= sy_max:
                self.decision = "OUT"
                return "OUT"
        
        self.decision = "NOT OUT (Missed Stumps)"
        return "NOT OUT"

    def reset(self):
        self.impact_point = None
        self.first_contact = None # "BAT" or "PAD"
        self.decision = "PENDING"
        self.reason = ""
