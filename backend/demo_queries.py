import os
from copilot_query import query_pipeline

DEMO_QUERIES = [
    "Show me everyone carrying a black suitcase",
    "Where was person_003 seen across all cameras?",
    "Show detections on cam_1 between 18:02 and 18:03",
    "Find anyone carrying a blue jacket",
    "Cross-camera re-identification summary"
]

def run_demo():
    print("=" * 80)
    print(" CCTV COPILOT ANALYTICS - DEMO RUNNER")
    print("=" * 80)

    api_key_status = "PRESENT" if os.getenv("GROQ_API_KEY") else "ABSENT (Running in fallback mode)"
    print(f"Groq API Key status: {api_key_status}\n")

    for idx, q_text in enumerate(DEMO_QUERIES, 1):
        print(f"\n{'='*80}")
        print(f"QUERY #{idx}: \"{q_text}\"")
        print(f"{'='*80}")

        res = query_pipeline(q_text)

        print(f"\n[1] Parsed Filters:")
        print(f"    {res['parsed_filters']}")

        print(f"\n[2] Matched Events Count: {res['matched_events_count']}")
        if res['matched_events_count'] > 0:
            print("    Sample matched event metadata:")
            for meta in res['events'][:3]:
                print(f"      - [{meta.get('timestamp')}] {meta.get('track_id')} on {meta.get('camera_id')} ({meta.get('object_color')} {meta.get('object_class')})")

        print(f"\n[3] LLM Summary:")
        print(f"    {res['summary']}")
        print("-" * 80)

if __name__ == "__main__":
    run_demo()
