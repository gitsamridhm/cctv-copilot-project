from tracker import CentroidTracker
from detect import detect_people
import glob

tracker = CentroidTracker(max_distance=300, max_disappeared=3)
frames = sorted(glob.glob("../data/Image_subsets/C1/*.png"))[:10]
for frame_path in frames:
    detections = detect_people(frame_path)
    tracked = tracker.update(detections)
    track_ids = sorted([t["track_id"] for t in tracked])
    print(f"{frame_path} -> {len(tracked)} tracked, ids: {track_ids}\n")