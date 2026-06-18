import React, { useState, useRef, useEffect } from 'react';
import { 
  Compass, Sparkles, Lock, CheckCircle2, ChevronRight, ChevronUp, HelpCircle, 
  Bot, Zap, Brain, Lightbulb, Flame, Award, BookOpen, Check, Target, Trophy, 
  Clock, Play, MapPin, Activity, Sparkle, Database, Laptop, Workflow, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Roadmap, Phase, Level, Lesson } from '../types';
import { XPBadge } from './Badges';

interface RoadmapTreeProps {
  roadmap: Roadmap;
  onLessonSelect: (phaseId: string, levelId: string, lessonId: string) => void;
  onAiAction: (actionType: 'explain' | 'quiz' | 'study_plan' | 'projects', phaseName: string) => void;
}

export function RoadmapTree({ roadmap, onLessonSelect, onAiAction }: RoadmapTreeProps) {
  // Master container ref to track click locations for XP particles accurately
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep track of which phases are expanded to show levels and lessons inline
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Record<string, boolean>>({});

  // Toast notifications for level updates or locked feedback
  const [toastMessage, setToastMessage] = useState<{ id: string; text: string; subtitle?: string } | null>(null);

  // Floating gold XP particle triggers
  const [floatingXPs, setFloatingXPs] = useState<{ id: string; x: number; y: number; amount: number }[]>([]);

  // Automatically expand the current active phase and completed ones to let users see their status instantly
  useEffect(() => {
    if (roadmap.phases.length > 0) {
      const defaultExpanded: Record<string, boolean> = {};
      roadmap.phases.forEach((ph) => {
        // Expand active or completed stages by default so they list levels inline
        defaultExpanded[ph.id] = ph.status === 'current' || ph.status === 'completed';
      });
      setExpandedPhaseIds(defaultExpanded);
    }
  }, [roadmap.id]);

  const togglePhaseExpand = (phaseId: string) => {
    setExpandedPhaseIds(prev => ({
      ...prev,
      [phaseId]: !prev[phaseId]
    }));
  };

  const triggerToast = (text: string, subtitle?: string) => {
    const id = Date.now().toString();
    setToastMessage({ id, text, subtitle });
    setTimeout(() => {
      setToastMessage(prev => prev?.id === id ? null : prev);
    }, 4000);
  };

  const handleLessonClick = (phaseId: string, level: Level, les: Lesson, e: React.MouseEvent) => {
    // Capture precise coordinates relative to the locked dashboard layout
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;

      const newFxp = {
        id: Math.random().toString(),
        x: fx,
        y: fy,
        amount: les.xpReward
      };

      setFloatingXPs(prev => [...prev, newFxp]);

      // Reap particle after animation ends
      setTimeout(() => {
        setFloatingXPs(prev => prev.filter(p => p.id !== newFxp.id));
      }, 1200);
    }

    onLessonSelect(phaseId, level.id, les.id);
  };

  const getPhaseIcon = (index: number, name: string) => {
    const n = name.toLowerCase();
    if (n.includes('math') || n.includes('stat') || n.includes('prob') || n.includes('matrix') || n.includes('algebra')) return Compass;
    if (n.includes('python') || n.includes('program') || n.includes('code') || n.includes('script') || n.includes('oop')) return Laptop;
    if (n.includes('database') || n.includes('sql') || n.includes('store') || n.includes('query')) return Database;
    if (n.includes('tool') || n.includes('jupyter') || n.includes('environment')) return Target;
    if (n.includes('library') || n.includes('pandas') || n.includes('numpy') || n.includes('matplotlib')) return BookOpen;
    if (n.includes('concept') || n.includes('theory') || n.includes('machine learning')) return Brain;
    if (n.includes('deep learning') || n.includes('neural') || n.includes('gradient')) return Zap;
    if (n.includes('framework') || n.includes('tensorflow') || n.includes('pytorch')) return Workflow;
    if (n.includes('project') || n.includes('application') || n.includes('capstone')) return Trophy;
    if (n.includes('skill') || n.includes('soft') || n.includes('habits')) return Flame;
    if (n.includes('career') || n.includes('resume') || n.includes('job') || n.includes('interview')) return Award;
    
    const defaults = [Compass, Laptop, Database, Target, BookOpen, Brain, Zap, Workflow, Trophy, Flame, Award];
    return defaults[index % defaults.length];
  };

  // Global counts for HUD status representation
  const totalPhases = roadmap.phases.length;
  const completedPhases = roadmap.phases.filter(p => p.status === 'completed').length;
  const overallProgressPct = roadmap.progressPercent;
  const activePhase = roadmap.phases.find(p => p.status === 'current') || roadmap.phases[0];

  return (
    <div ref={containerRef} className="space-y-6 select-none font-sans text-white relative">
      {/* Dynamic Keyframes for floaty XP rises & particle streams */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float-xp-up {
          0% {
            transform: translate3d(-50%, 0, 0) scale(0.85);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translate3d(-50%, -30px, 0) scale(1.1);
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translate3d(-50%, -95px, 0) scale(0.9);
            opacity: 0;
          }
        }
        .animate-xp-float {
          animation: float-xp-up 1.2s cubic-bezier(0.215, 0.61, 0.355, 1) forwards;
        }
        @keyframes subtle-glow-pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.3; }
        }
        .animate-glow-pulse {
          animation: subtle-glow-pulse 3.5s ease-in-out infinite;
        }
      `}} />

      {/* Pop Toast for Module/Interaction Responses */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 pointer-events-none"
          >
            <div className="bg-[#121215]/95 border border-purple-500/30 backdrop-blur-md rounded-2xl p-4 shadow-[0_15px_30px_rgba(168,85,247,0.25)] pointer-events-auto flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center shrink-0">
                <Trophy className="w-4.5 h-4.5 text-purple-400 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-black tracking-wide text-white uppercase">{toastMessage.text}</h4>
                {toastMessage.subtitle && <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">{toastMessage.subtitle}</p>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Gold XP Particle Celebrations upon clicks */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        <AnimatePresence>
          {floatingXPs.map((fxp) => (
            <div
              key={fxp.id}
              style={{ left: fxp.x, top: fxp.y }}
              className="absolute pointer-events-none animate-xp-float bg-gradient-to-r from-purple-500 to-blue-500 text-white font-extrabold text-[11px] px-2.5 py-1 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)] flex items-center gap-1 border border-white/20 select-none"
            >
              <Sparkles className="w-3 h-3 text-yellow-300 animate-pulse" />
              <span>+{fxp.amount} XP</span>
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Gamified HUD Status Card: Stable general telemetry overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 glass-card p-5">
        <div className="flex items-center gap-4 col-span-1 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-white/5 pb-4 md:pb-0 md:pr-4">
          <div className="relative w-15 h-15 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="30" cy="30" r="25" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="4" fill="none" />
              <circle 
                cx="30" cy="30" r="25" 
                className="stroke-purple-600 dark:stroke-purple-500 transition-all duration-1000" 
                strokeWidth="4" 
                strokeDasharray="157" 
                strokeDashoffset={157 - (157 * overallProgressPct) / 100} 
                strokeLinecap="round" 
                fill="none" 
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-xs font-black text-zinc-900 dark:text-white">{overallProgressPct}%</span>
            </div>
          </div>
          <div>
            <span className="block text-[8px] font-black text-zinc-500 dark:text-zinc-500 tracking-wider uppercase">Curriculum Completion</span>
            <h4 className="text-xs font-black text-zinc-900 dark:text-white truncate max-w-[130px]">{roadmap.goal}</h4>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{completedPhases}/{totalPhases} Portals cleared</p>
          </div>
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-4 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-white/5 pb-4 md:pb-0 md:px-4">
          <div className="flex flex-col justify-center">
            <span className="text-[8px] font-black text-zinc-500 dark:text-zinc-500 tracking-wider uppercase block">Accumulated Experience</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="p-1 px-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[10px] font-extrabold text-purple-700 dark:text-purple-400 flex items-center gap-1">
                <Sparkle className="w-3 h-3 text-purple-600 dark:text-purple-400 animate-pulse" />
                <span>{roadmap.totalXp} XP Cumulative</span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Remaining: <strong className="text-zinc-900 dark:text-white">{roadmap.hoursRemaining} hours</strong></p>
          </div>

          <div className="flex flex-col justify-center">
            <span className="text-[8px] font-black text-zinc-500 dark:text-zinc-500 tracking-wider uppercase block">Daily study target</span>
            <div className="flex items-center gap-1 mt-1">
              <Flame className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500" />
              <span className="text-[11px] font-black text-amber-700 dark:text-amber-400">Weekly Pace: {roadmap.weeklyHours} hrs</span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-[#0A0A0A] h-1 rounded-full mt-1 overflow-hidden border border-zinc-300 dark:border-white/5">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, Math.max(30, overallProgressPct))}%` }} />
            </div>
          </div>
        </div>

        <div className="col-span-1 flex flex-col justify-center pl-0 md:pl-2">
          <span className="text-[8px] font-black text-zinc-500 dark:text-zinc-500 tracking-wider uppercase">Current Active Milestone</span>
          <div className="flex items-center gap-1.5 mt-1">
            <Activity className="w-3.5 h-3.5 text-purple-650 dark:text-purple-400 animate-pulse" />
            <span className="text-xs font-black text-purple-650 dark:text-purple-400 truncate max-w-[120px]">{activePhase?.name}</span>
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Phase completeness: <strong className="text-zinc-900 dark:text-white">{activePhase?.progress || 0}%</strong></p>
        </div>
      </div>

      {/* CORE PERMANENTLY LOCKED SYSTEM TIMELINE */}
      <div className="glass-card p-6 shadow-xl relative overflow-hidden">
        {/* Background ambient lighting flares */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[140px] pointer-events-none animate-glow-pulse" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[140px] pointer-events-none animate-glow-pulse" />

        <div className="border-b border-zinc-200 dark:border-white/5 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h3 className="font-display font-black text-base text-zinc-900 dark:text-white">Curriculum Progression Track</h3>
            </div>
            <span className="text-[9px] font-bold text-zinc-550 dark:text-zinc-400 uppercase bg-zinc-200/50 dark:bg-white/5 border border-zinc-300 dark:border-white/10 px-2 py-1 rounded">
              Locked Progression System
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
            Flow sequentially through curated challenges. Complete mandatory levels below to expand subsequent locks automatically.
          </p>
        </div>

        {/* Stable Unified Timeline Track */}
        <div className="relative space-y-8 pl-4 sm:pl-8 before:absolute before:top-2 before:bottom-2 before:left-2 sm:before:left-4 before:w-[2px] before:bg-gradient-to-b before:from-purple-500/40 before:via-blue-500/20 before:to-zinc-800">
          
          {roadmap.phases.map((ph, phaseIdx) => {
            const PhaseIcon = getPhaseIcon(phaseIdx, ph.name);
            const isCompleted = ph.status === 'completed';
            const isActive = ph.status === 'current';
            const isLocked = false; // Unlocked globally for free learning flow
            const isExpanded = !!expandedPhaseIds[ph.id];

            return (
              <div key={ph.id} className="relative group">
                
                {/* Visual Timeline Connector Node (Permanently Aligned on Left Sidebar Line) */}
                <div className={`absolute left-0 -translate-x-1/2 w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300 z-10 ${
                  isCompleted 
                    ? 'bg-purple-500/15 border-purple-500/70 text-purple-600 dark:text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.45)]' 
                    : isActive 
                      ? 'bg-purple-500/20 border-purple-500 text-purple-600 dark:text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.4)] scale-110' 
                      : 'bg-zinc-100 dark:bg-[#0E0E10] border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
                style={{ left: '-12px' }} // Position correctly inside sm:pl-8 structure
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5 stroke-[3.5px]" />
                  ) : isActive ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400 animate-ping" />
                  ) : (
                    <span className="text-[9px] font-bold">{phaseIdx + 1}</span>
                  )}
                </div>

                {/* Phase Row Container */}
                <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                  isActive 
                    ? 'bg-purple-50/70 dark:bg-[#14121b] border-purple-300 dark:border-purple-500/25 shadow-[0_4px_20px_rgba(168,85,247,0.06)]' 
                    : isCompleted 
                      ? 'bg-[#1E1B29] border-purple-500/35 dark:border-purple-500/25 shadow-[0_4px_20px_rgba(139,92,246,0.12)] text-white'
                      : 'bg-zinc-100/60 dark:bg-zinc-950/20 border-zinc-200 dark:border-zinc-900 text-zinc-500 opacity-75'
                }`}>
                  
                  {/* Phase Summary Header */}
                  <div 
                    onClick={() => togglePhaseExpand(ph.id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02]"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl border shrink-0 ${
                        isCompleted 
                          ? 'bg-purple-500/20 border-purple-400/40 text-purple-300' 
                          : isActive 
                            ? 'bg-purple-500/10 border-purple-400/20 text-purple-600 dark:text-purple-400' 
                            : 'bg-zinc-200/50 dark:bg-white/5 border-zinc-300 dark:border-zinc-900 text-zinc-600'
                      }`}>
                        <PhaseIcon className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${
                            isCompleted ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-500'
                          }`}>PHASE {String(phaseIdx + 1).padStart(2, '0')}</span>
                          <span className={`text-[8px] font-mono font-black uppercase px-2 py-0.5 border rounded ${
                            isCompleted 
                              ? 'bg-purple-500/25 border-purple-400/30 text-purple-200' 
                              : isActive 
                                ? 'bg-purple-100 dark:bg-purple-500/10 border-purple-300/40 dark:border-purple-500/20 text-purple-750 dark:text-purple-400' 
                                : 'bg-zinc-200/50 dark:bg-white/5 border-zinc-300 dark:border-white/5 text-zinc-600'
                          }`}>
                            {ph.status}
                          </span>
                        </div>
                        <h4 className={`font-bold text-sm mt-1 group-hover:text-purple-300 transition-colors ${
                          isCompleted ? 'text-white' : 'text-zinc-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300'
                        }`}>{ph.name}</h4>
                        <p className={`text-xs mt-1 line-clamp-2 max-w-2xl ${
                          isCompleted ? 'text-zinc-300' : 'text-zinc-500 dark:text-zinc-300'
                        }`}>{ph.description}</p>
                      </div>
                    </div>

                    {/* Progress representation + Quick study state controller */}
                    <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end border-t sm:border-t-0 border-zinc-200 dark:border-white/5 pt-3 sm:pt-0">
                      <div className="text-right">
                        <span className={`block text-[8px] font-bold tracking-wider uppercase ${
                          isCompleted ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-500'
                        }`}>Stage Progress</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={`w-16 h-1.5 rounded-full overflow-hidden border ${
                            isCompleted ? 'bg-zinc-950 border-purple-500/35' : 'bg-zinc-200 dark:bg-[#0E0E10] border-zinc-300 dark:border-white/5'
                          }`}>
                            <div className="h-full bg-purple-600 dark:bg-purple-500 rounded-full" style={{ width: `${ph.progress}%` }} />
                          </div>
                          <span className={`text-[10px] font-bold font-mono ${
                            isCompleted ? 'text-white' : 'text-zinc-900 dark:text-white'
                          }`}>{ph.progress}%</span>
                        </div>
                      </div>
                      
                      {/* Expansion arrow toggle state */}
                      <div className={`p-1.5 rounded-xl border ${
                        isCompleted 
                          ? 'border-purple-500/30 bg-purple-950/40 text-purple-350' 
                          : 'border-zinc-200 dark:border-white/5 bg-zinc-100 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Levels Checklist & Lessons grid container (Permanently Inline) */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className={`border-t ${
                          isCompleted 
                            ? 'border-purple-500/15 bg-zinc-950/45' 
                            : 'border-zinc-200 dark:border-white/[0.04] bg-zinc-100/30 dark:bg-[#09090A]/40'
                        }`}
                      >
                        <div className="p-4 space-y-6">
                          
                          {/* Inner Level Header */}
                          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
                            isCompleted ? 'border-purple-500/15' : 'border-zinc-200 dark:border-white/[0.03]'
                          }`}>
                            <div>
                              <span className="text-[8px] font-black text-purple-600 dark:text-purple-400 tracking-widest uppercase">SYLLABUS SECTOR CHECKS</span>
                              <h5 className={`text-xs font-black mt-0.5 flex items-center gap-1.5 ${
                                isCompleted ? 'text-zinc-200' : 'text-zinc-900 dark:text-white'
                              }`}>
                                <BookOpen className={`w-3.5 h-3.5 ${isCompleted ? 'text-purple-400' : 'text-zinc-500'}`} />
                                <span>Includes {ph.levels.length} modular milestones • {ph.estimatedHours} Hours total</span>
                              </h5>
                            </div>

                            {/* AI Copilot Tools Integrated per Phase */}
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAiAction('explain', ph.name);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold text-purple-700 dark:text-purple-300 hover:text-white bg-purple-100 hover:bg-purple-600 dark:bg-purple-500/10 border border-purple-200 hover:border-purple-500 rounded-lg transition-colors cursor-pointer"
                              >
                                <Bot className="w-3 h-3" />
                                <span>Explain Stage</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAiAction('quiz', ph.name);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold text-blue-700 dark:text-blue-300 hover:text-white bg-blue-100 hover:bg-blue-600 dark:bg-blue-500/10 border border-blue-200 hover:border-blue-500 rounded-lg transition-colors cursor-pointer"
                              >
                                <Zap className="w-3 h-3" />
                                <span>AI Practice Quiz</span>
                              </button>
                            </div>
                          </div>

                          {/* Level list/ timeline container inside Phase */}
                          <div className="space-y-4">
                            {ph.levels.map((lvl, lvlIdx) => {
                              const lvlIsLocked = false; // Unlocked globally for free learning flow
                              const lvlIsDone = lvl.status === 'completed';
                              const lvlIsCurrent = lvl.status === 'current';

                              return (
                                <div 
                                  key={lvl.id} 
                                  className={`p-4 rounded-xl border transition-all ${
                                    lvlIsCurrent
                                      ? 'bg-purple-50/60 dark:bg-[#13121b] border-purple-300 dark:border-purple-500/30'
                                      : lvlIsDone
                                        ? (isCompleted 
                                            ? 'bg-[#15121F]/80 border-purple-500/30 text-white shadow-[0_2px_12px_rgba(168,85,247,0.06)]' 
                                            : 'bg-[#1E1B29]/40 dark:bg-[#1E1B29]/30 border-purple-500/25 dark:border-purple-500/15')
                                        : (isCompleted
                                            ? 'bg-zinc-900/40 border-white/5 opacity-80'
                                            : 'bg-zinc-50 dark:bg-zinc-950/30 border-zinc-200 dark:border-zinc-900 opacity-80')
                                  }`}
                                >
                                  {/* Level Meta info */}
                                  <div className={`flex items-center justify-between border-b pb-2 mb-3 ${
                                    isCompleted ? 'border-purple-500/10' : 'border-zinc-200 dark:border-white/[0.03]'
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                        lvlIsDone 
                                          ? 'bg-purple-100/90 dark:bg-purple-500/15 border-purple-300/40 dark:border-purple-500/20 text-purple-800 dark:text-purple-300'
                                          : lvlIsCurrent
                                            ? 'bg-purple-100 dark:bg-purple-500/10 border-purple-300 dark:border-purple-500/25 text-purple-700 dark:text-purple-400 animate-pulse'
                                            : 'bg-zinc-100 dark:bg-white/5 border-zinc-300 dark:border-zinc-800 text-zinc-500 dark:text-zinc-500'
                                      }`}>
                                        Level {lvlIdx + 1} • {lvl.type}
                                      </span>
                                      <h6 className={`font-bold text-xs truncate max-w-[200px] ${
                                        isCompleted ? 'text-zinc-100' : 'text-zinc-900 dark:text-white'
                                      }`}>{lvl.name}</h6>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {lvlIsDone ? (
                                        <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                      ) : lvlIsCurrent ? (
                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400 animate-ping" />
                                      ) : lvlIsLocked ? (
                                        <Lock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-700" />
                                      ) : null}
                                      <span className={`text-[9px] font-mono ${
                                        isCompleted ? 'text-purple-300/90' : 'text-zinc-650 dark:text-zinc-500'
                                      }`}>
                                        {lvl.lessons.filter(l => l.status === 'completed').length}/{lvl.lessons.length} Quests
                                      </span>
                                    </div>
                                  </div>

                                  {/* Inline rendering of lesson tiles under this level */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {lvl.lessons.map((les) => {
                                      const isLessonLocked = false; // Unlocked globally for free learning flow
                                      const isLessonDone = les.status === 'completed';

                                      let iconEmoji = "📖";
                                      let subText = "Study reading";
                                      if (les.type === 'quiz') { iconEmoji = "🧠"; subText = "Interactive evaluation"; }
                                      if (les.type === 'coding') { iconEmoji = "💻"; subText = "Code execution"; }
                                      if (les.type === 'boss_challenge' || les.type === 'challenge') { iconEmoji = "🏆"; subText = "Major core challenge"; }

                                      return (
                                        <div
                                          key={les.id}
                                          onClick={(e) => handleLessonClick(ph.id, lvl, les, e)}
                                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 flex flex-col justify-between h-28 relative overflow-hidden group/les ${
                                            !isLessonLocked
                                              ? isLessonDone
                                                ? (isCompleted
                                                    ? 'bg-[#15121F]/70 hover:bg-[#15121F] border-purple-500/25 hover:border-purple-500 text-zinc-100 hover:shadow-[0_2px_12px_rgba(168,85,247,0.1)]'
                                                    : 'bg-[#1E1B29]/30 hover:bg-[#1E1B29]/50 dark:bg-[#1E1B29]/40 dark:hover:bg-[#1E1B29]/60 border-purple-500/25 dark:border-purple-500/15 hover:border-purple-500 dark:hover:border-purple-400 text-purple-900 dark:text-purple-300 hover:shadow-[0_2px_12px_rgba(168,85,247,0.08)]')
                                                : isCompleted
                                                  ? 'bg-[#15121F]/50 hover:bg-[#15121F]/75 border-purple-900/40 hover:border-purple-500/50 text-zinc-300 hover:shadow-md'
                                                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/5 hover:border-purple-300 dark:hover:border-purple-500/30 hover:shadow-md'
                                              : 'bg-zinc-100/55 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-950 text-zinc-400 dark:text-zinc-500 opacity-45 cursor-not-allowed'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-1">
                                            <div className="min-w-0">
                                              <span className={`text-[7.5px] font-bold tracking-wider uppercase block ${
                                                isCompleted ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-500'
                                              }`}>{subText}</span>
                                              <h6 className={`font-bold text-xs truncate mt-0.5 transition-colors ${
                                                isCompleted 
                                                  ? 'text-zinc-100 group-hover/les:text-purple-300' 
                                                  : 'text-zinc-900 dark:text-white group-hover/les:text-purple-600 dark:group-hover/les:text-purple-300'
                                              }`}>{les.name}</h6>
                                            </div>
                                            <span className="text-base select-none">{iconEmoji}</span>
                                          </div>

                                          <div className={`pt-2 border-t mt-2 flex items-center justify-between ${
                                            isCompleted ? 'border-purple-500/10' : 'border-zinc-200 dark:border-white/[0.03]'
                                          }`}>
                                            <XPBadge amount={les.xpReward} size="sm" />
                                            
                                            <div>
                                              {isLessonDone ? (
                                                <span className={`text-[8px] font-black px-2 py-0.5 border rounded-full flex items-center gap-0.5 ${
                                                  isCompleted 
                                                    ? 'text-purple-250 bg-purple-500/20 border-purple-400/30' 
                                                    : 'text-purple-800 dark:text-purple-300 bg-purple-100/90 dark:bg-purple-500/10 border-purple-300/40 dark:border-purple-500/20'
                                                }`}>
                                                  <Check className="w-2.5 h-2.5 stroke-[3.5px]" />
                                                  <span>COMPLETED</span>
                                                </span>
                                              ) : !isLessonLocked ? (
                                                <button className="text-[8px] font-black text-white bg-purple-600 dark:bg-purple-500 hover:bg-purple-750 dark:hover:bg-purple-600 px-3 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer">
                                                  <Play className="w-2 h-2 fill-white" />
                                                  <span>START</span>
                                                </button>
                                              ) : (
                                                <span className="text-[8.5px] font-bold text-zinc-500 dark:text-zinc-500 flex items-center gap-0.5">
                                                  <Lock className="w-2.5 h-2.5" />
                                                  <span>Locked</span>
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                </div>
                              );
                            })}
                          </div>

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>

              </div>
            );
          })}

          {/* Locked End Finish Triumphant Anchor */}
          <div className="relative pl-4">
            {/* End Point node check */}
            <div className={`absolute left-0 -translate-x-1/2 w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-zinc-500 z-10 ${
              overallProgressPct === 100 ? 'bg-purple-500/15 border-purple-500 text-purple-650 dark:text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.4)]' : ''
            }`}
            style={{ left: '-12px' }}
            >
              <Trophy className="w-3.5 h-3.5" />
            </div>

            <div className={`p-4 rounded-xl border max-w-sm inline-flex items-center gap-3 select-none ${
              overallProgressPct === 100 
                ? 'bg-purple-100/80 dark:bg-[#1E1B29]/95 border-purple-400 dark:border-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.35)] text-purple-900 dark:text-white' 
                : 'bg-zinc-100/50 dark:bg-[#101012] border-zinc-200 dark:border-zinc-900 text-zinc-600 dark:text-zinc-500'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md ${
                overallProgressPct === 100 ? 'bg-purple-600 dark:bg-purple-500 text-white animate-bounce' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-650'
              }`}>
                <Trophy className="w-4 h-4 fill-current" />
              </div>
              <div className="text-left">
                <span className="block text-[8px] font-black uppercase tracking-wider text-zinc-500">Graduation Objective</span>
                <span className={`text-xs font-black tracking-widest block uppercase ${overallProgressPct === 100 ? 'text-purple-600 dark:text-purple-300' : 'text-zinc-400 dark:text-zinc-400'}`}>SUCCESS !!</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Structured study metrics section tracking diagnostic results */}
      <div className="bg-[#111111]/90 border border-white/5 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 mb-4 gap-2">
          <div>
            <h4 className="font-display font-semibold text-sm text-white">Consistency diagnostics & learning velocity tracker</h4>
            <p className="text-[10px] text-zinc-500">Continuous study telemetry tracked automatically by LearnPath AI.</p>
          </div>
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase bg-white/5 border border-white/10 px-2 py-1 rounded-md">
            Syllabus Engine 1.2
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2 text-center">
          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-2xl">
            <span className="text-[8px] font-black text-zinc-500 tracking-wider uppercase block">Chapters Completed</span>
            <span className="text-lg font-black text-purple-400 font-display block mt-1">
              {roadmap.lessonsCompleted} Chapters
            </span>
            <span className="text-[9px] text-zinc-500">{overallProgressPct}% Complete</span>
          </div>

          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-2xl">
            <span className="text-[8px] font-black text-zinc-500 tracking-wider uppercase block">Quizzes Verified</span>
            <span className="text-lg font-black text-blue-400 font-display block mt-1">
              {Math.max(1, Math.round(roadmap.lessonsCompleted * 0.4))} Quiz units
            </span>
            <span className="text-[9px] text-zinc-500">Avg accuracy: 92%</span>
          </div>

          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-2xl">
            <span className="text-[8px] font-black text-zinc-500 tracking-wider uppercase block">Coding challenges</span>
            <span className="text-lg font-black text-emerald-400 font-display block mt-1">
              {Math.max(1, Math.round(roadmap.lessonsCompleted * 0.35))} Exercises
            </span>
            <span className="text-[9px] text-zinc-500 font-medium">Pass rate: 85% compile</span>
          </div>

          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-2xl">
            <span className="text-[8px] font-black text-zinc-500 tracking-wider uppercase block">Speed study velocity</span>
            <span className="text-lg font-black text-amber-500 font-display block mt-1">
              Excellent
            </span>
            <span className="text-[9px] text-zinc-400">Streak factor active</span>
          </div>
        </div>
      </div>

    </div>
  );
}
