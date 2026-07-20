from ultralytics import YOLO
import cv2

print("Loading model...")
model = YOLO("yolov8n.pt")
print("Model loaded.")

def detect_people(image_path, conf=0.4):
    print(f"Loading image: {image_path}")
    img = cv2.imread(image_path)
    if img is None:
        print("ERROR: image failed to load — check the path")
        return []
    print("Image loaded, running detection...")
    results = model(img, classes=[0], conf=conf)
    print("Detection complete.")
    boxes = []
    for box in results[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf_score = box.conf[0].item()
        boxes.append({"bbox": (x1, y1, x2, y2), "confidence": conf_score})
    return boxes

if __name__ == "__main__":
    boxes = detect_people("../data/Image_subsets/C1/00000000.png")
    print(f"Detected {len(boxes)} people")
    for b in boxes[:5]:
        print(b)