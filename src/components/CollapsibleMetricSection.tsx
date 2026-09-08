import { ReactNode, useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleMetricSectionProps {
  /** localStorage key used to remember this viewer's open/closed choice */
  storageKey: string;
  defaultOpen: boolean;
  title: ReactNode;
  /** One-line summary shown in the heading row while the section is closed */
  summary?: string;
  titleClassName?: string;
  children: ReactNode;
}

function readStored(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === 'open') return true;
    if (raw === 'closed') return false;
  } catch {
    /* storage unavailable — fall back to the default */
  }
  return fallback;
}

export function CollapsibleMetricSection({
  storageKey,
  defaultOpen,
  title,
  summary,
  titleClassName = 'text-xs font-medium text-muted-foreground',
  children,
}: CollapsibleMetricSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  useEffect(() => {
    setOpen(readStored(storageKey, defaultOpen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? 'open' : 'closed');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className={titleClassName}>{title}</span>
          {!open && summary && (
            <span className="text-xs text-muted-foreground/80">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        id={contentId}
        className={`grid transition-all duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** "3 with a value · 5 waiting on Follow Up Boss" */
export function summarise(values: Array<number | null | undefined>, waitingLabel = 'waiting on Follow Up Boss') {
  const filled = values.filter(v => v !== null && v !== undefined).length;
  const waiting = values.length - filled;
  return `${filled} with a value · ${waiting} ${waitingLabel}`;
}
