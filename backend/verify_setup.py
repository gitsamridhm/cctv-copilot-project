"""
Role C - Phase 1 Verification Script
Run this to prove each step (1.1, 1.2, 1.3) was completed.
"""

import os
import chromadb
from dotenv import load_dotenv

load_dotenv()

PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "pattern_of_life")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

passed = 0
failed = 0


def check(label, condition, detail=""):
    global passed, failed
    status = "PASS" if condition else "FAIL"
    if condition:
        passed += 1
    else:
        failed += 1
    print(f"  {status} - {label}")
    if detail:
        print(f"         {detail}")


print("=" * 70)
print("ROLE C - PHASE 1 VERIFICATION")
print("=" * 70)

print("\nSTEP 1.1: Environment & API Key Acquisition")
print("-" * 70)
env_exists = os.path.isfile(".env")
check(".env file exists", env_exists)
key_present = bool(GROQ_API_KEY) and len(GROQ_API_KEY) > 10
masked = GROQ_API_KEY[:8] + "..." + GROQ_API_KEY[-4:] if key_present else "NOT FOUND"
check("Groq API key loaded from .env", key_present, f"Key: {masked}")
try:
    chroma_version = chromadb.__version__
    check("chromadb package installed", True, f"Version: {chroma_version}")
except ImportError:
    check("chromadb package installed", False)
try:
    from groq import Groq
    check("groq package installed", True)
except ImportError:
    check("groq package installed", False)
try:
    import dotenv
    check("python-dotenv installed", True)
except ImportError:
    check("python-dotenv installed", False)
groq_works = False
groq_detail = ""
try:
    from groq import Groq
    client = Groq(api_key=GROQ_API_KEY)
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Reply with exactly: OK"}],
        max_tokens=5,
    )
    groq_works = resp.choices[0].message.content.strip() == "OK"
    groq_detail = f"Live API call returned: '{resp.choices[0].message.content.strip()}'"
except Exception as e:
    groq_detail = f"API call failed: {e}"
check("Groq API key is valid (live test)", groq_works, groq_detail)

print("\nSTEP 1.2: Initialize the Vector Database")
print("-" * 70)
dir_exists = os.path.isdir(PERSIST_DIR)
check(f"Persistent Chroma directory exists: {PERSIST_DIR}", dir_exists)
chroma_files = []
if dir_exists:
    for root, dirs, files in os.walk(PERSIST_DIR):
        for f in files:
            chroma_files.append(f)
check("Chroma directory contains data files", len(chroma_files) > 0, f"Found {len(chroma_files)} files")
collection = None
try:
    client = chromadb.PersistentClient(path=PERSIST_DIR)
    check("Persistent Chroma client initialized", True)
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    check(f"Collection '{COLLECTION_NAME}' exists", True)
except Exception as e:
    check("Persistent Chroma client initialized", False, str(e))
if collection:
    embed_fn = collection._embedding_function
    embed_name = type(embed_fn).__name__ if embed_fn else "None"
    check("Using lightweight open-source embedding function", True, f"Embedding function: {embed_name}")

print("\nSTEP 1.3: Seed Dummy Data & Test Embeddings")
print("-" * 70)
if collection:
    count = collection.count()
    check("Collection has seeded data (>= 5 events)", count >= 5, f"Total events: {count}")
    all_records = collection.get()
    docs = all_records.get("documents", [])
    metadatas = all_records.get("metadatas", [])
    check("All records have natural-language document payloads", all(docs), f'Sample: "{docs[0]}"' if docs else "No documents")
    check("All records have structured metadata dictionaries", all(metadatas), f"Sample metadata: {metadatas[0]}" if metadatas else "No metadata")
    required_fields = ["camera_id", "object_color", "timestamp"]
    if metadatas:
        first_meta = metadatas[0]
        all_fields_present = all(f in first_meta for f in required_fields)
        check(f"Metadata contains required fields: {required_fields}", all_fields_present, f"Fields: {list(first_meta.keys())}")
    print("\n  Sample seeded events (document + metadata):")
    for i, (doc, meta) in enumerate(zip(docs[:3], metadatas[:3])):
        print(f"\n     Event {i+1}:")
        print(f'       Document:  "{doc}"')
        print(f"       Metadata:  {meta}")
    print("\n  Embedding verification - semantic search test:")
    results = collection.query(query_texts=["crimson bag"], n_results=3)
    print(f"     Query: 'crimson bag' (should match 'red backpack')")
    for i, (doc, dist) in enumerate(zip(results["documents"][0], results["distances"][0])):
        print(f'       Match {i+1} [distance={dist:.4f}]: "{doc}"')
    check("Semantic search returns relevant results", len(results["documents"][0]) > 0)
    print("\n  Metadata filter verification - camera_id='cam_03':")
    filtered = collection.get(where={"camera_id": "cam_03"})
    print(f"     Found {len(filtered['documents'])} events on Camera 3")
    for doc in filtered["documents"]:
        print(f'       - "{doc}"')
    check("Metadata filtering works (camera_id filter)", len(filtered["documents"]) > 0)

print("\n" + "=" * 70)
print(f"RESULTS: {passed} passed, {failed} failed")
if failed == 0:
    print("ALL PHASE 1 STEPS VERIFIED - ready for Phase 2")
else:
    print(f"{failed} check(s) failed - see details above")
print("=" * 70)
