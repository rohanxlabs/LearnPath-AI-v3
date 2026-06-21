import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, Bookmark, Video, ExternalLink } from 'lucide-react';
import { getProjectRecommendations } from '../lib/recommendations';

interface RecommendedResourcesProps {
  techStack: string[];
  features: string[];
}

const iconMap = {
  video: <Video size={16} className="text-rose-400" />,
  course: <Bookmark size={16} className="text-amber-400" />,
  article: <BookOpen size={16} className="text-sky-400" />,
};

const RecommendedResources: React.FC<RecommendedResourcesProps> = ({ techStack, features }) => {
  const recommendations = getProjectRecommendations(techStack, features);

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="bg-violet-500/10 p-4 rounded-xl border border-violet-500/20 space-y-3">
      <h4 className="text-xs font-bold text-violet-300 uppercase tracking-wider">Recommended Resources</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recommendations.map((res) => (
          <motion.a
            key={res.id}
            href={res.url}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.03 }}
            className="bg-black/20 p-3 rounded-lg border border-white/10 hover:bg-black/40 transition-colors flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0">{iconMap[res.type] || <BookOpen size={16} />}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{res.title}</p>
                <p className="text-xs text-zinc-400 uppercase tracking-wide">{res.provider}</p>
              </div>
            </div>
            <ExternalLink size={14} className="text-zinc-400 shrink-0" />
          </motion.a>
        ))}
      </div>
    </div>
  );
};

export default RecommendedResources;