"""
SQLite-based session persistence.
Stores full LearningState as JSON per session_id.
"""
import json
import sqlite3
from pathlib import Path
from langchain_core.messages import HumanMessage, AIMessage

DB_PATH = Path(__file__).parent / "sessions.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn


def save_session(session_id: str, state: dict) -> None:
    serializable = {
        **state,
        "messages": [
            {"type": m.type, "content": m.content, "additional_kwargs": getattr(m, "additional_kwargs", {})}
            for m in state.get("messages", [])
        ],
    }
    conn = _get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO sessions (session_id, state_json) VALUES (?, ?)",
        (session_id, json.dumps(serializable))
    )
    conn.commit()
    conn.close()


def load_session(session_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT state_json FROM sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    conn.close()

    if not row:
        return None

    data = json.loads(row[0])

    # Deserialize messages
    messages = []
    for m in data.get("messages", []):
        if m["type"] == "human":
            messages.append(HumanMessage(content=m["content"]))
        elif m["type"] == "ai":
            ai_msg = AIMessage(content=m["content"])
            ai_msg.additional_kwargs = m.get("additional_kwargs", {})
            messages.append(ai_msg)
    data["messages"] = messages

    return data


def delete_session(session_id: str) -> None:
    conn = _get_conn()
    conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
    conn.commit()
    conn.close()
