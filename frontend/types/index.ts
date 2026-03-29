// ── Syllabus ──────────────────────────────────────────────────────────────────

export interface SyllabusTerm {
  id: string
  term: string
  definition: string
  example: string
  exam_question: string
  key_concepts: string[]
  misconceptions: string[]
}

export interface SyllabusChapter {
  id: string
  title: string
  terms: SyllabusTerm[]
}

export interface Syllabus {
  topic: string
  topic_summary: string
  chapters: SyllabusChapter[]
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  agent_id: "teacher" | "user"
  content: string
  timestamp: number
}

// ── Session ───────────────────────────────────────────────────────────────────

export type Level = "beginner" | "intermediate" | "advanced"
export type TermPhase = "intro" | "socratic" | "direct" | "teach_back"

export interface Session {
  session_id: string
  topic: string
  level: Level
  score: number
  syllabus: Syllabus
  term_phase: TermPhase
  current_chapter_idx: number
  current_term_idx: number
}

// ── SSE events ────────────────────────────────────────────────────────────────

export interface ScoreUpdate {
  delta: number
  new_score: number
  reason: string
}

export interface PhaseUpdate {
  term_phase: TermPhase
  chapter_idx: number
  term_idx: number
  chapter_title: string
  term_id: string
  term_name: string
  score: number
}
