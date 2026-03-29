"""
Chat endpoint with SSE streaming.
POST /chat          — send a message, get SSE stream back
GET  /session/{id}  — restore session state (on page refresh)

SSE event types:
  agent_message   — teacher's message
  score_update    — {delta, new_score, reason}
  phase_update    — {term_phase, chapter_idx, term_idx, term_id, term_name}
  done            — stream complete
  error           — something went wrong
"""
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from graph.orchestrator import process_message
from graph.state import Syllabus
from db.session import load_session, save_session

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str
    message: str
    i_understand: bool = False  # student clicked "I understand" button


async def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_response(session_id: str, user_message: str, i_understand: bool):
    state = load_session(session_id)
    if state is None:
        yield await _sse("error", {"message": "Session not found"})
        return

    try:
        state_delta, output = await process_message(state, user_message, i_understand)

        # Merge updated state
        updated_state = {**state, **state_delta}

        # Send teacher message
        yield await _sse("agent_message", {
            "agent_id": "teacher",
            "content": output.message,
        })

        # Send score update if any
        if updated_state.get("pending_score_update"):
            yield await _sse("score_update", updated_state["pending_score_update"])

        # Send phase update
        syllabus = Syllabus(**updated_state["syllabus"])
        ch_idx = updated_state["current_chapter_idx"]
        t_idx = updated_state["current_term_idx"]
        chapter = syllabus.chapters[ch_idx] if ch_idx < len(syllabus.chapters) else None
        term = chapter.terms[t_idx] if chapter and t_idx < len(chapter.terms) else None

        yield await _sse("phase_update", {
            "term_phase": updated_state["term_phase"],
            "chapter_idx": ch_idx,
            "term_idx": t_idx,
            "chapter_title": chapter.title if chapter else "",
            "term_id": term.id if term else "",
            "term_name": term.term if term else "",
            "score": updated_state["score"],
        })

        # Persist
        updated_state["pending_score_update"] = None
        save_session(session_id, updated_state)

    except Exception as e:
        yield await _sse("error", {"message": str(e)})

    yield await _sse("done", {})


@router.post("/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        stream_response(req.session_id, req.message, req.i_understand),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    state = load_session(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found")

    syllabus = Syllabus(**state["syllabus"])
    ch_idx = state["current_chapter_idx"]
    t_idx = state["current_term_idx"]
    chapter = syllabus.chapters[ch_idx] if ch_idx < len(syllabus.chapters) else None
    term = chapter.terms[t_idx] if chapter and t_idx < len(chapter.terms) else None

    messages = [
        {
            "type": m.type,
            "content": m.content,
            "agent_id": getattr(m, "additional_kwargs", {}).get("agent_id"),
        }
        for m in state["messages"]
        if m.content != "__start__"
    ]

    return {
        "session_id": session_id,
        "topic": state.get("topic", ""),
        "level": state.get("level", "beginner"),
        "score": state.get("score", 20),
        "syllabus": state["syllabus"],
        "messages": messages,
        "term_phase": state.get("term_phase"),
        "current_chapter_idx": ch_idx,
        "current_term_idx": t_idx,
        "current_term": term.model_dump() if term else None,
    }
