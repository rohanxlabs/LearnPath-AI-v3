import React from 'react';
import { motion } from 'motion/react';
import { PlusCircle, BookOpen, Code2, Brain, Sparkles, RefreshCw } from 'lucide-react';
import { buttonStyles } from '../styles/theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  actionLabel, 
  onAction,
  secondaryActionLabel,
  onSecondaryAction 
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mb-6">
        {icon || <Sparkles className="w-10 h-10 text-purple-600" />}
      </div>
      <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
      <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={`px-6 py-3 ${buttonStyles.primary} rounded-xl font-bold text-sm inline-flex items-center gap-2`}
        >
          <PlusCircle className="w-5 h-5" />
          {actionLabel}
        </button>
      )}
      {secondaryActionLabel && onSecondaryAction && (
        <button
          onClick={onSecondaryAction}
          className={`mt-3 px-6 py-3 ${buttonStyles.secondary} rounded-xl font-bold text-sm inline-flex items-center gap-2`}
        >
          <RefreshCw className="w-4 h-4" />
          {secondaryActionLabel}
        </button>
      )}
    </motion.div>
  );
}

export function NoRoadmapEmptyState({ onCreateRoadmap }: { onCreateRoadmap: () => void }) {
  return (
    <EmptyState
      icon={<BookOpen className="w-10 h-10 text-purple-600" />}
      title="No Roadmap Yet"
      description="Create your first learning roadmap to start tracking progress, unlocking achievements, and getting personalized AI recommendations."
      actionLabel="Generate Your First Roadmap"
      onAction={onCreateRoadmap}
    />
  );
}

export function NoProjectsEmptyState({ onGenerateProject }: { onGenerateProject: () => void }) {
  return (
    <EmptyState
      icon={<Code2 className="w-10 h-10 text-blue-600" />}
      title="No Projects Yet"
      description="Projects will appear here as you progress through your roadmap. Each completed module unlocks hands-on project opportunities."
      actionLabel="View Roadmap"
      onAction={onGenerateProject}
    />
  );
}

export function NoQuizzesEmptyState({ onCreateQuiz }: { onCreateQuiz: () => void }) {
  return (
    <EmptyState
      icon={<Brain className="w-10 h-10 text-amber-600" />}
      title="No Quizzes Available"
      description="Complete more lessons in your roadmap to unlock practice quizzes and test your knowledge."
      actionLabel="Continue Learning"
      onAction={onCreateQuiz}
    />
  );
}