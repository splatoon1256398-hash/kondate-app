"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  Sparkles,
  ChefHat,
  Sun,
  Moon,
  Leaf,
  AlertCircle,
  Loader2,
  ArrowRight,
  Refrigerator,
  Check,
  X,
  Heart,
  Star,
} from "lucide-react";
import type { ApiResponse } from "@/types/common";
import type { UseUpWeekResponse } from "@/app/api/meal-plan/use-up-week/route";
import { dayLabel, shortDate } from "@/lib/utils/date";
import { residualLabel, daysLeft } from "@/lib/utils/pantry-freshness";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApplied?: () => void;
};

export default function UseUpPlanDialog({ open, onOpenChange, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<UseUpWeekResponse | null>(null);
  const [applied, setApplied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    setApplied(false);
    try {
      const res = await fetch("/api/meal-plan/use-up-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json: ApiResponse<UseUpWeekResponse> = await res.json();
      if (json.error || !json.data) {
        setError(json.error || "計画の生成に失敗しました");
        return;
      }
      setPlan(json.data);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      generate();
    } else {
      setPlan(null);
      setError(null);
      setApplied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = useCallback(async () => {
    if (!plan || applying) return;
    setApplying(true);
    setError(null);
    try {
      const body = {
        week_start_date: plan.week_start_date,
        slots: plan.plan.map((s) => ({
          date: s.date,
          meal_type: s.meal_type,
          servings: s.servings,
          is_skipped: false,
          recipe_id: s.recipe_id,
        })),
      };
      const res = await fetch("/api/meal-plan/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: ApiResponse<{ weekly_menu_id: string }> = await res.json();
      if (json.error || !json.data) {
        setError(json.error || "適用に失敗しました");
        return;
      }
      setApplied(true);
      onApplied?.();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setApplying(false);
    }
  }, [plan, applying, onApplied]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 top-0 z-50 mx-auto flex max-w-lg flex-col bg-bg-grouped pb-safe pt-safe shadow-2xl sm:rounded-[14px]">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-separator bg-bg-secondary px-4 py-3">
            <Dialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-full text-label-secondary active:bg-fill"
              aria-label="閉じる"
            >
              <X size={18} strokeWidth={2} />
            </Dialog.Close>
            <Dialog.Title className="text-[17px] font-semibold text-label">
              使い切り計画
            </Dialog.Title>
            <button
              type="button"
              onClick={generate}
              disabled={loading || applying}
              className="text-[13px] font-medium text-blue active:opacity-60 disabled:opacity-30"
            >
              再生成
            </button>
          </div>

          {/* Body (scrollable) */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <LoadingBody />
            ) : error && !plan ? (
              <ErrorBody error={error} onRetry={generate} />
            ) : plan ? (
              <PlanBody plan={plan} applied={applied} />
            ) : null}
          </div>

          {/* Footer (sticky) */}
          {plan && !loading && (
            <div className="shrink-0 border-t border-separator bg-bg-secondary px-4 py-3">
              {applied ? (
                <div className="flex items-center justify-center gap-2 py-2 text-[15px] font-semibold text-green">
                  <Check size={18} strokeWidth={2.5} />
                  今週のカレンダーに反映しました
                </div>
              ) : (
                <>
                  {error && (
                    <p className="mb-2 text-center text-[12px] text-red">{error}</p>
                  )}
                  <button
                    type="button"
                    onClick={apply}
                    disabled={applying}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-purple py-3 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-40"
                  >
                    {applying ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ArrowRight size={16} strokeWidth={2.5} />
                    )}
                    {applying ? "反映中…" : "この計画で1週間を埋める"}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-label-tertiary">
                    ※ 既存の今週の献立は上書きされます
                  </p>
                </>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LoadingBody() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-purple border-t-transparent" />
        <Sparkles
          size={20}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-purple"
          strokeWidth={2}
        />
      </div>
      <div className="space-y-1">
        <p className="text-[17px] font-semibold text-label">計画中…</p>
        <p className="text-[13px] text-label-secondary">
          在庫を見ながら1週間を組んでいます
        </p>
      </div>
    </div>
  );
}

function ErrorBody({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <AlertCircle size={32} className="text-red" strokeWidth={1.5} />
      <p className="text-[15px] text-label-secondary">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[10px] bg-fill px-4 py-2 text-[13px] font-medium text-blue active:bg-fill-secondary"
      >
        もう一度試す
      </button>
    </div>
  );
}

function PlanBody({
  plan,
  applied,
}: {
  plan: UseUpWeekResponse;
  applied: boolean;
}) {
  // 日ごとにグルーピング
  const byDate = useMemo(() => {
    const map = new Map<string, typeof plan.plan>();
    for (const s of plan.plan) {
      const arr = map.get(s.date) || [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [plan]);

  const usedItems = plan.pantry_usage.filter((u) => u.used_in.length > 0);
  const unusedItems = plan.pantry_usage.filter((u) => u.used_in.length === 0);

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Summary card */}
      <section className="rounded-[14px] bg-bg-secondary p-4">
        <div className="mb-3 flex items-center gap-2">
          <Refrigerator size={14} className="text-blue" strokeWidth={2} />
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            使い切りサマリー
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label="在庫消費"
            value={`${plan.summary.used_pantry} / ${plan.summary.total_pantry}`}
            hint={
              plan.summary.total_pantry > 0
                ? `${Math.round(
                    (plan.summary.used_pantry / plan.summary.total_pantry) * 100
                  )}% 消費`
                : "在庫なし"
            }
            tone={
              plan.summary.total_pantry === 0
                ? "gray"
                : plan.summary.used_pantry / plan.summary.total_pantry >= 0.7
                ? "green"
                : plan.summary.used_pantry / plan.summary.total_pantry >= 0.4
                ? "blue"
                : "orange"
            }
          />
          <SummaryTile
            label="🔴 期限近い"
            value={
              plan.summary.near_expiry_total === 0
                ? "なし"
                : `${plan.summary.near_expiry_covered} / ${plan.summary.near_expiry_total}`
            }
            hint={
              plan.summary.near_expiry_total === 0
                ? "危険な食材なし"
                : plan.summary.near_expiry_covered === plan.summary.near_expiry_total
                ? "全部救える"
                : `${
                    plan.summary.near_expiry_total - plan.summary.near_expiry_covered
                  } 救えない`
            }
            tone={
              plan.summary.near_expiry_total === 0
                ? "gray"
                : plan.summary.near_expiry_covered === plan.summary.near_expiry_total
                ? "green"
                : "red"
            }
          />
        </div>
      </section>

      {/* Day-by-day plan */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
          <Sparkles size={12} strokeWidth={2} />
          1週間の計画
        </h2>
        {byDate.map(([date, slots]) => (
          <DayCard key={date} date={date} slots={slots} applied={applied} />
        ))}
      </section>

      {/* Pantry usage breakdown */}
      {plan.pantry_usage.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            <Leaf size={12} strokeWidth={2} />
            在庫の行方
          </h2>
          <div className="overflow-hidden rounded-[12px] bg-bg-secondary">
            {usedItems.length > 0 && (
              <div className="cell-separator">
                {usedItems.map((item) => (
                  <PantryUsageRow key={item.name} item={item} isUsed />
                ))}
              </div>
            )}
            {unusedItems.length > 0 && (
              <>
                <div className="border-t border-separator bg-fill-tertiary/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-label-tertiary">
                  使わなかった食材（{unusedItems.length}）
                </div>
                <div className="cell-separator">
                  {unusedItems.map((item) => (
                    <PantryUsageRow key={item.name} item={item} isUsed={false} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "orange" | "red" | "gray";
}) {
  const toneMap: Record<typeof tone, string> = {
    green: "text-green",
    blue: "text-blue",
    orange: "text-orange",
    red: "text-red",
    gray: "text-label-tertiary",
  };
  return (
    <div className="rounded-[10px] bg-fill-tertiary/60 p-3">
      <p className="text-[11px] font-medium text-label-tertiary">{label}</p>
      <p className={`mt-1 text-[20px] font-bold ${toneMap[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-label-secondary">{hint}</p>
    </div>
  );
}

function DayCard({
  date,
  slots,
  applied,
}: {
  date: string;
  slots: UseUpWeekResponse["plan"];
  applied: boolean;
}) {
  const isWeekend = ["土", "日"].includes(dayLabel(date));
  return (
    <div
      className={`overflow-hidden rounded-[14px] bg-bg-secondary ${
        applied ? "ring-1 ring-green/30" : ""
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b border-separator px-4 py-2 ${
          isWeekend ? "bg-orange/5" : ""
        }`}
      >
        <span className="text-[13px] font-semibold text-label">
          {shortDate(date)}
        </span>
        <span
          className={`text-[13px] font-medium ${
            isWeekend ? "text-orange" : "text-label-secondary"
          }`}
        >
          {dayLabel(date)}
        </span>
      </div>
      <div className="cell-separator">
        {slots.map((s) => (
          <SlotRow key={s.meal_type} slot={s} />
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
}: {
  slot: UseUpWeekResponse["plan"][number];
}) {
  const isLunch = slot.meal_type === "lunch";
  const MealIcon = isLunch ? Sun : Moon;
  const mealColor = isLunch ? "text-orange" : "text-indigo";
  const inv = slot.inventory;
  const ratio = inv && inv.total > 0 ? inv.matched / inv.total : 0;
  const tone =
    !inv || inv.total === 0
      ? "bg-fill text-label-tertiary"
      : ratio >= 0.75
      ? "bg-green/15 text-green"
      : ratio >= 0.5
      ? "bg-blue/15 text-blue"
      : "bg-fill text-label-tertiary";

  return (
    <Link
      href={`/menu/${slot.recipe_id}`}
      className="flex items-start gap-3 px-4 py-3 active:bg-fill"
    >
      <MealIcon
        size={16}
        className={`mt-0.5 shrink-0 ${mealColor}`}
        strokeWidth={1.5}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-label">
            {slot.title}
          </span>
          {slot.cook_method === "hotcook" && (
            <ChefHat
              size={12}
              className="shrink-0 text-label-tertiary"
              strokeWidth={1.5}
            />
          )}
        </div>
        {slot.reason && (
          <p className="mt-0.5 text-[12px] leading-[16px] text-label-secondary">
            {slot.reason}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {slot.is_favorite ? (
            <span className="flex items-center gap-0.5 rounded-full bg-red/15 px-2 py-0.5 text-[11px] font-semibold text-red">
              <Heart size={10} className="fill-red" strokeWidth={2} />
              殿堂入り
              {slot.rating?.avg != null && (
                <span className="ml-0.5">★{slot.rating.avg.toFixed(1)}</span>
              )}
            </span>
          ) : slot.rating?.avg != null && slot.rating.count > 0 ? (
            <span
              className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                slot.rating.avg >= 4
                  ? "bg-yellow/15 text-orange"
                  : "bg-fill text-label-secondary"
              }`}
            >
              <Star size={10} strokeWidth={2} />
              {slot.rating.avg.toFixed(1)}
            </span>
          ) : null}
          {inv && inv.total > 0 && (
            <>
              <span
                className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
              >
                <Leaf size={10} strokeWidth={2} />
                {inv.matched}/{inv.total}
              </span>
              {inv.near_expiry_used.length > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-red/15 px-2 py-0.5 text-[11px] font-semibold text-red">
                  <AlertCircle size={10} strokeWidth={2} />
                  {inv.near_expiry_used[0]}
                  {inv.near_expiry_used.length > 1
                    ? ` +${inv.near_expiry_used.length - 1}`
                    : ""}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function PantryUsageRow({
  item,
  isUsed,
}: {
  item: UseUpWeekResponse["pantry_usage"][number];
  isUsed: boolean;
}) {
  const d = daysLeft(item.expiry_date);
  const urgentClass =
    d != null && d <= 1
      ? "text-red"
      : d != null && d <= 3
      ? "text-orange"
      : "text-label-tertiary";

  return (
    <div className="flex items-start gap-2 px-4 py-2.5">
      <span
        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
          isUsed ? "bg-green" : "bg-label-tertiary"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] text-label">{item.name}</span>
          {item.amount != null && (
            <span className="text-[11px] text-label-tertiary">
              {item.amount}
              {item.unit || ""}
            </span>
          )}
          {item.expiry_date && (
            <span className={`text-[11px] font-medium ${urgentClass}`}>
              {residualLabel(item.expiry_date)}
            </span>
          )}
        </div>
        {isUsed && item.used_in.length > 0 && (
          <div className="mt-0.5 text-[11px] text-label-secondary">
            {item.used_in
              .slice(0, 3)
              .map(
                (u) =>
                  `${shortDate(u.date)}${
                    u.meal_type === "lunch" ? "昼" : "夜"
                  } ${u.title}`
              )
              .join(" / ")}
            {item.used_in.length > 3 && ` +${item.used_in.length - 3}`}
          </div>
        )}
      </div>
    </div>
  );
}
