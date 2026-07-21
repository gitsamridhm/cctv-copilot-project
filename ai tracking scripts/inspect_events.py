import json

def inspect(path):
    with open(path) as f:
        data = json.load(f)
    print(f"\n=== {path} ===")
    print(f"Total events: {len(data)}")
    print(f"Sample event: {data[0]}")
    print(f"camera_id values: {set(e.get('camera_id') for e in data)}")
    print(f"object_class values: {set(e.get('object_class') for e in data)}")
    print(f"object_color values: {set(e.get('object_color') for e in data)}")
    frame_refs = sorted(e.get('frame_ref', '') for e in data)
    print(f"First frame_ref: {frame_refs[0]}")
    print(f"Last frame_ref: {frame_refs[-1]}")

for path in ["events_cam0.json", "events_cam1.json"]:
    inspect(path)
