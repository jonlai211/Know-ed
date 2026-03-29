"""
Teacher Agent — single agent with 4 modes.

Mode "intro":      Opens a new term: narrative hook → what problem this solves → introduce term → first question.
Mode "socratic":   Guides student toward the learning_goal with focused questions (max 6 rounds).
Mode "direct":     Gives a clear, complete explanation without holding back.
Mode "teach_back": Feynman-style — asks student to explain the term, then evaluates.
"""
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from agents.base import invoke_with_retry, JSON_REMINDER
from graph.state import LearningState, AgentOutput, Syllabus, SyllabusTerm

TEACHER_PERSONA = """You are a patient, engaging tutor who genuinely cares about student understanding.
You keep responses SHORT — 3 sentences max per section.
Never use hollow affirmations like "Exactly!", "Great!", "Good question!" when the student didn't say anything correct.
Match your tone to what the student actually said."""

OUTPUT_FORMAT = """
CRITICAL: Reply ONLY with a valid JSON object:
{
  "message": "your response to the student",
  "next_phase": "wait",
  "score_delta": 0,
  "score_reason": ""
}

next_phase options:
- "wait"       → waiting for student's response
- "socratic"   → (from intro) intro done, first question asked, start socratic mode
- "teach_back" → student reached the learning goal, move to teach-back
- "direct"     → (from socratic) student is stuck after max turns, explain directly
- "next_term"  → student passed teach-back, move to next term

score_delta: integer points (5-10 for good answers, 15 for passing teach-back, 0 otherwise)
score_reason: one short phrase, empty string if delta=0
"""


def _intro_prompt(term: SyllabusTerm, level: str) -> str:
    first_question = term.questions[0] if term.questions else f"What do you think {term.term} means?"
    scenario_note = f"\nUse this exact scenario throughout the lesson: {term.scenario}" if term.scenario else ""

    if level == "beginner":
        style = f"""Do these things in order (all in one message):
1. Start with a 1-2 sentence narrative: what real problem people faced that made "{term.term}" necessary.
2. Set up this exact scenario with the specific numbers: {term.scenario}
3. Introduce "{term.term}" as the solution in one sentence.
4. End with this exact question (copy it word for word): "{first_question}"

Set next_phase: "socratic".
Keep the whole message under 6 sentences."""
    else:
        style = f"""Do these things in order:
1. One sentence on what problem "{term.term}" solves.
2. Set up this scenario: {term.scenario}
3. Ask this question: "{first_question}"

Set next_phase: "socratic". Keep under 4 sentences."""

    return f"""{TEACHER_PERSONA}

You are starting a lesson on "{term.term}".
Learning goal: {term.learning_goal}
{scenario_note}

{style}
{OUTPUT_FORMAT}"""


def _socratic_prompt(term: SyllabusTerm, turn: int, is_stuck: bool, last_teacher_msg: str = "") -> str:
    max_turns = len(term.questions) if term.questions else 6
    turns_left = max_turns - turn
    last_call = turn >= max_turns - 1

    # Pick the next pre-written question (turn is 1-indexed when called)
    next_q_idx = min(turn, len(term.questions) - 1) if term.questions else -1
    next_question = f'\nNext question to ask (use it, you may lightly rephrase for flow): "{term.questions[next_q_idx]}"' if next_q_idx >= 0 and not is_stuck else ""

    stuck_instruction = ""
    if is_stuck:
        prev_q_context = f'The question the student is stuck on: "{last_teacher_msg}"\n' if last_teacher_msg else ""
        stuck_instruction = f"""
⚠️ STUDENT IS STUCK (said "idk" or very short answer).
{prev_q_context}Give a one-sentence concrete hint using numbers from the scenario ({term.scenario}), then re-ask the same question in a simpler way.
Do NOT move to the next question yet. Do NOT introduce new numbers or a new scenario."""

    return f"""{TEACHER_PERSONA}

You are continuing a lesson on "{term.term}".
LEARNING GOAL: {term.learning_goal}
Scenario (the one example to use throughout): {term.scenario}

Turn: {turn}/{max_turns}{"  ← LAST TURN: give the answer directly, next_phase: direct" if last_call else f"  ({turns_left} left)"}
{next_question}
{stuck_instruction}

Rules:
- ALWAYS refer back to the scenario above — never invent new numbers or a new example
- Respond to the student's answer first (1 sentence), then ask the next question
- If student's answer reaches the learning goal → next_phase: "teach_back", score_delta: 10
- If student shows partial understanding → next_phase: "wait", score_delta: 5
- If student is stuck → give hint + re-ask same question, score_delta: 0, next_phase: "wait"
- If this is the last turn → give the answer directly, next_phase: "direct"
- Otherwise → next_phase: "wait"
{OUTPUT_FORMAT}"""


def _direct_prompt(term: SyllabusTerm, last_student_msg: str) -> str:
    return f"""{TEACHER_PERSONA}

The student has struggled with "{term.term}". Give a clear complete explanation now — no more questions.

Definition: {term.definition}
Example: {term.example}
Learning goal: {term.learning_goal}

Explain in 2-3 sentences using the example. End with: "Click 'I understand' when you're ready to explain it back."
Set next_phase: "wait", score_delta: 0.
{OUTPUT_FORMAT}"""


def _teach_back_prompt(term: SyllabusTerm, student_explanation: str | None) -> str:
    if student_explanation is None:
        return f"""{TEACHER_PERSONA}

Ask the student to explain "{term.term}" in their own words. One sentence only.
Example: "Now explain [term] to me as if I've never heard of it."
Set next_phase: "wait".
{OUTPUT_FORMAT}"""
    else:
        # Simplified evaluation for speed
        return f"""{TEACHER_PERSONA}

Evaluate if the student's explanation of "{term.term}" captures the core idea.
Core idea to check: {term.learning_goal}
Student said: "{student_explanation}"

- Captures core idea → 1 sentence acknowledgment, next_phase: "next_term", score_delta: 15
- Partially correct → correct the specific gap in 1 sentence, next_phase: "wait", score_delta: 5
- Can't explain or says "idk" → give the correct explanation in 1-2 sentences, next_phase: "next_term", score_delta: 0
{OUTPUT_FORMAT}"""


def _get_current_term(state: LearningState) -> SyllabusTerm | None:
    syllabus = Syllabus(**state["syllabus"])
    ch_idx = state["current_chapter_idx"]
    t_idx = state["current_term_idx"]
    if ch_idx >= len(syllabus.chapters):
        return None
    chapter = syllabus.chapters[ch_idx]
    if t_idx >= len(chapter.terms):
        return None
    return chapter.terms[t_idx]


def _detect_stuck(state: LearningState) -> bool:
    """Return True if the last student message looks like a stuck response."""
    messages = state.get("messages", [])
    for m in reversed(messages):
        if hasattr(m, "type") and m.type == "human" and m.content not in ("__start__", "__teach_back_start__"):
            s = m.content.strip().lower()
            return (
                s in ("idk", "i don't know", "i dont know", "no idea", "不知道", "不懂", "?", "??")
                or len(s) <= 8
            )
    return False


def _build_history(state: LearningState) -> list:
    """Convert state messages to LangChain message list, filtering sentinels."""
    history = []
    for m in state.get("messages", []):
        if not hasattr(m, "type"):
            continue
        if m.type == "human":
            if m.content in ("__start__", "__teach_back_start__"):
                continue
            history.append(HumanMessage(content=m.content))
        elif m.type == "ai":
            history.append(AIMessage(content=m.content))
    return history


async def run_teacher(state: LearningState) -> AgentOutput:
    term = _get_current_term(state)
    if term is None:
        return AgentOutput(
            message="You've completed the entire course! Excellent work.",
            next_phase="wait",
            score_delta=20,
            score_reason="Completed all terms"
        )

    phase = state["term_phase"]
    level = state["level"]
    socratic_turn = state.get("socratic_turn", 0)

    raw_messages = state.get("messages", [])

    # Raw last human message (including sentinels) — used to detect teach_back entry
    last_human_raw = ""
    for m in reversed(raw_messages):
        if hasattr(m, "type") and m.type == "human":
            last_human_raw = m.content
            break

    # Last human message excluding sentinels — the student's actual words
    last_human = ""
    for m in reversed(raw_messages):
        if hasattr(m, "type") and m.type == "human" and m.content not in ("__start__", "__teach_back_start__"):
            last_human = m.content
            break

    # Get last teacher message (for stuck hint context)
    last_teacher_msg = ""
    for m in reversed(raw_messages):
        if hasattr(m, "type") and m.type == "ai":
            last_teacher_msg = m.content
            break

    is_stuck = _detect_stuck(state) if phase == "socratic" else False

    if phase == "intro":
        system = _intro_prompt(term, level)
        msgs = [SystemMessage(content=system), HumanMessage(content=f"Begin the lesson on {term.term}.\n{JSON_REMINDER}")]

    elif phase == "socratic":
        system = _socratic_prompt(term, socratic_turn, is_stuck, last_teacher_msg)
        history = _build_history(state)
        msgs = [SystemMessage(content=system)] + history + [HumanMessage(content=f"Continue the lesson. Turn {socratic_turn}.\n{JSON_REMINDER}")]

    elif phase == "direct":
        system = _direct_prompt(term, last_human)
        history = _build_history(state)
        msgs = [SystemMessage(content=system)] + history + [HumanMessage(content=f"Give the direct explanation.\n{JSON_REMINDER}")]

    elif phase == "teach_back":
        # Entering teach_back for first time (sentinel) → prompt student to explain
        if last_human_raw in ("__teach_back_start__", "__start__", ""):
            system = _teach_back_prompt(term, None)
            history = _build_history(state)
            msgs = [SystemMessage(content=system)] + history + [HumanMessage(content=f"Prompt for teach-back.\n{JSON_REMINDER}")]
        else:
            # Student has given their explanation — evaluate it
            system = _teach_back_prompt(term, last_human)
            msgs = [SystemMessage(content=system), HumanMessage(content=f"Evaluate the explanation.\n{JSON_REMINDER}")]
    else:
        system = _intro_prompt(term, level)
        msgs = [SystemMessage(content=system), HumanMessage(content=f"Begin the lesson.\n{JSON_REMINDER}")]

    return await invoke_with_retry(msgs, output_class=AgentOutput)
