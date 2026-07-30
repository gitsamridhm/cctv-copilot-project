import os
import json
import re
import chromadb
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")
COLLECTION_NAME = "cctv_events"

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def get_groq_client():
    if not GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        return Groq(api_key=GROQ_API_KEY)
    except Exception:
        return None

def parse_query_stage1(query_text: str) -> dict:
    """Parses natural language query into filter metadata dictionary."""
    client = get_groq_client()
    
    heuristic_filters = {}
    
    # Check for track_id/person_id patterns
    p_match = re.search(r'person[_\s]?(\d+)', query_text.lower())
    if p_match:
        num = int(p_match.group(1))
        heuristic_filters["track_id"] = f"person_{num:03d}"
        
    # Check for camera IDs
    cam_match = re.search(r'(?:camera|cam)[_\s]?(\d+)', query_text.lower())
    if cam_match:
        heuristic_filters["camera_id"] = f"cam_{int(cam_match.group(1))}"
        
    # Check for colors
    for color in ["black", "blue", "red", "green", "white", "yellow", "gray"]:
        if color in query_text.lower():
            heuristic_filters["object_color"] = color
            break

    # Check for carried object
    for obj in ["suitcase", "jacket", "bag", "backpack", "tote_bag", "briefcase", "umbrella"]:
        if obj in query_text.lower():
            heuristic_filters["object_class"] = obj.replace(" ", "_")
            break

    if not client:
        return heuristic_filters

    prompt = f"""
You are a CCTV video analytics query parser. Convert the user query into structured search parameters.
Extract the following JSON fields if present in the user query:
- track_id: (e.g. "person_001", "person_003")
- camera_id: (e.g. "cam_0", "cam_1")
- object_class: (e.g. "suitcase", "jacket", "backpack")
- object_color: (e.g. "black", "blue", "red")
- start_time: ISO timestamp substring or time (e.g. "18:02")
- end_time: ISO timestamp substring or time (e.g. "18:03")

User query: "{query_text}"

Respond ONLY with a valid JSON object. Do not include markdown or formatting blocks outside JSON.
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content.strip())
        
        # Merge heuristics for missing critical fields
        for k, v in heuristic_filters.items():
            if k not in parsed or not parsed[k]:
                parsed[k] = v
                
        return {k: v for k, v in parsed.items() if v}
    except Exception:
        return heuristic_filters

def build_chroma_where(filters: dict) -> dict:
    """Builds a valid ChromaDB where clause supporting metadata fields and timestamps."""
    conditions = []

    if "track_id" in filters and filters["track_id"]:
        conditions.append({"track_id": filters["track_id"]})

    if "camera_id" in filters and filters["camera_id"]:
        conditions.append({"camera_id": filters["camera_id"]})

    if "object_class" in filters and filters["object_class"]:
        conditions.append({"object_class": filters["object_class"]})

    if "object_color" in filters and filters["object_color"]:
        conditions.append({"object_color": filters["object_color"]})

    if "start_time" in filters and filters["start_time"]:
        conditions.append({"timestamp": {"$gte": filters["start_time"]}})
    if "end_time" in filters and filters["end_time"]:
        conditions.append({"timestamp": {"$lte": filters["end_time"]}})

    if not conditions:
        return {}
    elif len(conditions) == 1:
        return conditions[0]
    else:
        return {"$and": conditions}

def query_pipeline(query_text: str, n_results: int = 50):
    chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = chroma_client.get_collection(name=COLLECTION_NAME)

    parsed_filters = parse_query_stage1(query_text)
    where_clause = build_chroma_where(parsed_filters)

    query_params = {
        "query_texts": [query_text],
        "n_results": n_results
    }
    if where_clause:
        query_params["where"] = where_clause

    try:
        results = collection.query(**query_params)
    except Exception:
        # Fallback to pure semantic search if strict where clause fails
        results = collection.query(query_texts=[query_text], n_results=n_results)

    matched_docs = results["documents"][0] if results and results.get("documents") else []
    matched_meta = results["metadatas"][0] if results and results.get("metadatas") else []

    client = get_groq_client()

    if not client:
        llm_summary = "LLM summary unavailable — no API key configured"
    else:
        events_str = "\n".join([f"- {doc}" for doc in matched_docs[:25]])
        summary_prompt = f"""
You are a CCTV Analytics Assistant. Summarize the following retrieved video surveillance events to directly answer the user query.

Instructions:
- Explicitly reference cross-camera sightings and unified person IDs (e.g. person_003) when the matched events span multiple cameras (e.g. cam_0 and cam_1).
- Provide a clear chronological summary or movement timeline if applicable.
- Keep the response concise and accurate based only on the provided evidence.

User Query: "{query_text}"

Retrieved Events:{events_str if events_str else "No events found."}
"""
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": summary_prompt}],
                temperature=0.2
            )
            llm_summary = response.choices[0].message.content.strip()
        except Exception as e:
            llm_summary = f"LLM summary generation failed: {str(e)}"

    return {
        "query": query_text,
        "parsed_filters": parsed_filters,
        "matched_events_count": len(matched_docs),
        "events": matched_meta,
        "documents": matched_docs,
        "summary": llm_summary
    }

if __name__ == "__main__":
    import sys
    q = sys.argv[1] if len(sys.argv) > 1 else "Where was person_003?"
    res = query_pipeline(q)
    print(f"\n--- Query: {res['query']} ---")
    print(f"Parsed Filters: {res['parsed_filters']}")
    print(f"Matched Events: {res['matched_events_count']}")
    print(f"\nLLM Summary:\n{res['summary']}\n")
