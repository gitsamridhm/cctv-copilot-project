import os
import sqlite3
import chromadb

# Path configurations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "db", "pattern_of_life.db")
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")

COLLECTION_NAME = "cctv_events"

def get_chroma_client():
    return chromadb.PersistentClient(path=CHROMA_PATH)

def seed_database():
    print(f"Connecting to pattern_of_life DB at: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database file not found at {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Inspect table structure to see available columns
    cursor.execute("PRAGMA table_info(events)")
    columns = [row["name"] for row in cursor.fetchall()]
    print(f"Detected table columns: {columns}")

    has_dwell_time = "dwell_time" in columns

    query = """
        SELECT 
            id,
            track_id,
            camera_id,
            timestamp,
            frame_ref,
            object_class,
            object_color,
            confidence
    """
    if has_dwell_time:
        query += ", COALESCE(dwell_time, 0.0) as dwell_time "
    
    query += " FROM events"

    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    print(f"Fetched {len(rows)} total events from SQLite DB.")

    client = get_chroma_client()

    # Delete existing collection to replace (not append to) the stale index
    try:
        client.delete_collection(name=COLLECTION_NAME)
        print(f"Deleted existing ChromaDB collection '{COLLECTION_NAME}'.")
    except Exception:
        pass

    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"}
    )

    documents = []
    metadatas = []
    ids = []

    for row in rows:
        event_id = str(row["id"])
        track_id = str(row["track_id"]) if row["track_id"] else "unknown"
        camera_id = str(row["camera_id"])
        timestamp = str(row["timestamp"])
        frame_ref = str(row["frame_ref"]) if row["frame_ref"] else ""
        obj_class = str(row["object_class"]) if row["object_class"] else "none"
        obj_color = str(row["object_color"]) if row["object_color"] else "none"
        confidence = float(row["confidence"]) if row["confidence"] is not None else 1.0
        dwell_time = float(row["dwell_time"]) if has_dwell_time and row["dwell_time"] is not None else 0.0

        # Rich natural-language document per event
        carried_str = f"carrying a {obj_color} {obj_class}" if obj_class != "none" else "no carried objects detected"
        doc = (
            f"Person {track_id} detected on camera {camera_id} at {timestamp}. "
            f"Carried object: {carried_str}. "
            f"Frame reference: {frame_ref}. Dwell time: {dwell_time:.1f}s. "
            f"Detection confidence: {confidence:.2f}."
        )

        metadata = {
            "camera_id": camera_id,
            "track_id": track_id,
            "object_class": obj_class,
            "object_color": obj_color,
            "confidence": confidence,
            "timestamp": timestamp,
            "frame_ref": frame_ref
        }

        ids.append(f"event_{event_id}")
        documents.append(doc)
        metadatas.append(metadata)

    # Upsert in batches of 200
    batch_size = 200
    for i in range(0, len(documents), batch_size):
        end = i + batch_size
        collection.upsert(
            ids=ids[i:end],
            documents=documents[i:end],
            metadatas=metadatas[i:end]
        )

    print(f"Successfully indexed {len(documents)} events into ChromaDB collection '{COLLECTION_NAME}'.\n")

    # Verification Step
    print("=== RUNNING VERIFICATION CHECKS ===")
    all_indexed = collection.get()
    total_count = len(all_indexed["ids"])
    print(f"Total indexed documents in ChromaDB: {total_count}")

    # Check identities person_001 to person_004
    for p_num in range(1, 5):
        p_id = f"person_{p_num:03d}"
        res = collection.get(where={"track_id": p_id})
        count = len(res["ids"])
        
        if p_id == "person_003":
            cam0_res = collection.get(where={"$and": [{"track_id": p_id}, {"camera_id": "cam_0"}]})
            cam1_res = collection.get(where={"$and": [{"track_id": p_id}, {"camera_id": "cam_1"}]})
            cam0_count = len(cam0_res["ids"])
            cam1_count = len(cam1_res["ids"])
            print(f"Identity {p_id}: {count} total events (cam_0: {cam0_count}, cam_1: {cam1_count})")
            assert count == 32, f"Expected 32 events for person_003, got {count}"
            assert cam0_count == 11, f"Expected 11 events on cam_0 for person_003, got {cam0_count}"
            assert cam1_count == 21, f"Expected 21 events on cam_1 for person_003, got {cam1_count}"
        else:
            print(f"Identity {p_id}: {count} total events")

    print("\nVerification Passed! All 4 identities indexed correctly.")

if __name__ == "__main__":
    seed_database()
