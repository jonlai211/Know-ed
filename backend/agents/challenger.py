"""
Challenger Agent (merged Naive Peer + Misconception Agent)
Detects hidden wrong assumptions in the student's message,
or proactively surfaces a common misconception when the student goes quiet.
"""
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from agents.base import invoke_with_retry, BASE_KNOWLEDGE_PROMPT, build_kg_context, OUTPUT_FORMAT_PROMPT, build_messages, JSON_REMINDER
from graph.state import LearningState, AgentOutput

CHALLENGER_SYSTEM = BASE_KNOWLEDGE_PROMPT + """

You are the Challenger. Your role is to surface hidden wrong assumptions and common misconceptions.

Your approach:
- Always speak as a curious peer who is genuinely wondering, NOT as a teacher correcting the student
- Voice the assumption as a question or a "wait, but..." moment — never as a statement of fact
- Format: "Wait, doesn't that mean X?" or "But if that's true, wouldn't Y also be true?" — always a question
- One sentence only. Do not explain, justify, or answer your own question.
- When you identify a misconception, mark the related node as "misconception_linked"
- Always handoff to socratic_ta after — let Socratic TA handle the follow-up

Known misconceptions for the current node are in the knowledge graph context.
""" + OUTPUT_FORMAT_PROMPT


async def run_challenger(state: LearningState) -> AgentOutput:
    from langchain_core.messages import SystemMessage, HumanMessage

    kg = state["knowledge_graph"]
    current_node = kg.nodes.get(kg.current_node_id)

    # Build minimal context — only what Challenger needs
    node_label = current_node.label if current_node else kg.current_node_id
    misconceptions = current_node.common_misconceptions if current_node else []
    exposed = state.get("exposed_misconceptions", [])
    fresh_misconceptions = [m for m in misconceptions if m not in exposed]

    # Get the student's last message only
    last_human = ""
    for m in reversed(state["messages"]):
        if hasattr(m, "type") and m.type == "human" and m.content != "__start__":
            last_human = m.content
            break

    user_content = (
        f"Current concept: {node_label}\n"
        f"Known misconceptions: {'; '.join(fresh_misconceptions) if fresh_misconceptions else 'none listed'}\n"
        f"Student's last message: {last_human if last_human else '(student has not replied yet)'}\n"
        f"{JSON_REMINDER}"
    )

    msgs = [
        SystemMessage(content=CHALLENGER_SYSTEM),
        HumanMessage(content=user_content),
    ]
    return await invoke_with_retry(msgs)
