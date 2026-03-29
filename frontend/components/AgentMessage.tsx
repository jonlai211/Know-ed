const AGENT_CONFIG: Record<string, { name: string; color: string }> = {
  teacher: { name: "Tutor", color: "#006a6a" },
  user:    { name: "You",   color: "#74777f" },
}

interface Props {
  agentId: string
  content: string
  isStreaming?: boolean
}

export function AgentMessage({ agentId, content, isStreaming }: Props) {
  const config = AGENT_CONFIG[agentId] ?? AGENT_CONFIG.teacher
  const isUser = agentId === "user"

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[72%] bg-surface-container px-5 py-3 rounded-xl rounded-br-none shadow-sm">
          <p className="text-[15px] text-on-surface leading-relaxed">{content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-4">
      <div
        className="max-w-[72%] bg-surface-container-lowest px-5 py-4 rounded-xl rounded-tl-none shadow-sm"
        style={{ borderLeft: `2.5px solid ${config.color}` }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="font-[family-name:var(--font-newsreader)] font-bold text-sm tracking-wide"
            style={{ color: config.color }}
          >
            {config.name}
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: config.color }}
          />
        </div>
        <p className="text-[15px] text-on-surface leading-relaxed">
          {content}
          {isStreaming && (
            <span className="inline-block w-1 h-3.5 bg-outline ml-0.5 animate-pulse rounded-sm" />
          )}
        </p>
      </div>
    </div>
  )
}
