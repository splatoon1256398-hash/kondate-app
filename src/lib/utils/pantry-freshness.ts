/**
 * 在庫の鮮度 (expiry_date から残日数) を計算し、
 * プロンプト / UI で共通に使うユーティリティ。
 *
 * ルール:
 *   - red:    <=1日 or 期限切れ   (🔴 今すぐ使い切り)
 *   - orange: 2-3日               (🟠 今週中に)
 *   - green:  4日以上 or 日付無し (まだ余裕)
 */

export type FreshnessUrgency = "red" | "orange" | "green" | null;

export type PantryItemLite = {
  name: string;
  amount: number | null;
  unit: string | null;
  expiry_date?: string | null;
};

export function daysLeft(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const t = new Date(expiryDate).getTime();
  if (!isFinite(t)) return null;
  // 日単位で切り上げ (同日は0)
  const now = Date.now();
  const diffMs = t - now;
  return Math.ceil(diffMs / 86400000);
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
 */
export function formatPantryLineForAi(item: PantryItemLite): string {
  const qty = item.amount != null ? `: ${item.amount}${item.unit || ""}` : "";
  const residual = residualLabel(item.expiry_date);
  if (!residual) return `- ${item.name}${qty}`;
  const emoji = urgencyEmoji(freshnessUrgency(item.expiry_date));
  return `- ${item.name}${qty} (${residual}${emoji ? ` ${emoji}` : ""})`;
}

/**
 * red urgency な pantry item の name set を返す。
 * inventory-match で「鮮度🔴を使ったか？」の判定に使う。
 */
export function redUrgencyNames(items: PantryItemLite[]): Set<string> {
  const set = new Set<string>();
  for (const i of items) {
    if (freshnessUrgency(i.expiry_date) === "red") set.add(i.name);
  }
  return set;
}

/**
 * プロンプトで「🔴 優先的に使い切るべき食材」セクションの本文。空なら null。
 */
export function buildUrgentConsumeSection(items: PantryItemLite[]): string | null {
  const urgent = items.filter((i) => {
    const u = freshnessUrgency(i.expiry_date);
    return u === "red" || u === "orange";
  });
  if (urgent.length === 0) return null;
  return urgent
    .sort((a, b) => (daysLeft(a.expiry_date) ?? 99) - (daysLeft(b.expiry_date) ?? 99))
    .map((i) => {
      const residual = residualLabel(i.expiry_date) || "";
      const emoji = urgencyEmoji(freshnessUrgency(i.expiry_date));
      return `- ${i.name} (${residual}${emoji ? ` ${emoji}` : ""})`;
    })
    .join("\n");
}
