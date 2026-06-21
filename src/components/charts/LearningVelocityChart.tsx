import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LearningVelocity } from '../../lib/insights';

interface LearningVelocityChartProps {
  data: LearningVelocity[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-lg p-3 text-sm">
        <p className="label text-zinc-400">{`Date: ${label}`}</p>
        <p className="intro text-white font-bold">{`XP Gained: ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};

export const LearningVelocityChart: React.FC<LearningVelocityChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{
          top: 10, right: 30, left: 0, bottom: 0,
        }}
      >
        <defs>
          <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
        <XAxis 
          dataKey="date" 
          tick={{ fill: '#9ca3af', fontSize: 12 }} 
          tickFormatter={(tick) => new Date(tick).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          axisLine={{ stroke: 'rgba(255, 255, 255, 0.2)' }}
          tickLine={{ stroke: 'rgba(255, 255, 255, 0.2)' }}
        />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={{ stroke: 'rgba(255, 255, 255, 0.2)' }} tickLine={{ stroke: 'rgba(255, 255, 255, 0.2)' }} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="xp" stroke="#8884d8" fillOpacity={1} fill="url(#colorUv)" />
      </AreaChart>
    </ResponsiveContainer>
  );
};