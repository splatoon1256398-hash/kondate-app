/**
 * 在庫の鮮度 (残日数) 計算と AIプロンプト / UI 用フォーマット。
 *
 * 優先順位:
 *   1. expiry_date があればそれを使う
 *   2. 無ければ purchased_at + category 別デフォルト日数から推定
 *   3. どちらも無ければ null (判定不能 = 無期限扱い)
 *
 * Urgency:
 *   red:    <=1日 or 期限切れ   (🔴 今すぐ使い切り)
 *   orange: 2-3日               (🟠 今週中に)
 *   green:  4日以上 or 日付無し (まだ余裕)
 */

export type FreshnessUrgency = "red" | "orange" | "green" | null;

export type PantryItemLite = {
  name: string;
  amount: number | null;
  unit: string | null;
  expiry_date?: string | null;
  purchased_at?: string | null;
  category?: string | null;
};

/** カテゴリ別デフォルト消費期限日数 (購入日 + N日 = 推定期限) */
const DEFAULT_DAYS_BY_CATEGORY: Record<string, number> = {
  meat_fish: 3,
  dairy_egg: 7,
  tofu_natto: 4,
  vegetable: 5,
  dry_goods: 60,
  frozen: 60,
  seasoning: 180,
  other: 14,
};

/**
 * expiry_date が無い場合、purchased_at + category から期限を推定する。
 * どちらも無い場合は null を返す。
 */
export function effectiveExpiryDate(
  item: PantryItemLite | { expiry_date?: string | null; purchased_at?: string | null; category?: string | null }
): string | null {
  if (item.expiry_date) return item.expiry_date;
  if (!item.purchased_at) return null;
  const days = DEFAULT_DAYS_BY_CATEGORY[item.category || "other"] ?? 14;
  const d = new Date(item.purchased_at);
  if (!isFinite(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 指定日付の残日数 (YYYY-MM-DD 直接指定) */
export function daysLeft(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const t = new Date(expiryDate).getTime();
  if (!isFinite(t)) return null;
  const diffMs = t - Date.now();
  return Math.ceil(diffMs / 86400000);
}

/** pantry item 全体から残日数を求める (推定含む) */
export function itemDaysLeft(item: PantryItemLite): number | null {
  return daysLeft(effectiveExpiryDate(item));
}

export function freshnessUrgency(
  expiryDate: string | null | undefined
): FreshnessUrgency {
  const d = daysLeft(expiryDate);
  if (d == null) return null;
  if (d <= 1) return "red";
  if (d <= 3) return "orange";
  return "green";
}

export function itemUrgency(item: PantryItemLite): FreshnessUrgency {
  return freshnessUrgency(effectiveExpiryDate(item));
}

export function urgencyEmoji(u: FreshnessUrgency): string {
  if (u === "red") return "🔴";
  if (u === "orange") return "🟠";
  return "";
}

export function residualLabel(expiryDate: string | null | undefined): string | null {
  const d = daysLeft(expiryDate);
  if (d == null) return null;
  if (d < 0) return "期限切れ";
  if (d === 0) return "今日まで";
  if (d === 1) return "明日まで";
  return `残${d}日`;
}

/**
 * AIプロンプト用: `- 鶏もも: 300g (残2日 🟠)` 形式
 * expiry_date 未設定だが purchased_at + category で推定できれば `(推定 残2日 🟠)` になる
 */
export function formatPantryLineForAi(item: PantryItemLite): string {
  const qty = item.amount != null ? `: ${item.amount}${item.unit || ""}` : "";
  const effective = effectiveExpiryDate(item);
  const residual = residualLabel(effective);
  if (!residual) return `- ${item.name}${qty}`;
  const emoji = urgencyEmoji(freshnessUrgency(effective));
  const estimatedPrefix = !item.expiry_date && item.purchased_at ? "推定 " : "";
  return `- ${item.name}${qty} (${estimatedPrefix}${residual}${emoji ? ` ${emoji}` : ""})`;
}

/** red urgency な pantry item の name set */
export function redUrgencyNames(items: PantryItemLite[]): Set<string> {
  const set = new Set<string>();
  for (const i of items) {
    if (itemUrgency(i) === "red") set.add(i.name);
  }
  return set;
}

/** プロンプトに差し込む「優先的に使い切るべき食材」セクション本文。空なら null */
export function buildUrgentConsumeSection(items: PantryItemLite[]): string | null {
  const urgent = items.filter((i) => {
    const u = itemUrgency(i);
    return u === "red" || u === "orange";
  });
  if (urgent.length === 0) return null;
  return urgent
    .sort((a, b) => {
      const da = daysLeft(effectiveExpiryDate(a));
      const db = daysLeft(effectiveExpiryDate(b));
      return (da ?? 99) - (db ?? 99);
    })
    .map((i) => {
      const effective = effectiveExpiryDate(i);
      const residual = residualLabel(effective) || "";
      const emoji = urgencyEmoji(freshnessUrgency(effective));
      return `- ${i.name} (${residual}${emoji ? ` ${emoji}` : ""})`;
    })
    .join("\n");
}
