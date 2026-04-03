/** 指定日を含む週の月曜日を返す (YYYY-MM-DD) */
export function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

/** Date → YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD → Date (ローカル時間) */
export function parseDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 月曜始まりの7日間を返す */
export function getWeekDays(mondayStr: string): string[] {
  const monday = parseDate(mondayStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return formatDate(d);
  });
}

/** "4/7" のような短い日付表示 */
export function shortDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** "月" のような曜日表示 */
export function dayLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  return DAY_LABELS[d.getDay()];
}

/** 前の週の月曜を返す */
export function prevWeek(mondayStr: string): string {
  const d = parseDate(mondayStr);
  d.setDate(d.getDate() - 7);
  return formatDate(d);
}

/** 次の週の月曜を返す */
export function nextWeek(mondayStr: string): string {
  const d = parseDate(mondayStr);
  d.setDate(d.getDate() + 7);
  return formatDate(d);
}
