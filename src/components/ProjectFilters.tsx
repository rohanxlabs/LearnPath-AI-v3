import React from 'react';

const difficultyLevels = ['all', 'beginner', 'intermediate', 'advanced'];

interface ProjectFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: 'all' | 'beginner' | 'intermediate' | 'advanced') => void;
}

const ProjectFilters: React.FC<ProjectFiltersProps> = ({ activeFilter, onFilterChange }) => {
  return (
    <div className="flex flex-wrap gap-2 p-1.5 bg-white/5 border border-white/10 rounded-xl max-w-fit">
      {difficultyLevels.map((level) => (
        <button
          key={level}
          onClick={() => onFilterChange(level as any)}
          className={`px-4 py-2 text-xs font-bold rounded-lg uppercase tracking-wider transition-colors duration-300 ${
            activeFilter === level
              ? 'bg-violet-600 text-white shadow-lg'
              : 'text-zinc-300 hover:bg-white/10 hover:text-white'
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
};

export default ProjectFilters;