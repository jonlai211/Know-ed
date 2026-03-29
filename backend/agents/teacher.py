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
    seed_q = term.questions[0] if term.questions else f"Why do you think we need {term.term}?"

    # The scenario contains the full worked example including the solution.
    # For the intro, only the PROBLEM SETUP should be visible — not the formula or answer.
    # Extract just the situation (e.g. "prediction=0.8, truth=1.0") not the calculation.

    if level in ("novice", "beginner"):
        style = f"""Structure (one message, max 6 sentences):
1. Open with a concrete, relatable failure or frustration — NOT a definition, NOT the term name.
   Put the student in the situation first. Good openers:
   - "Imagine you built something that guesses numbers, and it guessed {term.scenario.split('=')[0].strip() if term.scenario else 'something wrong'}…"
   - "You trained a model. It gave an answer. But how do you know if the answer is close enough or way off?"
   - Describe the gap/pain, not the solution.
2. Use only the PROBLEM PART of this scenario (the situation, not the formula or result): {term.scenario}
   Show the student the gap (e.g. predicted vs actual numbers) but do NOT compute or reveal the answer yet.
3. End with ONE intuition question — answerable with zero prior knowledge, just common sense.
   Seed idea: "{seed_q}"

FORBIDDEN in intro: the term name, any formula, any technical definition, the solution to the scenario."""

    elif level == "intermediate":
        style = f"""Structure (max 5 sentences):
1. Describe the concrete problem in one sentence — what breaks without this concept, outcome-focused, no jargon.
   Do NOT start with "The problem is that we need X" — that's a definition. Start with the situation.
   Good opener: "You have a prediction and a true answer. You want to know how wrong you are — but how?"
2. Use the PROBLEM SETUP from this scenario (situation + numbers only, NOT the formula or result): {term.scenario}
3. End with a WHY question that requires reasoning from the gap, not prior knowledge of the formula.
   Seed idea: "{seed_q}"

FORBIDDEN in intro: the formula, the computed result, any definition of "{term.term}"."""

    else:  # advanced
        style = f"""Structure (max 4 sentences):
1. State the design constraint or trade-off that motivated "{term.term}" — one sentence, mechanism-level.
   NOT "we need X" — frame it as a design decision: "To train via gradient descent, the error signal must satisfy…"
2. Scenario (full context is fine for advanced): {term.scenario}
3. A WHY/HOW question at the design or trade-off level.
   Seed idea: "{seed_q}"

Advanced students can see the full scenario — focus on motivating the design choice, not hiding the answer."""

    return f"""{TEACHER_PERSONA}

Opening lesson on "{term.term}".
Learning goal: {term.learning_goal}
Full scenario (use problem setup now; save the solution for later phases): {term.scenario}

{style}

Set next_phase: "socratic".
{OUTPUT_FORMAT}"""


def _socratic_prompt(term: SyllabusTerm, level: str, turn: int, is_stuck: bool, last_teacher_msg: str = "") -> str:
    max_turns = max(len(term.questions), 15)
    last_call = turn >= max_turns - 1

    # Map turn → teaching stage
    if turn <= 0:
        stage, stage_goal = "WHY", "why this concept is needed — build motivation before introducing the mechanism"
    elif turn <= 1:
        stage, stage_goal = "WHAT", "what this concept actually is — definition grounded in the scenario"
    elif turn <= 2:
        stage, stage_goal = "HOW", "how it works mechanically — probe the design, not just the label"
    else:
        stage, stage_goal = "APPLY", "apply it back to the opening scenario — close the loop"

    # Seed hint from pre-written questions (inspiration only, not verbatim)
    seed_idx = min(turn, len(term.questions) - 1) if term.questions else -1
    seed_hint = (
        f"\nSeed idea for your question (inspiration only — adapt to what the student just said): \"{term.questions[seed_idx]}\""
        if seed_idx >= 0 and not is_stuck else ""
    )

    # Level-specific questioning rules
    if level in ("novice", "beginner"):
        level_rules = """Questioning rules for NOVICE:
- Ask about phenomena, intuition, purpose — never assume technical prior knowledge
- No formulas; no jargon without an immediate plain-language gloss
- Every question must be answerable by reasoning from the scenario alone
- Good forms: "What would happen if…?", "Why do you think we need…?", "Looking at the numbers, what changes when…?" """
    elif level == "intermediate":
        level_rules = """Questioning rules for INTERMEDIATE:
- Light math intuition is fine (trends, ratios, input/output relationships)
- Name variables but explain their role in context
- Focus on mechanism and patterns, not just surface observation
- Good forms: "How would you express that gap as a number?", "What property should this quantity have?", "What does changing X do to Y?" """
    else:
        level_rules = """Questioning rules for ADVANCED:
- Assume solid prior knowledge; go straight to mechanism and trade-offs
- Ask about design choices, derivations, edge cases, comparisons to alternatives
- Good forms: "Why must this be differentiable?", "What breaks if this property doesn't hold?", "How does this compare to X approach?" """

    if is_stuck:
        stuck_block = f"""
⚠️ STUDENT SAID "idk" — they are stuck on your last question: "{last_teacher_msg}"

MANDATORY RESPONSE RULES (override everything else including final-turn instructions):
1. Do NOT say "You're right" or acknowledge any previous correct answer — the student just said they don't know
2. Do NOT give the full answer or explanation
3. Do NOT set next_phase to "direct" or "teach_back"
4. Do NOT repeat your previous question unchanged

Your only job: ask ONE short diagnostic question to find out WHERE they're stuck.
Choose the most natural one given the conversation:
- "Which part of my question didn't make sense — the word I used, the example, or what I was asking you to figure out?"
- "Is it the scenario that's unclear, or you see the scenario but don't know how to think about the answer?"
- "Is there a word in my question that you're not sure about?"

One sentence only. Set next_phase: "wait", score_delta: 0."""
    else:
        stuck_block = ""

    error_feedback = """
When the student's answer is wrong or only partially right:
1. Acknowledge the correct part specifically (not "good try" — name what they got right)
2. Name the exact gap: "The key issue is that you're treating X as Y"
3. Use a counter-example or consequence from the scenario to show why it doesn't hold
4. Ask a smaller follow-up question targeting that exact gap — do NOT re-ask the full question unchanged"""

    return f"""{TEACHER_PERSONA}
{stuck_block}
Teaching "{term.term}" | Stage: {stage} — {stage_goal}
Learning goal: {term.learning_goal}
Scenario (use this, never invent new numbers): {term.scenario}

{level_rules}

Turn {turn}/{max_turns}{"  ← FINAL TURN: wrap up this stage, then set next_phase: \"direct\"" if last_call and not is_stuck else ""}
{seed_hint}

How to respond (in order):
1. React to what the student just said — 1 honest sentence, specific to their words, no hollow praise
2. Generate ONE new question that fits the current STAGE and LEVEL
   - Adapt to their actual answer: if they got it right, go deeper; if partial, probe the gap; if wrong, apply error feedback below
   - Keep the scenario as the anchor
3. Never skip ahead to a later stage unprompted; never go back to an earlier stage

{error_feedback}

Phase transitions:
- Student demonstrates clear understanding of the learning goal → next_phase: "teach_back", score_delta: 10
- Solid partial answer → next_phase: "wait", score_delta: 5
- Stuck, wrong, or very short → next_phase: "wait", score_delta: 0
- Final turn → next_phase: "direct"
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


def _teach_back_prompt(term: SyllabusTerm, level: str, student_explanation: str | None) -> str:
    if student_explanation is None:
        if level in ("novice", "beginner", "intermediate"):
            structure_hint = ' Suggest this structure: "Cover why we needed it → what it is → how it works → how it applied to our example."'
        else:
            structure_hint = ""
        return f"""{TEACHER_PERSONA}

Ask the student to explain "{term.term}" in their own words as if teaching someone who has never heard of it.{structure_hint}
One sentence prompt only. Set next_phase: "wait".
{OUTPUT_FORMAT}"""
    else:
        return f"""{TEACHER_PERSONA}

Evaluate the student's teach-back for "{term.term}".
Core idea to verify: {term.learning_goal}
Student said: "{student_explanation}"

Check which elements they covered:
- WHY: did they say why it's needed?
- WHAT: did they describe what it is?
- HOW: did they explain how it works?
- USE: did they connect it to the scenario/example?

Scoring:
- Core idea covered + at least 2 of the 4 elements → 1 sentence of genuine acknowledgment, next_phase: "next_term", score_delta: 15
- Core idea present but gaps → name the specific missing element in 1 sentence, next_phase: "wait", score_delta: 5
- Core idea missing or says idk → give the correct explanation in 1-2 sentences, next_phase: "next_term", score_delta: 0
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
            return s in (
                "idk", "i don't know", "i dont know", "no idea", "don't know", "dont know",
                "not sure", "no clue", "have no idea", "no idea at all",
                "不知道", "不懂", "不清楚", "不会", "说不上来", "不太懂",
                "?", "??", "???",
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
        system = _socratic_prompt(term, level, socratic_turn, is_stuck, last_teacher_msg)
        history = _build_history(state)
        msgs = [SystemMessage(content=system)] + history + [HumanMessage(content=f"Continue the lesson. Turn {socratic_turn}.\n{JSON_REMINDER}")]

    elif phase == "direct":
        system = _direct_prompt(term, last_human)
        history = _build_history(state)
        msgs = [SystemMessage(content=system)] + history + [HumanMessage(content=f"Give the direct explanation.\n{JSON_REMINDER}")]

    elif phase == "teach_back":
        # Entering teach_back for first time (sentinel) → prompt student to explain
        if last_human_raw in ("__teach_back_start__", "__start__", ""):
            system = _teach_back_prompt(term, level, None)
            history = _build_history(state)
            msgs = [SystemMessage(content=system)] + history + [HumanMessage(content=f"Prompt for teach-back.\n{JSON_REMINDER}")]
        else:
            # Student has given their explanation — evaluate it
            system = _teach_back_prompt(term, level, last_human)
            msgs = [SystemMessage(content=system), HumanMessage(content=f"Evaluate the explanation.\n{JSON_REMINDER}")]
    else:
        system = _intro_prompt(term, level)
        msgs = [SystemMessage(content=system), HumanMessage(content=f"Begin the lesson.\n{JSON_REMINDER}")]

    return await invoke_with_retry(msgs, output_class=AgentOutput)
