"""
Demo orchestrator — fully scripted, no AI calls.

Routing per student message:
  - stuck   : short reply or "idk" → on_stuck response, stay on same turn
  - correct : any keyword found in message → on_correct response, advance turn
  - partial : everything else → on_partial response, stay on same turn

Turn flow per term:
  intro → turns[0] → turns[1] → ... → turns[n] → teach_back → next_term
  "I understand" at any point → jump to teach_back
"""
import json
import asyncio
from pathlib import Path
from graph.state import AgentOutput

THINKING_DELAY = 1.5  # seconds — makes the "thinking..." animation visible

DEMO_SCRIPTS_DIR = Path(__file__).parent / "demo_scripts"

_script_cache: dict[str, dict] = {}


def _load_script(topic: str) -> dict:
    slug = topic.lower().replace(" ", "_")
    if slug not in _script_cache:
        path = DEMO_SCRIPTS_DIR / f"{slug}.json"
        if not path.exists():
            raise FileNotFoundError(f"No demo script for topic: {topic}")
        _script_cache[slug] = json.loads(path.read_text())
    return _script_cache[slug]


def _get_term_script(script: dict, chapter_idx: int, term_idx: int) -> dict | None:
    try:
        return script["chapters"][chapter_idx]["terms"][term_idx]
    except (IndexError, KeyError):
        return None


def _is_stuck(message: str) -> bool:
    s = message.strip().lower()
    return (
        s in ("idk", "i don't know", "i dont know", "no idea", "not sure", "?", "??", "hmm")
        or len(s) <= 8
    )


def _is_correct(message: str, keywords: list[str]) -> bool:
    msg_lower = message.lower()
    return any(kw.lower() in msg_lower for kw in keywords)


def _advance_term(script: dict, chapter_idx: int, term_idx: int) -> dict:
    """Return state delta to move to next term."""
    try:
        chapter = script["chapters"][chapter_idx]
        if term_idx + 1 < len(chapter["terms"]):
            return {"current_chapter_idx": chapter_idx, "current_term_idx": term_idx + 1,
                    "term_phase": "intro", "demo_turn_idx": 0}
        elif chapter_idx + 1 < len(script["chapters"]):
            return {"current_chapter_idx": chapter_idx + 1, "current_term_idx": 0,
                    "term_phase": "intro", "demo_turn_idx": 0}
        else:
            # Course complete — stay on last state, phase signals completion
            return {"current_chapter_idx": chapter_idx, "current_term_idx": term_idx,
                    "term_phase": "intro", "demo_turn_idx": 0}
    except (IndexError, KeyError):
        return {"current_chapter_idx": chapter_idx, "current_term_idx": term_idx,
                "term_phase": "intro", "demo_turn_idx": 0}


async def demo_process_message(
    state: dict,
    user_message: str,
    i_understand: bool = False,
) -> tuple[dict, AgentOutput]:
    """
    Process one student message in demo mode.
    Returns (state_delta, agent_output) — same interface as the AI orchestrator.
    """
    topic = state["topic"]
    script = _load_script(topic)

    ch_idx = state["current_chapter_idx"]
    t_idx = state["current_term_idx"]
    phase = state["term_phase"]
    turn_idx = state.get("demo_turn_idx", 0)
    old_score = state.get("score", 20)

    term = _get_term_script(script, ch_idx, t_idx)

    # Add thinking delay for all phases except intro (which auto-triggers on term start)
    if phase != "intro":
        await asyncio.sleep(THINKING_DELAY)

    # ── Course complete ────────────────────────────────────────────────────────
    if term is None:
        output = AgentOutput(
            message="You've completed the entire course! Excellent work.",
            next_phase="wait",
            score_delta=20,
            score_reason="Course complete",
        )
        return {"score": min(100, old_score + 20)}, output

    # ── I understand → jump to teach_back ─────────────────────────────────────
    if i_understand and phase != "teach_back":
        output = AgentOutput(
            message=term["teach_back_prompt"],
            next_phase="wait",
            score_delta=0,
            score_reason="",
        )
        delta = {
            "term_phase": "teach_back",
            "demo_turn_idx": turn_idx,
            "score": old_score,
            "pending_score_update": None,
        }
        return delta, output

    # ── Intro phase ───────────────────────────────────────────────────────────
    if phase == "intro":
        output = AgentOutput(
            message=term["intro"],
            next_phase="wait",
            score_delta=0,
            score_reason="",
        )
        delta = {
            "term_phase": "socratic",
            "demo_turn_idx": 0,
            "score": old_score,
            "pending_score_update": None,
        }
        return delta, output

    # ── Teach-back phase ──────────────────────────────────────────────────────
    if phase == "teach_back":
        tb_keywords = term.get("teach_back_keywords", [])
        if _is_stuck(user_message) or not _is_correct(user_message, tb_keywords):
            score_delta = term.get("score_teach_back_fail", 0)
            response = term["teach_back_fail"]
        else:
            score_delta = term.get("score_teach_back_pass", 15)
            response = term["teach_back_pass"]

        new_score = min(100, old_score + score_delta)
        advance = _advance_term(script, ch_idx, t_idx)

        output = AgentOutput(
            message=response,
            next_phase="wait",
            score_delta=score_delta,
            score_reason="Teach-back" if score_delta > 0 else "",
        )
        delta = {
            **advance,
            "score": new_score,
            "pending_score_update": (
                {"delta": score_delta, "new_score": new_score, "reason": "Teach-back"}
                if score_delta > 0 else None
            ),
        }
        return delta, output

    # ── Socratic phase ────────────────────────────────────────────────────────
    turns = term.get("turns", [])

    # Guard: no turns defined — skip straight to teach_back
    if not turns:
        output = AgentOutput(
            message=term["teach_back_prompt"],
            next_phase="wait",
            score_delta=0,
            score_reason="",
        )
        return {"term_phase": "teach_back", "demo_turn_idx": 0, "score": old_score,
                "pending_score_update": None}, output

    current_turn = turns[min(turn_idx, len(turns) - 1)]
    keywords = current_turn.get("keywords", [])

    if _is_stuck(user_message):
        response = current_turn["on_stuck"]
        score_delta = 0
        next_turn_idx = turn_idx  # stay on same question
    elif _is_correct(user_message, keywords):
        response = current_turn["on_correct"]
        score_delta = current_turn.get("score_correct", 5)
        next_turn_idx = turn_idx + 1  # advance
    else:
        response = current_turn["on_partial"]
        score_delta = current_turn.get("score_partial", 2)
        next_turn_idx = turn_idx  # stay on same question

    new_score = min(100, old_score + score_delta)

    # After last turn → teach_back
    if next_turn_idx >= len(turns):
        next_phase = "teach_back"
        next_turn_idx = 0
        # Append teach_back prompt to the response
        response = response + "\n\n" + term["teach_back_prompt"]
    else:
        next_phase = "socratic"

    output = AgentOutput(
        message=response,
        next_phase="wait",
        score_delta=score_delta,
        score_reason="Good answer" if score_delta >= 5 else "",
    )
    delta = {
        "term_phase": next_phase,
        "demo_turn_idx": next_turn_idx,
        "score": new_score,
        "pending_score_update": (
            {"delta": score_delta, "new_score": new_score, "reason": "Good answer"}
            if score_delta > 0 else None
        ),
    }
    return delta, output
