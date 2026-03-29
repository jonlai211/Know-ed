"""
Quick test script — run with: python test_quick.py
Tests: model API, KG loading, agent output parsing, full setup flow
"""
import asyncio
import json
import sys
import httpx
from pathlib import Path

# ── colors ────────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):   print(f"{GREEN}✓{RESET} {msg}")
def fail(msg): print(f"{RED}✗{RESET} {msg}");
def info(msg): print(f"{YELLOW}→{RESET} {msg}")
def header(msg): print(f"\n{BOLD}{msg}{RESET}")


# ── Test 1: Raw model API ──────────────────────────────────────────────────────
async def test_model_api():
    header("Test 1: Model API connection")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "http://118.25.85.143:6400/v1/chat/completions",
                headers={"Authorization": "Bearer EMPTY", "Content-Type": "application/json"},
                json={
                    "model": "deepseek-v3",
                    "messages": [
                        {"role": "user", "content": "Reply with just the word: PONG"}
                    ],
                    "max_tokens": 20,
                    "temperature": 0,
                }
            )
        if res.status_code == 200:
            content = res.json()["choices"][0]["message"]["content"]
            ok(f"Model responded: {content.strip()!r}")
            return True
        else:
            fail(f"HTTP {res.status_code}: {res.text[:200]}")
            return False
    except Exception as e:
        fail(f"Connection error: {e}")
        return False


# ── Test 2: Prebuilt KG loading ────────────────────────────────────────────────
def test_kg_loading():
    header("Test 2: Prebuilt KG loading")
    try:
        path = Path("graph/kg_data/backpropagation.json")
        data = json.loads(path.read_text())
        nodes = data["nodes"]
        edges = data["edges"]
        ok(f"Loaded {len(nodes)} nodes, {len(edges)} edges")
        ok(f"Entry node: {data['entry_node_id']}")
        for nid, node in nodes.items():
            info(f"  [{node['status']:20s}] {node['label']}")
        return True
    except Exception as e:
        fail(f"KG load error: {e}")
        return False


# ── Test 3: Agent output parsing ───────────────────────────────────────────────
def test_parsing():
    header("Test 3: Agent output parsing")
    sys.path.insert(0, ".")
    from agents.base import parse_agent_output

    cases = [
        # Clean JSON
        ('{"message": "hello", "handoff_to": "user", "mentioned_nodes": ["loss_function"], "node_status_updates": [], "node_completed": false}',
         "clean JSON"),
        # JSON with thinking block
        ('<think>some reasoning here</think>\n{"message": "hi", "handoff_to": "socratic_ta", "mentioned_nodes": [], "node_status_updates": [], "node_completed": false}',
         "JSON with <think> block"),
        # JSON in markdown code block
        ('```json\n{"message": "world", "handoff_to": "challenger", "mentioned_nodes": ["gradient"], "node_status_updates": [{"id": "gradient", "status": "active"}], "node_completed": false}\n```',
         "JSON in markdown block"),
        # Fallback: plain text
        ('This is just plain text without any JSON',
         "plain text fallback"),
    ]

    all_ok = True
    for raw, label in cases:
        try:
            out = parse_agent_output(raw)
            ok(f"{label}: message={out.message[:40]!r}, handoff={out.handoff_to}")
        except Exception as e:
            fail(f"{label}: {e}")
            all_ok = False

    return all_ok


# ── Test 4: LangChain LLM call ────────────────────────────────────────────────
async def test_langchain_llm():
    header("Test 4: LangChain LLM wrapper")
    sys.path.insert(0, ".")
    try:
        from agents.base import llm
        from langchain_core.messages import HumanMessage
        res = await llm.ainvoke([HumanMessage(content="Reply with just the word: PONG")])
        ok(f"LangChain response: {res.content[:80]!r}")
        return True
    except Exception as e:
        fail(f"LangChain error: {e}")
        return False


# ── Test 5: Architect agent (single call) ─────────────────────────────────────
async def test_architect():
    header("Test 5: Architect agent")
    sys.path.insert(0, ".")
    try:
        import json
        from graph.state import KnowledgeGraph, KGNode, LearningState
        from agents.architect import run_architect
        from langchain_core.messages import HumanMessage

        path = Path("graph/kg_data/backpropagation.json")
        data = json.loads(path.read_text())
        nodes = {nid: KGNode(**n) for nid, n in data["nodes"].items()}
        kg = KnowledgeGraph(
            nodes=nodes,
            edges=[tuple(e) for e in data["edges"]],
            current_node_id=data["entry_node_id"],
        )

        state = {
            "messages": [HumanMessage(content="Let's start learning backpropagation")],
            "knowledge_graph": kg,
            "teaching_phase": "orient",
            "exposed_misconceptions": [],
            "user_understanding_score": 50,
            "active_agent": None,
            "handoff_to": "architect",
            "pending_graph_updates": [],
            "session_id": "test-123",
            "topic": "backpropagation",
        }

        output = await run_architect(state)
        ok(f"message: {output.message[:100]!r}")
        ok(f"handoff_to: {output.handoff_to}")
        ok(f"mentioned_nodes: {output.mentioned_nodes}")
        return True
    except Exception as e:
        fail(f"Architect error: {e}")
        import traceback; traceback.print_exc()
        return False


# ── Main ───────────────────────────────────────────────────────────────────────
async def main():
    print(f"{BOLD}=== Quick Backend Tests ==={RESET}")
    results = []

    results.append(("Model API",      await test_model_api()))
    results.append(("KG Loading",     test_kg_loading()))
    results.append(("Output Parsing", test_parsing()))
    results.append(("LangChain LLM",  await test_langchain_llm()))
    results.append(("Architect Agent",await test_architect()))

    print(f"\n{BOLD}=== Results ==={RESET}")
    passed = sum(1 for _, r in results if r)
    for name, result in results:
        status = f"{GREEN}PASS{RESET}" if result else f"{RED}FAIL{RESET}"
        print(f"  {status}  {name}")
    print(f"\n{passed}/{len(results)} tests passed")


if __name__ == "__main__":
    asyncio.run(main())
