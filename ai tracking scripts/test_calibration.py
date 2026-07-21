import os
from calibration_utils import load_extrinsic, load_intrinsic, build_ground_homography, pixel_to_ground

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")

rvec, tvec = load_extrinsic(os.path.join(CALIB_DIR, "extrinsic", "extr_CVLab1.xml"))
K, dist = load_intrinsic(os.path.join(CALIB_DIR, "intrinsic_zero", "intr_CVLab1.xml"))
H = build_ground_homography(K, rvec, tvec)

# Simulate a person standing lower-middle of the 1920x1080 frame (feet near bottom)
x, y = pixel_to_ground(960, 1000, H)
print(f"Camera 1 -> estimated ground position: X={x:.1f}, Y={y:.1f}")
