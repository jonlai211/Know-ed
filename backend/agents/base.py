import re
import json
import logging
from typing import Type, TypeVar
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# ── LLM 实例 ──────────────────────────────────────────────────────────────────

llm = ChatOpenAI(
    model="deepseek-v3",
    openai_api_key="EMPTY",
    openai_api_base="http://118.25.85.143:6400/v1",
    temperature=0.0,
    max_tokens=2048,
    model_kwargs={"extra_body": {"chat_template_kwargs": {"thinking": True}}},
)

JSON_REMINDER = "\n\n[Reminder: reply ONLY with a valid JSON object, no other text.]"

# ── JSON 解析 ─────────────────────────────────────────────────────────────────

def _extract_json(raw: str) -> dict | None:
    """Extract and parse the first JSON object from raw LLM output."""
    # Model outputs thinking without opening <think>, only closing </think>
    if "</think>" in raw:
        raw = raw.split("</think>")[-1].strip()
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

    # Try markdown code block first
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if json_match:
        cleaned = json_match.group(1).strip()

    # Find JSON object
    obj_match = re.search(r"\{[\s\S]*\}", cleaned)
    if obj_match:
        cleaned = obj_match.group(0)

    try:
        data = json.loads(cleaned)
        message = data.get("message", "").strip()
        if not message or len(message) < 5:
            return None
        return data
    except Exception:
        return None


async def invoke_with_retry(
    messages: list[BaseMessage],
    output_class: Type[T] = None,
    max_retries: int = 2,
) -> T:
    """Call LLM and retry if output isn't valid JSON. Returns parsed output_class instance."""
    from graph.state import AgentOutput  # avoid circular import at module level

    if output_class is None:
        output_class = AgentOutput

    for attempt in range(max_retries + 1):
        response = await llm.ainvoke(messages)
        data = _extract_json(response.content)
        if data is not None:
            try:
                return output_class(**{
                    k: v for k, v in data.items()
                    if k in output_class.model_fields
                })
            except Exception as e:
                logger.warning("Attempt %d/%d: schema mismatch: %s", attempt + 1, max_retries + 1, e)
        else:
            logger.warning("Attempt %d/%d: invalid JSON output", attempt + 1, max_retries + 1)

    logger.error("All retries failed.")
    # Return a neutral fallback
    return output_class(**{
        "message": "I need a moment to think about that. Could you rephrase?",
        **{k: v.default for k, v in output_class.model_fields.items()
           if k != "message" and v.default is not None}
    })
