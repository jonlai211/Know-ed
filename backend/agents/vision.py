"""
Vision Agent — image analysis via GPT-4o-mini (lava.so proxy).
Only used for image uploads; all other LLM calls use the normal provider.
"""
import base64
import json
import re
import httpx

_LAVA_KEY = "aks_live_ImHZR1oWaxKD4gsi_ViVCUHCu6YmuEFLuSBphF6n7d-SdOrGy13yQAV"
_LAVA_FORWARD = "https://api.lava.so/v1/forward"
_OPENAI_COMPLETIONS = "https://api.openai.com/v1/chat/completions"

_PROMPT = """Analyze this image for educational purposes. Output ONLY a JSON object — no prose, no markdown.

{
  "topic": "concise topic name, 2-5 words",
  "description": "2-3 sentences: what this image shows and what key concepts a student should learn from it"
}"""


async def analyze_image(image_bytes: bytes, mime_type: str) -> dict:
    """
    Returns {"topic": "...", "description": "..."}.
    Calls GPT-4o-mini via lava.so proxy — independent of the main LLM provider.
    """
    b64 = base64.b64encode(image_bytes).decode()

    payload = {
        "model": "gpt-4o-mini",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
            ],
        }],
        "max_tokens": 256,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            _LAVA_FORWARD,
            params={"u": _OPENAI_COMPLETIONS},
            headers={
                "Authorization": f"Bearer {_LAVA_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

    # Strip think tags (just in case)
    if "</think>" in content:
        content = content.split("</think>")[-1].strip()
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    # Strip markdown fence
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    if m:
        content = m.group(1).strip()

    # Parse JSON
    try:
        obj_match = re.search(r"\{[\s\S]*\}", content)
        if obj_match:
            data = json.loads(obj_match.group(0))
            return {
                "topic": data.get("topic", "Image Content").strip(),
                "description": data.get("description", "").strip(),
            }
    except Exception:
        pass

    # Fallback: treat raw content as description
    return {"topic": "Image Content", "description": content[:300]}


async def describe_for_chat(image_bytes: bytes, mime_type: str) -> str:
    """
    Returns a 1-2 sentence description of the image for embedding in a chat message.
    Used when a student attaches an image during Socratic dialogue.
    """
    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "model": "gpt-4o-mini",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe what this image shows in 1-2 sentences. Focus on educational content: diagrams, formulas, text, concepts, or processes visible in the image. Be concise and specific."},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
            ],
        }],
        "max_tokens": 150,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            _LAVA_FORWARD,
            params={"u": _OPENAI_COMPLETIONS},
            headers={
                "Authorization": f"Bearer {_LAVA_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
