"""
lbw_detector.py
================
LBW (Leg Before Wicket) Detector Module
-----------------------------------------
Provides two key capabilities integrated into the main cricket analysis pipeline:

  1. Man Shot Detection overlay  – renders the active shot label on the frame.
  2. LBW Leg Heatmap            – draws a knee-to-foot thermal heat zone over the
                                   batsman's leg using MediaPipe landmarks.
  3. Ball-Contact Detection     – detects when the ball centre enters the leg
                                   heat zone and fires the LBW rules engine.
  4. LBW Rules Engine           – applies official cricket LBW laws:
        Rule A: Ball must pitch in line (between off stump and leg stump)
                OR on the leg-stump side up to a threshold.
        Rule B: Impact (contact) must be in line with the stumps.
        Rule C: Ball must be going on to hit the stumps (projected trajectory).
        => If all three pass → OUT (LBW).

Usage (from main.py):
    from lbw_detector import LBWDetector
    detector = LBWDetector(frame_width, frame_height)
    annotated_frame, decision = detector.process(
        frame, pose_landmarks, ball_box, ball_track,
        stump_x_range=(sx1, sx2), stump_y_range=(sy1, sy2),
        shot_label=label, shot_conf=conf
    )
"""

import cv2
import numpy as np
import mediapipe as mp
from collections import deque


# ──────────────────────────────────────────────
#  COLOUR PALETTE  (BGR)
# ──────────────────────────────────────────────
HEAT_COLD   = np.array([255,   0,   0], dtype=np.float32)   # blue  (far from ball)
HEAT_HOT    = np.array([  0,   0, 255], dtype=np.float32)   # red   (ball impact zone)
HEAT_ALPHA  = 0.45                                           # heat overlay opacity
OUT_COLOR   = (0,   0, 255)
NOT_OUT_COLOR = (0, 200,  50)
DECISION_HOLD_FRAMES = 90   # ~3 sec at 30 fps


# ──────────────────────────────────────────────
#  MEDIAPIPE LANDMARK INDICES
# ──────────────────────────────────────────────
# Left leg landmarks
L_HIP   = 23
L_KNEE  = 25
L_ANKLE = 27
L_HEEL  = 29
L_TOE   = 31
# Right leg landmarks
R_HIP   = 24
R_KNEE  = 26
R_ANKLE = 28
R_HEEL  = 30
R_TOE   = 32


# ──────────────────────────────────────────────
#  HELPER: project ball trajectory to stump x
# ──────────────────────────────────────────────
def _project_to_x(track, target_x):
    """Linear extrapolation from last two ball positions to target_x."""
    if len(track) < 2:
        return None
    x1, y1 = track[-2]
    x2, y2 = track[-1]
    dx = x2 - x1
    if abs(dx) < 1e-3:
        return y2  # vertical path
    t = (target_x - x1) / dx
    return int(y1 + t * (y2 - y1))


# ──────────────────────────────────────────────
#  HELPER: build a leg polygon from landmarks
# ──────────────────────────────────────────────
def _leg_polygon(landmarks, frame_w, frame_h, side="left"):
    """Return pixel coordinates of a leg polygon (knee → foot)."""
    if side == "left":
        ids = [L_KNEE, L_ANKLE, L_HEEL, L_TOE]
    else:
        ids = [R_KNEE, R_ANKLE, R_HEEL, R_TOE]

    pts = []
    for idx in ids:
        lm = landmarks.landmark[idx]
        # Lower visibility threshold so partial occlusions still give a polygon
        if lm.visibility < 0.1:
            return None
        px = int(lm.x * frame_w)
        py = int(lm.y * frame_h)
        pts.append([px, py])

    if len(pts) < 3:
        return None
    return np.array(pts, dtype=np.int32)


# ──────────────────────────────────────────────
#  MAIN CLASS
# ──────────────────────────────────────────────
class LBWDetector:
    """
    Per-frame LBW detection and heatmap overlay.

    Parameters
    ----------
    frame_w, frame_h : int
        Frame dimensions (same as main pipeline).
    stump_x_fraction : float
        Approximate x-position of the stumps as a fraction of frame width.
        Used as a fallback when stump_x_range is not supplied per-frame.
    """

    def __init__(self, frame_w: int, frame_h: int, stump_x_fraction: float = 0.85):
        self.fw = frame_w
        self.fh = frame_h
        self.stump_x_default = int(frame_w * stump_x_fraction)

        # Stump y-range (defaults to middle third of frame height)
        self.stump_y1_default = int(frame_h * 0.35)
        self.stump_y2_default = int(frame_h * 0.70)

        # Decision latch
        self._decision_text  = ""
        self._decision_color = NOT_OUT_COLOR
        self._decision_timer = 0

        # Contact detection – fire on very first hit (threshold = 1)
        self._contact_frames    = 0
        self._contact_threshold = 1   # 1 = fire immediately on first touch
        self._PAD_RADIUS        = 55  # pixel proximity fallback (ball near leg)

        # Heat pulse effect
        self._heat_pulse = 0          # frames remaining for hot-red flash
        self.PULSE_FRAMES = 20

    # ──────────────────────────────────────────
    #  PUBLIC API
    # ──────────────────────────────────────────
    def process(
        self,
        frame: np.ndarray,
        pose_landmarks,          # mediapipe.framework.formats.landmark_pb2.NormalizedLandmarkList or None
        ball_box,                # (x1,y1,x2,y2) float tuple or None
        ball_track: list,        # list of (cx,cy) ints
        stump_x_range=None,      # (sx1, sx2) pixel coords or None
        stump_y_range=None,      # (sy1, sy2) pixel coords or None
        shot_label: str = "",
        shot_conf: float = 0.0,
    ):
        """
        Main processing function called every frame.

        Returns
        -------
        frame : np.ndarray
            Annotated frame (in-place modifications).
        decision : str
            Current LBW decision string ("OUT (LBW)", "NOT OUT", or "").
        """
        # ── Resolve stump bounds ──────────────────────────────────────
        if stump_x_range:
            stump_cx = int((stump_x_range[0] + stump_x_range[1]) / 2)
        else:
            stump_cx = self.stump_x_default

        if stump_y_range:
            stump_y1, stump_y2 = int(stump_y_range[0]), int(stump_y_range[1])
        else:
            stump_y1, stump_y2 = self.stump_y1_default, self.stump_y2_default

        # ── Ball centre ───────────────────────────────────────────────
        ball_cx = ball_cy = None
        if ball_box is not None:
            x1, y1, x2, y2 = ball_box
            ball_cx = int((x1 + x2) / 2)
            ball_cy = int((y1 + y2) / 2)

        # ── Leg polygons + heatmap ────────────────────────────────────
        leg_polys   = []
        ball_in_leg = False

        if pose_landmarks is not None:
            for side in ("left", "right"):
                poly = _leg_polygon(pose_landmarks, self.fw, self.fh, side)
                if poly is not None:
                    leg_polys.append(poly)

            # Build heatmap overlay
            if leg_polys:
                frame = self._draw_heatmap(frame, leg_polys, ball_cx, ball_cy)

            # Check ball contact: polygon hit OR proximity fallback
            if ball_cx is not None and ball_cy is not None:
                for poly in leg_polys:
                    dist_to_poly = cv2.pointPolygonTest(
                        poly, (float(ball_cx), float(ball_cy)), True  # True = signed distance
                    )
                    # dist >= 0 → inside; dist >= -PAD_RADIUS → within padding
                    if dist_to_poly >= -self._PAD_RADIUS:
                        ball_in_leg = True
                        break

        # ── Contact debounce ──────────────────────────────────────────
        if ball_in_leg:
            self._contact_frames += 1
        else:
            self._contact_frames = max(0, self._contact_frames - 1)

        confirmed_contact = self._contact_frames >= self._contact_threshold

        # ── Debug info overlay (small, top-left corner below stats) ──
        pose_status = "POSE: OK" if pose_landmarks is not None else "POSE: NO DETECT"
        ball_status = f"BALL: ({ball_cx},{ball_cy})" if ball_cx is not None else "BALL: NOT SEEN"
        leg_status  = f"LEG POLYS: {len(leg_polys)}  CONTACT:{ball_in_leg}"
        y_dbg = self.fh - 110
        for dbg_line in [pose_status, ball_status, leg_status]:
            cv2.putText(frame, dbg_line, (10, y_dbg),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 50), 1)
            y_dbg += 18

        # ── LBW rules engine ─────────────────────────────────────────
        if confirmed_contact and self._decision_timer == 0:
            decision_str, decision_color = self._apply_lbw_rules(
                ball_track, ball_cx, ball_cy, stump_cx, stump_y1, stump_y2
            )
            self._decision_text  = decision_str
            self._decision_color = decision_color
            self._decision_timer = DECISION_HOLD_FRAMES
            self._heat_pulse     = self.PULSE_FRAMES
            self._contact_frames = 0   # reset after decision

        # ── Countdown ─────────────────────────────────────────────────
        if self._decision_timer > 0:
            self._decision_timer -= 1
        if self._heat_pulse > 0:
            self._heat_pulse -= 1

        # ── Overlay: Man Shot label ───────────────────────────────────
        if shot_label and shot_conf > 0:
            self._draw_shot_label(frame, shot_label, shot_conf)

        # ── Overlay: LBW decision banner ──────────────────────────────
        if self._decision_text and self._decision_timer > 0:
            self._draw_decision_banner(frame, self._decision_text, self._decision_color)

        # ── Draw leg contact flash ────────────────────────────────────
        if self._heat_pulse > 0 and ball_cx is not None:
            pulse_alpha = self._heat_pulse / self.PULSE_FRAMES
            radius = int(30 + 20 * pulse_alpha)
            overlay = frame.copy()
            cv2.circle(overlay, (ball_cx, ball_cy), radius, (0, 0, 255), -1)
            cv2.addWeighted(overlay, 0.5 * pulse_alpha, frame, 1 - 0.5 * pulse_alpha, 0, frame)

        return frame, self._decision_text if self._decision_timer > 0 else ""

    # ──────────────────────────────────────────
    #  PRIVATE: LBW rules engine
    # ──────────────────────────────────────────
    def _apply_lbw_rules(self, ball_track, impact_x, impact_y,
                          stump_cx, stump_y1, stump_y2):
        """
        Official LBW Laws (simplified for 2D video analysis):

        Rule A – Pitching:
            Ball must pitch between off-stump line and leg-stump line
            (we model this as: pitch x between 20%–80% of stump_cx).
        Rule B – Impact in line:
            Ball must hit the leg between off-stump and leg-stump lines
            (we model this as impact_x within stump band ± margin).
        Rule C – Going on:
            Projected trajectory must cross stump_cx within stump_y1..stump_y2.
        """
        # ── Rule A: pitch in-line (very wide band — 2D is approximate) ──
        OFF_STUMP_X = int(stump_cx * 0.30)   # generous off-side
        LEG_STUMP_X = int(stump_cx * 1.60)   # generous leg-side

        pitch_in_line = True   # default — assume in-line unless clearly outside
        if len(ball_track) >= 6:
            ys = [p[1] for p in ball_track]
            xs = [p[0] for p in ball_track]
            bounce_idx = np.argmax(ys)
            bounce_x   = xs[bounce_idx]
            if not (OFF_STUMP_X <= bounce_x <= LEG_STUMP_X):
                pitch_in_line = False

        # ── Rule B: impact in-line (20% frame width either side) ─────
        MARGIN = int(self.fw * 0.20)   # generous for 2D estimation
        impact_in_line = True   # default when no stump reference
        if impact_x is not None:
            impact_in_line = (stump_cx - MARGIN) <= impact_x <= (stump_cx + MARGIN)

        # ── Rule C: ball going on to hit stumps ───────────────────────
        # Expand y-range by ±30% of frame height to be lenient
        y_margin = int(self.fh * 0.30)
        going_on = True  # assume going on if trajectory can't be computed
        if len(ball_track) >= 2:
            proj_y = _project_to_x(ball_track, stump_cx)
            if proj_y is not None:
                going_on = (stump_y1 - y_margin) <= proj_y <= (stump_y2 + y_margin)

        # ── Decision ──────────────────────────────────────────────────
        if pitch_in_line and impact_in_line and going_on:
            return "OUT (LBW) !", OUT_COLOR
        elif not pitch_in_line:
            return "NOT OUT  (Pitching Outside)", NOT_OUT_COLOR
        elif not impact_in_line:
            return "NOT OUT  (Outside Stumps)", NOT_OUT_COLOR
        else:
            return "NOT OUT  (Missing Stumps)", NOT_OUT_COLOR

    # ──────────────────────────────────────────
    #  PRIVATE: draw thermal heatmap on leg zone
    # ──────────────────────────────────────────
    def _draw_heatmap(self, frame, leg_polys, ball_cx, ball_cy):
        overlay = frame.copy()

        for poly in leg_polys:
            # Create a mask for this polygon
            mask = np.zeros((self.fh, self.fw), dtype=np.float32)
            cv2.fillPoly(mask, [poly], 1.0)

            # Compute per-pixel distance to ball centre (or polygon centroid)
            if ball_cx is not None and ball_cy is not None:
                hot_x, hot_y = ball_cx, ball_cy
            else:
                M = cv2.moments(poly)
                if M["m00"] != 0:
                    hot_x = int(M["m10"] / M["m00"])
                    hot_y = int(M["m01"] / M["m00"])
                else:
                    hot_x, hot_y = poly[0][0], poly[0][1]

            # Build heat image for this polygon
            Y, X = np.mgrid[0:self.fh, 0:self.fw]
            dist  = np.sqrt((X - hot_x)**2 + (Y - hot_y)**2).astype(np.float32)

            # Normalise distance within polygon pixels
            poly_pixels = dist[mask > 0]
            if len(poly_pixels) == 0:
                continue
            max_d = max(poly_pixels.max(), 1.0)
            t = np.clip(1.0 - dist / max_d, 0, 1)  # 1=hot, 0=cold

            # Pulse boost: if ball is very close, amp up the red
            pulse_boost = (self._heat_pulse / self.PULSE_FRAMES) if self._heat_pulse > 0 else 0
            t = np.clip(t + pulse_boost * mask, 0, 1)

            # Build RGB heat image
            heat_img = np.zeros((self.fh, self.fw, 3), dtype=np.float32)
            for c in range(3):
                heat_img[:, :, c] = (
                    HEAT_COLD[c] * (1 - t) + HEAT_HOT[c] * t
                ) * mask

            # Apply overlay only inside polygon
            heat_uint8 = heat_img.astype(np.uint8)
            poly_mask_3ch = np.stack([mask, mask, mask], axis=-1)
            overlay = (overlay * (1 - poly_mask_3ch * HEAT_ALPHA) +
                       heat_uint8 * poly_mask_3ch * HEAT_ALPHA).astype(np.uint8)

            # Draw polygon outline
            cv2.polylines(overlay, [poly], True, (0, 165, 255), 2)

        return overlay

    # ──────────────────────────────────────────
    #  PRIVATE: draw shot label (top-right)
    # ──────────────────────────────────────────
    def _draw_shot_label(self, frame, label, conf):
        text  = f"SHOT: {label}  ({conf*100:.0f}%)"
        x, y  = self.fw - 420, 55
        # shadow
        cv2.putText(frame, text, (x+2, y+2), cv2.FONT_HERSHEY_SIMPLEX,
                    0.75, (0, 0, 0), 3)
        # main text
        cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX,
                    0.75, (0, 220, 255), 2)

    # ──────────────────────────────────────────
    #  PRIVATE: draw LBW decision banner
    # ──────────────────────────────────────────
    def _draw_decision_banner(self, frame, text, color):
        banner_h = 80
        y0 = self.fh - banner_h - 20
        # translucent black background
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, y0), (self.fw, y0 + banner_h), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

        # centre the text
        scale = 1.4
        thickness = 3
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX, scale, thickness)
        tx = (self.fw - tw) // 2
        ty = y0 + (banner_h + th) // 2

        # shadow
        cv2.putText(frame, text, (tx+3, ty+3), cv2.FONT_HERSHEY_DUPLEX,
                    scale, (0, 0, 0), thickness + 2)
        # glow
        cv2.putText(frame, text, (tx, ty), cv2.FONT_HERSHEY_DUPLEX,
                    scale, color, thickness)
