import cv2
import numpy as np

# Constants
STUMP_X_MIN = 300
STUMP_X_MAX = 500
STUMP_Y_MIN = 400
STUMP_Y_MAX = 700

IMPACT_THRESHOLD = 50 # Pixels

def calculate_distance(p1, p2):
    return np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

def resize_frame(frame, width=1000):
    height = int(frame.shape[0] * (width / frame.shape[1]))
    return cv2.resize(frame, (width, height))
