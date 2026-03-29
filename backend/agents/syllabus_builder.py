"""
Syllabus Builder Agent
Single LLM call that generates a complete personalized syllabus for any topic.
"""
import re
import json
from langchain_core.messages import SystemMessage, HumanMessage
from agents.base import llm

SYLLABUS_SYSTEM = """You are an expert curriculum designer. Generate a complete learning syllabus as a single JSON object.

Structure: 2-3 chapters, each with 2-4 terms.

Reply ONLY with a valid JSON object matching this exact schema (no markdown, no explanation):
{
  "topic": "exact topic name",
  "topic_summary": "2-sentence overview of the topic and why it matters",
  "chapters": [
    {
      "id": "ch1",
      "title": "Chapter Title",
      "hook": "one compelling sentence about why this chapter matters",
      "start_here_if": "brief description of who should start here",
      "terms": [
        {
          "id": "term_id_snake_case",
          "term": "Term Name",
          "definition": "clear 1-sentence definition",
          "example": "one concrete real-world example",
          "exam_question": "a typical test/exam question for this concept",
          "learning_goal": "Student can [specific action] given [specific context].",
          "intro_text": "2-3 short paragraphs introducing this concept from first principles. End with an engaging question. Max 180 words total.",
          "scenario": "One specific concrete scenario with actual numbers/names/details used throughout the Socratic lesson. Be very specific.",
          "questions": [
            "First Socratic question building intuition",
            "Second question deepening understanding",
            "Third question applying to the scenario",
            "Fourth question checking transfer"
          ],
          "misconceptions": ["common wrong belief 1", "common wrong belief 2"]
        }
      ]
    }
  ]
}"""


async def build_syllabus(topic: str, level: str) -> dict:
    """Generate a complete syllabus for the given topic and level via LLM."""
    level_instruction = {
        "novice": "Use simple analogies, everyday examples, lots of scaffolding. Avoid jargon.",
        "intermediate": "Assume basic familiarity. Use balanced depth, moderate complexity.",
        "advanced": "Skip hand-holding. Use sophisticated examples, expect prior knowledge.",
    }.get(level, "Use intermediate level.")

    user_prompt = (
        f'Generate a complete learning syllabus for: "{topic}"\n'
        f"Student level: {level} — {level_instruction}\n\n"
        "Reply ONLY with the JSON object."
    )

    messages = [
        SystemMessage(content=SYLLABUS_SYSTEM),
        HumanMessage(content=user_prompt),
    ]

    response = await llm.ainvoke(messages)
    content = response.content

    # Strip <think>...</think> blocks
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    # Try markdown code block first
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    if m:
        content = m.group(1).strip()
    else:
        # Find raw JSON object
        m = re.search(r"\{[\s\S]*\}", content)
        if m:
            content = m.group(0)

    return json.loads(content)
