# Know-de

**The AI tutor that asks, not tells.**

Know-de is a Socratic AI tutor that generates a personalized course on any topic and teaches it through guided questioning — never giving away the answer until you've had a real chance to arrive there yourself.

## Demo

[![Know-de Demo](https://img.youtube.com/vi/QQgO_W5J68U/0.jpg)](https://youtu.be/QQgO_W5J68U?si=1SGa64QcgFTRFyAl)

## How It Works

Type any topic, pick your level (Novice / Intermediate / Advanced), and Know-de:

1. Generates a structured 2-chapter syllabus with 3–4 concepts per chapter
2. Teaches each concept through a 4-phase Socratic loop:
   - **Intro** — Opens with a real-world problem, never naming the concept upfront
   - **Socratic dialogue** — Asks WHY → WHAT → HOW → APPLY questions, adapting to your answers
   - **Direct explanation** — Only given after exhausting the Socratic rounds
   - **Teach-back** — You explain the concept back as if teaching someone else (Feynman technique)
3. Builds a live **Knowledge Graph** showing concept relationships as you progress

## Features

- Any topic, any level — fully generated curriculum in seconds
- Adaptive questioning — diagnoses *where* you're stuck before deciding how to help
- Dynamic knowledge graph with active concept highlighting
- Image upload — attach a diagram during the lesson; the teacher incorporates it
- Score system with real-time feedback

## Tech Stack

- **Frontend**: Next.js (App Router), SSE streaming
- **Backend**: FastAPI, LangChain
- **LLM**: K2 (core teaching), GPT-4o-mini (vision)

## Running Locally

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
