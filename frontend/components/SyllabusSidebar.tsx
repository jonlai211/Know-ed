"use client"

import { Syllabus } from "@/types"

interface Props {
  syllabus: Syllabus
  currentChapterIdx: number
  currentTermIdx: number
  onViewHistory?: (chapterIdx: number, termIdx: number) => void
}

export function SyllabusSidebar({ syllabus, currentChapterIdx, currentTermIdx, onViewHistory }: Props) {
  return (
    <aside className="w-56 flex-shrink-0 border-r border-outline-variant/15 overflow-y-auto flex flex-col">
      <div className="px-4 py-3 border-b border-outline-variant/15">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
          Syllabus
        </span>
      </div>

      <nav className="flex-1 py-2">
        {syllabus.chapters.map((chapter, chIdx) => (
          <div key={chapter.id} className="mb-1">
            {/* Chapter header */}
            <div className="px-4 py-1.5 flex items-center gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: chIdx === currentChapterIdx ? "#006a6a" : "var(--color-on-surface-variant, #444)" }}
              >
                Ch {chIdx + 1}
              </span>
              <span
                className="text-xs font-medium truncate"
                style={{ color: chIdx === currentChapterIdx ? "#006a6a" : "var(--color-on-surface-variant, #444)" }}
              >
                {chapter.title}
              </span>
            </div>

            {/* Terms */}
            {chapter.terms.map((term, tIdx) => {
              const isCurrent = chIdx === currentChapterIdx && tIdx === currentTermIdx
              const isDone = chIdx < currentChapterIdx || (chIdx === currentChapterIdx && tIdx < currentTermIdx)

              return (
                <div
                  key={term.id}
                  onClick={() => isDone && onViewHistory?.(chIdx, tIdx)}
                  className="mx-2 px-3 py-1.5 rounded-lg flex items-center gap-2 mb-0.5"
                  style={{
                    background: isCurrent ? "rgba(0,106,106,0.1)" : "transparent",
                    cursor: isDone ? "pointer" : "default",
                  }}
                >
                  {/* Status dot */}
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: isDone ? "#006a6a" : isCurrent ? "#006a6a" : "#ccc",
                      opacity: isDone ? 0.5 : 1,
                    }}
                  />
                  <span
                    className="text-xs truncate"
                    style={{
                      color: isCurrent
                        ? "#006a6a"
                        : isDone
                        ? "var(--color-on-surface-variant, #888)"
                        : "var(--color-on-surface, #1a1a1a)",
                      fontWeight: isCurrent ? 600 : 400,
                      textDecoration: isDone ? "line-through" : "none",
                      opacity: isDone ? 0.6 : 1,
                    }}
                  >
                    {term.term}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
