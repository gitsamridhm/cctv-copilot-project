from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import Role C's existing query function
from copilot_query import run_copilot_query

app = FastAPI(title="CCTV Copilot API")

# Enable CORS so your React/Vite dev server (e.g., http://localhost:5173) can communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust origin URL if needed for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define request schema
class QueryRequest(BaseModel):
    query: str

@app.get("/")
def health_check():
    return {"status": "ok", "message": "CCTV Copilot API is running"}

@app.post("/api/query")
def process_query(request: QueryRequest):
    """
    Receives a prompt from the React frontend, passes it to Role C's 
    copilot query engine, and returns the LLM response + retrieved events.
    """
    try:
        response = run_copilot_query(request.query)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
