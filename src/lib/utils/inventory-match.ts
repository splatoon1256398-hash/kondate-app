/**
 * 「このレシピを作ると、在庫の何割を使えるか？」を計算する。
 *
 * - 調味料は母数から除外（常備前提なので対象外）
 * - 名前マッチはゆるめ (部分一致双方向)
 * - near_expiry_names に含まれる pantry を使ったかも検出する
 */

export type IngredientLite = {
  name: string;
  amount?: number | null;
  unit?: string | null;
};

export type PantryForMatch = {
  name: string;
  amount?: number | null;
  unit?: string | null;
  expiry_date?: string | null;
};

export type InventoryMatch = {
  matched: number;
  total: number;
  matched_names: string[];
  missing_names: string[];
  /** 鮮度赤 (expired/今日明日) を使うレシピか */
  near_expiry_used: string[];
};

const SEASONING_KEYWORDS = [
  "醤油", "しょうゆ", "みりん", "酒", "砂糖", "塩", "胡椒", "こしょう",
  "味噌", "みそ", "酢", "バター", "だし", "コンソメ", "ケチャップ",
  "マヨネーズ", "ソース", "めんつゆ", "ポン酢", "オイスターソース",
  "ごま油", "オリーブオイル", "料理酒", "サラダ油",
];

function isSeasoning(name: string): boolean {
  return SEASONING_KEYWORDS.some((k) => name.includes(k));
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

function nameMatches(pantryName: string, ingName: string): boolean {
  const p = normalizeName(pantryName);
  const i = normalizeName(ingName);
  if (!p || !i) return false;
  if (p === i) return true;
  // 2文字以上の共通部分を要求（「卵」「大根」1文字食材も許容するため閾値は緩め）
  if (p.includes(i) || i.includes(p)) return true;
  return false;
}

export function computeInventoryMatch(
  ingredients: IngredientLite[],
  pantry: PantryForMatch[],
  nearExpiryNames: Set<string> = new Set()
): InventoryMatch {
  // 調味料はカウントから除外（レシピ側）
  const relevant = ingredients.filter((ing) => !isSeasoning(ing.name));

  const matchedNames: string[] = [];
  const missingNames: string[] = [];
  const nearExpiryUsed = new Set<string>();

  for (const ing of relevant) {
    const hit = pantry.find((p) => nameMatches(p.name, ing.name));
    if (hit) {
      matchedNames.push(ing.name);
      if (nearExpiryNames.has(hit.name)) {
        nearExpiryUsed.add(hit.name);
      }
    } else {
      missingNames.push(ing.name);
    }
  }

  return {
    matched: matchedNames.length,
    total: relevant.length,
    matched_names: matchedNames,
    missing_names: missingNames,
    near_expiry_used: Array.from(nearExpiryUsed),
  };
}

/**
 * 複数 candidate を鮮度🔴使用数 → マッチ率の順で並べ替え
 */
export function sortByInventoryPriority<
  T extends { inventory?: InventoryMatch | null }
>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const ai = a.inventory;
    const bi = b.inventory;
    if (!ai && !bi) return 0;
    if (!ai) return 1;
    if (!bi) return -1;
    // 1. 鮮度🔴を使った数 (多い方が上)
    const ne = bi.near_expiry_used.length - ai.near_expiry_used.length;
    if (ne !== 0) return ne;
    // 2. マッチ率
    const ar = ai.total > 0 ? ai.matched / ai.total : 0;
    const br = bi.total > 0 ? bi.matched / bi.total : 0;
    if (br !== ar) return br - ar;
    // 3. 絶対数
    return bi.matched - ai.matched;
  });
}
