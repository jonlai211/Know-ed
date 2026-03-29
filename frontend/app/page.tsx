"use client"

import { useState, useCallback, useRef } from "react"
import { Session, Level, Syllabus, PhaseUpdate, ScoreUpdate } from "@/types"
import { ChatPanel } from "@/components/ChatPanel"
import { SyllabusSidebar } from "@/components/SyllabusSidebar"
import { KnowledgeGraphPanel } from "@/components/KnowledgeGraph"

// Topics that have a hand-crafted demo script (exact match, lowercase)
const demoTopics = ["backpropagation"]

const LEVELS: { value: Level; label: string; desc: string; score: number }[] = [
  { value: "beginner",     label: "Beginner",     desc: "I barely know anything about this", score: 20 },
  { value: "intermediate", label: "Intermediate",  desc: "I have some basics but not systematic",  score: 40 },
  { value: "advanced",     label: "Advanced",      desc: "I understand it but not deeply",   score: 70 },
]

type ChapterPreview = {
  id: string
  title: string
  hook: string
  start_here_if: string
  term_count: number
}

export default function Home() {
  // Screen: "landing" | "assess" | "chapter_select" | "learning"
  const [screen, setScreen] = useState<"landing" | "assess" | "chapter_select" | "learning">("landing")
  const [topicInput, setTopicInput] = useState("")
  const [selectedLevel, setSelectedLevel] = useState<Level>("beginner")
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState("")

  const [chapterPreviews, setChapterPreviews] = useState<ChapterPreview[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [score, setScore] = useState(20)
  const [phaseUpdate, setPhaseUpdate] = useState<PhaseUpdate | null>(null)
  const chatPanelRef = useRef<{ viewHistory: (chapterIdx: number, termIdx: number) => void } | null>(null)

  const loadChapterPreviews = async () => {
    const topic = topicInput.trim() || "backpropagation"
    setIsStarting(true)
    setError("")
    try {
      const res = await fetch(`http://localhost:8000/setup/preview/${encodeURIComponent(topic.toLowerCase())}`)
      if (!res.ok) throw new Error(`Topic not found: ${topic}`)
      const data = await res.json()
      setChapterPreviews(data.chapters)
      setScreen("chapter_select")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsStarting(false)
    }
  }

  const startSession = async (chapterIdx: number) => {
    const topic = topicInput.trim() || "backpropagation"
    setIsStarting(true)
    setError("")
    try {
      const res = await fetch("http://localhost:8000/setup/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          level: selectedLevel,
          mode: demoTopics.includes(topic.toLowerCase()) ? "demo" : "ai",
          start_chapter_idx: chapterIdx,
        }),
      })
      if (!res.ok) throw new Error(`Setup failed: ${res.status}`)
      const data = await res.json()
      const syllabus: Syllabus = data.syllabus
      setSession({
        session_id: data.session_id,
        topic,
        level: selectedLevel,
        score: data.initial_score,
        syllabus,
        term_phase: "intro",
        current_chapter_idx: chapterIdx,
        current_term_idx: 0,
      })
      setScore(data.initial_score)
      setScreen("learning")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsStarting(false)
    }
  }

  const handlePhaseUpdate = useCallback((update: PhaseUpdate) => {
    setPhaseUpdate(update)
    setScore(update.score)
    setSession(prev => prev ? {
      ...prev,
      term_phase: update.term_phase,
      current_chapter_idx: update.chapter_idx,
      current_term_idx: update.term_idx,
      score: update.score,
    } : prev)
  }, [])

  const handleScoreUpdate = useCallback((update: ScoreUpdate) => {
    setScore(update.new_score)
  }, [])

  // ── Landing ──────────────────────────────────────────────────────────────────
  if (screen === "landing") {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-8 text-center">
          <div>
            <h1 className="font-[family-name:var(--font-newsreader)] text-4xl font-bold text-primary-container mb-3 tracking-tight">
              Know-de
            </h1>
            <p className="text-on-surface-variant text-base leading-relaxed max-w-sm mx-auto">
              An AI tutor that adapts to you — guiding you to think, not just memorize.
            </p>
          </div>

          <div className="space-y-3">
            <input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="Topic to learn (default: Backpropagation)"
              className="w-full bg-surface-container-lowest rounded-xl px-5 py-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none transition shadow-sm text-[15px]"
              onKeyDown={(e) => e.key === "Enter" && setScreen("assess")}
            />
            <button
              className="w-full py-3.5 bg-primary text-on-primary rounded-xl font-medium hover:opacity-90 transition-opacity"
              onClick={() => setScreen("assess")}
            >
              Start Learning
            </button>
          </div>

          {error && <p className="text-on-error-container text-sm">{error}</p>}
          <p className="text-on-surface-variant/50 text-xs tracking-widest uppercase">
            YHack26
          </p>
        </div>
      </main>
    )
  }

  // ── Self-assessment ───────────────────────────────────────────────────────────
  if (screen === "assess") {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center">
            <h2 className="font-[family-name:var(--font-newsreader)] text-3xl font-bold text-primary-container mb-2">
              How well do you know this?
            </h2>
            <p className="text-on-surface-variant text-sm">
              Topic: <span className="text-on-surface font-medium">{topicInput || "Backpropagation"}</span>
            </p>
          </div>

          <div className="space-y-3">
            {LEVELS.map((lvl) => (
              <button
                key={lvl.value}
                onClick={() => setSelectedLevel(lvl.value)}
                className="w-full text-left px-6 py-4 rounded-xl transition-all"
                style={{
                  background: selectedLevel === lvl.value
                    ? "rgba(0,106,106,0.12)"
                    : "var(--color-surface-container-lowest, #f8f8f8)",
                  outline: selectedLevel === lvl.value ? "2px solid #006a6a" : "none",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-on-surface">{lvl.label}</div>
                    <div className="text-sm text-on-surface-variant mt-0.5">{lvl.desc}</div>
                  </div>
                  <span className="text-xs font-bold text-secondary tabular-nums">
                    {lvl.score} pts
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setScreen("landing")}
              className="flex items-center gap-1.5 px-6 py-3 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors text-sm"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <button
              className="flex-1 py-3.5 bg-primary text-on-primary rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              onClick={loadChapterPreviews}
              disabled={isStarting}
            >
              {isStarting ? "Loading..." : "Choose a Chapter"}
            </button>
          </div>

          {error && <p className="text-on-error-container text-sm text-center">{error}</p>}
        </div>
      </main>
    )
  }

  // ── Chapter selection ─────────────────────────────────────────────────────────
  if (screen === "chapter_select") {
    const topic = topicInput.trim() || "Backpropagation"
    return (
      <main className="min-h-screen bg-surface py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="font-[family-name:var(--font-newsreader)] text-3xl font-bold text-primary-container">
              What do you want to explore?
            </h2>
            <p className="text-on-surface-variant text-sm">
              {topic} · <span className="capitalize">{selectedLevel}</span> · Pick the chapter most relevant to you
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {chapterPreviews.map((ch, idx) => (
              <button
                key={ch.id}
                onClick={() => startSession(idx)}
                disabled={isStarting}
                className="w-full text-left px-6 py-5 rounded-2xl transition-all group disabled:opacity-50"
                style={{ background: "var(--color-surface-container-lowest, #f8f8f8)" }}
                onMouseEnter={e => (e.currentTarget.style.outline = "2px solid #006a6a")}
                onMouseLeave={e => (e.currentTarget.style.outline = "none")}
              >
                <div className="flex items-start gap-4">
                  <span
                    className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "rgba(0,106,106,0.12)", color: "#006a6a" }}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-on-surface">{ch.title}</span>
                      <span className="text-xs text-on-surface-variant flex-shrink-0">
                        {ch.term_count} terms
                      </span>
                    </div>
                    {ch.hook && (
                      <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{ch.hook}</p>
                    )}
                    {ch.start_here_if && (
                      <p className="text-xs mt-2" style={{ color: "#006a6a" }}>
                        Start here if: {ch.start_here_if}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => setScreen("assess")}
              className="flex items-center gap-1.5 px-6 py-3 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors text-sm"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
          </div>

          {error && <p className="text-on-error-container text-sm text-center">{error}</p>}
        </div>
      </main>
    )
  }

  // ── Learning screen ───────────────────────────────────────────────────────────
  if (!session) return null

  const currentChapter = session.syllabus.chapters[session.current_chapter_idx]
  const currentTerm = currentChapter?.terms[session.current_term_idx]
  const maxScore = 100
  const scorePercent = Math.min(100, (score / maxScore) * 100)

  return (
    <main className="h-screen bg-surface flex flex-col overflow-hidden">
      {/* Header with progress */}
      <header className="px-6 py-3 flex items-center gap-6 flex-shrink-0 border-b border-outline-variant/15">
        <h1 className="font-[family-name:var(--font-newsreader)] text-xl font-bold text-primary-container tracking-tight whitespace-nowrap">
          {session.topic}
        </h1>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${scorePercent}%`, background: "#006a6a" }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: "#006a6a", minWidth: "3rem" }}>
            {score} pts
          </span>
        </div>

        {/* Current term */}
        {currentTerm && (
          <div className="hidden md:flex items-center gap-2 text-xs text-on-surface-variant whitespace-nowrap">
            <span className="font-medium text-on-surface">{currentTerm.term}</span>
            <span>·</span>
            <span>{currentChapter?.title}</span>
          </div>
        )}

        <button
          onClick={() => { setSession(null); setScreen("landing") }}
          className="flex items-center gap-1.5 text-on-surface-variant text-sm hover:opacity-70 transition-opacity whitespace-nowrap"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Exit
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Syllabus sidebar */}
        <SyllabusSidebar
          syllabus={session.syllabus}
          currentChapterIdx={session.current_chapter_idx}
          currentTermIdx={session.current_term_idx}
          onViewHistory={(ch, t) => chatPanelRef.current?.viewHistory(ch, t)}
        />

        {/* Chat */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-outline-variant/15 min-w-0">
          <ChatPanel
            ref={chatPanelRef}
            sessionId={session.session_id}
            termPhase={session.term_phase}
            currentChapterIdx={session.current_chapter_idx}
            currentTermIdx={session.current_term_idx}
            onPhaseUpdate={handlePhaseUpdate}
            onScoreUpdate={handleScoreUpdate}
          />
        </div>

        {/* KG panel (placeholder for now) */}
        <div className="w-[360px] flex-shrink-0 flex flex-col">
          <div className="px-5 py-3 border-b border-outline-variant/15">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Knowledge Graph
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center text-on-surface-variant/40 text-sm">
            Coming soon
          </div>
        </div>
      </div>
    </main>
  )
}
