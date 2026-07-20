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

## Phase 1: Initialize & Seed Chroma (Day 1)

```bash
python seed_chroma.py
```

## Phase 2: Query the Copilot (Day 2)

```bash
python copilot_query.py "Show every time someone carrying a red backpack was near Camera 3 after 6pm"
```

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

## Connect to Person D's Dashboard

```python
from copilot_query import run_copilot_query
result = run_copilot_query(st.text_input("Ask the copilot..."))
st.write(result["summary"])
```
