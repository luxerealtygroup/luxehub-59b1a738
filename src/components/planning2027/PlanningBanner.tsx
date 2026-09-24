import { CalendarClock } from 'lucide-react';
import { PlanningSettings, countdown, formatDeadline, formatSessionDate, lockTime } from '@/lib/planning2027';

export function PlanningBanner({ settings, now }: { settings: PlanningSettings; now: number }) {
  const locked = now > new Date(lockTime(settings)).getTime();
  const draftPast = now > new Date(settings.submission_deadline).getTime();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gold/50 bg-gold/5 px-4 py-3">
      <CalendarClock className="h-5 w-5 text-gold shrink-0" />
      <span className="font-semibold text-foreground">
        Draft due {formatSessionDate(new Date(settings.submission_deadline).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }))} · Final at the session {formatSessionDate(settings.planning_session_date)}
      </span>
      <span className="text-sm text-muted-foreground">
        {!draftPast
          ? `Draft: ${countdown(settings.submission_deadline, now)} (${formatDeadline(settings.submission_deadline)})`
          : !locked
            ? `Draft deadline passed — goals lock ${formatDeadline(lockTime(settings))}`
            : 'Goals locked'} · Toronto time
      </span>
    </div>
  );
}
