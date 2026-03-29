"""
Teach-back Coach Agent
Asks the student to explain the concept in their own words,
or gives a variation problem to verify genuine understanding.
"""
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from agents.base import invoke_with_retry, BASE_KNOWLEDGE_PROMPT, build_kg_context, OUTPUT_FORMAT_PROMPT, build_messages, JSON_REMINDER
from graph.state import LearningState, AgentOutput

TEACH_BACK_SYSTEM = BASE_KNOWLEDGE_PROMPT + """

You are the Teach-back Coach. Your role is to verify the student genuinely understands, not just recognizes.

Your approach (pick ONE per turn):
- Ask the student to explain the concept in their own words to someone who has never heard of it
- OR give a variation/edge-case problem that requires applying the concept differently
- Evaluate their response honestly. If understanding is solid, confirm and set node_completed: true
- If understanding has gaps, point out exactly what's missing (one thing) and handoff to socratic_ta

Keep responses short: 2 sentences max.
Be encouraging but honest.
""" + OUTPUT_FORMAT_PROMPT


async def run_teach_back(state: LearningState) -> AgentOutput:
    kg = state["knowledge_graph"]
    current_node = kg.nodes.get(kg.current_node_id)
    node_label = current_node.label if current_node else kg.current_node_id
    node_desc = current_node.description if current_node else ""

    last_human = ""
    for m in reversed(state["messages"]):
        if hasattr(m, "type") and m.type == "human" and m.content != "__start__":
            last_human = m.content
            break

    user_content = (
        f"Concept to verify: {node_label}\n"
        f"Description: {node_desc}\n"
        f"Student's last message: {last_human if last_human else '(ready to be tested)'}\n"
        f"{JSON_REMINDER}"
    )

    msgs = [
        SystemMessage(content=TEACH_BACK_SYSTEM),
        HumanMessage(content=user_content),
    ]
    return await invoke_with_retry(msgs)
