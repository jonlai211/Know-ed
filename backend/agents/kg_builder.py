"""
KG Builder Agent
One-time agent: given topic text or uploaded content,
generates the full knowledge graph structure.
Also provides build_visual_kg() for the visual SVG knowledge graph panel.
"""
import json
import re
import asyncio
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from agents.base import llm
try:
    from graph.state import KnowledgeGraph, KGNode
except ImportError:
    KnowledgeGraph = None  # type: ignore
    KGNode = None  # type: ignore

# Separate LLM instance for visual KG generation
_vis_llm = ChatOpenAI(
    model="deepseek-v3",
    openai_api_key="EMPTY",
    openai_api_base="http://118.25.85.143:6400/v1",
    temperature=0.0,
    max_tokens=1536,
)


def _extract_json_vis(text: str) -> str:
    """Extract first complete JSON object by brace-depth counting."""
    if "</think>" in text:
        text = text.split("</think>")[-1].strip()
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()

    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found")

    depth = 0
    in_str = False
    escaped = False
    for i, ch in enumerate(text[start:], start):
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_str:
            escaped = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]


_VIS_KG_SYSTEM = """You are a knowledge graph designer. Output ONLY a JSON object — no prose, no markdown.

Schema:
{
  "nodes": [
    {
      "id": "snake_case_id",
      "display": "Short ≤12 chars",
      "fullLabel": "Full concept name",
      "chapter": "exact chapter title",
      "col": 1,
      "row": 1
    }
  ],
  "edges": [
    {
      "id": "e-from-to",
      "from": "node_id",
      "to": "node_id",
      "label": "verb phrase ≤12 chars"
    }
  ],
  "term_nodes": {
    "chIdx-tIdx": ["node_id"]
  }
}

Rules:
- 6-12 nodes total. Each syllabus term maps to 1-2 nodes.
- col: 1=left, 2=center, 3=right. Spread nodes across all three columns.
- row: 1=top (prerequisite), increasing downward. Use rows 1-8 as needed.
- No two nodes share the same (col, row) combination.
- term_nodes must have a key for every "chIdx-tIdx" index provided.
- 6-14 edges. Labels are short verbs: "enables", "requires", "leads to", "explains", "supports".
- Output JSON only."""


async def build_visual_kg(topic: str, syllabus: dict) -> dict:
    """Generate a visual KG (nodes with grid positions, edges, term→node map)."""
    chapters_info = "\n".join(
        f"Chapter {ci} '{ch['title']}': "
        + ", ".join(
            f"[{ci}-{ti}] {t['term']}"
            for ti, t in enumerate(ch.get("terms", []))
        )
        for ci, ch in enumerate(syllabus.get("chapters", []))
    )

    prompt = (
        f'Topic: "{topic}"\n\n'
        f"Syllabus:\n{chapters_info}\n\n"
        "Use the exact [chIdx-tIdx] keys in term_nodes. Output JSON only."
    )

    try:
        resp = await _vis_llm.ainvoke([
            SystemMessage(content=_VIS_KG_SYSTEM),
            HumanMessage(content=prompt),
        ])
        extracted = _extract_json_vis(resp.content)
        kg = json.loads(extracted)

        if not isinstance(kg.get("nodes"), list) or not isinstance(kg.get("edges"), list):
            raise ValueError("Malformed KG response")
        if not isinstance(kg.get("term_nodes"), dict):
            kg["term_nodes"] = {}

        return kg

    except Exception:
        return _fallback_visual_kg(syllabus)


def _fallback_visual_kg(syllabus: dict) -> dict:
    """Build a minimal visual KG directly from the syllabus (used when LLM fails)."""
    COLS = [1, 3, 2, 1, 3, 2]
    nodes = []
    term_nodes: dict = {}

    for ci, ch in enumerate(syllabus.get("chapters", [])):
        for ti, t in enumerate(ch.get("terms", [])):
            node_id = t["id"]
            col = COLS[(ci * 3 + ti) % len(COLS)]
            row = ci * 3 + ti + 1
            nodes.append({
                "id": node_id,
                "display": t["term"][:12],
                "fullLabel": t["term"],
                "chapter": ch["title"],
                "col": col,
                "row": row,
            })
            term_nodes[f"{ci}-{ti}"] = [node_id]

    edges = []
    chapters = syllabus.get("chapters", [])
    for ci, ch in enumerate(chapters):
        terms = ch.get("terms", [])
        for ti in range(len(terms) - 1):
            edges.append({
                "id": f"e-{terms[ti]['id']}-{terms[ti+1]['id']}",
                "from": terms[ti]["id"],
                "to": terms[ti + 1]["id"],
                "label": "leads to",
            })

    if len(chapters) >= 2:
        t0 = chapters[0].get("terms", [])
        t1 = chapters[1].get("terms", [])
        if t0 and t1:
            edges.append({
                "id": f"e-{t0[-1]['id']}-{t1[0]['id']}",
                "from": t0[-1]["id"],
                "to": t1[0]["id"],
                "label": "enables",
            })

    return {"nodes": nodes, "edges": edges, "term_nodes": term_nodes}

KG_BUILDER_SYSTEM = """

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
