export interface CalendarQuarter {
  quarter: 1 | 2 | 3 | 4;
  year: number;
  label: string;
  start: string;
  end: string;
}

const ymd = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function calendarQuarter(year: number, quarter: 1 | 2 | 3 | 4): CalendarQuarter {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  const endDay = new Date(year, endMonth, 0).getDate();
  return {
    quarter,
    year,
    label: `Q${quarter} ${year}`,
    start: ymd(year, startMonth, 1),
    end: ymd(year, endMonth, endDay),
  };
}

export function rollingCalendarQuarters(now = new Date()) {
  const currentNumber = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  const current = calendarQuarter(now.getFullYear(), currentNumber);
  const nextNumber = (currentNumber === 4 ? 1 : currentNumber + 1) as 1 | 2 | 3 | 4;
  const next = calendarQuarter(currentNumber === 4 ? now.getFullYear() + 1 : now.getFullYear(), nextNumber);
  return {
    current,
    next,
    combinedLabel: `Q${current.quarter} + Q${next.quarter}`,
  };
}
