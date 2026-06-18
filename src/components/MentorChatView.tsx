import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, MessageSquare, Bot, HelpCircle, Code2, BookOpen, Lightbulb, Mic, MicOff, Paperclip, CheckCircle, Search, Terminal, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '../types';
import { XPBadge } from './Badges';

interface MentorChatViewProps {
  chats: ChatMessage[];
  onSendMessage: (text: string) => void;
  isGenerating: boolean;
  onSelectAction: (topic: string) => void;
}

export function MentorChatView({ chats, onSendMessage, isGenerating, onSelectAction }: MentorChatViewProps) {
  const [inputText, setInputText] = useState('');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, isGenerating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
    setAttachmentName(null);
  };

  const handleSuggestedPrompt = (prompt: string) => {
    onSendMessage(prompt);
  };

  const toggleVoice = () => {
    setIsVoiceActive(!isVoiceActive);
    if (!isVoiceActive) {
      // Simulate speech detection
      setInputText("Hey AI Mentor, can you give me a code example of how to build a simple neural network layer?");
    }
  };

  const handleFileMockUpload = () => {
    setAttachmentName("numpy_matrix_ops.py");
  };

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

  // Simple Markdown and Code Block formatter helper:
  const formatMessageText = (text: string) => {
    // Regex split for markdown code blocks (```python ... ```)
    const blocks = text.split(/(```[a-z]*\n[\s\S]*?\n```)/g);

    return blocks.map((block, idx) => {
      if (block.startsWith('```')) {
        const lines = block.split('\n');
        const lang = lines[0].replace('```', '') || 'code';
        const code = lines.slice(1, -1).join('\n');
        
        return (
          <div key={idx} className="my-3 rounded-lg overflow-hidden border border-zinc-800 font-mono text-xs">
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              <span>{lang} environment</span>
              <span className="text-[9px] bg-zinc-800 px-1 py-0.5 rounded">Terminal Readout</span>
            </div>
            <pre className="p-3 bg-zinc-950 overflow-x-auto text-zinc-300">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Format bold markup text (**text**) & inline code (`code`)
      let formattedText = block;
      const paragraphs = formattedText.split('\n').map((line, pIdx) => {
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          return (
            <li key={pIdx} className="ml-4 list-disc mt-1 text-zinc-300">
              {line.substring(2)}
            </li>
          );
        }
        if (line.trim().startsWith('### ')) {
          return <h4 key={pIdx} className="font-display font-semibold text-sm text-purple-300 mt-3 mb-1">{line.substring(4)}</h4>;
        }
        if (line.trim().startsWith('## ')) {
          return <h3 key={pIdx} className="font-display font-bold text-base text-purple-400 mt-4 mb-1.5">{line.substring(3)}</h3>;
        }
        
        return <p key={pIdx} className="mt-1.5 text-zinc-320 leading-relaxed">{line}</p>;
      });

      return <div key={idx}>{paragraphs}</div>;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] md:h-[calc(100vh-8.5rem)] rounded-3xl glass-card border border-white/5 shadow-2xl relative overflow-hidden">
      {/* Upper info panel */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-zinc-950/25 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-blue-650 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(168,85,247,0.35)]">
            <Bot className="w-4.5 h-4.5 animate-pulse" />
          </div>
          <div>
            <h4 className="font-semibold text-xs text-white flex items-center gap-1.5">
              <span>LearnPath AI Mentor</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </h4>
            <p className="text-[10px] text-zinc-400 font-mono">Gemini 3.5 Flash Model active</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-550 bg-white/5 border border-white/10 px-2 py-0.5 rounded font-bold uppercase tracking-wider hidden sm:block">Offline Proxy Safety Enabled</span>
        </div>
      </div>

      {/* Message space panel */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chats.map((ch) => {
          const isAI = ch.sender === 'assistant';
          return (
            <div
              key={ch.id}
              className={`flex gap-3 max-w-[85%] ${isAI ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
            >
              <div className={`p-1.5 h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                isAI
                  ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}>
                {isAI ? <Bot className="w-4.5 h-4.5" /> : <Terminal className="w-4.5 h-4.5" />}
              </div>

              <div className="space-y-1">
                <div className={`p-4 rounded-2xl text-xs select-text leading-relaxed ${
                  isAI
                    ? 'glass-card glass-card-purple border-purple-500/10 text-zinc-100 shadow-sm'
                    : 'glass-card glass-card-blue border-blue-500/15 text-white font-medium shadow-md'
                }`}>
                  {formatMessageText(ch.text)}
                </div>
                <span className={`block text-[8px] text-zinc-500 font-mono px-2 ${isAI ? 'text-left' : 'text-right'}`}>
                  {new Date(ch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}

        {/* Streaming / typing load state indicator */}
        {isGenerating && (
          <div className="flex gap-3 mr-auto max-w-[85%]">
            <div className="p-1.5 h-8 w-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-purple-400">
              <Bot className="w-4.5 h-4.5 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl glass-card glass-card-purple border border-purple-500/10 flex items-center gap-1 text-zinc-400">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="text-[10px] text-zinc-400 font-medium ml-2 animate-pulse">Formulating AI feedback...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested fast click starting prompt bubbles */}
      {chats.length <= 1 && (
        <div className="p-4 border-t border-white/5 bg-zinc-950/20 backdrop-blur-md">
          <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2 px-1">SUGGESTED DISCUSSIONS</label>
          <div className="grid grid-cols-2 gap-2">
            {suggestedPrompts.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.text}
                  onClick={() => handleSuggestedPrompt(p.text)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 text-xs text-left text-zinc-300 hover:text-white transition-all cursor-pointer"
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
      <div className="p-3 border-t border-white/5 bg-zinc-950/10 backdrop-blur-sm flex gap-1.5 overflow-x-auto scrollbar-none">
        {helperActions.map((act) => (
          <button
            key={act.label}
            onClick={() => onSelectAction(act.topic)}
            className="px-3 py-1.5 rounded-full text-[10px] font-bold border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white whitespace-nowrap transition-all cursor-pointer"
          >
            {act.label}
          </button>
        ))}
      </div>

      {/* Active input form bar with frosted background */}
      <form onSubmit={handleSubmit} className="p-3 bg-zinc-950/45 border-t border-white/5 backdrop-blur-md">
        {attachmentName && (
          <div className="mb-2 py-1 px-2.5 rounded border border-purple-500/30 bg-purple-500/10 flex items-center justify-between max-w-sm">
            <span className="text-[10px] text-zinc-350 select-none flex items-center gap-1.5">
              <Paperclip className="w-3 h-3 text-purple-400" />
              <span>Loaded Document: <strong className="text-purple-300">{attachmentName}</strong></span>
            </span>
            <button
              type="button"
              onClick={() => setAttachmentName(null)}
              className="text-[9px] text-red-450 hover:text-red-500 font-semibold"
            >
              Remove
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFileMockUpload}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition-colors cursor-pointer"
            title="Attach python scripts"
            id="btn-chat-attach"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleVoice}
            className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
              isVoiceActive
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
            }`}
            title="Toggle Mic Speech"
            id="btn-chat-mic"
          >
            {isVoiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isVoiceActive ? "Listening..." : "Ask Mentor anything about neural mechanics..."}
            className="flex-1 px-4 py-2.5 bg-black/40 border border-white/5 text-xs rounded-xl text-white focus:outline-hidden focus:border-purple-500/50"
            disabled={isGenerating || isVoiceActive}
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isGenerating}
            className="p-2.5 rounded-xl text-white bg-gradient-to-tr from-purple-500 to-blue-600 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md"
            id="btn-chat-submit"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
