Detection & Single-Camera Tracking — Documentation

Role: Person A — Detection & Single-Camera Tracking
Project: CCTV Multi-Feed Object and Individual Tracking — Analyst Copilot


1. Overview

This module is the entry point of the pipeline: it detects people in each camera frame, tracks them across frames within a single camera view, and flags whether each person is carrying a distinctively colored item. Output is written as structured JSON events, consumed downstream by the cross-camera fusion (SQLite) and analyst copilot components.

2. Components

FilePurposedetect.pyYOLOv8 (pretrained, yolov8n.pt) person detection per frametracker.pyCentroid-based tracker assigning persistent track_ids across frames within one cameracarried_object.pyHSV color-mask heuristic flagging carried/worn items (blue jacket, black backpack)build_events.pyCombines detection + tracking + carried-object heuristic into final event recordsload_annotations.pyParses WILDTRACK ground-truth annotation filescheck_overlay.py / compare_overlay.pyVisual QA tools — ground truth vs. predictionsevaluate.pyComputes precision/recall of the detector against ground truth

3. Detection


Model: YOLOv8n (Ultralytics, pretrained on COCO), person class only.
Confidence threshold: 0.4.
Verified visually against WILDTRACK ground-truth annotations using compare_overlay.py before proceeding to tracking.


4. Tracking


Method: Centroid-based tracking — matches detections across frames by minimizing global centroid distance, using a greedy nearest-neighbor assignment.
Parameters (validated empirically): max_distance=250, max_disappeared=3.


Known limitation — tracking accuracy tradeoff

WILDTRACK's image subset is extracted at 2fps, and our event pipeline further samples every 2nd–10th frame for processing speed. This means the real time gap between analyzed frames can be several seconds, during which people can move a large distance across the scene.

This creates a direct tradeoff:


Low max_distance (e.g., 75): correctly separates distinct nearby individuals, but fails to track fast-moving people — nearly every person gets a new track_id every frame, breaking continuity.
High max_distance (e.g., 250+): successfully tracks fast-moving individuals, but risks identity switches in dense crowd areas — mismatching two different people who happen to be near each other.


max_distance=250 was chosen as a validated middle ground based on empirical testing (logged minimum match distances across real frames ranged from under 1px to 600+px in the same frame). A motion-prediction approach (e.g., Kalman filtering) would resolve this tradeoff more rigorously and is noted as a path-forward improvement.

5. Carried-Object Detection


Method: HSV color-mask heuristic. For each tracked person's bounding box (lower 60% of the box, to focus on torso/arm region), checks what fraction of pixels fall within a target color range.
Classes: blue → jacket, black → backpack (2 classes, within the project's documented 2–3 class scope).
Output: structured result with object_color, object_class, and a confidence tier (high_match / medium_match / none).


Known limitation

This is a color-only heuristic, not true object classification — it cannot distinguish object type (e.g., a black backpack vs. a black suitcase vs. a black jacket) and can false-positive on any sufficiently large region of matching color (e.g., dark clothing, shadows). A more robust approach would use YOLOv8's native backpack/suitcase COCO classes for object-type detection, combined with this heuristic for color — noted as a path-forward improvement, not implemented due to time constraints.

6. Event Output Format

Each detected/tracked person per frame produces one JSON event:

json{
  "camera_id": "cam_0",
  "track_id": 26,
  "frame_ref": "cam_0/00001100.png",
  "bbox": [456, 150, 514, 293],
  "object_class": "backpack",
  "confidence": 0.87
}

7. Detection Accuracy — Precision / Recall

Evaluated using IoU-based matching (threshold ≥ 0.5) against WILDTRACK's human-annotated ground truth.

MetricValueSample size40 frames (of 400 available annotated frames)CameraCamera 0 (C1)Precision0.619Recall0.334True Positives280False Positives172False Negatives559

Interpretation


Precision (0.619): roughly 62% of detections YOLO flagged as a person were correct matches to a real, annotated person.
Recall (0.334): roughly 33% of all real people in these frames were successfully detected.


The relatively low recall reflects WILDTRACK's dense crowd scenes (20–36 annotated people per frame in this camera), where a pretrained, non-fine-tuned YOLOv8n model struggles most with small, distant, and partially-occluded individuals — a known and expected limitation of using an off-the-shelf detector on this dataset without fine-tuning.

Note on sample size

Due to time constraints, evaluation was run on a 40-frame sample rather than the full 400-frame annotated set. Results should be treated as indicative of overall performance, not exhaustive. A full-dataset evaluation is a straightforward extension (evaluate.py supports this by removing the sample limit) if time allows.

8. Path Forward / Future Improvements


Fine-tune YOLOv8 on WILDTRACK-specific data to improve recall on small/occluded/crowded detections.
Motion-prediction tracking (Kalman filter or similar) to resolve the centroid-tracker's speed/accuracy tradeoff without manual threshold tuning.
True object classification for carried items (YOLO's native backpack/suitcase classes) rather than color-only heuristics, enabling more precise and less error-prone "carrying X" queries.
Full 400-frame evaluation for a more statistically robust precision/recall measurement.
Confidence threshold tuning — lowering the detection confidence threshold (currently 0.4) could improve recall at a documented cost to precision.
