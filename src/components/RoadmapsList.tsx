import React from 'react';
import { Trash2, Calendar, TrendingUp, Clock, ChevronRight } from 'lucide-react';
import { Roadmap } from '../types';
import { Skeleton } from './Skeleton';

interface RoadmapsListProps {
  roadmaps: Roadmap[];
  onSelectRoadmap: (id: string) => void;
  onDeleteRoadmap: (id: string) => void;
  isLoading?: boolean;
}

export function RoadmapsList({ roadmaps, onSelectRoadmap, onDeleteRoadmap, isLoading }: RoadmapsListProps) {
  const getStatusStyle = (progress: number) => {
    if (progress === 0) return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    if (progress === 100) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/25';
  };

  const getStatusLabel = (progress: number) => {
    if (progress === 0) return 'Not Started';
    if (progress === 100) return 'Completed';
    return 'In Progress';
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  if (roadmaps.length === 0 && !isLoading) {
    return (
      <div className="text-center py-12 px-6">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 glass-card rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-purple-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Roadmaps Yet</h3>
          <p className="text-sm text-zinc-400">
            Create your first learning roadmap to get started on your journey!
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-5 rounded-2xl glass-card space-y-3">
            <Skeleton className="h-5 w-3/4 rounded-lg" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-3 w-8 rounded" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {roadmaps.map((roadmap) => (
        <div
          key={roadmap.id}
          className="group glass-card rounded-2xl p-5 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer relative"
          onClick={() => onSelectRoadmap(roadmap.id)}
        >
          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete "${roadmap.goal}"? This cannot be undone.`)) {
                onDeleteRoadmap(roadmap.id);
              }
            }}
            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-rose-500/10"
            aria-label="Delete roadmap"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
          </button>

          {/* Content */}
          <div className="pr-8">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="font-bold text-base text-white line-clamp-2 flex-1">
                {roadmap.goal}
              </h3>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusStyle(roadmap.progressPercent)}`}>
                {getStatusLabel(roadmap.progressPercent)}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                {roadmap.experienceLevel}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                <span>Progress</span>
                <span className="font-semibold text-white">{roadmap.progressPercent}%</span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${roadmap.progressPercent}%` }}
                />
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-4 text-xs text-zinc-400 mb-3">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{roadmap.totalXp} XP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{roadmap.lessonsCompleted} lessons</span>
              </div>
            </div>

            {/* Creation Date */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {formatDate(roadmap.createdAt)}</span>
            </div>
          </div>

          {/* Arrow Icon */}
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className="w-5 h-5 text-purple-400" />
          </div>
        </div>
      ))}
    </div>
  );
}
