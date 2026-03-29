import { useCallback, useRef } from "react"
import { ScoreUpdate, PhaseUpdate } from "@/types"

export type SSEEvent =
  | { event: "agent_message"; data: { agent_id: string; content: string } }
  | { event: "score_update"; data: ScoreUpdate }
  | { event: "phase_update"; data: PhaseUpdate }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: Record<string, never> }

type SSEHandlers = {
  onEvent: (event: SSEEvent) => void
  onError?: (err: Error) => void
}

export function useSSE({ onEvent, onError }: SSEHandlers) {
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async (sessionId: string, message: string, iUnderstand = false, imageFile?: File | null) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        // Base64-encode image if present
        let imageB64: string | undefined
        let imageMime: string | undefined
        if (imageFile) {
          imageMime = imageFile.type || "image/jpeg"
          imageB64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(",")[1])
            reader.onerror = reject
            reader.readAsDataURL(imageFile)
          })
        }

        const res = await fetch("http://localhost:8000/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            message,
            i_understand: iUnderstand,
            ...(imageB64 ? { image_b64: imageB64, image_mime: imageMime } : {}),
          }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const parts = buffer.split("\n\n")
          buffer = parts.pop() ?? ""

          for (const part of parts) {
            if (!part.trim()) continue
            const lines = part.split("\n")
            let eventName = ""
            let dataStr = ""
            for (const line of lines) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim()
              if (line.startsWith("data: ")) dataStr = line.slice(6).trim()
            }
            if (eventName && dataStr) {
              try {
                const parsed = { event: eventName, data: JSON.parse(dataStr) } as SSEEvent
                onEvent(parsed)
              } catch {
                // skip malformed
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onError?.(err as Error)
        }
      }
    },
    [onEvent, onError]
  )

  const abort = useCallback(() => abortRef.current?.abort(), [])

  return { send, abort }
}
