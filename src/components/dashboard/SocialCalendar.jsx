import React, { useState, useMemo } from 'react';
import { PLATFORMS, POST_STATUSES } from '../../utils/socialPlatforms';

export default function SocialCalendar({ posts, onUpdatePost }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // month | week
  const [selectedDay, setSelectedDay] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7; // Mon=0
    const days = [];

    // Padding days from previous month
    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false });
    }
    // Days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    // Padding to fill grid
    while (days.length % 7 !== 0) {
      const next = days.length - startPad - lastDay.getDate() + 1;
      days.push({ date: new Date(year, month + 1, next), isCurrentMonth: false });
    }
    return days;
  }, [year, month]);

  const postsByDate = useMemo(() => {
    const map = {};
    for (const post of posts) {
      const dateStr = post.scheduledAt
        ? new Date(post.scheduledAt).toDateString()
        : post.postedAt
        ? new Date(post.postedAt).toDateString()
        : null;
      if (dateStr) {
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(post);
      }
    }
    return map;
  }, [posts]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const today = new Date().toDateString();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const selectedDayPosts = useMemo(() => {
    if (!selectedDay) return [];
    return postsByDate[selectedDay.toDateString()] || [];
  }, [selectedDay, postsByDate]);

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="px-2 py-1 text-xs text-forge-text-muted hover:text-forge-text-primary transition-colors">&larr;</button>
          <h3 className="text-sm font-mono font-semibold text-forge-text-primary min-w-[160px] text-center">
            {monthName}
          </h3>
          <button onClick={nextMonth} className="px-2 py-1 text-xs text-forge-text-muted hover:text-forge-text-primary transition-colors">&rarr;</button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-2.5 py-1 text-[10px] text-forge-text-muted border border-forge-border rounded hover:text-forge-accent hover:border-forge-accent/30 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-px">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-[10px] font-mono text-forge-text-muted uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-forge-border/30 rounded-lg overflow-hidden">
        {calendarDays.map((day, i) => {
          const dateStr = day.date.toDateString();
          const dayPosts = postsByDate[dateStr] || [];
          const isToday = dateStr === today;
          const isSelected = selectedDay && selectedDay.toDateString() === dateStr;

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(day.date)}
              className={`min-h-[72px] p-1.5 text-left transition-colors ${
                day.isCurrentMonth ? 'bg-forge-surface' : 'bg-forge-bg/50'
              } ${isSelected ? 'ring-1 ring-forge-accent ring-inset' : ''} hover:bg-forge-surface-hover`}
            >
              <div className={`text-[10px] font-mono ${
                isToday ? 'text-forge-accent font-bold' : day.isCurrentMonth ? 'text-forge-text-secondary' : 'text-forge-text-muted/50'
              }`}>
                {day.date.getDate()}
              </div>
              {dayPosts.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {dayPosts.slice(0, 4).map((post, j) => {
                    const platform = PLATFORMS[post.platform];
                    return (
                      <span
                        key={j}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: platform?.color || '#64748B' }}
                        title={`${platform?.name || post.platform}: ${post.content?.text?.slice(0, 50) || ''}`}
                      />
                    );
                  })}
                  {dayPosts.length > 4 && (
                    <span className="text-[8px] text-forge-text-muted">+{dayPosts.length - 4}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day Detail */}
      {selectedDay && (
        <div className="card">
          <h4 className="text-xs font-mono font-semibold text-forge-text-secondary mb-3">
            {selectedDay.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h4>
          {selectedDayPosts.length === 0 ? (
            <p className="text-xs text-forge-text-muted py-4 text-center">No posts scheduled for this day</p>
          ) : (
            <div className="space-y-2">
              {selectedDayPosts.map(post => {
                const platform = PLATFORMS[post.platform];
                const status = POST_STATUSES[post.status];
                return (
                  <div key={post.id} className="flex items-start gap-2 p-2 rounded-lg bg-forge-bg/50 border border-forge-border">
                    <span className="text-sm" style={{ color: platform?.color }}>{platform?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-forge-text-primary">{platform?.name}</span>
                        <span className="px-1.5 py-0.5 text-[10px] rounded" style={{ backgroundColor: `${status?.color}20`, color: status?.color }}>
                          {status?.label}
                        </span>
                      </div>
                      <p className="text-xs text-forge-text-secondary mt-0.5 line-clamp-2">{post.content?.text}</p>
                    </div>
                    {post.scheduledAt && (
                      <span className="text-[10px] text-forge-text-muted flex-shrink-0">
                        {new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
