/**
 * 買い物リスト・レシピ表示向けの数量フォーマッタ
 *
 * 入力例:
 *   (1.25, "個")          → { primary: "1¼ 個" }
 *   (1.5,  "個(450g)")    → { primary: "1½ 個", secondary: "約450g" }
 *   (0.5,  "/2本(75g)")   → { primary: "約38g" }  // パーサーが壊した値を救済
 *   (2,    "大さじ")      → { primary: "大さじ 2" }
 *   (null, "適量")        → { primary: "適量" }
 *
 * 方針:
 *   - `0.5` → `½` などのUnicode分数に整形
 *   - `個(450g)` のような unit は `個` を主、`(約450g)` を副として分離
 *   - `/N…(Xg)` という壊れた unit（COCORO+ パーサーの副作用）は grams を推定して救済
 *   - `大さじ`, `小さじ`, `適量`, `少々` などの定性値は単位→数量の順に入れ替え
 */

export type FormattedAmount = {
  /** メインに出す文字列（空なら量なし） */
  primary: string;
  /** サブに出す grams 補足（なければ undefined） */
  secondary?: string;
};

const FRACTION_MAP: Record<string, string> = {
  "0.25": "¼",
  "0.333": "⅓",
  "0.33": "⅓",
  "0.5": "½",
  "0.667": "⅔",
  "0.67": "⅔",
  "0.75": "¾",
};

const FRACTION_THRESHOLDS: { value: number; glyph: string }[] = [
  { value: 0.25, glyph: "¼" },
  { value: 1 / 3, glyph: "⅓" },
  { value: 0.5, glyph: "½" },
  { value: 2 / 3, glyph: "⅔" },
  { value: 0.75, glyph: "¾" },
];

function nearestFractionGlyph(frac: number): string | null {
  let best: { glyph: string; dist: number } | null = null;
  for (const { value, glyph } of FRACTION_THRESHOLDS) {
    const dist = Math.abs(frac - value);
    if (!best || dist < best.dist) best = { glyph, dist };
  }
  return best && best.dist <= 0.12 ? best.glyph : null;
}

function formatNumber(n: number): string {
  if (n === 0) return "0";
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);

  const key = frac.toFixed(frac < 0.35 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "");
  const exact = FRACTION_MAP[key] ?? FRACTION_MAP[frac.toFixed(2)];
  if (exact) {
    return whole === 0 ? exact : `${whole}${exact}`;
  }
  // 端数が分数テーブルにない場合は最寄りの分数に寄せる
  const nearest = nearestFractionGlyph(frac);
  if (nearest) {
    return whole === 0 ? nearest : `${whole}${nearest}`;
  }
  return n.toFixed(1).replace(/\.0$/, "");
}

/** "個(450g)" → { main: "個", grams: 450 } / "個" → { main: "個" } */
function splitUnitAndGrams(unit: string): { main: string; grams?: number } {
  const gramMatch = unit.match(/\(\s*約?\s*(\d+(?:\.\d+)?)\s*g\s*\)/);
  if (gramMatch) {
    const grams = parseFloat(gramMatch[1]);
    const main = unit.replace(gramMatch[0], "").trim();
    return { main, grams };
  }
  return { main: unit };
}

/** 大さじ/小さじ/適量/少々/ひとつまみ などの定性・前置単位判定 */
const PREFIXED_UNITS = ["大さじ", "小さじ", "カップ"];
const QUALITATIVE_UNITS = ["適量", "少々", "ひとつまみ", "お好みで", "お好み"];

export function formatShoppingAmount(
  amount: number | null | undefined,
  unit: string | null | undefined
): FormattedAmount {
  const rawUnit = (unit ?? "").trim();

  // 定性単位（適量・少々）は数量を消して単位だけ
  if (QUALITATIVE_UNITS.some((q) => rawUnit.startsWith(q))) {
    return { primary: rawUnit };
  }

  // 数量なし
  if (amount == null || !isFinite(amount) || amount <= 0) {
    return { primary: rawUnit };
  }

  // 壊れた "/N本(Xg)" 形式を救済: grams に換算
  if (rawUnit.startsWith("/")) {
    const { grams } = splitUnitAndGrams(rawUnit);
    if (grams != null) {
      // amount は既に ratio 適用済みの実効倍率
      const finalG = Math.round(grams * amount);
      return { primary: `約${finalG}g` };
    }
    // grams が取れない場合は先頭の / だけ除去
    const cleaned = rawUnit.replace(/^\//, "");
    return { primary: `${formatNumber(amount)} ${cleaned}`.trim() };
  }

  // "個(450g)" → 主: 個, 副: 約450g
  const { main, grams } = splitUnitAndGrams(rawUnit);

  // 前置単位: "大さじ 2" の順
  if (PREFIXED_UNITS.some((p) => main.startsWith(p))) {
    const primary = `${main} ${formatNumber(amount)}`.trim();
    return grams != null
      ? { primary, secondary: `約${Math.round(grams * amount)}g` }
      : { primary };
  }

  // 通常: "1½ 個"
  const primary = main
    ? `${formatNumber(amount)} ${main}`
    : formatNumber(amount);
  return grams != null
    ? { primary, secondary: `約${Math.round(grams * amount)}g` }
    : { primary };
}
