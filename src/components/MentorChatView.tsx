import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Sparkles, MessageSquare, Bot, HelpCircle, Code2, BookOpen, Lightbulb, Mic, MicOff, Paperclip, CheckCircle, Search, Terminal, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '../types';
import { XPBadge } from './Badges';
import { motion } from 'motion/react';
import { easeInOut } from 'motion';

// Memoized message component to prevent unnecessary re-renders
const ChatMessageItem = memo(({ ch, isGenerating }: { ch: ChatMessage; isGenerating: boolean }) => {
  const isAI = ch.sender === 'assistant';
  const timestamp = new Date(ch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={`flex gap-3 max-w-full sm:max-w-[85%] ${isAI ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
    >
      <div className={`p-1.5 h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${
          isAI
            ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
            : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
        }`}>
        {isAI ? <Bot className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
      </div>

      <div className="space-y-1">
        <div className={`p-4 rounded-2xl text-sm select-text leading-relaxed break-words ${
            isAI
              ? 'glass-card glass-card-purple border-purple-500/10 text-zinc-100 shadow-sm'
              : 'glass-card glass-card-blue border-blue-500/15 text-white font-medium shadow-md'
          }`}>
          {isAI ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre({ children }) {
                  const codeElement = React.Children.toArray(children).find(React.isValidElement) as React.ReactElement<{ className?: string }> | null;
                  const match = /language-(\w+)/.exec(codeElement?.props.className || '');
                  return (
                    <div className="my-3 max-w-full rounded-xl overflow-hidden border border-white/10">
                                      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.06] border-b border-white/10 text-xs text-zinc-400 font-bold uppercase tracking-wider">
                                        <span>{match ? match[1] : 'code'} example</span>
                                        <span className="text-xs bg-white/[0.08] px-1.5 py-0.5 rounded-md">walkthrough</span>
                                      </div>
                      <pre className="p-3 bg-zinc-950 overflow-x-auto whitespace-pre-wrap text-zinc-300 text-[11px]">
                        {children}
                      </pre>
                    </div>
                  );
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code({ className, children }: any) {
                  return <code className={className}>{children}</code>;
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                h1: ({ children }: any) => <h1 className="font-display font-bold text-xl text-purple-300 mt-3 mb-2">{children}</h1>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                h2: ({ children }: any) => <h2 className="font-display font-bold text-lg text-purple-400 mt-3 mb-1.5">{children}</h2>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                h3: ({ children }: any) => <h3 className="font-display font-semibold text-base text-purple-300 mt-3 mb-1">{children}</h3>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                h4: ({ children }: any) => <h4 className="font-display font-semibold text-sm text-purple-300 mt-3 mb-1">{children}</h4>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                p: ({ children }: any) => <p className="mt-1.5 leading-relaxed">{children}</p>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ul: ({ children }: any) => <ul className="list-disc ml-4 mt-2 mb-2 text-zinc-300">{children}</ul>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ol: ({ children }: any) => <ol className="list-decimal ml-4 mt-2 mb-2 text-zinc-300">{children}</ol>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                li: ({ children }: any) => <li className="mt-1">{children}</li>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                strong: ({ children }: any) => <strong className="text-white font-bold">{children}</strong>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                em: ({ children }: any) => <em className="text-zinc-200 italic">{children}</em>
              }}
            >
              {ch.text}
            </ReactMarkdown>
          ) : (
            ch.text
          )}
        </div>
        <span className={`block text-xs text-zinc-500 font-mono px-2 ${isAI ? 'text-left' : 'text-right'}`}>
          {timestamp}
        </span>
      </div>
    </div>
  );
});

interface MentorChatViewProps {
  chats: ChatMessage[];
  onSendMessage: (text: string) => void;
  isGenerating: boolean;
  onSelectAction: (topic: string) => void;
  aiActive: boolean | null;
}

export function MentorChatView({ chats, onSendMessage, isGenerating, onSelectAction, aiActive }: MentorChatViewProps) {
  const [inputText, setInputText] = useState('');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentContent, setAttachmentContent] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, isGenerating]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const outgoing = attachmentContent
      ? `${inputText}\n\n[Attached file: ${attachmentName}]\n\`\`\`\n${attachmentContent}\n\`\`\``
      : inputText;
    onSendMessage(outgoing);
    setInputText('');
    setAttachmentName(null);
    setAttachmentContent(null);
  }, [inputText, attachmentContent, attachmentName, onSendMessage]);

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    onSendMessage(prompt);
  }, [onSendMessage]);

  // Real dictation via the browser's Web Speech API (no server round-trip needed).
  const toggleVoice = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setVoiceSupported(false);
      return;
    }

    if (isVoiceActive) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setIsVoiceActive(true);
    recognition.onerror = () => setIsVoiceActive(false);
    recognition.onend = () => setIsVoiceActive(false);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setInputText(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isVoiceActive]);

  // Real file reading — content is attached as literal text context sent to the mentor.
  const MAX_ATTACHMENT_BYTES = 50_000;
  const handleFileButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAttachmentError(null);

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError(`"${file.name}" is too large to attach (max 50KB).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentContent(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      setAttachmentError(`Couldn't read "${file.name}".`);
    };
    reader.readAsText(file);
  }, []);

  const suggestedPrompts = [
    { text: "Explain NumPy Vector Broadcast", icon: Code2 },
    { text: "How does Self-Attention work?", icon: BookOpen },
    { text: "Design a 4-hour RAG Study Plan", icon: Sparkles },
    { text: "Suggest AI coding project ideas", icon: Lightbulb }
  ];

  const helperActions = [
    { label: "Explain Core Concepts", topic: "Explain the absolute foundations of Deep Learning in plain English." },
    { label: "Generate Live Quiz", topic: "Ask me 3 challenging questions about LLM tokenization so I can practice." },
    { label: "Review My Study Progress", topic: "Please review my study logs and suggest what topics I should conquer next." },
    { label: "Suggest AI Projects", topic: "Recommend 2 cool open-source project guides involving Model Context Protocol." }
  ];

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      {/* Upper info panel */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-zinc-950/25 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <motion.div 
            className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-blue-600 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(168,85,247,0.35)]"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: easeInOut }}
          >
            <Bot className="w-4 h-4" />
          </motion.div>
          <div>
            <h4 className="font-semibold text-sm text-white flex items-center gap-1.5">
              <span>LearnPath AI Mentor</span>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${aiActive === false ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </h4>
            <p className="text-xs text-zinc-400">
              {aiActive === false ? 'Offline mode — fallback replies' : 'OpenRouter model active'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded font-bold uppercase tracking-wider hidden sm:block">Offline Proxy Safety Enabled</span>
        </div>
      </div>

      {/* Message space panel */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {chats.map((ch) => (
          <ChatMessageItem key={ch.id} ch={ch} isGenerating={isGenerating} />
        ))}

        {/* Streaming / typing load state indicator */}
        {isGenerating && (
          <div className="flex gap-3 mr-auto max-w-[85%]">
            <div className="p-1.5 h-8 w-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-purple-400">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl glass-card glass-card-purple border-purple-500/10 flex items-center gap-1 text-zinc-400">
              <FloatingParticles />
              <span className="text-xs text-zinc-400 font-medium ml-2 animate-pulse">Formulating AI feedback...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested fast click starting prompt bubbles */}
      {chats.length <= 1 && (
        <div className="p-4 border-t border-white/10 bg-zinc-950/20 backdrop-blur-md">
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 px-1">Suggested discussions</label>
          <div className="grid grid-cols-2 gap-2">
            {suggestedPrompts.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.text}
                  onClick={() => handleSuggestedPrompt(p.text)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 text-sm text-left text-zinc-300 hover:text-white transition-all cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="truncate">{p.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Side drawer controls sheets for prompt helpers */}
      <div className="relative border-t border-white/10 bg-zinc-950/10 backdrop-blur-sm">
        {/* Right fade mask to hint overflow */}
        <div className="pointer-events-none absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-zinc-950/80 to-transparent z-10" />
      <div className="px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-none">
        {helperActions.map((act) => (
          <button
            key={act.label}
            onClick={() => onSelectAction(act.topic)}
            className="px-3 py-1.5 rounded-full text-xs font-bold border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white whitespace-nowrap transition-all cursor-pointer"
          >
            {act.label}
          </button>
        ))}
      </div>
      </div>

      {/* Active input form bar with frosted background */}
      <form onSubmit={handleSubmit} className="px-4 py-3 bg-zinc-950/45 border-t border-white/10 backdrop-blur-md">
        {attachmentName && (
          <div className="mb-2 py-1 px-2.5 rounded border border-purple-500/30 bg-purple-500/10 flex items-center justify-between max-w-sm">
            <span className="text-xs text-zinc-300 select-none flex items-center gap-1.5">
              <Paperclip className="w-3 h-3 text-purple-400" />
              <span>Loaded Document: <strong className="text-purple-300">{attachmentName}</strong></span>
            </span>
            <button
              type="button"
              onClick={() => { setAttachmentName(null); setAttachmentContent(null); }}
              className="text-xs text-red-400 hover:text-red-300 font-semibold"
            >
              Remove
            </button>
          </div>
        )}

        {attachmentError && (
          <div className="mb-2 py-1 px-2.5 rounded border border-amber-500/30 bg-amber-500/10 max-w-sm">
            <span className="text-xs text-amber-300">{attachmentError}</span>
          </div>
        )}

        {!voiceSupported && (
          <div className="mb-2 py-1 px-2.5 rounded border border-amber-500/30 bg-amber-500/10 max-w-sm">
            <span className="text-xs text-amber-300">Voice dictation isn't supported in this browser.</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".py,.js,.ts,.tsx,.jsx,.txt,.md,.json,.csv"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={handleFileButtonClick}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition-colors cursor-pointer"
            aria-label="Attach a code or text file"
            id="btn-chat-attach"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleVoice}
            className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
              isVoiceActive
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
            }`}
            aria-label={isVoiceActive ? 'Stop dictation' : 'Start voice dictation'}
            id="btn-chat-mic"
          >
            {isVoiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isVoiceActive ? "Listening..." : "Ask Mentor anything about your roadmap..."}
            className="flex-1 px-4 py-2.5 bg-white/[0.05] border border-white/10 text-sm rounded-xl text-white focus:outline-hidden focus:border-purple-500/50"
            disabled={isGenerating || isVoiceActive}
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isGenerating}
            className="p-2.5 rounded-xl text-white bg-gradient-to-tr from-purple-500 to-blue-600 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md"
            aria-label="Send message"
            id="btn-chat-submit"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

// Floating thinking particles component
const FloatingParticles: React.FC = () => {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-purple-400"
          animate={{ 
            y: [-3, -8, -3], 
            opacity: [0.4, 1, 0.4] 
          }}
          transition={{ 
            duration: 1.2, 
            repeat: Infinity, 
            delay: i * 0.2,
            ease: easeInOut 
          }}
        />
      ))}
    </div>
  );
};
