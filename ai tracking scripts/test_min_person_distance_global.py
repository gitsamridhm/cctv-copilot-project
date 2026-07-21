import os
from load_annotations import load_all_annotations
from calibration_utils import get_homography_for_view, pixel_to_ground

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
ANN_DIR = os.path.join(SCRIPT_DIR, "..", "data", "annotations_positions")

def foot_point(bbox):
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, y2

print("Loading all annotation frames (may take a few seconds)...")
all_frames = load_all_annotations(ANN_DIR)
print(f"Loaded {len(all_frames)} frames.\n")

homographies = {v: get_homography_for_view(v, CALIB_DIR) for v in range(7)}

global_min, global_info = None, None
for frame_id, boxes_by_camera in all_frames.items():
    for cam, boxes in boxes_by_camera.items():
        positions = []
        for b in boxes:
            u, v = foot_point(b["bbox"])
            x, y = pixel_to_ground(u, v, homographies[cam])
            positions.append((b["person_id"], x, y))
        for i in range(len(positions)):
            for j in range(i + 1, len(positions)):
                pid1, x1, y1 = positions[i]
                pid2, x2, y2 = positions[j]
                d = ((x1 - x2)**2 + (y1 - y2)**2) ** 0.5
                if global_min is None or d < global_min:
                    global_min, global_info = d, (frame_id, cam, pid1, pid2)

print(f"Smallest distance between two DIFFERENT people, across ALL {len(all_frames)} frames and all 7 cameras:")
print(f"  {global_min:.1f} (dataset units, ~cm)")
print(f"  Frame {global_info[0]}, Camera {global_info[1]}, person {global_info[2]} vs person {global_info[3]}")
print(f"\nFor reference: same person across cameras measured 4.5-16.8cm.")
