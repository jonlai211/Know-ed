"""
KG Builder Agent
One-time agent: given topic text or uploaded content,
generates the full knowledge graph structure.
"""
import json
import re
from langchain_core.messages import SystemMessage, HumanMessage
from agents.base import llm, BASE_KNOWLEDGE_PROMPT, parse_agent_output
from graph.state import KnowledgeGraph, KGNode

KG_BUILDER_SYSTEM = BASE_KNOWLEDGE_PROMPT + """

You are a Knowledge Graph Builder. Given a topic or document content, extract a structured knowledge graph for teaching.

Rules:
- Extract 5-8 key concepts (nodes), not more
- Identify prerequisite relationships between concepts (edges)
- For each concept, list 2-3 common misconceptions students have
- Choose one entry node (the simplest starting point)
- All other nodes start as "locked" except prerequisites of entry node which are "available", and entry node itself is "active"

Reply ONLY with valid JSON, no extra text:
{
  "topic_summary": "<one sentence describing what this topic is about>",
  "entry_node_id": "<id of the starting node>",
  "nodes": [
    {
      "id": "<snake_case_id>",
      "label": "<short display name>",
      "description": "<one sentence description>",
      "prerequisites": ["<node_id>", ...],
      "common_misconceptions": ["<misconception>", ...]
    }
  ],
  "edges": [["<from_id>", "<to_id>"], ...]
}"""


async def run_kg_builder(content: str) -> KnowledgeGraph:
    messages = [
        SystemMessage(content=KG_BUILDER_SYSTEM),
        HumanMessage(content=f"Build a knowledge graph for:\n\n{content}"),
    ]

    response = await llm.ainvoke(messages)
    raw = response.content

    # 去掉 thinking 块
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if json_match:
        cleaned = json_match.group(1).strip()

    try:
        data = json.loads(cleaned)
    except Exception:
        raise ValueError(f"KG Builder failed to produce valid JSON:\n{raw}")

    entry_id = data["entry_node_id"]
    nodes: dict[str, KGNode] = {}

    for n in data["nodes"]:
        nid = n["id"]
        if nid == entry_id:
            status = "active"
        elif not n.get("prerequisites"):
            status = "available"
        else:
            status = "locked"
        nodes[nid] = KGNode(
            id=nid,
            label=n["label"],
            description=n["description"],
            status=status,
            prerequisites=n.get("prerequisites", []),
            common_misconceptions=n.get("common_misconceptions", []),
        )

    edges = [tuple(e) for e in data.get("edges", [])]

    return KnowledgeGraph(
        nodes=nodes,
        edges=edges,
        current_node_id=entry_id,
    )
