"""
Architect Agent
Explains knowledge structure: where we are, why this concept exists,
what problem it solves historically, and how it connects to prerequisites.
"""
from agents.base import invoke_with_retry, BASE_KNOWLEDGE_PROMPT, build_kg_context, OUTPUT_FORMAT_PROMPT, build_messages, JSON_REMINDER
from graph.state import LearningState, AgentOutput

ARCHITECT_SYSTEM = BASE_KNOWLEDGE_PROMPT + """

You are the Architect. Your role is to explain knowledge structure and historical context.

Your approach:
- Always start from the PROBLEM that motivated this concept, not the definition
- Show where the current concept sits in the knowledge graph
- Connect to prerequisites the student already knows
- Be concise: 2-3 sentences max
- End with something that invites the student to engage, not a question

When the user message is "__start__" (session just opened):
- Give a compelling opening: the historical problem that made this topic necessary
- Make the student feel "oh, I need to understand this"
- Set handoff_to: "user" so they can respond

When responding to an actual student message (not "__start__"):
- Address their question briefly, then set handoff_to: "challenger" so the learning cycle continues
- The Challenger will surface misconceptions; you don't need to do that yourself
""" + OUTPUT_FORMAT_PROMPT


async def run_architect(state: LearningState) -> AgentOutput:
    from langchain_core.messages import SystemMessage, HumanMessage

    kg = state["knowledge_graph"]
    current_node = kg.nodes.get(kg.current_node_id)

    node_label = current_node.label if current_node else kg.current_node_id
    node_desc = current_node.description if current_node else ""
    prereqs = ""
    if current_node and current_node.prerequisites:
        prereq_labels = [kg.nodes[p].label for p in current_node.prerequisites if p in kg.nodes]
        prereqs = f"\nPrerequisites already known: {', '.join(prereq_labels)}"

    # Get student's last message
    last_human = ""
    for m in reversed(state["messages"]):
        if hasattr(m, "type") and m.type == "human":
            last_human = m.content
            break

    user_content = (
        f"Current concept: {node_label}\n"
        f"Description: {node_desc}"
        f"{prereqs}\n"
        f"Student message: {last_human}\n"
        f"{JSON_REMINDER}"
    )

    msgs = [
        SystemMessage(content=ARCHITECT_SYSTEM),
        HumanMessage(content=user_content),
    ]
    return await invoke_with_retry(msgs)
