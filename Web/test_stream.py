
import requests
import time

try:
    print("Testing /video_feed...")
    # Use stream=True to avoid loading the whole thing (it's infinite)
    r = requests.get("http://127.0.0.1:8080/video_feed", stream=True, timeout=5)
    print(f"Status: {r.status_code}")
    print(f"Headers: {r.headers.get('Content-Type')}")
    
    # Read first 1024 bytes to see if it yields anything
    for chunk in r.iter_content(chunk_size=1024):
        if chunk:
            print("Successfully received data chunk!")
            break
except Exception as e:
    print(f"Connect failed: {e}")
