"""
Orchestrator — simple async state machine replacing LangGraph multi-agent routing.

Flow per term:
  intro → (student replies) → socratic (x≤4) → direct → teach_back → next_term
  At any point "I understand" button → teach_back
"""
from langchain_core.messages import AIMessage, HumanMessage
from graph.state import LearningState, AgentOutput, Syllabus
from agents.teacher import run_teacher
from graph.demo_orchestrator import demo_process_message


def _get_syllabus(state: LearningState) -> Syllabus:
    return Syllabus(**state["syllabus"])


def _advance_term(state: LearningState) -> dict:
    """Return state delta to move to next term (or chapter)."""
    syllabus = _get_syllabus(state)
    ch_idx = state["current_chapter_idx"]
    t_idx = state["current_term_idx"]

    chapter = syllabus.chapters[ch_idx]
    if t_idx + 1 < len(chapter.terms):
        return {"current_term_idx": t_idx + 1, "term_phase": "intro", "socratic_turn": 0}
    elif ch_idx + 1 < len(syllabus.chapters):
        return {"current_chapter_idx": ch_idx + 1, "current_term_idx": 0, "term_phase": "intro", "socratic_turn": 0}
    else:
        return {"term_phase": "intro", "socratic_turn": 0}  # course complete


async def process_message(state: LearningState, user_message: str, i_understand: bool = False) -> tuple[dict, AgentOutput]:
    if state.get("mode") == "demo":
        return await demo_process_message(state, user_message, i_understand)
    """
    Process one user message and return (state_delta, agent_output).
    i_understand=True means the student clicked the 'I understand' button.
    """
    # Add user message to state messages
    new_messages = list(state.get("messages", [])) + [HumanMessage(content=user_message)]
    state = {**state, "messages": new_messages}

    # Override phase if student clicked "I understand"
    # Use a sentinel message so teacher knows to prompt (not evaluate)
    entering_teach_back = i_understand and state["term_phase"] != "teach_back"
    if entering_teach_back:
        state = {**state, "term_phase": "teach_back"}
        # Replace user message with sentinel so teacher prompts instead of evaluating
        new_messages[-1] = type(new_messages[-1])(content="__teach_back_start__")
        state = {**state, "messages": new_messages}

    # Advance socratic turn counter before running (so teacher sees updated count)
    phase = state["term_phase"]
    socratic_turn = state.get("socratic_turn", 0)
    if phase == "socratic":
        state = {**state, "socratic_turn": socratic_turn + 1}

    # Run teacher
    output = await run_teacher(state)

    # Build AI message
    ai_message = AIMessage(
        content=output.message,
        additional_kwargs={"agent_id": "teacher"}
    )

    # Determine new score
    old_score = state.get("score", 20)
    new_score = max(0, min(100, old_score + output.score_delta))

    # Determine phase transition
    next_phase = output.next_phase
    # Determine final phase (always include in state_delta so it persists correctly)
    current_phase = state["term_phase"]  # already updated if i_understand
    if next_phase == "next_term":
        advance = _advance_term(state)
        final_phase = advance.get("term_phase", "intro")
        final_socratic_turn = advance.get("socratic_turn", 0)
        final_chapter_idx = advance.get("current_chapter_idx", state["current_chapter_idx"])
        final_term_idx = advance.get("current_term_idx", state["current_term_idx"])
    elif next_phase == "teach_back":
        final_phase, final_socratic_turn = "teach_back", 0
        final_chapter_idx = state["current_chapter_idx"]
        final_term_idx = state["current_term_idx"]
    elif next_phase == "direct":
        final_phase, final_socratic_turn = "direct", state.get("socratic_turn", 0)
        final_chapter_idx = state["current_chapter_idx"]
        final_term_idx = state["current_term_idx"]
    elif next_phase == "socratic":
        final_phase, final_socratic_turn = "socratic", 0
        final_chapter_idx = state["current_chapter_idx"]
        final_term_idx = state["current_term_idx"]
    else:  # "wait" — keep current phase
        final_phase = current_phase
        final_socratic_turn = state.get("socratic_turn", 0)
        final_chapter_idx = state["current_chapter_idx"]
        final_term_idx = state["current_term_idx"]

    state_delta: dict = {
        "messages": new_messages + [ai_message],
        "score": new_score,
        "term_phase": final_phase,
        "socratic_turn": final_socratic_turn,
        "current_chapter_idx": final_chapter_idx,
        "current_term_idx": final_term_idx,
        "pending_score_update": (
            {"delta": output.score_delta, "new_score": new_score, "reason": output.score_reason}
            if output.score_delta != 0 else None
        ),
    }

    return state_delta, output
