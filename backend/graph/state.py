from typing import Literal, Optional, Any
from pydantic import BaseModel
from langgraph.graph import MessagesState


# ── Syllabus structures ────────────────────────────────────────────────────────

class SyllabusTerm(BaseModel):
    id: str
    term: str
    definition: str
    example: str
    exam_question: str
    learning_goal: str = ""
    intro_text: str = ""
    key_concepts: list[str] = []
    misconceptions: list[str] = []
    scenario: str = ""        # the single concrete example used throughout the lesson
    questions: list[str] = [] # pre-written progressive questions for socratic phase


class SyllabusChapter(BaseModel):
    id: str
    title: str
    hook: str = ""
    start_here_if: str = ""
    terms: list[SyllabusTerm]


class Syllabus(BaseModel):
    topic: str
    topic_summary: str
    chapters: list[SyllabusChapter]


# ── Agent output ───────────────────────────────────────────────────────────────

class AgentOutput(BaseModel):
    message: str
    # phase transition: what should happen next
    next_phase: Literal["socratic", "direct", "teach_back", "wait", "next_term"] = "wait"
    # score delta (+/- points), 0 if no change
    score_delta: int = 0
    score_reason: str = ""


# ── Main learning state ────────────────────────────────────────────────────────

class LearningState(MessagesState):
    # Session metadata
    session_id: str
    topic: str

    # Student level & score
    level: Literal["beginner", "intermediate", "advanced"]
    score: int  # 0-100

    # Syllabus navigation
    syllabus: dict  # raw dict, serialized from Syllabus
    current_chapter_idx: int
    current_term_idx: int

    # Teaching phase for current term
    # intro → socratic (x4 max) → direct → teach_back → next_term
    term_phase: Literal["intro", "socratic", "direct", "teach_back"]
    socratic_turn: int  # 0-4

    # Session mode
    mode: str  # "ai" | "demo"

    # Demo mode: current question index within the term
    demo_turn_idx: int

    # Pending SSE events for frontend
    pending_score_update: Optional[dict]  # {delta, new_score, reason}
