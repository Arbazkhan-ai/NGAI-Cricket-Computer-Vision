import cv2
import numpy as np

def draw_analytics(frame, ball_data, objects, trajectory, predicted_path, impact_point, decision, fps, pitch_roi, stump_rect, manual_pitch, bat_zone=None, pad_zone=None, first_contact=None, show_setup=True):
    overlay = frame.copy()
    
    # 1. Draw Setup Elements (Only if show_setup is True)
    if show_setup:
        # Draw Pitch (Manual Polygon or Auto ROI)
        if manual_pitch and len(manual_pitch) > 0:
            pts = np.array(manual_pitch, np.int32)
            cv2.polylines(frame, [pts], True, (255, 255, 0), 2)
            for pt in manual_pitch:
                cv2.circle(frame, pt, 5, (255, 255, 0), -1)
            cv2.putText(frame, "MANUAL PITCH", (manual_pitch[0][0], manual_pitch[0][1] - 5), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
        elif pitch_roi:
            px1, py1, px2, py2 = pitch_roi
            cv2.rectangle(frame, (px1, py1), (px2, py2), (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(frame, "AUTO PITCH", (px1, py1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        # Draw Stumps Region
        sx_min, sy_min, sx_max, sy_max = stump_rect
        cv2.rectangle(frame, (sx_min, sy_min), (sx_max, sy_max), (0, 255, 255), 2)
        cv2.putText(frame, "STUMPS", (sx_min, sy_min - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
    
    # 3. Draw Heat Zones
    if bat_zone:
        bx1, by1, bx2, by2 = bat_zone
        color = (0, 255, 0)
        alpha = 0.3
        # Glow effect if hit
        if first_contact == "BAT":
            alpha = 0.6
            cv2.rectangle(frame, (bx1-5, by1-5), (bx2+5, by2+5), color, 3)
            
        cv2.rectangle(overlay, (bx1, by1), (bx2, by2), color, -1)
        cv2.rectangle(frame, (bx1, by1), (bx2, by2), color, 2)
        cv2.putText(frame, "BAT ZONE", (bx1, by1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    if pad_zone:
        px1, py1, px2, py2 = pad_zone
        color = (0, 0, 255)
        alpha_p = 0.3
        # Glow effect if hit
        if first_contact == "PAD":
            alpha_p = 0.6
            cv2.rectangle(frame, (px1-5, py1-5), (px2+5, py2+5), color, 3)
            
        cv2.rectangle(overlay, (px1, py1), (px2, py2), color, -1)
        cv2.rectangle(frame, (px1, py1), (px2, py2), color, 2)
        cv2.putText(frame, "PAD ZONE", (px1, py1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    # Apply transparency to zones
    cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, frame)

    # 4. Draw Detections
    if ball_data:
        x1, y1, x2, y2 = ball_data['bbox']
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 255), 1)
        cv2.circle(frame, ball_data['center'], 5, (0, 255, 255), -1)
        
    if objects.get('batsman'):
        bx1, by1, bx2, by2 = objects['batsman']['bbox']
        cv2.rectangle(frame, (bx1, by1), (bx2, by2), (255, 0, 255), 1)

    # 5. Draw Trajectory
    for i in range(1, len(trajectory)):
        cv2.line(frame, trajectory[i-1], trajectory[i], (255, 255, 0), 2)
        
    # 6. Draw Predicted Path
    for pt in predicted_path:
        cv2.circle(frame, pt, 2, (0, 255, 0), -1)
        
    # 7. Draw Impact/Collision Points
    if impact_point:
        color = (0, 255, 0) if first_contact == "BAT" else (0, 0, 255)
        label = "BAT CONTACT!" if first_contact == "BAT" else "PAD CONTACT!"
        
        # Draw a larger, more prominent impact marker
        cv2.circle(frame, impact_point, 12, (255, 255, 255), -1)
        cv2.circle(frame, impact_point, 10, color, -1)
        cv2.putText(frame, label, (impact_point[0] + 15, impact_point[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 3)
        
        # Add a top banner for collision
        banner_color = (0, 150, 0) if first_contact == "BAT" else (0, 0, 200)
        # Larger banner
        cv2.rectangle(frame, (frame.shape[1]//2 - 200, 10), (frame.shape[1]//2 + 200, 80), (0,0,0), -1)
        cv2.rectangle(frame, (frame.shape[1]//2 - 200, 10), (frame.shape[1]//2 + 200, 80), banner_color, 4)
        cv2.putText(frame, label, (frame.shape[1]//2 - 180, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 4)

    # 8. Draw Decision & Status
    # decision_box
    cv2.rectangle(frame, (20, 20), (350, 110), (0, 0, 0), -1)
    cv2.rectangle(frame, (20, 20), (350, 110), (255, 255, 255), 2)
    
    color = (0, 0, 255) if "OUT" in decision and "NOT" not in decision else (0, 255, 0)
    if decision == "PENDING" or decision == "TRACKING...": color = (255, 255, 0)
    
    cv2.putText(frame, f"DECISION: {decision}", (40, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    cv2.putText(frame, f"FPS: {int(fps)}", (40, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    
    return frame
