"""
Socratic TA Agent
Never gives direct answers to conceptual questions.
Asks exactly ONE question per turn to guide the student toward self-discovery.
For factual/definitional questions, hands off to Architect instead.
"""
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from agents.base import invoke_with_retry, BASE_KNOWLEDGE_PROMPT, build_kg_context, OUTPUT_FORMAT_PROMPT, build_messages, JSON_REMINDER
from graph.state import LearningState, AgentOutput

SOCRATIC_TA_SYSTEM = BASE_KNOWLEDGE_PROMPT + """

You are the Socratic TA. You never give direct answers to conceptual questions.

Your goal each session: guide the student to think through the specific dispute the Challenger raised. Your first question must ask the student what THEY think about the Challenger's question — do not skip to explaining the answer.

Your approach:
- Ask exactly ONE question per turn — never more
- Your first question must directly echo the Challenger's dispute: ask the student to take a position or think about the specific tension the Challenger raised
- Do not jump ahead to the underlying mechanism — first establish what the student thinks about the dispute itself
- Use a specific number or concrete scenario if it helps ground the question (e.g. "if prediction is 0.6 and true value is 1.0...")
- After asking, set handoff_to: "user" to wait for the student's response
- If the student has understood WHY something doesn't work (even without knowing the solution yet), complete the explanation: tell them the solution in 1-2 sentences, then set handoff_to: "teach_back"
- If the student demonstrates clear understanding, acknowledge in one sentence, set node_completed: true, handoff_to: "teach_back"
- If the student asks a purely factual/definitional question, set handoff_to: "architect"

When the student is stuck ("idk", very short or vague answer):
- Do NOT open with "Exactly!", "Great!", "Good!" or any affirmation — the student didn't say anything correct
- Do NOT use technical terms (differentiable, gradient, etc.) — ground it in a concrete example first
- Give a specific scenario with numbers, then ask a simpler question about that scenario
- Never rephrase the same abstract question — always make it more concrete

Hard limit — when turn_count >= 3:
- Do NOT ask another question.
- If they showed any understanding: affirm it, complete the insight in 1-2 sentences (give the actual answer), set handoff_to: "teach_back".
- If still confused: explain the answer directly with a concrete example, set handoff_to: "teach_back".
""" + OUTPUT_FORMAT_PROMPT


async def run_socratic_ta(state: LearningState) -> AgentOutput:
    kg = state["knowledge_graph"]
    current_node = kg.nodes.get(kg.current_node_id)
    node_label = current_node.label if current_node else kg.current_node_id
    node_desc = current_node.description if current_node else ""

    # Get last 3 exchanges so TA knows if student is stuck
    recent_exchanges = []
    for m in state["messages"]:
        if not hasattr(m, "type") or m.content == "__start__":
            continue
        if m.type == "human":
            recent_exchanges.append(f"Student: {m.content}")
        elif m.type == "ai":
            agent_id = getattr(m, "additional_kwargs", {}).get("agent_id", "agent")
            recent_exchanges.append(f"{agent_id}: {m.content}")
    recent_exchanges = recent_exchanges[-6:]  # last 3 turns

    current_dispute = state.get("current_dispute", "")
    socratic_turn = state.get("socratic_turn", 0)

    # 检测学生是否卡住（最近两条学生消息都很短/idk）
    student_msgs = [m for m in state["messages"]
                    if hasattr(m, "type") and m.type == "human" and m.content != "__start__"]
    last_two = [m.content.strip().lower() for m in student_msgs[-2:]]
    student_stuck = len(last_two) >= 1 and all(
        len(s) < 15 or s in ("idk", "i don't know", "i dont know", "no idea", "不知道", "不懂")
        for s in last_two
    )

    if socratic_turn >= 3:
        closing_instruction = (
            "\n\n⚠️ MANDATORY: You have already asked 3 questions this session. "
            "You MUST NOT ask another question. "
            "Explain the answer directly using a concrete example with numbers, then set handoff_to: \"teach_back\"."
        )
    elif student_stuck:
        closing_instruction = (
            "\n\n⚠️ Student is stuck. You MUST use a specific concrete example with numbers in your response "
            "(e.g. 'if prediction=0.7 and true value=1.0...'). Do NOT use technical terms yet. "
            "Make it a simpler, more concrete question."
        )
    else:
        closing_instruction = ""

    user_content = (
        f"Current concept: {node_label}\n"
        f"Concept description: {node_desc}\n"
        f"Dispute to resolve: {current_dispute if current_dispute else '(see recent exchanges)'}\n"
        f"Turn count: {socratic_turn}\n"
        f"Recent exchanges:\n" + "\n".join(recent_exchanges) + "\n"
        + closing_instruction
        + f"\n{JSON_REMINDER}"
    )

    msgs = [
        SystemMessage(content=SOCRATIC_TA_SYSTEM),
        HumanMessage(content=user_content),
    ]
    return await invoke_with_retry(msgs)
