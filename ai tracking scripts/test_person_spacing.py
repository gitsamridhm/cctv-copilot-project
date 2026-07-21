import os
from load_annotations import load_annotations
from calibration_utils import load_extrinsic, load_intrinsic, build_ground_homography, pixel_to_ground

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
ANN_PATH = os.path.join(SCRIPT_DIR, "..", "data", "annotations_positions", "00000000.json")

def get_homography(name):
    rvec, tvec = load_extrinsic(os.path.join(CALIB_DIR, "extrinsic", f"extr_{name}.xml"))
    K, dist = load_intrinsic(os.path.join(CALIB_DIR, "intrinsic_zero", f"intr_{name}.xml"))
    return build_ground_homography(K, rvec, tvec)

def foot_point(bbox):
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, y2

boxes_by_camera = load_annotations(ANN_PATH)
H0 = get_homography("CVLab1")

positions = []
for b in boxes_by_camera[0]:
    u, v = foot_point(b["bbox"])
    x, y = pixel_to_ground(u, v, H0)
    positions.append((b["person_id"], x, y))

print(f"{len(positions)} different real people detected in View 0\n")

min_dist, closest_pair = None, None
for i in range(len(positions)):
    for j in range(i + 1, len(positions)):
        pid1, x1, y1 = positions[i]
        pid2, x2, y2 = positions[j]
        d = ((x1 - x2)**2 + (y1 - y2)**2) ** 0.5
        if min_dist is None or d < min_dist:
            min_dist, closest_pair = d, (pid1, pid2)

print(f"Closest two DIFFERENT people in this frame: person {closest_pair[0]} & person {closest_pair[1]}")
print(f"Distance apart: {min_dist:.1f} (dataset units, ~cm)")
print(f"\nFor reference: same person across cameras measured 4.5-16.8 in the last test.")
