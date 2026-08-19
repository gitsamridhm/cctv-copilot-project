import os
import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from copilot_query import query_pipeline

app = FastAPI(title="CCTV Copilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
DB_PATH = os.path.join(BASE_DIR, "db", "pattern_of_life.db")
C1_IMAGES_DIR = os.path.join(PROJECT_ROOT, "data", "Image_subsets", "C1")
C2_IMAGES_DIR = os.path.join(PROJECT_ROOT, "data", "Image_subsets", "C2")

if os.path.exists(C1_IMAGES_DIR):
    app.mount("/frames/C1", StaticFiles(directory=C1_IMAGES_DIR), name="c1_frames")
if os.path.exists(C2_IMAGES_DIR):
    app.mount("/frames/C2", StaticFiles(directory=C2_IMAGES_DIR), name="c2_frames")

def get_db_connection():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail="Database not found")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

class QueryRequest(BaseModel):
    query: str

@app.post("/api/query")
def process_query(req: QueryRequest):
    return query_pipeline(req.query)

@app.get("/api/identities")
def get_identities():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            track_id,
            COUNT(*) as total_events,
            MIN(timestamp) as first_seen,
            MAX(timestamp) as last_seen,
            GROUP_CONCAT(DISTINCT camera_id) as cameras,
            GROUP_CONCAT(DISTINCT object_class) as object_classes,
            GROUP_CONCAT(DISTINCT object_color) as object_colors
        FROM events
        WHERE track_id IS NOT NULL AND track_id != ''
        GROUP BY track_id
        ORDER BY track_id ASC
    """)
    rows = cursor.fetchall()
    conn.close()

    identities = []
    for r in rows:
        identities.append({
            "track_id": r["track_id"],
            "total_events": r["total_events"],
            "first_seen": r["first_seen"],
            "last_seen": r["last_seen"],
            "cameras": r["cameras"].split(",") if r["cameras"] else [],
            "carried_objects": [
                f"{col} {cls}".strip() 
                for col, cls in zip((r["object_colors"] or "").split(","), (r["object_classes"] or "").split(",")) 
                if cls and cls != "none"
            ]
        })

    return {"identities": identities}

@app.get("/api/person/{track_id}")
def get_person_events(track_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            id, track_id, camera_id, timestamp, frame_ref,
            object_class, object_color, confidence, COALESCE(dwell_seconds, 0.0) as dwell_time
        FROM events
        WHERE track_id = ?
        ORDER BY timestamp ASC
    """, (track_id,))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"Identity {track_id} not found")

    events = [dict(r) for r in rows]
    return {
        "track_id": track_id,
        "total_events": len(events),
        "events": events
    }

@app.get("/api/frames/{camera_id}/{frame_ref}")
def serve_frame(camera_id: str, frame_ref: str):
    if camera_id in ["cam_0", "C0"]:
        filename = os.path.basename(frame_ref)
        if not filename.endswith(".png") and not filename.endswith(".jpg"):
            filename += ".png"

        file_path = os.path.join(C1_IMAGES_DIR, filename)
        if os.path.exists(file_path):
            return FileResponse(file_path)
        else:
            raise HTTPException(status_code=404, detail=f"Frame file {filename} not found on cam_0")
    elif camera_id in ["cam_1", "C2"]:
        if not os.path.exists(C2_IMAGES_DIR):
            raise HTTPException(
                status_code=503,
                detail="cam_1 source frames not available in this environment (WILDTRACK C2 was not provided)."
            )

        filename = os.path.basename(frame_ref)
        if not filename.endswith(".png") and not filename.endswith(".jpg"):
            filename += ".png"

        file_path = os.path.join(C2_IMAGES_DIR, filename)
        if os.path.exists(file_path):
            return FileResponse(file_path)
        else:
            raise HTTPException(status_code=404, detail=f"Frame file {filename} not found on cam_1")
    else:
        raise HTTPException(status_code=404, detail=f"Unknown camera_id: {camera_id}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
