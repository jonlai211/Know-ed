"""
Syllabus Builder Agent
Two-step generation: structure first, then enrich each term in parallel.
"""
import re
import json
import asyncio
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

# Separate LLM instance with higher token limit for syllabus generation
_llm = ChatOpenAI(
    model="deepseek-v3",
    openai_api_key="EMPTY",
    openai_api_base="http://118.25.85.143:6400/v1",
    temperature=0.0,
    max_tokens=4096,
)


def _extract_json(text: str) -> str:
    """Extract the first complete JSON object by counting brace depth."""
    # Model outputs thinking without opening <think>, only closing </think>
    if "</think>" in text:
        text = text.split("</think>")[-1].strip()
    # Also handle properly-wrapped <think>...</think>
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Unwrap markdown code fence if present
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()

    # Find first { and walk to its matching }
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in LLM output")

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

    # Fallback: return from start to end
    return text[start:]


# ── Step 1: lightweight structure ─────────────────────────────────────────────

STRUCTURE_SYSTEM = """You are a curriculum designer. Output ONLY a JSON object — no prose, no markdown.

Schema:
{
  "topic": "exact topic name",
  "topic_summary": "one sentence",
  "chapters": [
    {
      "id": "ch1",
      "title": "Chapter Title",
      "hook": "one sentence why this matters",
      "start_here_if": "who should start here",
      "terms": [
        {
          "id": "snake_case_id",
          "term": "Term Name",
          "definition": "one clear sentence",
          "learning_goal": "Student can [action] given [context]."
        }
      ]
    }
  ]
}

Rules: exactly 2 chapters, 3-4 terms each. Output JSON only."""


# ── Step 2: enrich one term ────────────────────────────────────────────────────

ENRICH_SYSTEM = """You are a Socratic tutor. Output ONLY a JSON object — no prose, no markdown.

Schema:
{
  "intro_text": "2 short paragraphs max 80 words. End with one question.",
  "scenario": "specific scenario with real numbers/names",
  "questions": ["q1", "q2", "q3"]
}

Output JSON only."""


async def _enrich_term(term: dict, topic: str, level: str) -> dict:
    prompt = (
        f'Topic: "{topic}" | Level: {level}\n'
        f'Term: "{term["term"]}" — {term["definition"]}\n'
        f'Goal: {term["learning_goal"]}\n'
        "Output JSON only."
    )
    try:
        resp = await _llm.ainvoke([
            SystemMessage(content=ENRICH_SYSTEM),
            HumanMessage(content=prompt),
        ])
        extracted = _extract_json(resp.content)
        extra = json.loads(extracted)
        term["intro_text"] = extra.get("intro_text", "")
        term["scenario"]   = extra.get("scenario", "")
        term["questions"]  = extra.get("questions", [])
    except Exception:
        term.setdefault("intro_text", "")
        term.setdefault("scenario", "")
        term.setdefault("questions", [])
    return term


async def build_syllabus(topic: str, level: str) -> dict:
    level_hint = {
        "novice":       "Simple analogies, no jargon.",
        "beginner":     "Simple analogies, no jargon.",
        "intermediate": "Balanced depth, moderate complexity.",
        "advanced":     "Sophisticated examples, assume prior knowledge.",
    }.get(level, "Balanced depth.")

    # Step 1 — structure
    resp = await _llm.ainvoke([
        SystemMessage(content=STRUCTURE_SYSTEM),
        HumanMessage(content=(
            f'Syllabus for: "{topic}"\n'
            f"Level: {level} — {level_hint}\n"
            "Output JSON only."
        )),
    ])
    syllabus = json.loads(_extract_json(resp.content))

    # Fill defaults
    for ch in syllabus.get("chapters", []):
        ch.setdefault("hook", "")
        ch.setdefault("start_here_if", "")
        for t in ch.get("terms", []):
            for key in ("example", "exam_question", "intro_text", "scenario"):
                t.setdefault(key, "")
            for key in ("key_concepts", "misconceptions", "questions"):
                t.setdefault(key, [])

    # Step 2 — enrich all terms concurrently
    all_terms = [
        (ci, ti, t)
        for ci, ch in enumerate(syllabus.get("chapters", []))
        for ti, t in enumerate(ch.get("terms", []))
    ]
    enriched = await asyncio.gather(*[_enrich_term(t, topic, level) for _, _, t in all_terms])
    for (ci, ti, _), et in zip(all_terms, enriched):
        syllabus["chapters"][ci]["terms"][ti] = et

    return syllabus
