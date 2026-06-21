import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WeeklyReport } from '../../lib/insights';

interface WeeklyReportChartProps {
  data: WeeklyReport[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-lg p-3 text-sm">
        <p className="label text-zinc-400 font-bold">{label}</p>
        <p className="text-cyan-400">{`XP Gained: ${payload[0].value}`}</p>
        <p className="text-amber-400">{`Lessons Completed: ${payload[1].value}`}</p>
      </div>
    );
  }
  return null;
};

export const WeeklyReportChart: React.FC<WeeklyReportChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{
          top: 5, right: 30, left: 20, bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
        <XAxis 
          dataKey="week" 
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(255, 255, 255, 0.2)' }}
          tickLine={{ stroke: 'rgba(255, 255, 255, 0.2)' }}
        />
        <YAxis 
          yAxisId="left" 
          orientation="left" 
          stroke="#86efac" 
          tick={{ fill: '#86efac', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(134, 239, 172, 0.4)' }}
          tickLine={{ stroke: 'rgba(134, 239, 172, 0.4)' }}
        />
        <YAxis 
          yAxisId="right" 
          orientation="right" 
          stroke="#fcd34d" 
          tick={{ fill: '#fcd34d', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(252, 211, 77, 0.4)' }}
          tickLine={{ stroke: 'rgba(252, 211, 77, 0.4)' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '14px', color: '#9ca3af' }} />
        <Bar yAxisId="left" dataKey="xpGained" fill="#22d3ee" name="XP Gained" />
        <Bar yAxisId="right" dataKey="lessonsCompleted" fill="#f59e0b" name="Lessons Completed" />
      </BarChart>
    </ResponsiveContainer>
  );
};