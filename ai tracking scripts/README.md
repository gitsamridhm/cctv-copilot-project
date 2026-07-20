## Detection & Tracking Pipeline (Person A)
- `detect.py` — YOLOv8 person detection
- `tracker.py` — centroid-based single-camera tracking
- `carried_object.py` — HSV color heuristic for carried objects
- `build_events.py` — combines detection + tracking + object heuristic → output/events_cam0.json

Run: `python build_events.py` (from inside this folder, with venv active)
