import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from 'recharts';
import { SkillMastery } from '../../lib/insights';

interface SkillRadarChartProps {
  data: SkillMastery[];
}

export const SkillRadarChart: React.FC<SkillRadarChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
        <defs>
          <radialGradient id="skillGradient">
            <stop offset="0%" stopColor="rgba(136, 132, 216, 0.8)" />
            <stop offset="100%" stopColor="rgba(136, 132, 216, 0.3)" />
          </radialGradient>
        </defs>
        <PolarGrid stroke="rgba(255, 255, 255, 0.2)" />
        <PolarAngleAxis 
          dataKey="skill" 
          tick={{ fill: '#d4d4d8', fontSize: 12 }} 
        />
        <PolarRadiusAxis 
          angle={30} 
          domain={[0, 5]} 
          tick={false} 
          axisLine={false} 
        />
        <Radar 
          name="Mastery Level" 
          dataKey="level" 
          stroke="#a78bfa" 
          fill="url(#skillGradient)"
          fillOpacity={0.8} 
        />
      </RadarChart>
    </ResponsiveContainer>
  );
};