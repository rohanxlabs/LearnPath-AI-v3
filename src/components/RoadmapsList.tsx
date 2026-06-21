import React from 'react';
import { Trash2, Calendar, TrendingUp, Clock, ChevronRight } from 'lucide-react';
import { Roadmap } from '../types';

interface RoadmapsListProps {
  roadmaps: Roadmap[];
  onSelectRoadmap: (id: string) => void;
  onDeleteRoadmap: (id: string) => void;
}

export function RoadmapsList({ roadmaps, onSelectRoadmap, onDeleteRoadmap }: RoadmapsListProps) {
  const getStatusColor = (progress: number) => {
    if (progress === 0) return 'bg-slate-100 text-slate-700 border-slate-200';
    if (progress === 100) return 'bg-green-100 text-green-700 border-green-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
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

  if (roadmaps.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <div className="max-w-md mx-auto">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-10 h-10 text-indigo-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No Roadmaps Yet</h3>
          <p className="text-sm text-slate-600">
            Create your first learning roadmap to get started on your journey!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {roadmaps.map((roadmap) => (
        <div
          key={roadmap.id}
          className="group bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-all cursor-pointer relative"
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
            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-50 rounded-lg"
            aria-label="Delete roadmap"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>

          {/* Content */}
          <div className="pr-8">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="font-bold text-lg text-slate-900 line-clamp-2 flex-1">
                {roadmap.goal}
              </h3>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusColor(roadmap.progressPercent)}`}>
                {getStatusLabel(roadmap.progressPercent)}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                {roadmap.experienceLevel}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                <span>Progress</span>
                <span className="font-semibold">{roadmap.progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${roadmap.progressPercent}%` }}
                ></div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-4 text-xs text-slate-600 mb-3">
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
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {formatDate(roadmap.createdAt)}</span>
            </div>
          </div>

          {/* Arrow Icon */}
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className="w-5 h-5 text-indigo-600" />
          </div>
        </div>
      ))}
    </div>
  );
}
