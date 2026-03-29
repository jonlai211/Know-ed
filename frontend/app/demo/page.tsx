"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { DemoKnowledgeGraph } from "@/components/DemoKnowledgeGraph"

// ── Static demo data ──────────────────────────────────────────────────────────

type Level = "novice" | "intermediate" | "advanced"

const LEVELS: { value: Level; label: string; desc: string; score: number }[] = [
  { value: "novice",       label: "Novice",        desc: "Just starting to explore this topic",          score: 20 },
  { value: "intermediate", label: "Intermediate",  desc: "Familiar with the basics, building fluency",   score: 40 },
  { value: "advanced",     label: "Advanced",      desc: "Solid understanding, seeking deeper insight",  score: 60 },
]

// Placeholder sources — replace with real URLs when ready
const DEMO_SOURCES = [
  { type: "article", url: "en.wikipedia.org/wiki/Diels–Alder_reaction" },
  { type: "video",   url: "youtube.com/watch?v=DA_reaction_mechanism" },
  { type: "course",  url: "ocw.mit.edu/courses/5-43-advanced-organic-chemistry" },
  { type: "article", url: "chemistry.libretexts.org/Diels-Alder" },
  { type: "video",   url: "youtube.com/watch?v=stereochemistry_DA" },
  { type: "article", url: "masterorganicchemistry.com/diels-alder-reaction" },
  { type: "paper",   url: "pubs.acs.org/doi/10.1021/cr900007n" },
  { type: "course",  url: "khanacademy.org/organic-chemistry/cycloadditions" },
  { type: "article", url: "chemguide.co.uk/mechanisms/dielsalder.html" },
]

const DEMO_CHAPTERS = [
  {
    id: "ch1",
    title: "Fundamentals",
    hook: "Master the core mechanism — the concerted [4+2] cycloaddition that makes Diels-Alder one of the most powerful bond-forming tools in synthesis.",
    start_here_if: "You want to understand how the reaction actually works at an atomic level",
    terms: [
      { id: "mechanism",   label: "Mechanism",   desc: "The concerted [4+2] cycloaddition, arrow pushing, and transition state" },
      { id: "components",  label: "Components",  desc: "Diene, dienophile, and the electronic requirements for each" },
      { id: "geometry",    label: "Geometry",    desc: "s-cis conformation requirement and orbital overlap" },
    ],
  },
  {
    id: "ch2",
    title: "Outcomes",
    hook: "Learn why Diels-Alder is prized in total synthesis — it controls both regiochemistry and stereochemistry in a single step.",
    start_here_if: "You already understand the mechanism and want to predict products for substituted reagents",
    terms: [
      { id: "stereo",  label: "Stereochemistry",  desc: "Endo/exo selectivity and how the concerted mechanism locks in relative configuration" },
      { id: "regio",   label: "Regiochemistry",   desc: "Ortho/para rule, FMO analysis, and predicting regioselectivity" },
    ],
  },
]

// ── Scripted teacher responses ────────────────────────────────────────────────

interface TeacherStep {
  text: string
  image?: string
  scoreAfter: number
  scoreDelta?: number
}

const TEACHER_STEPS: TeacherStep[] = [
  // 0 — intro, no score change (starts at 60)
  {
    text: `Fun fact: Chemists Unanimously Agree that the Diels-Alder Reaction Is Awesome.\n\n"The Diels-Alder reaction is one of the most useful of synthetic reactions."\n– Robert B. Woodward (1965 Nobel Prize in Chemistry)\n\n"The Diels-Alder reaction has both enabled and shaped the art and science of total synthesis over the last few decades, to an extent which, arguably, has yet to be eclipsed by any other transformation in the current synthetic repertoire."\n– K.C. Nicolaou (author of Classics in Total Synthesis)\n\n"The Diels-Alder is one of the most important and fascinating transformations in chemistry [and] continues to surprise, excite, delight, and inform the chemical community"\n– Elias J. Corey (1990 Nobel Prize in Chemistry)\n\nBased on your self-rating as an advanced learner, could you give me an example of a DA reaction with full arrow pushing mechanism? You can simply take a pic and I can help evaluate that for you.`,
    scoreAfter: 60,
  },
  // 1 — evaluates image (+9 → 69)
  {
    text: "Good job. I see that you have nailed the bond connectivity part, using carbon numbering to help guide the new bond formed in this reaction, where you reacted isoprene as the diene and ethylene as the dienophile.\n\nCan you draw all the different products that you would form if you use a substituted dienophile like (E)-but-2-ene shown here? Can you tell me why this is a more challenging case?",
    image: "/demo/demo_4.jpg",
    scoreAfter: 69,
    scoreDelta: 9,
  },
  // 2 — probing deeper, no score change
  {
    text: "That's correct, but why didn't you draw the thermodynamically more stable product shown below?",
    image: "/demo/demo_5.jpg",
    scoreAfter: 69,
  },
  // 3 — solid understanding (+13 → 82)
  {
    text: "This really shows you have a solid and fundamental understanding of the mechanism of Diels-Alder reaction so that you can predict the relative stereochemistry. What about an unsymmetrical substituted alkene like (Z)-pent-2-ene? What new dilemma has come up in this case?",
    image: "/demo/demo_6.jpg",
    scoreAfter: 82,
    scoreDelta: 13,
  },
  // 4 — great job (+8 → 90)
  {
    text: "Great job in recognizing the regiochemical problem that creates more dimensions of complexity in the system. This shows to me that you have built a model of how to visualize the bond formation events in your mind concretely and comprehensively.",
    scoreAfter: 90,
    scoreDelta: 8,
  },
  // 5 — teach-back prompt, no score change
  {
    text: "Can you summarize your mental model of Diels-Alder reaction for me now in less than three sentences? For example, what are the factors that we should pay attention to in predicting the product of a DA reaction?",
    scoreAfter: 90,
  },
  // 6 — teach-back success (+10 → 100)
  {
    text: "Excellent! You clearly understand the Diels-Alder reaction at a mechanistic level — both the stereochemical and regiochemical dimensions. Well done!",
    scoreAfter: 100,
    scoreDelta: 10,
  },
]

// ── Term intros (read-only panels for non-demo terms) ─────────────────────────

type IntroBlock = { type: "text"; content: string } | { type: "img"; src: string }

const TERM_INTROS: Record<string, IntroBlock[]> = {
  "0-1": [
    { type: "text", content: `The two coupling components in this reaction are:

The Diene — a conjugated diene that must adopt an s-cis conformation (double bonds on the same side of the connecting single bond).

The Dienophile — typically an electron-poor alkene or alkyne. Simple alkenes can react, but electron-withdrawing groups dramatically increase reactivity.

Using electron-donating and withdrawing effects, which would be the more reactive dienophile with 1,3-butadiene, and why?
A. Methyl vinyl ketone
B. Propene` },
  ],

  "0-2": [
    { type: "text", content: `Two geometric requirements must both be met for the [4+2] cycloaddition to occur:

1. S-Cis Conformation
The diene must be in the s-cis form — double bonds on the same side of C2–C3 — so that C1 and C4 are close enough to bond with the dienophile simultaneously. S-trans dienes and dienes locked in s-trans geometry cannot react.

2. Supra-Supra Approach
Both new bonds form on the same face of each component (the molecules stack like sheets of paper), ensuring the orbital lobes overlap constructively.

Consider the two cyclic dienes below. One reacts lightning-fast with maleic anhydride; the other is completely unreactive. Why?` },
    { type: "img", src: "/demo/demo_7.jpg" },
    { type: "img", src: "/demo/demo_8.jpg" },
  ],

  "1-0": [
    { type: "text", content: `Because the Diels-Alder reaction is concerted, the spatial arrangement of starting materials is directly "frozen" into the product. Three rules govern the 3D outcome:

1. Retention of Configuration ("Syn" Rule)
Relative geometry is preserved: cis substituents on the dienophile stay cis in the product; trans stay trans. Diene substituents at C1/C4 pointing "outside" end up on the same face of the new ring.

2. Endo Rule (Kinetic Preference)
When the dienophile carries a π-containing EWG (carbonyl, nitrile, etc.), the endo transition state — where the EWG sits under the diene — is favored due to secondary orbital overlap, lowering the activation energy.

3. Cyclic Dienes → Bridged Bicyclics
With cyclopentadiene the product is bicyclic. Endo: EWG points away from the bridge; Exo: EWG points toward it.

Predict the major product of (2E,4E)-2,4-hexadiene + dimethyl maleate: are the methyls cis or trans? The esters? In the major Endo product, are the esters on the same face as the methyls?` },
    { type: "img", src: "/demo/demo_9.jpg" },
    { type: "img", src: "/demo/demo_10.jpg" },
  ],

  "1-1": [
    { type: "text", content: `When both diene and dienophile are unsymmetrical, two regioisomeric products are possible. The "Ortho/Para Rule" predicts which dominates:

· 1-Substituted diene + substituted dienophile → 1,2-product ("Ortho")
· 2-Substituted diene + substituted dienophile → 1,4-product ("Para")
The 1,3-("Meta") product rarely forms.

Electronic Basis: Use resonance to find the most nucleophilic carbon on the diene (where the EDG pushes density) and the most electrophilic carbon on the dienophile (where the EWG withdraws density). The bond forms between these two centers. In FMO terms, the reaction maximizes overlap between the largest HOMO coefficient on the diene and the largest LUMO coefficient on the dienophile.

Predict the major regioisomer from 1-methoxy-1,3-butadiene + acrylonitrile.` },
    { type: "img", src: "/demo/demo_11.jpg" },
  ],
}

// ── DemoImage ─────────────────────────────────────────────────────────────────

function DemoImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        className="rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-center mt-2"
        style={{
          width: 240, height: 150,
          background: "rgba(0,106,106,0.06)",
          border: "1.5px dashed rgba(0,106,106,0.25)",
          color: "#006a6a", opacity: 0.7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span style={{ opacity: 0.7 }}>{src.split("/").pop()}</span>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt="diagram"
      onError={() => setFailed(true)}
      className="rounded-xl object-contain mt-2"
      style={{ maxWidth: "100%", maxHeight: 320 }}
    />
  )
}

// ── Generating screen ─────────────────────────────────────────────────────────

const ICON: Record<string, string> = { article: "📄", video: "🎬", course: "🎓", paper: "🔬" }

function GeneratingScreen({ topic, onDone }: { topic: string; onDone: () => void }) {
  const [visibleSources, setVisibleSources] = useState(0)
  const [stage, setStage] = useState<"searching" | "analyzing" | "building" | "done">("searching")
  const [visibleChapters, setVisibleChapters] = useState(0)
  const [visibleTerms, setVisibleTerms] = useState<number[]>([])

  const allTerms = DEMO_CHAPTERS.flatMap((ch, ci) => ch.terms.map((t, ti) => ({ ci, ti })))

  useEffect(() => {
    // Reveal sources one by one
    let i = 0
    const srcInterval = setInterval(() => {
      i++
      setVisibleSources(i)
      if (i >= DEMO_SOURCES.length) {
        clearInterval(srcInterval)
        setTimeout(() => setStage("analyzing"), 400)
      }
    }, 260)
    return () => clearInterval(srcInterval)
  }, [])

  useEffect(() => {
    if (stage === "analyzing") {
      setTimeout(() => setStage("building"), 1800)
    }
    if (stage === "building") {
      // Reveal chapters then terms
      let ci = 0
      const chInterval = setInterval(() => {
        ci++
        setVisibleChapters(ci)
        if (ci >= DEMO_CHAPTERS.length) clearInterval(chInterval)
      }, 500)
      let ti = 0
      const termInterval = setInterval(() => {
        if (ti < allTerms.length) {
          const { ci: chIdx, ti: tIdx } = allTerms[ti]
          setVisibleTerms(prev => [...prev, chIdx * 10 + tIdx])
          ti++
        } else {
          clearInterval(termInterval)
          setTimeout(() => setStage("done"), 600)
        }
      }, 180)
      return () => { clearInterval(chInterval); clearInterval(termInterval) }
    }
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const typeIcon = (type: string) => {
    if (type === "video")  return <span style={{ color: "#e53e3e" }}>▶</span>
    if (type === "course") return <span style={{ color: "#d69e2e" }}>🎓</span>
    if (type === "paper")  return <span style={{ color: "#805ad5" }}>⬡</span>
    return <span style={{ color: "#718096" }}>◈</span>
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10"
      style={{ background: "var(--color-surface, #f6f8f9)" }}>
      <div className="w-full max-w-lg">

        {/* Header */}
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

        {/* Sources */}
        <div className="rounded-2xl mb-3 overflow-hidden"
          style={{ background: "var(--color-surface-container-lowest, #fff)", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
            <span className="text-xs font-semibold text-on-surface-variant">Sources</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: "#006a6a" }}>
              {visibleSources} / {DEMO_SOURCES.length}
            </span>
          </div>
          <div className="px-5 py-3 space-y-2">
            {DEMO_SOURCES.slice(0, visibleSources).map((src, i) => (
              <div key={i} className="flex items-center gap-3"
                style={{ animation: "fadeSlideIn 0.18s ease-out" }}>
                <span className="text-[13px] w-4 text-center flex-shrink-0">{typeIcon(src.type)}</span>
                <span className="text-[13px] text-on-surface-variant truncate flex-1"
                  style={{ fontVariantNumeric: "tabular-nums" }}>
                  {src.url}
                </span>
                <svg className="flex-shrink-0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#006a6a" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
            ))}
            {visibleSources < DEMO_SOURCES.length && (
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

            {stage !== "analyzing" && (
              <div className="px-5 py-4 space-y-4">
                {DEMO_CHAPTERS.slice(0, visibleChapters).map((ch, ci) => (
                  <div key={ch.id} style={{ animation: "fadeSlideIn 0.2s ease-out" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                      style={{ color: "#006a6a" }}>
                      Chapter {ci + 1} — {ch.title}
                    </p>
                    <div className="space-y-1.5">
                      {ch.terms.map((t, ti) => visibleTerms.includes(ci * 10 + ti) && (
                        <div key={t.id} className="flex items-center gap-3"
                          style={{ animation: "fadeSlideIn 0.15s ease-out" }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: ci === 0 && ti === 0 ? "#006a6a" : "rgba(0,0,0,0.15)" }} />
                          <span className="text-sm"
                            style={{
                              color: ci === 0 && ti === 0 ? "#006a6a" : "var(--color-on-surface, #1a1a1a)",
                              fontWeight: ci === 0 && ti === 0 ? 600 : 400,
                            }}>
                            {t.label}
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
          <button
            onClick={onDone}
            className="w-full py-4 rounded-2xl font-semibold text-[15px] hover:opacity-90 transition-opacity"
            style={{ background: "#006a6a", color: "white" }}
          >
            Start Learning
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
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

// ── Learning screen ───────────────────────────────────────────────────────────

interface Msg {
  id: number
  role: "teacher" | "user"
  text?: string
  imageUrl?: string
  isUnderstand?: true
}

function LearningScreen({
  topic,
  initialScore,
  chapterIdx,
  termIdx,
  onExit,
}: {
  topic: string
  initialScore: number
  chapterIdx: number
  termIdx: number
  onExit: () => void
}) {
  const chapter = DEMO_CHAPTERS[chapterIdx]
  const term = chapter.terms[termIdx]

  const [messages, setMessages] = useState<Msg[]>([])
  const [score, setScore] = useState(initialScore)
  const [isThinking, setIsThinking] = useState(false)
  const [teacherIdx, setTeacherIdx] = useState(0)
  const [input, setInput] = useState("")
  const [attachedImage, setAttachedImage] = useState<{ url: string; name: string } | null>(null)
  const [scorePopup, setScorePopup] = useState<{ delta: number; key: number } | null>(null)
  const [activeTermKey, setActiveTermKey] = useState("0-0")
  const popupKeyRef = useRef(0)

  const msgId = useRef(0)
  const hasStarted = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nextId = () => { msgId.current += 1; return msgId.current }

  const playScoreSound = () => {
    try {
      const ctx = new AudioContext()
      const times = [0, 0.08, 0.18]
      const freqs = [660, 880, 1100]
      times.forEach((t, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = "sine"
        osc.frequency.value = freqs[i]
        gain.gain.setValueAtTime(0, ctx.currentTime + t)
        gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22)
        osc.start(ctx.currentTime + t)
        osc.stop(ctx.currentTime + t + 0.25)
      })
    } catch { /* AudioContext not available */ }
  }

  const playSuccessSound = () => {
    try {
      const ctx = new AudioContext()
      const notes = [523, 659, 784, 1047, 1319]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = "sine"
        osc.frequency.value = freq
        const start = ctx.currentTime + i * 0.10
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4)
        osc.start(start)
        osc.stop(start + 0.45)
      })
    } catch { /* AudioContext not available */ }
  }

  const addMsg = useCallback((m: Omit<Msg, "id">) => {
    setMessages(prev => [...prev, { ...m, id: nextId() }])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fireTeacher = useCallback((idx: number) => {
    if (idx >= TEACHER_STEPS.length) return
    const step = TEACHER_STEPS[idx]
    setIsThinking(true)
    setTimeout(() => {
      setIsThinking(false)
      addMsg({ role: "teacher", text: step.text, imageUrl: step.image })
      setScore(step.scoreAfter)
      if (step.scoreDelta && step.scoreDelta > 0) {
        popupKeyRef.current += 1
        const isTeachBack = idx === TEACHER_STEPS.length - 1
        setScorePopup({ delta: step.scoreDelta, key: popupKeyRef.current })
        if (isTeachBack) {
          playSuccessSound()
        } else {
          playScoreSound()
        }
        setTimeout(() => setScorePopup(null), 2800)
      }
      setTeacherIdx(idx + 1)
    }, 1600)
  }, [addMsg]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true
    fireTeacher(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 50)
    return () => clearTimeout(t)
  }, [messages, isThinking])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachedImage({ url: URL.createObjectURL(file), name: file.name })
    e.target.value = ""
  }

  const handleRemoveAttachment = () => {
    if (attachedImage) URL.revokeObjectURL(attachedImage.url)
    setAttachedImage(null)
  }

  const canSend = !isThinking && teacherIdx < TEACHER_STEPS.length &&
    (input.trim().length > 0 || attachedImage !== null)

  const handleSend = (iUnderstand = false) => {
    if (isThinking || teacherIdx >= TEACHER_STEPS.length) return
    if (!iUnderstand && !input.trim() && !attachedImage) return
    if (iUnderstand) {
      addMsg({ role: "user", isUnderstand: true })
    } else {
      addMsg({ role: "user", text: input.trim() || undefined, imageUrl: attachedImage?.url })
    }
    setInput("")
    setAttachedImage(null)
    setTimeout(() => fireTeacher(teacherIdx), 300)
  }

  const scorePercent = Math.min(100, (score / 100) * 100)
  const isDone = teacherIdx >= TEACHER_STEPS.length && !isThinking

  // Active term info (for header + sidebar)
  const [activeChIdx, activeTIdx] = activeTermKey.split("-").map(Number)
  const activeChapter = DEMO_CHAPTERS[activeChIdx]
  const activeTerm = activeChapter?.terms[activeTIdx]

  return (
    <main className="h-screen bg-surface flex flex-col overflow-hidden">
      <header className="px-6 py-3 flex items-center flex-shrink-0 border-b border-outline-variant/15">
        <h1
          className="text-xl font-bold text-primary-container tracking-tight flex-1"
          style={{ fontFamily: "var(--font-newsreader, serif)" }}
        >
          Know-de
        </h1>
        <button onClick={onExit} className="flex items-center gap-1.5 text-on-surface-variant text-sm hover:opacity-70 transition-opacity whitespace-nowrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
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
            {DEMO_CHAPTERS.map((ch, chIdx) => (
              <div key={ch.id} className="mb-1">
                <div className="px-4 pt-4 pb-1.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: activeChIdx === chIdx ? "#006a6a" : "var(--color-on-surface-variant, #aaa)" }}>
                      Ch {chIdx + 1}
                    </span>
                    <span className="flex-1 h-px" style={{ background: activeChIdx === chIdx ? "rgba(0,106,106,0.2)" : "rgba(0,0,0,0.07)" }} />
                  </div>
                  <span className="text-[14px] font-semibold"
                    style={{ color: activeChIdx === chIdx ? "#006a6a" : "var(--color-on-surface, #1a1a1a)" }}>
                    {ch.title}
                  </span>
                </div>
                {ch.terms.map((t, tIdx) => {
                  const key = `${chIdx}-${tIdx}`
                  const isSelected = activeTermKey === key
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTermKey(key)}
                      className="w-full mx-2 px-3 py-1.5 rounded-lg flex items-center gap-2 mb-0.5 text-left transition-colors hover:bg-surface-container"
                      style={{
                        width: "calc(100% - 1rem)",
                        background: isSelected ? "rgba(0,106,106,0.1)" : "transparent",
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: isSelected ? "#006a6a" : "#ccc" }} />
                      <span className="text-[13px] truncate"
                        style={{ color: isSelected ? "#006a6a" : "var(--color-on-surface, #1a1a1a)", fontWeight: isSelected ? 600 : 400 }}>
                        {t.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Chat — unified layout for all terms */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-outline-variant/15 min-w-0">
          {/* Progress bar — above chat only */}
          <div className="px-5 py-2 flex items-center gap-3 border-b border-outline-variant/15 flex-shrink-0">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,106,106,0.1)" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${scorePercent}%`, background: "#006a6a" }} />
            </div>
            <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "#006a6a", minWidth: "3rem" }}>{score} pts</span>
          </div>
          <div className="flex flex-col h-full relative" style={{ height: "calc(100% - 41px)" }}>
            {/* Score popup (main demo only) */}
            {activeTermKey === "0-0" && scorePopup && (
              <div key={scorePopup.key} className="absolute inset-x-0 top-0 flex justify-center z-20 pointer-events-none pt-5">
                <div className="px-6 py-3 rounded-2xl font-bold shadow-2xl"
                  style={{
                    background: "linear-gradient(135deg, #006a6a 0%, #00908f 100%)",
                    color: "white",
                    fontSize: "1.5rem",
                    letterSpacing: "-0.01em",
                    animation: "scorePopIn 2.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
                    boxShadow: "0 0 0 0 rgba(0,106,106,0.4), 0 8px 32px rgba(0,106,106,0.35)",
                  }}>
                  +{scorePopup.delta} pts ✦
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-col justify-end min-h-full gap-3">

                {activeTermKey === "0-0" ? (
                  /* ── Main demo messages ── */
                  <>
                    {messages.map(msg => {
                      if (msg.role === "user") {
                        return (
                          <div key={msg.id} className="flex justify-end">
                            <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-br-sm shadow-sm text-[15px] leading-relaxed"
                              style={{ background: "rgba(0,106,106,0.10)", color: "var(--color-on-surface, #1a1a1a)" }}>
                              {msg.isUnderstand && <span className="text-on-surface-variant italic">I think I&apos;m ready to explain this.</span>}
                              {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                              {msg.imageUrl && <DemoImage src={msg.imageUrl} />}
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={msg.id} className="flex justify-start gap-2.5">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                            style={{ background: "rgba(0,106,106,0.12)", color: "#006a6a" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#006a6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                            </svg>
                          </div>
                          <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-container-lowest shadow-sm"
                            style={{ border: "1px solid rgba(0,106,106,0.08)" }}>
                            {msg.text && <p className="text-[15px] text-on-surface leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                            {msg.imageUrl && <DemoImage src={msg.imageUrl} />}
                          </div>
                        </div>
                      )
                    })}
                    {isThinking && (
                      <div className="flex items-start gap-2.5">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                          style={{ background: "rgba(0,106,106,0.12)", color: "#006a6a" }}>T</div>
                        <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-surface-container-lowest shadow-sm"
                          style={{ border: "1px solid rgba(0,106,106,0.08)" }}>
                          <div className="flex gap-1.5 items-center">
                            {[0, 1, 2].map(i => (
                              <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                                style={{ background: "#006a6a", opacity: 0.5, animationDelay: `${i * 0.15}s` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {isDone && (
                      <div className="flex justify-center py-2">
                        <span className="text-xs text-on-surface-variant/40 tracking-wide">— Session complete —</span>
                      </div>
                    )}
                  </>
                ) : (
                  /* ── Term intro bubble ── */
                  <div className="flex justify-start gap-2.5">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                      style={{ background: "rgba(0,106,106,0.12)", color: "#006a6a" }}>T</div>
                    <div className="max-w-[85%]">
                      <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-surface-container-lowest shadow-sm text-[14.5px] leading-relaxed"
                        style={{ border: "1px solid rgba(0,106,106,0.08)" }}>
                        <div className="text-xs font-semibold mb-2.5" style={{ color: "#006a6a" }}>
                          {activeTerm?.label} · {activeChapter?.title}
                        </div>
                        {(TERM_INTROS[activeTermKey] ?? []).map((block, i) =>
                          block.type === "text" ? (
                            <p key={i} className="text-on-surface whitespace-pre-wrap leading-relaxed">
                              {block.content}
                            </p>
                          ) : (
                            <div key={i} className="mt-3">
                              <DemoImage src={block.src} />
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* Input area — hidden only when mechanism demo is done */}
            {(!isDone || activeTermKey !== "0-0") && (
              <div className="px-4 pb-4 pt-2 flex-shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                <div className="rounded-2xl shadow-sm overflow-hidden"
                  style={{ border: "1.5px solid rgba(0,0,0,0.08)", background: "var(--color-surface-container-lowest, #fff)" }}>

                  {/* Attachment preview (main demo only) */}
                  {activeTermKey === "0-0" && attachedImage && (
                    <div className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(0,106,106,0.06)", border: "1px solid rgba(0,106,106,0.12)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={attachedImage.url} alt="attachment" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                      <span className="text-xs text-on-surface-variant truncate flex-1">{attachedImage.name}</span>
                      <button onClick={handleRemoveAttachment}
                        className="p-1 rounded-lg text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-outline/10 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Textarea */}
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) handleSend(false) } }}
                    placeholder="Type your answer or question..."
                    rows={2}
                    disabled={isThinking}
                    className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none disabled:opacity-40 leading-relaxed"
                  />

                  {/* Action bar */}
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isThinking}
                      title="Attach image"
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 hover:bg-outline/10"
                      style={{ color: "var(--color-on-surface-variant, #777)" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => handleSend(true)}
                      disabled={isThinking}
                      className="px-3.5 py-1.5 rounded-xl text-sm transition-all disabled:opacity-40 hover:bg-outline/10"
                      style={{ color: "var(--color-on-surface-variant, #666)" }}
                    >
                      I can explain this
                    </button>
                    <button
                      onClick={() => handleSend(false)}
                      disabled={!canSend}
                      className="px-4 py-1.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-35 hover:opacity-90"
                      style={{ background: "#006a6a", color: "white" }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* KG panel */}
        <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-outline-variant/15 flex-shrink-0">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Knowledge Graph</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <DemoKnowledgeGraph activeTermKey={activeTermKey} />
          </div>
        </div>
      </div>
    </main>
  )
}

// ── Demo flow wrapper ─────────────────────────────────────────────────────────

type Screen = "landing" | "assess" | "generating" | "learning"

function DemoFlow({ onRestart }: { onRestart: () => void }) {
  const [screen, setScreen] = useState<Screen>("landing")
  const [topicInput, setTopicInput] = useState("")
  const [selectedLevel, setSelectedLevel] = useState<Level>("advanced")
  const [error, setError] = useState("")

  const topic = topicInput.trim() || "Diels-Alder Reaction"

  const handleStartLearning = () => {
    const t = topicInput.trim().toLowerCase()
    if (t && !t.includes("diels")) {
      setError("Only \"Diels-Alder Reaction\" is available in demo mode.")
      return
    }
    setError("")
    setScreen("assess")
  }

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
              onChange={e => { setTopicInput(e.target.value); setError("") }}
              placeholder="Topic to learn (e.g. Diels-Alder Reaction)"
              className="w-full bg-surface-container-lowest rounded-xl px-5 py-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none transition shadow-sm text-[15px]"
              onKeyDown={e => e.key === "Enter" && handleStartLearning()}
            />
            <button
              className="w-full py-3.5 rounded-xl font-medium hover:opacity-90 transition-opacity"
              style={{ background: "#006a6a", color: "white" }}
              onClick={handleStartLearning}
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

  // ── Assess ───────────────────────────────────────────────────────────────────
  if (screen === "assess") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--color-surface, #f6f8f9)" }}>
        <div className="w-full max-w-md space-y-7">

          {/* Header */}
          <div className="text-center space-y-1.5">
            <h2 className="text-3xl font-bold text-on-surface tracking-tight"
              style={{ fontFamily: "var(--font-newsreader, serif)" }}>
              How well do you know this?
            </h2>
            <p className="text-sm text-on-surface-variant">
              Topic: <span className="font-medium text-on-surface">{topic}</span>
            </p>
          </div>

          {/* Level cards */}
          <div className="space-y-2">
            {LEVELS.map(lvl => {
              const isSelected = selectedLevel === lvl.value
              return (
                <button
                  key={lvl.value}
                  onClick={() => setSelectedLevel(lvl.value)}
                  className="w-full text-left px-5 py-4 rounded-2xl transition-all duration-150"
                  style={{
                    background: isSelected
                      ? "rgba(0,106,106,0.09)"
                      : "var(--color-surface-container-lowest, #fff)",
                    border: isSelected
                      ? "1.5px solid rgba(0,106,106,0.45)"
                      : "1.5px solid rgba(0,0,0,0.06)",
                    boxShadow: isSelected ? "0 0 0 3px rgba(0,106,106,0.07)" : "none",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Selection indicator */}
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          border: `1.5px solid ${isSelected ? "#006a6a" : "rgba(0,0,0,0.2)"}`,
                          background: isSelected ? "#006a6a" : "transparent",
                        }}>
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <path d="M20 6L9 17l-5-5"/>
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-on-surface">{lvl.label}</span>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">{lvl.desc}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums flex-shrink-0"
                      style={{ color: isSelected ? "#006a6a" : "var(--color-on-surface-variant, #888)" }}>
                      {lvl.score} pts
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={() => setScreen("landing")}
              className="flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <button
              onClick={() => setScreen("generating")}
              className="flex-1 py-3 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
              style={{ background: "#006a6a", color: "white" }}
            >
              Generate Syllabus
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ── Generating ────────────────────────────────────────────────────────────────
  if (screen === "generating") {
    return <GeneratingScreen topic={topic} onDone={() => setScreen("learning")} />
  }

  // ── Learning ──────────────────────────────────────────────────────────────────
  const levelScore = LEVELS.find(l => l.value === selectedLevel)?.score ?? 60
  return (
    <LearningScreen
      topic={topic}
      initialScore={levelScore}
      chapterIdx={0}
      termIdx={0}
      onExit={onRestart}
    />
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [key, setKey] = useState(0)
  return <DemoFlow key={key} onRestart={() => setKey(k => k + 1)} />
}
