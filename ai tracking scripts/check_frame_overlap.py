import json

def load_frame_set(path):
    with open(path) as f:
        data = json.load(f)
    return set(e['frame_ref'].split('/')[-1] for e in data)

cam0_frames = load_frame_set("events_cam0.json")
cam1_frames = load_frame_set("events_cam1.json")

overlap = cam0_frames & cam1_frames

print(f"cam_0 unique frames: {len(cam0_frames)}")
print(f"cam_1 unique frames: {len(cam1_frames)}")
print(f"Frames present in BOTH: {len(overlap)}")
print(f"Sample shared frames: {sorted(overlap)[:5]}")
