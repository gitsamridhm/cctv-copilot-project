"""
Role C — Copilot & Retrieval Backend
Phase 2: Dual-stage retrieval engine using Groq LLM + Chroma vector search.

Pipeline:
    Step 2.1  →  Stage 1 LLM: Metadata Parser (NL → structured JSON)
    Step 2.2  →  Hybrid Retrieval (Chroma metadata $and/$eq + semantic vector search)
    Step 2.3  →  Stage 2 LLM: Generation Pass (matched events → factual summary)
    Step 2.4  →  Public entry point: run_copilot_query(user_query)

Usage:
    python copilot_query.py "Show every time someone carrying a red backpack was near Camera 3 after 6pm"

    # Or import in Person D's Streamlit dashboard:
    from copilot_query import run_copilot_query
    result = run_copilot_query(st.text_input("Ask the copilot..."))
    st.write(result["summary"])
"""

import os
import json
import re
import chromadb
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# ── Configuration ────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "llama-3.3-70b-versatile"
PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "pattern_of_life")

# ── Clients ──────────────────────────────────────────────────────────────────
groq_client = Groq(api_key=GROQ_API_KEY)
chroma_client = chromadb.PersistentClient(path=PERSIST_DIR)
collection = chroma_client.get_or_create_collection(name=COLLECTION_NAME)


# ═════════════════════════════════════════════════════════════════════════════
# STEP 2.1 — STAGE 1 LLM: THE METADATA PARSER
# ═════════════════════════════════════════════════════════════════════════════

STAGE1_SYSTEM_PROMPT = """You are an analyst assistant for a CCTV pattern-of-life system.
Extract time range, camera ID, and object attributes from the analyst's question as structured JSON.

Never infer identity beyond what's in the object/appearance data provided.
Do not speculate. If a field is missing, return null.

Extract these fields:
- camera_id: string or null — e.g. "cam_03" (convert "Camera 3" → "cam_03")
- time_after: string or null — HH:MM in 24h format
- time_before: string or null — HH:MM in 24h format
- object_class: string or null — one of: backpack, tote_bag, briefcase, jacket, umbrella, none
- object_color: string or null — e.g. "red", "blue", "black", "yellow", "green"
- negate_object: boolean — true if analyst asks for people WITHOUT a carried object
- search_text: string — short rephrased query for semantic vector search

Respond ONLY with raw JSON. No explanation, no markdown, no code fences."""


def parse_analyst_query(user_query: str) -> dict:
    """
    Step 2.1: Takes the analyst's raw string input and passes it to the Groq LLM.
    The LLM acts as a deterministic parser, outputting only raw JSON with
    structured filters extracted from the natural-language query.
    """
    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": STAGE1_SYSTEM_PROMPT},
            {"role": "user", "content": f'Analyst query: "{user_query}"'},
        ],
        response_format={"type": "json_object"},
        temperature=0,  # deterministic — no creative guessing
    )
    return json.loads(response.choices[0].message.content)


# ═════════════════════════════════════════════════════════════════════════════
# STEP 2.2 — HYBRID RETRIEVAL FUNCTION
# ═════════════════════════════════════════════════════════════════════════════

def build_chroma_where(filters: dict):
    """
    Constructs a Chroma metadata query using native logical operators ($and, $eq).
    Hard-filters on camera_id, object_class, object_color, and negate_object
    so that "Camera 3" returns ONLY cam_03 events, while the semantic query
    ("crimson bag") still matches "red backpack" via vector similarity.
    """
    conditions = []
    if filters.get("camera_id"):
        conditions.append({"camera_id": {"$eq": filters["camera_id"]}})
    if filters.get("object_class"):
        conditions.append({"object_class": {"$eq": filters["object_class"]}})
    if filters.get("object_color"):
        conditions.append({"object_color": {"$eq": filters["object_color"]}})
    if filters.get("negate_object"):
        conditions.append({"object_class": {"$eq": "none"}})

    if len(conditions) == 0:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def hybrid_retrieve(filters: dict, n_results: int = 20) -> list:
    """
    Step 2.2: Parses the JSON from Step 2.1 and queries Chroma with BOTH
    a semantic text search (vector similarity) AND hard metadata filters ($and/$eq).
    Also applies post-retrieval time-range filtering since Chroma's where clause
    doesn't natively support time comparisons.
    """
    search_text = filters.get("search_text", "")
    where_clause = build_chroma_where(filters)

    results = collection.query(
        query_texts=[search_text] if search_text else None,
        n_results=n_results,
        where=where_clause,
    )

    events = []
    time_after = filters.get("time_after")
    time_before = filters.get("time_before")

    for doc, meta, dist in zip(
        results["documents"][0] if results["documents"] else [],
        results["metadatas"][0] if results["metadatas"] else [],
        results["distances"][0] if results["distances"] else [],
    ):
        # Post-retrieval time filtering (Chroma where doesn't support time ranges)
        if time_after or time_before:
            ts = meta.get("timestamp", "")
            if ts:
                hour_min = ts[11:16]  # Extract HH:MM from ISO timestamp
                if time_after and hour_min < time_after:
                    continue
                if time_before and hour_min > time_before:
                    continue

        events.append({
            "document": doc,
            "metadata": meta,
            "distance": dist,
        })

    return events


# ═════════════════════════════════════════════════════════════════════════════
# STEP 2.3 — STAGE 2 LLM: THE GENERATION PASS
# ═════════════════════════════════════════════════════════════════════════════

STAGE2_SYSTEM_PROMPT = """Based on the following verified tracking logs, synthesize a highly concise,
factual summary answering the analyst's query.

Rules:
- Provide specific timestamps and camera identifiers.
- Reference track IDs when mentioning individuals.
- Never infer or invent names, genders, or intent.
- If data is ambiguous, state that clearly to the analyst.
- If no events match, say so explicitly.
- Keep it under 200 words."""


def generate_summary(user_query: str, matched_events: list) -> str:
    """
    Step 2.3: Takes the raw metadata matches from Chroma, formats them into a
    clean text block, and passes it back to Groq with a generation prompt to
    produce a factual, concise summary for the analyst.
    """
    if not matched_events:
        events_text = "No matching events found."
    else:
        events_text = "\n".join(
            f"[{e['metadata'].get('track_id', 'unknown')}] {e['document']}"
            for e in matched_events
        )

    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": STAGE2_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f'Analyst question: "{user_query}"\n\n'
                    f"Matching tracking logs ({len(matched_events)} results):\n{events_text}"
                ),
            },
        ],
        temperature=0.3,  # slightly creative but grounded in the data
    )
    return response.choices[0].message.content


# ═════════════════════════════════════════════════════════════════════════════
# STEP 2.4 — PUBLIC ENTRY POINT (for Person D's Streamlit dashboard)
# ═════════════════════════════════════════════════════════════════════════════

def run_copilot_query(user_query: str) -> dict:
    """
    Single entry point for Person D's dashboard.
    Orchestrates the full dual-stage pipeline:

        user_query → [Stage 1: Groq parser] → filters
                   → [Step 2.2: Chroma hybrid retrieval] → matched events
                   → [Stage 2: Groq summarizer] → final summary

    Returns a dict with: query, parsed_filters, matched_events, summary, match_count.
    """
    # Step 2.1: Parse natural language → structured JSON filters
    filters = parse_analyst_query(user_query)
    if filters.get("camera_id"):
        cam = str(filters["camera_id"]).lower()
        match = re.search(r'\d+' , cam)
        if match:
            cam_num = int(match.group())
            filters["camera_id"] = f"cam_{cam_num}"

    # Step 2.2: Hybrid retrieval (semantic + metadata filtering)
    matched = hybrid_retrieve(filters)

    # Step 2.3: Generate factual summary from matched events
    summary = generate_summary(user_query, matched)

    return {
        "query": user_query,
        "parsed_filters": filters,
        "matched_events": matched,
        "summary": summary,
        "match_count": len(matched),
    }


# ═════════════════════════════════════════════════════════════════════════════
# CLI ENTRY POINT
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    query = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "Show every time someone carrying a red backpack was near Camera 3 after 6pm"
    )

    print("=" * 70)
    print(f"ANALYST QUERY: {query}")
    print("=" * 70)

    result = run_copilot_query(query)

    print(f"\n{'─' * 70}")
    print("STEP 2.1 — STAGE 1 LLM OUTPUT (PARSED FILTERS):")
    print("─" * 70)
    print(json.dumps(result["parsed_filters"], indent=2))

    print(f"\n{'─' * 70}")
    print(f"STEP 2.2 — HYBRID RETRIEVAL RESULTS ({result['match_count']} matches):")
    print("─" * 70)
    for e in result["matched_events"]:
        print(f"  [{e['metadata']['track_id']}] {e['document']}")
        print(f"    camera={e['metadata']['camera_id']}  "
              f"time={e['metadata']['timestamp']}  "
              f"color={e['metadata']['object_color']}  "
              f"distance={e['distance']:.4f}")

    print(f"\n{'─' * 70}")
    print("STEP 2.3 — STAGE 2 LLM OUTPUT (COPILOT SUMMARY):")
    print("─" * 70)
    print(result["summary"])
    print()
