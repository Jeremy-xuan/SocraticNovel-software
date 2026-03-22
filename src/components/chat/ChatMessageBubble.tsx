import type { ChatMessage } from '../../types';

interface Props {
  message: ChatMessage;
}

export default function ChatMessageBubble({ message }: Props) {
  if (message.role === 'system') {
    return (
      <div className="my-3 flex justify-center">
        <span className="rounded-full bg-slate-100 px-4 py-1.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {message.text}
        </span>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`my-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
        }`}
      >
        {/* TODO: render markdown + KaTeX for assistant messages */}
        <p className="whitespace-pre-wrap">{message.text}</p>

        {/* Tool calls indicator */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 border-t border-slate-200/20 pt-2">
            {message.toolCalls.map((tc) => (
              <div key={tc.id} className="text-xs opacity-70">
                🔧 {tc.name}({Object.keys(tc.input).join(', ')})
                {tc.isError && ' ❌'}
              </div>
            ))}
          </div>
        )}

        {/* Streaming indicator */}
        {message.isStreaming && (
          <span className="ml-1 inline-block animate-pulse">▊</span>
        )}
      </div>
    </div>
  );
}
