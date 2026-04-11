/**
 * COCORO+ から取り込んだホットクックレシピのステップに含まれる
 * 広告・リンク・コラボ宣伝文を除外するフィルタ。
 *
 * 表示時とインポート時の両方で利用する（= 既存DB汚染をマイグレーションなしで救済）。
 *
 * 除外対象:
 *   - URL (http/https) のみ or URL を含む行
 *   - 「★このレシピは…コラボ…」などの宣伝文
 *   - 「〜らぼ」「詳しくは…」「ご紹介」「こちら↓」「kinolabo」等
 *   - 極端に短い断片（"・・・" "〜" のみ）
 */

const PATTERNS_TO_REJECT = [
  /^https?:\/\//i, // 行頭 URL
  /https?:\/\/\S+/i, // 行中の URL
  /★/,
  /コラボ(メニュー|レシピ)/,
  /kinolabo|hokto-?kinoko|cocoro/i,
  /^(詳しくは|ご紹介|ご覧|ぜひ|レシピはこちら)/,
  /らぼとは/,
  /とは[・]{2,}/,
  /^[・。、\s]+$/, // 記号のみ
];

const TITLE_PHRASES_TO_REJECT = [
  "きのこらぼ",
  "レシピはこちら",
  "詳しくは",
  "ご紹介です",
  "コラボメニュー",
];

/**
 * ステップ1件を検査し、表示すべきかどうか返す。
 */
export function shouldKeepStep(instruction: string | null | undefined): boolean {
  if (!instruction) return false;
  const trimmed = instruction.trim();
  if (trimmed.length === 0) return false;
  // 3文字未満の断片は捨てる
  if (trimmed.length < 3) return false;

  for (const pat of PATTERNS_TO_REJECT) {
    if (pat.test(trimmed)) return false;
  }
  for (const phrase of TITLE_PHRASES_TO_REJECT) {
    if (trimmed.includes(phrase)) return false;
  }
  return true;
}

/**
 * ステップ配列を絞り込み、step_number を 1 から振り直して返す。
 * 入力型は最小限のインターフェースで、呼び出し側の型をなるべく壊さない。
 */
export function cleanSteps<
  T extends { instruction: string; step_number?: number }
>(steps: T[]): T[] {
  return steps
    .filter((s) => shouldKeepStep(s.instruction))
    .map((s, idx) => ({ ...s, step_number: idx + 1 }));
}
