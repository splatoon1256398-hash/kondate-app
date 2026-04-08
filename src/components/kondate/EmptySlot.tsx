"use client";

type Props = {
  date: string;
  mealType: "lunch" | "dinner";
};

export default function EmptySlot({ mealType }: Props) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border p-2.5">
      <span className="text-[10px] text-muted">
        {mealType === "lunch" ? "昼" : "夜"} — 未設定
      </span>
    </div>
  );
}
