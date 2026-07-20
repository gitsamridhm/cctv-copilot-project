import numpy as np


class CentroidTracker:
    def __init__(self, max_disappeared=10, max_distance=250):
        self.next_id = 0
        self.objects = {}
        self.bboxes = {}
        self.confidences = {}   # NEW: store confidence per track
        self.disappeared = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def register(self, centroid, bbox, confidence):
        self.objects[self.next_id] = centroid
        self.bboxes[self.next_id] = bbox
        self.confidences[self.next_id] = confidence
        self.disappeared[self.next_id] = 0
        self.next_id += 1

    def deregister(self, object_id):
        del self.objects[object_id]
        del self.bboxes[object_id]
        del self.confidences[object_id]
        del self.disappeared[object_id]

    def update(self, detections):
        input_centroids = []
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            input_centroids.append((cx, cy))

        if len(self.objects) == 0:
            for i, c in enumerate(input_centroids):
                self.register(c, detections[i]["bbox"], detections[i]["confidence"])
            return self.get_tracked()

        if len(input_centroids) == 0:
            for object_id in list(self.disappeared.keys()):
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)
            return self.get_tracked()

        object_ids = list(self.objects.keys())
        object_centroids = list(self.objects.values())

        D = np.linalg.norm(
            np.array(object_centroids)[:, None] - np.array(input_centroids)[None, :],
            axis=2
        )

        matches = []
        for r in range(D.shape[0]):
            for c in range(D.shape[1]):
                matches.append((D[r, c], r, c))
        matches.sort(key=lambda x: x[0])

        used_rows, used_cols = set(), set()
        for dist, row, col in matches:
            if row in used_rows or col in used_cols:
                continue
            if dist > self.max_distance:
                continue
            object_id = object_ids[row]
            self.objects[object_id] = input_centroids[col]
            self.bboxes[object_id] = detections[col]["bbox"]
            self.confidences[object_id] = detections[col]["confidence"]  # NEW
            self.disappeared[object_id] = 0
            used_rows.add(row)
            used_cols.add(col)

        unused_rows = set(range(len(object_ids))) - used_rows
        for row in unused_rows:
            object_id = object_ids[row]
            self.disappeared[object_id] += 1
            if self.disappeared[object_id] > self.max_disappeared:
                self.deregister(object_id)

        unused_cols = set(range(len(input_centroids))) - used_cols
        for col in unused_cols:
            self.register(input_centroids[col], detections[col]["bbox"], detections[col]["confidence"])

        return self.get_tracked()

    def get_tracked(self):
        return [
            {"track_id": oid, "bbox": self.bboxes[oid], "confidence": self.confidences[oid]}
            for oid in self.objects
        ]