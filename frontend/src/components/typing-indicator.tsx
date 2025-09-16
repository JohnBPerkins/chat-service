'use client'

interface TypingIndicatorProps {
  text: string
  show: boolean
}

export function TypingIndicator({ text, show }: TypingIndicatorProps) {
  if (!show || !text) {
    return null
  }

  return (
    <div className="flex gap-3">
      <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
        </div>
      </div>
      <div className="flex-1">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl rounded-tl-lg px-4 py-3 border border-white/10">
          <span className="text-white/70 italic text-sm">{text}</span>
        </div>
      </div>
    </div>
  )
}