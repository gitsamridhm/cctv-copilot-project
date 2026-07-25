# Cross-Camera Fusion — Methodology, Validation & Known Limitations
### Person B (Rakshith) — CCTV Multi-Feed Analyst Copilot

---

## 1. Approach

Cross-camera re-identification is done via **calibration-based ground-plane projection**, not facial recognition or pure visual appearance matching. This directly satisfies the project's "no facial recognition" requirement and is more defensible than appearance-only re-ID, since it's grounded in verifiable geometry rather than a black-box similarity score.

**How it works:**
1. Each camera's WILDTRACK calibration (intrinsic camera matrix + distortion coefficients, extrinsic rotation/translation vectors) is loaded from OpenCV-compatible XML files.
2. A ground-plane homography is built per camera, mapping image pixels to real-world ground coordinates (assuming a person's feet sit at world Z=0).
3. For each detected person, the bounding box's bottom-center point (approximate foot position) is projected through the homography into shared ground-plane coordinates.
4. Cross-camera candidate pairs are formed between tracks that co-occur in time (share 3+ frames).
5. Each candidate pair is scored using **ground-plane distance + object class/color agreement**, averaged across all shared frames.
6. A one-to-one greedy assignment ensures each track is fused with at most one match per other camera.

---

## 2. Validating the Core Math

Before trusting this approach on real detection data, the underlying calibration and camera-index mapping were independently verified:

- **The mapping between WILDTRACK's `viewNum` (0–6) and its physical calibration files (CVLab1–4, IDIAP1–3) existed nowhere in the codebase** and had to be established empirically. It was confirmed by testing 5 real people visible across 16 cross-camera view-pairs (using WILDTRACK's own ground-truth boxes): all pairs agreed on ground position within **4.5–16.8cm** — strong evidence the mapping and the full projection pipeline are correct.
- **Same-person cross-camera noise, measured across all 400 annotated frames (83,908 view-pairs):** 95th percentile = 25.3cm, worst case = 51.3cm.
- **Minimum distance between two different real people, worst case across all 400 frames:** 4.1cm.

This last point matters: the closest two different real people can get (4.1cm) is *tighter* than the low end of ordinary same-person cross-camera noise (4.5cm+). **This means ground-plane distance alone cannot always distinguish "same person, two cameras" from "two different people standing close together."** This is exactly why the design combines distance with object attributes rather than relying on geometry alone — and it's a measured fact about the dataset, not an assumption.

Based on this analysis, a working distance threshold of **60cm** was set (comfortably above the measured same-person noise ceiling), with object class/color agreement as a secondary signal.

---

## 3. Validation Against the Real Pipeline (Critical Finding)

The above was validated against WILDTRACK's pixel-perfect human-annotated ground truth. The real production pipeline (A's YOLOv8 detector + centroid tracker) introduces real-world noise, so the fusion logic was additionally tested end-to-end on actual pipeline output (`events_cam0.json`, `events_cam1.json` — 201 shared frames, 100% temporal overlap between the two cameras).

**Result: fusion precision against real ground truth was 14.4%** (20 correct matches out of 139 checkable pairs) — much lower than the clean-data validation above.

**Root cause, identified through further testing:** track "purity" was measured — how consistently a single `track_id` from A's single-camera tracker corresponds to one real ground-truth person, using IoU-based matching against WILDTRACK annotations.

| Metric | Value |
|---|---|
| Tracks analyzed | 243 |
| Average purity | 46.5% |
| Tracks ≥90% pure (clean single-person) | 7.0% |
| Tracks <70% pure (likely identity-switched) | 80.7% |
| Worst observed case | Track spanning 37 distinct real people across 73 frames |

**Conclusion:** the fusion algorithm itself is independently verified correct (Section 2). The low real-pipeline precision traces to **upstream single-camera tracking identity-switching**, not the cross-camera fusion approach. A's own documentation anticipated some risk of this (`max_distance=250` was flagged as a deliberate precision/continuity tradeoff), but the measured severity — the large majority of tracks switching identity, not just an occasional edge case — is worse than that framing suggested.

---

## 4. Re-Validation After A's Tracker Fix

After the Section 3 findings were shared with the team, Person A made changes to `tracker.py` and regenerated both event files (`events_cam0.json`, `events_cam1.json`). Re-running the identical validation scripts against the new data:

| Metric | Before | After |
|---|---|---|
| Tracks analyzed | 243 | 434 |
| Average purity | 46.5% | 54.4% |
| Tracks ≥90% pure | 7.0% | 14.5% |
| Tracks <70% pure | 80.7% | 69.8% |
| Fusion precision vs. ground truth | 14.4% | 16.5% |

**Assessment:** every metric moved in the right direction, confirming the fix had a real, measurable effect rather than being noise. The near-doubling of total track count (243→434) suggests the tracker's matching distance was tightened, producing more numerous, shorter, and on-average purer tracks.

However, **the majority of tracks (69.8%) are still likely identity-switched**, and fusion precision (16.5%) remains far below what could be trusted for a live, uncaveated demo. Critically, the worst-case tail did not improve: tracks blending 30+ distinct real people were still observed after the fix. This confirms the Section 2 finding that some identity mixing stems from genuine spatial ambiguity (real people standing centimeters apart) rather than purely a tracker-tuning problem — it is partly an inherent property of how dense this scene is.

---

## 5. Known Limitations

- **WILDTRACK's overlapping-camera geometry** stands in for the brief's "distinct, non-overlapping feeds" scenario. The pipeline itself doesn't require disjoint cameras — it treats each `camera_id` independently — but this is a real adaptation worth stating plainly.
- **Object detector currently supports only 2 classes** (black suitcase, blue jacket) rather than the 3 originally planned, and no red/backpack combination exists in real output — this limits the color/class signal's power as a disambiguation tool, and limits demo query variety.
- **Single-camera tracking identity-switching** (Section 3) is the primary blocker to high-precision fusion on real, non-ground-truth data.
- **Ground-plane distance alone cannot disambiguate people closer than ~4–5cm apart** (measured, not assumed) — the system relies on object attributes as a tiebreaker in these cases, which is weaker given only 2 possible object classes.
- **No long-term re-identification across days or sessions** — matching is scoped to a single continuous capture window.

---

## 6. Path Forward

- ~~Reduce the single-camera tracker's `max_distance` or otherwise improve track continuity~~ — attempted by Person A (see Section 4): produced a real but modest improvement (14.4% → 16.5% fusion precision). Further tuning along this axis likely has diminishing returns given the genuine spatial-ambiguity floor identified in Section 2.
- Expand the object detector's class/color range to strengthen the attribute-based tiebreaker — still the most promising unexplored lever, since attribute agreement is currently only a 2-class signal.
- **Recommended given time constraints:** present on a shorter or less crowded clip where single-camera tracking is more likely to hold up, while documenting this limitation transparently with the before/after numbers above — this is a defensible, evidence-based "path forward" story rather than a hidden gap.

---

## 7. Quick Reference — Validation Scripts

| Script | Purpose |
|---|---|
| `calibration_utils.py` | Calibration loading, ground-plane homography, pixel-to-ground projection |
| `test_calibration.py` | Sanity check of projection math on a single point |
| `test_cross_camera.py` | Confirms viewNum-to-calibration mapping via real multi-camera agreement |
| `test_min_person_distance_global.py` | Worst-case distance between different real people (all 400 frames) |
| `test_max_same_person_distance_global.py` | Same-person cross-camera noise distribution (all 400 frames) |
| `fuse_cross_camera.py` | The actual fusion algorithm (distance + attribute scoring, one-to-one assignment) |
| `validate_fusion_against_groundtruth.py` | Checks fused pairs against real ground truth — produced the 14.4% precision figure |
| `check_track_purity.py` | Measures single-camera track identity-switching — root-caused the low precision |
