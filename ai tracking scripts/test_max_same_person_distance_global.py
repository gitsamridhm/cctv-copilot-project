import os
from load_annotations import load_all_annotations
from calibration_utils import get_homography_for_view, pixel_to_ground

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
ANN_DIR = os.path.join(SCRIPT_DIR, "..", "data", "annotations_positions")

def foot_point(bbox):
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, y2

print("Loading all annotation frames...")
all_frames = load_all_annotations(ANN_DIR)
print(f"Loaded {len(all_frames)} frames.\n")

homographies = {v: get_homography_for_view(v, CALIB_DIR) for v in range(7)}

global_max, global_info = None, None
distances = []

for frame_id, boxes_by_camera in all_frames.items():
    person_views = {}
    for cam, boxes in boxes_by_camera.items():
        for b in boxes:
            person_views.setdefault(b["person_id"], {})[cam] = b["bbox"]
    for pid, views in person_views.items():
        if len(views) < 2:
            continue
        ground_points = {}
        for cam, bbox in views.items():
            u, v = foot_point(bbox)
            ground_points[cam] = pixel_to_ground(u, v, homographies[cam])
        cams = sorted(ground_points)
        for i in range(len(cams)):
            for j in range(i + 1, len(cams)):
                x1, y1 = ground_points[cams[i]]
                x2, y2 = ground_points[cams[j]]
                d = ((x1 - x2)**2 + (y1 - y2)**2) ** 0.5
                distances.append(d)
                if global_max is None or d > global_max:
                    global_max, global_info = d, (frame_id, pid, cams[i], cams[j])

distances.sort()
p95 = distances[int(len(distances) * 0.95)]

print(f"Checked {len(distances)} same-person cross-camera view pairs across {len(all_frames)} frames.\n")
print(f"Worst case (max): {global_max:.1f}cm -- frame {global_info[0]}, person {global_info[1]}, views {global_info[2]} & {global_info[3]}")
print(f"95th percentile: {p95:.1f}cm")
print(f"\nFor reference: worst case for two DIFFERENT people was 4.1cm.")
