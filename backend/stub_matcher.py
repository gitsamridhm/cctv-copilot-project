import sqlite3, json

conn = sqlite3.connect("db/pattern_of_life.db")
cursor = conn.cursor()

fake_events = [
    ("evt_00001","trk_0001","cam_01","2026-07-07T18:40:00Z",210,880,"backpack","red",0.85,12, json.dumps([400,120,90,200]), "cam01/frame_0001.jpg"),
    ("evt_00002","trk_0001","cam_03","2026-07-07T18:40:02Z",214,887,"backpack","red",0.87,40, json.dumps([412,118,96,210]), "cam03/frame_0001.jpg"),
]

for e in fake_events:
    cursor.execute("""
        INSERT OR REPLACE INTO events
        (id, track_id, camera_id, timestamp, ground_x, ground_y, object_class, object_color, confidence, dwell_seconds, bbox, frame_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, e)

conn.commit()
conn.close()
print("Stub events written.")
