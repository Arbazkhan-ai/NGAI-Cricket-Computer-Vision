
import sys
print(sys.path)
try:
    import mediapipe as mp
    print("MediaPipe imported")
    print(mp.__file__)
    print(dir(mp))
    print(f"Solutions: {mp.solutions}")
except Exception as e:
    print(e)
