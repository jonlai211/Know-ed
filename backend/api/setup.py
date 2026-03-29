"""
Setup endpoints:
  POST /setup/topic   — initialize session from topic string (uses prebuilt syllabus)
  POST /setup/upload  — initialize session from uploaded PDF/text (not in scope for demo)
"""
import json
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db.session import save_session

router = APIRouter(prefix="/setup", tags=["setup"])

PREBUILT_SYLLABUS_DIR = Path(__file__).parent.parent / "graph" / "syllabus_data"
DEMO_SCRIPTS_DIR = Path(__file__).parent.parent / "graph" / "demo_scripts"

LEVEL_SCORES = {
    "beginner": 20,
    "intermediate": 40,
    "advanced": 70,
}


class TopicRequest(BaseModel):
    topic: str
    level: str = "beginner"       # beginner | intermediate | advanced
    mode: str = "ai"              # "ai" | "demo"
    start_chapter_idx: int = 0    # which chapter to start from


class SetupResponse(BaseModel):
    session_id: str
    syllabus: dict
    topic_summary: str
    initial_score: int


def _load_prebuilt_syllabus(topic: str) -> dict | None:
    slug = topic.lower().replace(" ", "_")
    path = PREBUILT_SYLLABUS_DIR / f"{slug}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _initial_state(session_id: str, topic: str, level: str, syllabus: dict, mode: str = "ai", start_chapter_idx: int = 0) -> dict:
    return {
        "messages": [],
        "session_id": session_id,
        "topic": topic,
        "level": level,
        "score": LEVEL_SCORES.get(level, 20),
        "syllabus": syllabus,
        "current_chapter_idx": start_chapter_idx,
        "current_term_idx": 0,
        "term_phase": "intro",
        "socratic_turn": 0,
        "mode": mode,
        "demo_turn_idx": 0,
        "pending_score_update": None,
    }


def _load_demo_script(topic: str) -> dict | None:
    slug = topic.lower().replace(" ", "_")
    path = DEMO_SCRIPTS_DIR / f"{slug}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _demo_script_to_syllabus(script: dict) -> dict:
    """Convert a demo script to the Syllabus format so the frontend works unchanged."""
    chapters = []
    for ch in script.get("chapters", []):
        terms = []
        for t in ch.get("terms", []):
            terms.append({
                "id": t["id"],
                "term": t["term"],
                "definition": "",
                "example": "",
                "exam_question": "",
                "learning_goal": "",
            })
        chapters.append({"id": ch["id"], "title": ch["title"], "terms": terms})
    return {
        "topic": script["topic"],
        "topic_summary": script.get("topic_summary", ""),
        "chapters": chapters,
    }


@router.post("/topic", response_model=SetupResponse)
async def setup_from_topic(req: TopicRequest):
    if req.level not in LEVEL_SCORES:
        raise HTTPException(status_code=400, detail=f"Invalid level: {req.level}")

    if req.mode == "demo":
        script = _load_demo_script(req.topic)
        if not script:
            raise HTTPException(status_code=404, detail=f"No demo script for topic: {req.topic}")
        syllabus = _demo_script_to_syllabus(script)
    else:
        syllabus = _load_prebuilt_syllabus(req.topic)
        if not syllabus:
            raise HTTPException(status_code=404, detail=f"No prebuilt syllabus for topic: {req.topic}")

    session_id = str(uuid.uuid4())
    state = _initial_state(session_id, req.topic, req.level, syllabus, mode=req.mode, start_chapter_idx=req.start_chapter_idx)
    save_session(session_id, state)

    return SetupResponse(
        session_id=session_id,
        syllabus=syllabus,
        topic_summary=syllabus.get("topic_summary", ""),
        initial_score=LEVEL_SCORES[req.level],
    )


@router.get("/preview/{topic}")
async def preview_topic(topic: str):
    """Return chapter list with hooks for the chapter-selection screen. No session created."""
    script = _load_demo_script(topic)
    if script:
        chapters = [
            {
                "id": ch["id"],
                "title": ch["title"],
                "hook": ch.get("hook", ""),
                "start_here_if": ch.get("start_here_if", ""),
                "term_count": len(ch.get("terms", [])),
            }
            for ch in script.get("chapters", [])
        ]
        return {"topic": script["topic"], "mode": "demo", "chapters": chapters}

    syllabus = _load_prebuilt_syllabus(topic)
    if syllabus:
        chapters = [
            {
                "id": ch["id"],
                "title": ch["title"],
                "hook": "",
                "start_here_if": "",
                "term_count": len(ch.get("terms", [])),
            }
            for ch in syllabus.get("chapters", [])
        ]
        return {"topic": syllabus["topic"], "mode": "ai", "chapters": chapters}

    raise HTTPException(status_code=404, detail=f"Topic not found: {topic}")
