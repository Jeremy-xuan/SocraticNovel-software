import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { ChatMessage } from '../../types';
import { useAppStore } from '../../stores/appStore';

interface Props {
  message: ChatMessage;
}

export default function ChatMessageBubble({ message }: Props) {
  const thinkingStatus = useAppStore((s) => s.thinkingStatus);

  if (message.role === 'system') {
    return (
      <div className="my-6 flex justify-center">
        <span className="rounded-full bg-border-light/30 px-5 py-2 text-[13px] font-medium tracking-wide text-text-sub dark:bg-surface-dark dark:text-text-placeholder">
          {message.text}
        </span>
      </div>
    );
  }

  const isUser = message.role === 'user';
  const showThinking = message.isStreaming && !message.text && thinkingStatus;

  return (
    <div className={`my-8 flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`w-full max-w-3xl ${isUser ? 'ml-auto max-w-[70%]' : ''}`}>

        {isUser ? (
          /* User Message: Soft warm gray bubble, right aligned */
          <div className="float-right rounded-[20px] rounded-br-[4px] bg-[#F5F2EC] px-6 py-4 text-text-main shadow-sm dark:bg-[#2A2825] dark:text-text-main-dark">
            <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{message.text}</p>
          </div>
        ) : (
          /* AI Message: Flush left, completely borderless, sophisticated spacing */
          <div className="flex gap-5">
            {/* AI Avatar */}
            <div className="shrink-0 mt-1 h-8 w-8 rounded-full bg-[#E5E0D8] dark:bg-[#33302C] flex items-center justify-center text-primary text-xs font-semibold tracking-wider">
              AI
            </div>

            {/* Text Content */}
            <div className="flex-1 min-w-0">
              {showThinking && (
                <div className="mb-2 flex items-center gap-2 text-text-placeholder text-[14px]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                  <span className="animate-pulse">{thinkingStatus}</span>
                </div>
              )}

              {message.text ? (
                <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:leading-[1.7] prose-p:my-4 prose-headings:font-medium prose-headings:tracking-tight prose-headings:mt-8 prose-headings:mb-4 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-pre:my-6 prose-pre:rounded-[12px] prose-pre:bg-[#1E1E1E] prose-blockquote:my-6 prose-blockquote:border-l-primary prose-blockquote:text-text-sub">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {message.text}
                  </ReactMarkdown>
                </div>
              ) : null}

              {/* Tool calls indicator */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 pt-2">
                  {message.toolCalls.map((tc) => (
                    <div key={tc.id} className="inline-flex items-center rounded-full bg-border-light/40 px-3 py-1 text-[12px] tracking-wide text-text-sub dark:bg-border-dark/40">
                      <span className="mr-1.5 opacity-70">🔧</span>
                      {tc.name}
                      {tc.isError && <span className="ml-1 text-danger">❌</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Streaming cursor */}
              {message.isStreaming && message.text && (
                <span className="ml-1 inline-block h-4 w-2 bg-primary animate-pulse align-middle opacity-70"></span>
              )}
            </div>

            <div className="clear-both"></div>
          </div>
        )}
      </div>
    </div>
  );
}
