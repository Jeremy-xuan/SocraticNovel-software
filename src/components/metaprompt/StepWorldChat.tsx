import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { simpleChat } from '../../lib/tauri';
import { getEffectiveApiKey, getEffectiveCustomUrl, getEffectiveModel, getEffectiveProvider } from '../../lib/providerConfig';
import type { SimpleChatMessage } from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { getProviderModels } from '../../lib/providerModels';
import type { MetaPromptQuestionnaire, WorldSetting } from '../../types';
import { TEACHING_STYLE_LABELS } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

interface ChatBubble {
  id: string;
  role: 'ai' | 'user';
  text: string;
  options?: string[];
}

function buildSystemPrompt(data: MetaPromptQuestionnaire): string {
  const charSummary = data.characters
    .map(c => {
      const style = TEACHING_STYLE_LABELS[c.teachingStyle];
      return `${c.name}（${c.gender}，${c.age}岁，${style.label}风格，性格：${c.personalityCore.slice(0, 60)}）`;
    })
    .join('\n  - ');

  const modeDesc = data.storyMode === 'novel'
    ? (data.story.novelReferenceType === 'existing-work' && data.story.existingWorkName
      ? `小说模式，参考《${data.story.existingWorkName}》`
      : '小说模式，自由设计故事线')
    : '标准教学模式';

  return `你是 SocraticNovel 的世界观构建助手，语气亲切自然，像朋友聊天。
用户已经设计了以下内容：
- 学科：${data.subject.subjectName}
- 教学模式：${modeDesc}
- 角色（${data.characterCount}位）：
  - ${charSummary}

你的任务是通过对话帮用户确定 4 项世界观设定。每轮只问一个问题，按以下顺序：

1. **场景类型**：故事发生在什么样的空间？
   可选：封闭空间（观测站、灯塔）/ 半开放空间（森林小屋、天台）/ 日常空间（合租公寓、老房子）/ 自定义
2. **到来方式**：学习者是怎么来到这里的？
   可选：被安排/转来 / 主动找来 / 偶然到来 / 命运使然
3. **教学动机**：这些老师为什么教你？
   可选：职业教师 / 各有隐情 / 专属导师 / 共同目标
4. **超自然元素**：要不要加入超自然设定？
   可选：不加 / 要加（描述具体内容）

重要规则：
- 每轮给出 2-4 个建议选项，用 [选项:文字] 格式标记。用户可以点选也可以自由回答。
- 基于角色性格和学科特点给出个性化建议，不要机械列举。
- 简短回复，每轮不超过 3-4 句话。
- 第 4 项问完后，输出最终 JSON 总结。用 \`\`\`json 包裹，格式如下：
\`\`\`json
{
  "locationStyle": "enclosed|semi-open|everyday|custom",
  "arrivalType": "arranged|self-sought|accidental|fated",
  "teachingMotivation": "professional|personal-secret|assigned-mentor|shared-goal",
  "hasSupernatural": false,
  "supernaturalElement": "",
  "summary": "一段 2-3 句的世界观总结描述"
}
\`\`\`
JSON 之前加一段自然语言总结，让用户确认。`;
}

function parseOptions(text: string): { cleanText: string; options: string[] } {
  const options: string[] = [];
  const cleanText = text.replace(/\[选项[:：]([^\]]+)\]/g, (_, opt) => {
    options.push(opt.trim());
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { cleanText, options };
}

function parseWorldJson(text: string): Partial<WorldSetting> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const validLocation = ['enclosed', 'semi-open', 'everyday', 'custom'];
    const validArrival = ['arranged', 'self-sought', 'accidental', 'fated'];
    const validMotiv = ['professional', 'personal-secret', 'assigned-mentor', 'shared-goal'];

    return {
      locationStyle: validLocation.includes(parsed.locationStyle) ? parsed.locationStyle : 'enclosed',
      arrivalType: validArrival.includes(parsed.arrivalType) ? parsed.arrivalType : 'self-sought',
      teachingMotivation: validMotiv.includes(parsed.teachingMotivation) ? parsed.teachingMotivation : 'professional',
      hasSupernatural: !!parsed.hasSupernatural,
      supernaturalElement: parsed.supernaturalElement || '',
      location: parsed.summary || '',
    };
  } catch {
    return null;
  }
}

export default function StepWorldChat({ data, onChange }: Props) {
  const { t } = useTranslation();
  const settings = useAppStore(s => s.settings);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [parsedWorld, setParsedWorld] = useState<Partial<WorldSetting> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, []);

  const provider = getEffectiveProvider(settings);
  const model = getEffectiveModel(settings)
    || getProviderModels(settings.aiProvider, settings.customProviderConfig).find((m) => m.default)?.id
    || '';

  const sendToAi = useCallback(async (allBubbles: ChatBubble[]) => {
    setLoading(true);
    setError('');
    try {
      const apiKey = await getEffectiveApiKey(settings);
      const customUrl = getEffectiveCustomUrl(settings);
      const messages: SimpleChatMessage[] = allBubbles.map(b => ({
        role: b.role === 'ai' ? 'assistant' as const : 'user' as const,
        text: b.text + (b.options?.length ? '\n' + b.options.map(o => `[选项:${o}]`).join(' ') : ''),
      }));

      const systemPrompt = buildSystemPrompt(data);
      const response = await simpleChat(systemPrompt, messages, provider, model, apiKey, customUrl);

      const { cleanText, options } = parseOptions(response);
      const aiBubble: ChatBubble = {
        id: crypto.randomUUID(),
        role: 'ai',
        text: cleanText,
        options: options.length > 0 ? options : undefined,
      };

      const world = parseWorldJson(response);
      if (world) {
        setParsedWorld(world);
      }

      setBubbles(prev => [...prev, aiBubble]);
      scrollToBottom();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [provider, model, data, scrollToBottom]);

  // Auto-start conversation on mount
  useEffect(() => {
    if (initRef.current || bubbles.length > 0) return;
    initRef.current = true;
    sendToAi([]);
  }, [sendToAi, bubbles.length]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || loading) return;
    const userBubble: ChatBubble = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text.trim(),
    };
    const updated = [...bubbles, userBubble];
    setBubbles(updated);
    setInput('');
    scrollToBottom();
    sendToAi(updated);
  }, [bubbles, loading, sendToAi, scrollToBottom]);

  const handleOptionClick = useCallback((option: string) => {
    handleSend(option);
  }, [handleSend]);

  const handleConfirm = useCallback(() => {
    if (!parsedWorld) return;
    onChange({
      world: {
        ...data.world,
        ...parsedWorld,
      },
    });
    setConfirmed(true);
  }, [parsedWorld, data.world, onChange]);

  const handleReset = useCallback(() => {
    setBubbles([]);
    setParsedWorld(null);
    setConfirmed(false);
    setError('');
    initRef.current = false;
  }, []);

  // No API key — show fallback message
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      try {
        await getEffectiveApiKey(settings);
        setHasKey(true);
      } catch {
        setHasKey(false);
      }
    })();
  }, [provider]);

  if (hasKey === false) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepWorldChat.title')}</h2>
          <p className="text-aux text-text-sub">{t('stepWorldChat.desc')}</p>
        </div>
        <div className="rounded-card border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-900/20">
          <svg className="mx-auto mb-3 h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <p className="text-aux font-medium text-amber-700 dark:text-amber-300">{t('stepWorldChat.noApiKey')}</p>
          <p className="mt-1 text-tag text-amber-600 dark:text-amber-400">{t('stepWorldChat.noApiKeyHint')}</p>
        </div>
      </div>
    );
  }

  if (hasKey === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <div>
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepWorldChat.title')}</h2>
        <p className="text-aux text-text-sub">{t('stepWorldChat.desc')}</p>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 space-y-4 overflow-y-auto rounded-card border border-border-light bg-bg-light p-4 dark:border-border-dark dark:bg-surface-dark"
        style={{ minHeight: '320px', maxHeight: '420px' }}
      >
        {bubbles.map(bubble => (
          <div key={bubble.id} className={`flex ${bubble.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-aux leading-relaxed ${
              bubble.role === 'user'
                ? 'bg-primary text-white'
                : 'bg-surface-light text-text-main dark:bg-slate-700 dark:text-text-main-dark'
            }`}>
              <div className="whitespace-pre-wrap">{bubble.text}</div>
              {bubble.options && bubble.options.length > 0 && !loading && !parsedWorld && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {bubble.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => handleOptionClick(opt)}
                      className="rounded-full border border-blue-200 bg-white px-3 py-1 text-tag font-medium text-primary transition-colors hover:bg-blue-50 dark:border-blue-600 dark:bg-slate-600 dark:text-blue-300 dark:hover:bg-slate-500"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-surface-light px-4 py-3 dark:bg-slate-700">
              <div className="flex gap-1">
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-text-placeholder" style={{ animationDelay: '0ms' }} />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-text-placeholder" style={{ animationDelay: '150ms' }} />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-text-placeholder" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-btn bg-red-50 px-3 py-2 text-tag text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Parsed world confirmation card */}
      {parsedWorld && !confirmed && (
        <div className="rounded-card border border-green-200 bg-green-50 p-4 dark:border-green-700 dark:bg-green-900/20">
          <h3 className="mb-2 text-aux font-medium text-green-700 dark:text-green-300">{t('stepWorldChat.confirmTitle')}</h3>
          <div className="mb-3 grid grid-cols-2 gap-2 text-tag text-green-800 dark:text-green-200">
            <div><span className="text-green-600 dark:text-green-400">{t('stepWorldChat.locationLabel')}</span> {formatLocationStyle(parsedWorld.locationStyle, t)}</div>
            <div><span className="text-green-600 dark:text-green-400">{t('stepWorldChat.arrivalLabel')}</span> {formatArrivalType(parsedWorld.arrivalType, t)}</div>
            <div><span className="text-green-600 dark:text-green-400">{t('stepWorldChat.motivLabel')}</span> {formatMotivation(parsedWorld.teachingMotivation, t)}</div>
            <div><span className="text-green-600 dark:text-green-400">{t('stepWorldChat.supernaturalLabel')}</span> {parsedWorld.hasSupernatural ? parsedWorld.supernaturalElement : t('stepWorldChat.none')}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="rounded-btn bg-green-600 px-4 py-1.5 text-tag font-medium text-white hover:bg-green-700"
            >
              {t('stepWorldChat.confirm')}
            </button>
            <button
              onClick={handleReset}
              className="rounded-btn border border-green-300 px-4 py-1.5 text-tag font-medium text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900/40"
            >
              {t('stepWorldChat.restart')}
            </button>
          </div>
        </div>
      )}

      {/* Confirmed */}
      {confirmed && (
        <div className="rounded-card border border-green-200 bg-green-50 p-4 text-center dark:border-green-700 dark:bg-green-900/20">
          <svg className="mx-auto mb-1 h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-aux font-medium text-green-700 dark:text-green-300">{t('stepWorldChat.confirmed')}</p>
          <button onClick={handleReset} className="mt-2 text-tag text-green-600 underline hover:text-green-800 dark:text-green-400">
            {t('stepWorldChat.restartLink')}
          </button>
        </div>
      )}

      {/* Input area */}
      {!parsedWorld && !confirmed && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend(input); }}
            placeholder={t('stepWorldChat.inputPlaceholder')}
            disabled={loading || bubbles.length === 0}
            className="flex-1 rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux text-text-main caret-primary dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={loading || !input.trim()}
            className="rounded-btn bg-primary px-4 py-2.5 text-aux font-medium text-white transition-colors disabled:opacity-40"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function formatLocationStyle(s: string | undefined, t: (k: string) => string): string {
  return { enclosed: t('stepWorld.enclosed'), 'semi-open': t('stepWorld.semiOpen'), everyday: t('stepWorld.everyday'), custom: t('stepWorld.custom') }[s || 'enclosed'] || s || '';
}
function formatArrivalType(s: string | undefined, t: (k: string) => string): string {
  return { arranged: t('stepWorld.arrivalArranged'), 'self-sought': t('stepWorld.arrivalSelfSought'), accidental: t('stepWorld.arrivalAccidental'), fated: t('stepWorld.arrivalFated') }[s || 'self-sought'] || s || '';
}
function formatMotivation(s: string | undefined, t: (k: string) => string): string {
  return { professional: t('stepWorld.motivProfessional'), 'personal-secret': t('stepWorld.motivPersonalSecret'), 'assigned-mentor': t('stepWorld.motivAssignedMentor'), 'shared-goal': t('stepWorld.motivSharedGoal') }[s || 'professional'] || s || '';
}
