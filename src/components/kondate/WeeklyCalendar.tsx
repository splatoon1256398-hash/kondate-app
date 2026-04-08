"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  getMonday,
  getWeekDays,
  shortDate,
  dayLabel,
  prevWeek,
  nextWeek,
  formatDate,
} from "@/lib/utils/date";
import type { WeeklyMenuResponse, MealSlotResponse } from "@/types/weekly-menu";
import type { ApiResponse } from "@/types/common";
import MealSlotRow from "./MealSlotRow";

export default function WeeklyCalendar() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [menu, setMenu] = useState<WeeklyMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMenu = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/weekly-menus?week_start_date=${date}`);
      const json: ApiResponse<WeeklyMenuResponse | null> = await res.json();
      setMenu(json.data ?? null);
    } catch {
      setMenu(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu(weekStart);
  }, [weekStart, fetchMenu]);

  const days = getWeekDays(weekStart);
  const today = formatDate(new Date());
  const weekEndDate = days[days.length - 1];

  function slotsForDay(date: string): {
    lunch: MealSlotResponse | null;
    dinner: MealSlotResponse | null;
  } {
    if (!menu) return { lunch: null, dinner: null };
    const daySlots = menu.meal_slots.filter((s) => s.date === date);
    return {
      lunch: daySlots.find((s) => s.meal_type === "lunch") ?? null,
      dinner: daySlots.find((s) => s.meal_type === "dinner") ?? null,
    };
  }

  return (
    <div>
      {/* Week header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setWeekStart(prevWeek(weekStart))}
          className="rounded-xl p-2.5 text-muted transition-colors active:bg-card"
          aria-label="前の週"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="text-center">
          <h2 className="text-base font-bold">
            {shortDate(weekStart)} 〜 {shortDate(weekEndDate)}
          </h2>
          {menu && (
            <span
              className={`text-[10px] font-medium ${
                menu.status === "confirmed" ? "text-green" : "text-accent"
              }`}
            >
              {menu.status === "confirmed" ? "確定済み" : "下書き"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setWeekStart(nextWeek(weekStart))}
          className="rounded-xl p-2.5 text-muted transition-colors active:bg-card"
          aria-label="次の週"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Calendar body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : !menu ? (
        <EmptyWeekState />
      ) : (
        <div className="px-3">
          {days.map((date) => {
            const { lunch, dinner } = slotsForDay(date);
            const isToday = date === today;
            const isPast = date < today;
            const isSun = new Date(date).getDay() === 0;
            const isSat = new Date(date).getDay() === 6;

            return (
              <div
                key={date}
                className={`border-b border-border/50 py-2.5 last:border-0 ${isPast ? "opacity-50" : ""}`}
              >
                {/* Day header */}
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                      isToday
                        ? "bg-accent text-background"
                        : isSun
                          ? "text-danger"
                          : isSat
                            ? "text-blue"
                            : "text-muted"
                    }`}
                  >
                    {dayLabel(date)}
                  </span>
                  <span
                    className={`text-xs ${
                      isToday ? "font-bold text-accent" : "text-muted"
                    }`}
                  >
                    {shortDate(date)}
                  </span>
                  {isToday && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold text-accent">
                      TODAY
                    </span>
                  )}
                </div>

                {/* Meal rows */}
                <div className="space-y-1">
                  <MealSlotRow
                    slot={lunch}
                    mealType="lunch"
                    onUpdate={() => fetchMenu(weekStart)}
                  />
                  <MealSlotRow
                    slot={dinner}
                    mealType="dinner"
                    onUpdate={() => fetchMenu(weekStart)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyWeekState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <p className="text-sm text-muted">この週の献立はまだありません</p>
      <Link
        href="/ai"
        className="flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-background transition-opacity active:opacity-80"
      >
        <Sparkles size={16} />
        AIに提案してもらう
      </Link>
    </div>
  );
}
