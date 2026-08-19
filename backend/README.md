# Role C: Copilot & Retrieval Backend

CCTV Multi-Feed Object and Individual Tracking Analyst Copilot - backend for the
natural-language query engine using ChromaDB (vector search) and Groq (LLM parsing/summarization).

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Phase 1: Seed Chroma from the SQLite events DB

```bash
python seed_from_db.py
```

Indexes `db/pattern_of_life.db` into the `cctv_events` Chroma collection — this is the
one `copilot_query.py` actually queries.

## Phase 2: Query the Copilot

```bash
python demo_queries.py
```

Runs 5 canned natural-language queries through `query_pipeline()` in `copilot_query.py`
for a quick smoke test. There is no standalone CLI entry point in `copilot_query.py`
itself — import `query_pipeline(text)` directly to use it from other code (e.g.
`server.py`'s `/api/query` endpoint does exactly this).

## Architecture

```
Analyst Query --> [Groq Stage 1: Parser] --> Structured Filters + Query Text
                                                       |
                                                       v
Analyst Answer <-- [Groq Stage 2: Summarizer] <-- [Chroma Vector + Metadata Search]
```

- Embedding function: Chroma default (all-MiniLM-L6-v2 via sentence-transformers)
- LLM: Groq (llama-3.3-70b-versatile)
- Vector store: ChromaDB persistent local client

## Verify

```bash
python verify_setup.py
```

## Serve to the frontend

```bash
python server.py
```

Starts the FastAPI app (`/api/query`, `/api/identities`, `/api/person/{track_id}`,
`/api/frames/{camera_id}/{frame_ref}`) that the real React frontend
(`frontend/src/app/App.tsx`) calls.
