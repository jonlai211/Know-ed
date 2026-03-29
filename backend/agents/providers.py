"""
LLM provider configuration.
Set LLM_PROVIDER env var to switch: "deepseek" (default) or "k2"
"""
import os
from langchain_openai import ChatOpenAI

PROVIDER = os.getenv("LLM_PROVIDER", "deepseek")

_CONFIGS = {
    "deepseek": {
        "model": "deepseek-v3",
        "openai_api_key": "EMPTY",
        "openai_api_base": "http://118.25.85.143:6400/v1",
        "model_kwargs": {"extra_body": {"chat_template_kwargs": {"thinking": True}}},
    },
    "k2": {
        "model": "MBZUAI-IFM/K2-Think-v2",
        "openai_api_key": "IFM-D3UwKFYY2uyOC0mr",
        "openai_api_base": "https://api.k2think.ai/v1",
    },
}


def make_llm(max_tokens: int = 2048) -> ChatOpenAI:
    cfg = _CONFIGS.get(PROVIDER, _CONFIGS["deepseek"])
    return ChatOpenAI(
        temperature=0.0,
        max_tokens=max_tokens,
        **cfg,
    )
