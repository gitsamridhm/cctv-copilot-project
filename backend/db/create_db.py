import sqlite3

conn = sqlite3.connect("db/pattern_of_life.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    track_id TEXT,
    camera_id TEXT,
    timestamp TEXT,
    ground_x REAL,
    ground_y REAL,
    object_class TEXT,
    object_color TEXT,
    confidence REAL,
    dwell_seconds INTEGER,
    bbox TEXT,
    frame_ref TEXT
)
""")

conn.commit()
conn.close()
print("pattern_of_life.db created with 'events' table.")
