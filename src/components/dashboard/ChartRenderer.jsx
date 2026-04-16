import React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from 'recharts';

const CHART_PALETTE = ['#3B82F6', '#22C55E', '#F97316', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#EAB308'];

const tooltipStyle = {
  contentStyle: { background: '#1e1e24', border: '1px solid #3F465B', borderRadius: '8px', fontSize: '11px' },
  itemStyle: { color: '#e2e8f0' },
};

/**
 * Render a chart from structured data embedded in a recommendation.
 * Expected shape of rec.chartData:
 * {
 *   type: 'bar' | 'line' | 'pie' | 'area',
 *   title?: string,
 *   data: [{ name: string, value: number, ... }],
 *   series?: [{ key: string, label: string, color?: string }],
 *   xKey?: string,  // default 'name'
 * }
 */
export default function ChartRenderer({ chartData }) {
  if (!chartData || !chartData.data || chartData.data.length === 0) return null;

  const { type, title, data, series, xKey = 'name' } = chartData;
  const height = 180;

  return (
    <div className="mt-3 p-3 rounded-lg bg-forge-bg/50 border border-forge-border/30">
      {title && (
        <div className="text-[11px] font-mono text-forge-text-muted uppercase tracking-wider mb-2">
          {title}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        {type === 'bar' ? (
          <BarChart data={data} barSize={18}>
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} />
            {series ? (
              series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color || CHART_PALETTE[i]} radius={[3, 3, 0, 0]} />
              ))
            ) : (
              <Bar dataKey="value" fill={CHART_PALETTE[0]} radius={[3, 3, 0, 0]} />
            )}
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={data}>
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} />
            {series ? (
              series.map((s, i) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color || CHART_PALETTE[i]} strokeWidth={2} dot={{ r: 3 }} />
              ))
            ) : (
              <Line type="monotone" dataKey="value" stroke={CHART_PALETTE[0]} strokeWidth={2} dot={{ r: 3 }} />
            )}
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={data}>
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} />
            {series ? (
              series.map((s, i) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color || CHART_PALETTE[i]} fill={s.color || CHART_PALETTE[i]} fillOpacity={0.15} strokeWidth={2} />
              ))
            ) : (
              <Area type="monotone" dataKey="value" stroke={CHART_PALETTE[0]} fill={CHART_PALETTE[0]} fillOpacity={0.15} strokeWidth={2} />
            )}
          </AreaChart>
        ) : type === 'pie' ? (
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
              {data.map((d, i) => (
                <Cell key={i} fill={d.color || CHART_PALETTE[i % CHART_PALETTE.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
          </PieChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
}
