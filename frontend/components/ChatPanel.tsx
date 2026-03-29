"use client"

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react"
import { AgentMessage } from "./AgentMessage"
import { useSSE, SSEEvent } from "@/hooks/useSSE"
import { ChatMessage, TermPhase, PhaseUpdate, ScoreUpdate } from "@/types"

let msgIdCounter = 0
const nextId = () => String(++msgIdCounter)

function termKey(chapterIdx: number, termIdx: number) {
  return `${chapterIdx}_${termIdx}`
}

function playScoreChime(delta: number) {
  try {
    const ctx = new AudioContext()
    const freqs = delta >= 15 ? [523, 659, 784, 1047] : delta >= 10 ? [523, 659, 784] : [523, 659]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = "sine"
      const t = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.3, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
      osc.start(t)
      osc.stop(t + 0.25)
    })
  } catch { /* Web Audio not available */ }
}

interface Props {
  sessionId: string
  termPhase: TermPhase
  currentChapterIdx: number
  currentTermIdx: number
  onPhaseUpdate: (update: PhaseUpdate) => void
  onScoreUpdate: (update: ScoreUpdate) => void
}

export const ChatPanel = forwardRef<
  { viewHistory: (chapterIdx: number, termIdx: number) => void },
  Props
>(function ChatPanel({
  sessionId,
  termPhase,
  currentChapterIdx,
  currentTermIdx,
  onPhaseUpdate,
  onScoreUpdate,
}, ref) {
  // termChats stores per-term message history: key → messages
  const [termChats, setTermChats] = useState<Map<string, ChatMessage[]>>(new Map())
  // current active term's messages (live)
  const [currentMessages, setCurrentMessages] = useState<ChatMessage[]>([])
  // if viewing a previous term's history
  const [viewingKey, setViewingKey] = useState<string | null>(null)

  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [scorePopup, setScorePopup] = useState<{ delta: number; reason: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)

  const currentKey = termKey(currentChapterIdx, currentTermIdx)

  useImperativeHandle(ref, () => ({
    viewHistory: (chIdx: number, tIdx: number) => {
      setViewingKey(termKey(chIdx, tIdx))
    }
  }))

  // When term advances, save current messages to history and reset
  const prevTermKeyRef = useRef(currentKey)
  useEffect(() => {
    if (prevTermKeyRef.current !== currentKey) {
      // Save old term's messages
      const oldKey = prevTermKeyRef.current
      setTermChats(prev => new Map(prev).set(oldKey, currentMessages))
      // Start fresh for new term
      setCurrentMessages([])
      setViewingKey(null)
      prevTermKeyRef.current = currentKey
      // Auto-start new term
      setIsLoading(true)
      send(sessionId, "__start__")
    }
  }, [currentKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEvent = useCallback((event: SSEEvent) => {
    if (event.event === "agent_message") {
      setCurrentMessages(prev => [...prev, {
        id: nextId(),
        agent_id: "teacher" as const,
        content: event.data.content,
        timestamp: Date.now(),
      }])
    } else if (event.event === "score_update") {
      onScoreUpdate(event.data)
      if (event.data.delta > 0) {
        playScoreChime(event.data.delta)
        setScorePopup({ delta: event.data.delta, reason: event.data.reason })
        setTimeout(() => setScorePopup(null), 2500)
      }
    } else if (event.event === "phase_update") {
      onPhaseUpdate(event.data)
    } else if (event.event === "done") {
      setIsLoading(false)
    } else if (event.event === "error") {
      setIsLoading(false)
    }
  }, [onPhaseUpdate, onScoreUpdate])

  const { send } = useSSE({ onEvent: handleEvent })

  // Auto-start on mount
  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true
    setIsLoading(true)
    send(sessionId, "__start__")
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!viewingKey) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [currentMessages, viewingKey])

  const handleSend = async (overrideMsg?: string, iUnderstand = false) => {
    if (viewingKey) return  // can't send while viewing history
    const msg = overrideMsg ?? input.trim()
    if (!msg || isLoading) return

    setCurrentMessages(prev => [...prev, {
      id: nextId(),
      agent_id: "user",
      content: iUnderstand ? "✓ I understand this" : msg,
      timestamp: Date.now(),
    }])
    setInput("")
    setIsLoading(true)
    await send(sessionId, msg, iUnderstand)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend(undefined, false)
    }
  }

  // Messages to display: either viewing a previous term or current
  const displayMessages = viewingKey
    ? (termChats.get(viewingKey) ?? [])
    : currentMessages

  return (
    <div className="flex flex-col h-full relative">
      {/* Score popup */}
      {scorePopup && (
        <div
          className="absolute top-4 right-4 z-20 px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
          style={{ background: "#006a6a", color: "white", animation: "pulse 0.3s ease-out" }}
        >
          +{scorePopup.delta} pts ✦
          {scorePopup.reason && (
            <div className="text-xs font-normal opacity-80 mt-0.5">{scorePopup.reason}</div>
          )}
        </div>
      )}

      {/* Viewing history banner */}
      {viewingKey && (
        <div
          className="px-4 py-2 text-sm flex items-center justify-between flex-shrink-0"
          style={{ background: "rgba(0,106,106,0.08)", color: "#006a6a" }}
        >
          <span>Viewing previous term history</span>
          <button
            onClick={() => setViewingKey(null)}
            className="text-xs font-semibold hover:opacity-70"
          >
            Back to current →
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2">
        {displayMessages.length === 0 && isLoading && (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
            Preparing your lesson...
          </div>
        )}
        {displayMessages.map(msg => (
          <AgentMessage key={msg.id} agentId={msg.agent_id} content={msg.content} />
        ))}
        {isLoading && !viewingKey && (
          <div className="flex gap-2 items-center px-1 py-2">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 bg-outline rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-on-surface-variant">thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area — hidden when viewing history */}
      {!viewingKey && (
        <div className="p-4 border-t border-outline-variant/15 bg-surface flex-shrink-0">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => handleSend("I understand this concept", true)}
              disabled={isLoading}
              className="flex-1 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "rgba(0,106,106,0.1)",
                color: "#006a6a",
                border: "1.5px solid rgba(0,106,106,0.3)",
              }}
            >
              ✓ I understand this
            </button>
            <button
              onClick={() => {
                if (input.trim()) handleSend(undefined, false)
                else handleSend("I'm not sure yet, can you help me more?", false)
              }}
              disabled={isLoading}
              className="flex-1 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "rgba(116,119,127,0.08)",
                color: "var(--color-on-surface-variant, #555)",
                border: "1.5px solid rgba(116,119,127,0.2)",
              }}
            >
              Not yet — keep going
            </button>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer or question..."
              rows={2}
              disabled={isLoading}
              className="flex-1 resize-none bg-surface-container-lowest rounded-xl px-4 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none shadow-sm"
            />
            <button
              onClick={() => handleSend(undefined, false)}
              disabled={isLoading || !input.trim()}
              className="mb-0.5 px-4 py-3 bg-primary text-on-primary rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
