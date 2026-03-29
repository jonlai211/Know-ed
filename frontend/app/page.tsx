"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Syllabus } from "@/types"
import { useSSE, SSEEvent } from "@/hooks/useSSE"

const API = "http://localhost:8000"

// ── Level config ──────────────────────────────────────────────────────────────

const LEVELS = [
  { value: "novice",       label: "Novice",       desc: "Just starting to explore this topic",         score: 20 },
  { value: "intermediate", label: "Intermediate", desc: "Familiar with the basics, building fluency",  score: 40 },
  { value: "advanced",     label: "Advanced",     desc: "Solid understanding, seeking deeper insight", score: 60 },
] as const
type Level = typeof LEVELS[number]["value"]

// ── Fake source generator ─────────────────────────────────────────────────────

function makeSources(topic: string) {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const word = topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  return [
    { type: "article", url: `en.wikipedia.org/wiki/${word}` },
    { type: "video",   url: `youtube.com/watch?v=${slug}-explained` },
    { type: "course",  url: `khanacademy.org/search?referer=${slug}` },
    { type: "paper",   url: `arxiv.org/search/?query=${slug}` },
    { type: "article", url: `britannica.com/topic/${slug}` },
    { type: "video",   url: `youtube.com/watch?v=${slug}-deep-dive` },
    { type: "course",  url: `coursera.org/search?query=${encodeURIComponent(topic)}` },
    { type: "paper",   url: `semanticscholar.org/search?q=${slug}` },
    { type: "article", url: `scholarpedia.org/article/${slug}` },
  ]
}

function typeIcon(type: string) {
  if (type === "video")  return <span style={{ color: "#e53e3e" }}>▶</span>
  if (type === "course") return <span style={{ color: "#d69e2e" }}>🎓</span>
  if (type === "paper")  return <span style={{ color: "#805ad5" }}>⬡</span>
  return <span style={{ color: "#718096" }}>◈</span>
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

function playScoreSound() {
  try {
    const ctx = new AudioContext()
    ;[660, 880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = "sine"; osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.08
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      osc.start(t); osc.stop(t + 0.25)
    })
  } catch { /* unavailable */ }
}

function playSuccessSound() {
  try {
    const ctx = new AudioContext()
    ;[523, 659, 784, 1047, 1319].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = "sine"; osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.10
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
      osc.start(t); osc.stop(t + 0.45)
    })
  } catch { /* unavailable */ }
}

// ── GeneratingScreen ──────────────────────────────────────────────────────────

function GeneratingScreen({
  topic, level,
  onDone,
}: {
  topic: string
  level: Level
  onDone: (sessionId: string, syllabus: Syllabus, initialScore: number) => void
}) {
  type Stage = "searching" | "analyzing" | "building" | "done"
  const [stage, setStage] = useState<Stage>("searching")
  const [visibleSources, setVisibleSources] = useState(0)
  const [syllabusData, setSyllabusData] = useState<Syllabus | null>(null)
  const [sessionId, setSessionId] = useState("")
  const [initialScore, setInitialScore] = useState(0)
  const [visibleChapters, setVisibleChapters] = useState(0)
  const [visibleTerms, setVisibleTerms] = useState<number[]>([])
  const apiDoneRef = useRef(false)
  const sources = makeSources(topic)

  // Fire API call immediately
  useEffect(() => {
    fetch(`${API}/setup/topic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, level, mode: "ai" }),
    })
      .then(r => r.json())
      .then(data => {
        setSessionId(data.session_id)
        setSyllabusData(data.syllabus)
        setInitialScore(data.initial_score)
        apiDoneRef.current = true
      })
      .catch(() => { apiDoneRef.current = true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Animate sources
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i++; setVisibleSources(i)
      if (i >= sources.length) {
        clearInterval(id)
        setStage("analyzing")
      }
    }, 260)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for API completion while analyzing
  useEffect(() => {
    if (stage !== "analyzing") return
    const id = setInterval(() => {
      if (apiDoneRef.current && syllabusData) {
        clearInterval(id)
        setStage("building")
      }
    }, 200)
    return () => clearInterval(id)
  }, [stage, syllabusData])

  // Animate syllabus chapters+terms after building starts
  useEffect(() => {
    if (stage !== "building" || !syllabusData) return
    const chapters = syllabusData.chapters
    const allTerms = chapters.flatMap((ch, ci) => ch.terms.map((_, ti) => ({ ci, ti })))

    let ci = 0
    const chId = setInterval(() => {
      ci++; setVisibleChapters(ci)
      if (ci >= chapters.length) clearInterval(chId)
    }, 400)

    let ti = 0
    const tId = setInterval(() => {
      if (ti < allTerms.length) {
        const { ci: chIdx, ti: tIdx } = allTerms[ti]
        setVisibleTerms(prev => [...prev, chIdx * 100 + tIdx])
        ti++
      } else {
        clearInterval(tId)
        setTimeout(() => setStage("done"), 500)
      }
    }, 150)

    return () => { clearInterval(chId); clearInterval(tId) }
  }, [stage, syllabusData])

  const handleStart = () => {
    if (syllabusData && sessionId) onDone(sessionId, syllabusData, initialScore)
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10"
      style={{ background: "var(--color-surface, #f6f8f9)" }}>
      <div className="w-full max-w-lg">

        {/* Status badge + heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4"
            style={{ background: "rgba(0,106,106,0.08)", color: "#006a6a", border: "1px solid rgba(0,106,106,0.15)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#006a6a" }} />
            {stage === "done" ? "Syllabus ready" : stage === "analyzing" ? "Analyzing content" : stage === "building" ? "Generating syllabus" : "Researching"}
          </div>
          <h2 className="text-[28px] font-bold text-on-surface leading-tight"
            style={{ fontFamily: "var(--font-newsreader, serif)" }}>
            {stage === "done" ? "Your personalized syllabus" : "Searching the web for you"}
          </h2>
          {stage === "searching" && (
            <p className="text-sm text-on-surface-variant mt-2">
              Finding the best resources on <span className="font-medium text-on-surface">{topic}</span>
            </p>
          )}
        </div>

        {/* Sources panel */}
        <div className="rounded-2xl mb-3 overflow-hidden"
          style={{ background: "var(--color-surface-container-lowest, #fff)", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
            <span className="text-xs font-semibold text-on-surface-variant">Sources</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: "#006a6a" }}>
              {visibleSources} / {sources.length}
            </span>
          </div>
          <div className="px-5 py-3 space-y-2">
            {sources.slice(0, visibleSources).map((src, i) => (
              <div key={i} className="flex items-center gap-3" style={{ animation: "fadeSlideIn 0.18s ease-out" }}>
                <span className="text-[13px] w-4 text-center flex-shrink-0">{typeIcon(src.type)}</span>
                <span className="text-[13px] text-on-surface-variant truncate flex-1">{src.url}</span>
                <svg className="flex-shrink-0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#006a6a" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
            ))}
            {visibleSources < sources.length && (
              <div className="flex items-center gap-1.5 pt-0.5">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1 h-1 rounded-full animate-bounce"
                    style={{ background: "#006a6a", opacity: 0.4, animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Syllabus panel */}
        {(stage === "analyzing" || stage === "building" || stage === "done") && (
          <div className="rounded-2xl mb-4 overflow-hidden"
            style={{ background: "var(--color-surface-container-lowest, #fff)", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
              <span className="text-xs font-semibold text-on-surface-variant">
                {stage === "analyzing" ? "Reading & synthesizing…" : "Recommended learning path"}
              </span>
              {stage === "analyzing" && (
                <div className="ml-auto flex gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: "#006a6a", opacity: 0.5, animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              )}
            </div>
            {stage !== "analyzing" && syllabusData && (
              <div className="px-5 py-4 space-y-4">
                {syllabusData.chapters.slice(0, visibleChapters).map((ch, ci) => (
                  <div key={ch.id} style={{ animation: "fadeSlideIn 0.2s ease-out" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#006a6a" }}>
                      Chapter {ci + 1} — {ch.title}
                    </p>
                    <div className="space-y-1.5">
                      {ch.terms.map((t, ti) => visibleTerms.includes(ci * 100 + ti) && (
                        <div key={t.id} className="flex items-center gap-3" style={{ animation: "fadeSlideIn 0.15s ease-out" }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: ci === 0 && ti === 0 ? "#006a6a" : "rgba(0,0,0,0.15)" }} />
                          <span className="text-sm"
                            style={{ color: ci === 0 && ti === 0 ? "#006a6a" : "var(--color-on-surface, #1a1a1a)", fontWeight: ci === 0 && ti === 0 ? 600 : 400 }}>
                            {t.term}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        {stage === "done" && (
          <button onClick={handleStart}
            className="w-full py-4 rounded-2xl font-semibold text-[15px] hover:opacity-90 transition-opacity"
            style={{ background: "#006a6a", color: "white" }}>
            Start Learning
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  )
}

// ── RealLearningScreen ────────────────────────────────────────────────────────

interface Msg {
  id: number
  role: "teacher" | "user"
  text: string
  isUnderstand?: true
}

function RealLearningScreen({
  sessionId, syllabus, initialScore, topic, onExit,
}: {
  sessionId: string
  syllabus: Syllabus
  initialScore: number
  topic: string
  onExit: () => void
}) {
  const chapters = syllabus.chapters

  const [messages, setMessages]         = useState<Msg[]>([])
  const [score, setScore]               = useState(initialScore)
  const [isThinking, setIsThinking]     = useState(false)
  const [input, setInput]               = useState("")
  const [scorePopup, setScorePopup]     = useState<{ delta: number; key: number } | null>(null)
  const [activeTermKey, setActiveTermKey] = useState("0-0")
  // Backend's current position (updated by phase_update)
  const [backendChIdx, setBackendChIdx] = useState(0)
  const [backendTIdx, setBackendTIdx]   = useState(0)

  const msgId      = useRef(0)
  const popupKey   = useRef(0)
  const hasStarted = useRef(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const lastScoreDelta = useRef(0)

  const nextId = () => { msgId.current += 1; return msgId.current }

  const backendTermKey = `${backendChIdx}-${backendTIdx}`
  const scorePercent   = Math.min(100, score)

  const [activeChIdx, activeTIdx] = activeTermKey.split("-").map(Number)
  const activeChapter = chapters[activeChIdx]
  const activeTerm    = activeChapter?.terms[activeTIdx]

  // SSE event handler
  const handleEvent = useCallback((event: SSEEvent) => {
    if (event.event === "agent_message") {
      setMessages(prev => [...prev, { id: nextId(), role: "teacher", text: event.data.content }])
    } else if (event.event === "score_update") {
      setScore(event.data.new_score)
      lastScoreDelta.current = event.data.delta
      if (event.data.delta > 0) {
        popupKey.current += 1
        setScorePopup({ delta: event.data.delta, key: popupKey.current })
        if (event.data.delta >= 15) playSuccessSound(); else playScoreSound()
        setTimeout(() => setScorePopup(null), 2800)
      }
    } else if (event.event === "phase_update") {
      setBackendChIdx(event.data.chapter_idx)
      setBackendTIdx(event.data.term_idx)
      // When backend advances to a new term, switch the active view to it
      const newKey = `${event.data.chapter_idx}-${event.data.term_idx}`
      setActiveTermKey(newKey)
    } else if (event.event === "done") {
      setIsThinking(false)
    } else if (event.event === "error") {
      setIsThinking(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { send } = useSSE({ onEvent: handleEvent })

  // Kick off first teacher message
  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true
    setIsThinking(true)
    send(sessionId, "__start__")
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    const t = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    return () => clearTimeout(t)
  }, [messages, isThinking])

  const handleSend = (iUnderstand = false) => {
    const msg = iUnderstand ? "I think I'm ready to explain this." : input.trim()
    if (!msg) return
    setMessages(prev => [...prev, { id: nextId(), role: "user", text: msg, isUnderstand: iUnderstand || undefined }])
    setInput("")
    setIsThinking(true)
    send(sessionId, msg, iUnderstand)
    // Always return to backend's current term when sending a message
    setActiveTermKey(backendTermKey)
  }

  const canSend = input.trim().length > 0 && !isThinking

  return (
    <main className="h-screen bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 py-3 flex items-center flex-shrink-0 border-b border-outline-variant/15">
        <h1 className="text-xl font-bold text-primary-container tracking-tight flex-1"
          style={{ fontFamily: "var(--font-newsreader, serif)" }}>
          Know-de
        </h1>
        <button onClick={onExit}
          className="flex items-center gap-1.5 text-on-surface-variant text-sm hover:opacity-70 transition-opacity whitespace-nowrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Exit
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Syllabus sidebar */}
        <aside className="w-56 flex-shrink-0 border-r border-outline-variant/15 overflow-y-auto flex flex-col">
          <div className="px-4 py-3 border-b border-outline-variant/15">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Syllabus</span>
          </div>
          <nav className="flex-1 py-2">
            {chapters.map((ch, chIdx) => (
              <div key={ch.id} className="mb-1">
                <div className="px-4 pt-4 pb-1.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: backendChIdx === chIdx ? "#006a6a" : "var(--color-on-surface-variant, #aaa)" }}>
                      Ch {chIdx + 1}
                    </span>
                    <span className="flex-1 h-px"
                      style={{ background: backendChIdx === chIdx ? "rgba(0,106,106,0.2)" : "rgba(0,0,0,0.07)" }} />
                  </div>
                  <span className="text-[14px] font-semibold"
                    style={{ color: backendChIdx === chIdx ? "#006a6a" : "var(--color-on-surface, #1a1a1a)" }}>
                    {ch.title}
                  </span>
                </div>
                {ch.terms.map((t, tIdx) => {
                  const key = `${chIdx}-${tIdx}`
                  const isSelected  = activeTermKey === key
                  const isBackend   = backendTermKey === key
                  return (
                    <button key={t.id} onClick={() => setActiveTermKey(key)}
                      className="w-full mx-2 px-3 py-1.5 rounded-lg flex items-center gap-2 mb-0.5 text-left transition-colors hover:bg-surface-container"
                      style={{ width: "calc(100% - 1rem)", background: isSelected ? "rgba(0,106,106,0.1)" : "transparent" }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: isBackend ? "#006a6a" : isSelected ? "rgba(0,106,106,0.4)" : "#ccc" }} />
                      <span className="text-[13px] truncate"
                        style={{ color: isSelected ? "#006a6a" : "var(--color-on-surface, #1a1a1a)", fontWeight: isSelected ? 600 : 400 }}>
                        {t.term}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Chat column */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-outline-variant/15 min-w-0">
          {/* Progress bar */}
          <div className="px-5 py-2 flex items-center gap-3 border-b border-outline-variant/15 flex-shrink-0">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,106,106,0.1)" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${scorePercent}%`, background: "#006a6a" }} />
            </div>
            <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "#006a6a", minWidth: "3rem" }}>
              {score} pts
            </span>
          </div>

          <div className="flex flex-col h-full relative" style={{ height: "calc(100% - 41px)" }}>
            {/* Score popup */}
            {activeTermKey === backendTermKey && scorePopup && (
              <div key={scorePopup.key} className="absolute inset-x-0 top-0 flex justify-center z-20 pointer-events-none pt-5">
                <div className="px-6 py-3 rounded-2xl font-bold shadow-2xl"
                  style={{
                    background: "linear-gradient(135deg, #006a6a 0%, #00908f 100%)",
                    color: "white", fontSize: "1.5rem", letterSpacing: "-0.01em",
                    animation: "scorePopIn 2.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
                    boxShadow: "0 0 0 0 rgba(0,106,106,0.4), 0 8px 32px rgba(0,106,106,0.35)",
                  }}>
                  +{scorePopup.delta} pts ✦
                </div>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-col justify-end min-h-full gap-3">

                {activeTermKey === backendTermKey ? (
                  /* Current term: show chat */
                  <>
                    {messages.map(msg => {
                      if (msg.role === "user") {
                        return (
                          <div key={msg.id} className="flex justify-end">
                            <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-br-sm shadow-sm text-[15px] leading-relaxed"
                              style={{ background: "rgba(0,106,106,0.10)", color: "var(--color-on-surface, #1a1a1a)" }}>
                              {msg.isUnderstand
                                ? <span className="text-on-surface-variant italic">I think I&apos;m ready to explain this.</span>
                                : <p className="whitespace-pre-wrap">{msg.text}</p>}
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={msg.id} className="flex justify-start gap-2.5">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                            style={{ background: "rgba(0,106,106,0.12)", color: "#006a6a" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#006a6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                            </svg>
                          </div>
                          <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-container-lowest shadow-sm"
                            style={{ border: "1px solid rgba(0,106,106,0.08)" }}>
                            <p className="text-[15px] text-on-surface leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          </div>
                        </div>
                      )
                    })}
                    {isThinking && (
                      <div className="flex justify-start gap-2.5">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                          style={{ background: "rgba(0,106,106,0.12)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#006a6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                          </svg>
                        </div>
                        <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-surface-container-lowest shadow-sm"
                          style={{ border: "1px solid rgba(0,106,106,0.08)" }}>
                          <div className="flex gap-1.5">
                            {[0,1,2].map(i => (
                              <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                                style={{ background: "#006a6a", opacity: 0.5, animationDelay: `${i * 0.15}s` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Other term: show intro_text */
                  <div className="flex justify-start gap-2.5">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                      style={{ background: "rgba(0,106,106,0.12)", color: "#006a6a" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#006a6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                      </svg>
                    </div>
                    <div className="max-w-[85%]">
                      <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-surface-container-lowest shadow-sm text-[14.5px] leading-relaxed"
                        style={{ border: "1px solid rgba(0,106,106,0.08)" }}>
                        <div className="text-xs font-semibold mb-2.5" style={{ color: "#006a6a" }}>
                          {activeTerm?.term} · {activeChapter?.title}
                        </div>
                        <p className="text-on-surface whitespace-pre-wrap leading-relaxed">
                          {activeTerm?.intro_text || "Overview not available."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* Input area */}
            <div className="px-4 pb-4 pt-2 flex-shrink-0">
              <div className="rounded-2xl shadow-sm overflow-hidden"
                style={{ border: "1.5px solid rgba(0,0,0,0.08)", background: "var(--color-surface-container-lowest, #fff)" }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) handleSend(false) } }}
                  placeholder="Type your answer or question..."
                  rows={2}
                  disabled={isThinking}
                  className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none disabled:opacity-40 leading-relaxed"
                />
                <div className="flex items-center gap-2 px-3 pb-3">
                  <div className="flex-1" />
                  <button
                    onClick={() => handleSend(true)}
                    disabled={isThinking}
                    className="px-3.5 py-1.5 rounded-xl text-sm transition-all disabled:opacity-40 hover:bg-outline/10"
                    style={{ color: "var(--color-on-surface-variant, #666)" }}>
                    I can explain this
                  </button>
                  <button
                    onClick={() => handleSend(false)}
                    disabled={!canSend}
                    className="px-4 py-1.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-35 hover:opacity-90"
                    style={{ background: "#006a6a", color: "white" }}>
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KG panel */}
        <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-outline-variant/15 flex-shrink-0">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Knowledge Graph</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-on-surface-variant/40 text-sm">
            Coming soon
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scorePopIn {
          0%   { opacity: 0; transform: scale(0.5) translateY(8px); }
          18%  { opacity: 1; transform: scale(1.18) translateY(0); }
          30%  { transform: scale(1) translateY(0); }
          72%  { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.92) translateY(-18px); }
        }
      `}</style>
    </main>
  )
}

// ── Root flow ─────────────────────────────────────────────────────────────────

export default function Home() {
  type Screen = "landing" | "assess" | "generating" | "learning"
  const [screen, setScreen]               = useState<Screen>("landing")
  const [topicInput, setTopicInput]       = useState("")
  const [selectedLevel, setSelectedLevel] = useState<Level>("intermediate")
  const [error, setError]                 = useState("")
  const [sessionId, setSessionId]         = useState("")
  const [syllabus, setSyllabus]           = useState<Syllabus | null>(null)
  const [initialScore, setInitialScore]   = useState(0)

  const topic = topicInput.trim() || "Backpropagation"

  const handleGenerateDone = (sid: string, syl: Syllabus, score: number) => {
    setSessionId(sid); setSyllabus(syl); setInitialScore(score)
    setScreen("learning")
  }

  const handleExit = () => {
    setSessionId(""); setSyllabus(null); setInitialScore(0)
    setScreen("landing")
  }

  // ── Landing ────────────────────────────────────────────────────────────────
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
              onChange={e => { setTopicInput(e.target.value); setError("") }}
              placeholder="Topic to learn (e.g. Backpropagation)"
              className="w-full bg-surface-container-lowest rounded-xl px-5 py-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none transition shadow-sm text-[15px]"
              onKeyDown={e => e.key === "Enter" && setScreen("assess")}
            />
            <button
              className="w-full py-3.5 rounded-xl font-medium hover:opacity-90 transition-opacity"
              style={{ background: "#006a6a", color: "white" }}
              onClick={() => setScreen("assess")}
            >
              Start Learning
            </button>
          </div>
          {error && <p className="text-on-error-container text-sm">{error}</p>}
          <p className="text-on-surface-variant/50 text-xs tracking-widest uppercase">YHack26</p>
        </div>
      </main>
    )
  }

  // ── Assess ─────────────────────────────────────────────────────────────────
  if (screen === "assess") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--color-surface, #f6f8f9)" }}>
        <div className="w-full max-w-md space-y-7">
          <div className="text-center space-y-1.5">
            <h2 className="text-3xl font-bold text-on-surface tracking-tight"
              style={{ fontFamily: "var(--font-newsreader, serif)" }}>
              How well do you know this?
            </h2>
            <p className="text-sm text-on-surface-variant">
              Topic: <span className="font-medium text-on-surface">{topic}</span>
            </p>
          </div>

          <div className="space-y-2">
            {LEVELS.map(lvl => {
              const isSelected = selectedLevel === lvl.value
              return (
                <button key={lvl.value} onClick={() => setSelectedLevel(lvl.value)}
                  className="w-full text-left px-5 py-4 rounded-2xl transition-all duration-150"
                  style={{
                    background: isSelected ? "rgba(0,106,106,0.09)" : "var(--color-surface-container-lowest, #fff)",
                    border: isSelected ? "1.5px solid rgba(0,106,106,0.45)" : "1.5px solid rgba(0,0,0,0.06)",
                    boxShadow: isSelected ? "0 0 0 3px rgba(0,106,106,0.07)" : "none",
                  }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ border: `1.5px solid ${isSelected ? "#006a6a" : "rgba(0,0,0,0.2)"}`, background: isSelected ? "#006a6a" : "transparent" }}>
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <path d="M20 6L9 17l-5-5"/>
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-on-surface text-[15px]">{lvl.label}</div>
                        <div className="text-sm text-on-surface-variant mt-0.5">{lvl.desc}</div>
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums flex-shrink-0"
                      style={{ color: isSelected ? "#006a6a" : "var(--color-on-surface-variant, #888)" }}>
                      {lvl.score} pts
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setScreen("landing")}
              className="flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>
            <button onClick={() => setScreen("generating")}
              className="flex-1 py-3 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
              style={{ background: "#006a6a", color: "white" }}>
              Generate Syllabus
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ── Generating ─────────────────────────────────────────────────────────────
  if (screen === "generating") {
    return <GeneratingScreen topic={topic} level={selectedLevel} onDone={handleGenerateDone} />
  }

  // ── Learning ───────────────────────────────────────────────────────────────
  if (screen === "learning" && syllabus) {
    return (
      <RealLearningScreen
        sessionId={sessionId}
        syllabus={syllabus}
        initialScore={initialScore}
        topic={topic}
        onExit={handleExit}
      />
    )
  }

  return null
}
