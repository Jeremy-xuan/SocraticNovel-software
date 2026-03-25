import { useState, useRef } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  };

  return (
    <div className="shrink-0 w-full px-4 sm:px-8 pb-8 pt-2 bg-gradient-to-t from-surface-light via-surface-light to-transparent dark:from-surface-dark dark:via-surface-dark">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative flex items-end rounded-[24px] bg-surface-light shadow-float border border-border-light dark:border-border-dark dark:bg-[#1E1D1A] transition-all duration-300 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={disabled ? '等待 AI 回复...' : '输入消息...（Enter 发送，Shift+Enter 换行）'}
            rows={1}
            className="flex-1 max-h-[150px] resize-none bg-transparent px-6 py-4 text-[15px] leading-relaxed text-text-main placeholder-text-placeholder focus:outline-none disabled:opacity-50 dark:text-text-main-dark"
          />
          <div className="shrink-0 p-2 flex items-center justify-center">
            <button
              onClick={handleSubmit}
              disabled={disabled || !text.trim()}
              className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-primary text-white transition-all duration-200 hover:scale-105 hover:bg-[#BF6A4E] disabled:opacity-30 disabled:hover:scale-100 disabled:hover:bg-primary shadow-sm"
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="mt-3 text-center text-[11px] tracking-wide text-text-placeholder">
          AI 可能会犯错。核实重要信息。
        </div>
      </div>
    </div>
  );
}
