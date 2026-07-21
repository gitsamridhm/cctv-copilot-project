import os
from load_annotations import load_annotations
from calibration_utils import load_extrinsic, load_intrinsic, build_ground_homography, pixel_to_ground

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
ANN_PATH = os.path.join(SCRIPT_DIR, "..", "data", "annotations_positions", "00000000.json")

# Candidate mapping (WILDTRACK's commonly used convention) -- we're about to TEST this, not assume it
VIEW_TO_CALIB = {
    0: "CVLab1", 1: "CVLab2", 2: "CVLab3", 3: "CVLab4",
    4: "IDIAP1", 5: "IDIAP2", 6: "IDIAP3",
}

def get_homography(view_num):
    name = VIEW_TO_CALIB[view_num]
    rvec, tvec = load_extrinsic(os.path.join(CALIB_DIR, "extrinsic", f"extr_{name}.xml"))
    K, dist = load_intrinsic(os.path.join(CALIB_DIR, "intrinsic_zero", f"intr_{name}.xml"))
    return build_ground_homography(K, rvec, tvec)

def foot_point(bbox):
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, y2

boxes_by_camera = load_annotations(ANN_PATH)
homographies = {v: get_homography(v) for v in range(7)}

person_views = {}
for view_num, boxes in boxes_by_camera.items():
    for b in boxes:
        person_views.setdefault(b["person_id"], {})[view_num] = b["bbox"]

checked = 0
for pid, views in person_views.items():
    if len(views) < 2:
        continue
    print(f"\nPerson {pid} visible in views: {sorted(views.keys())}")
    ground_points = {}
    for view_num, bbox in views.items():
        u, v = foot_point(bbox)
        x, y = pixel_to_ground(u, v, homographies[view_num])
        ground_points[view_num] = (x, y)
        print(f"  View {view_num} ({VIEW_TO_CALIB[view_num]}): ground = ({x:.1f}, {y:.1f})")
    vlist = sorted(ground_points)
    x0, y0 = ground_points[vlist[0]]
    for v1 in vlist[1:]:
        x1, y1 = ground_points[v1]
        dist = ((x0 - x1)**2 + (y0 - y1)**2) ** 0.5
        print(f"  Distance view {vlist[0]} <-> view {v1}: {dist:.1f} (dataset units, ~cm)")
    checked += 1
    if checked >= 5:
        break
