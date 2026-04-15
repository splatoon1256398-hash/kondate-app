/**
 * 材料の数量表示フォーマット
 * - amount が 0（数量が解釈できなかった「適量」「大さじ4」等）の場合は unit のみ返す
 * - それ以外は "amount unit" の形で返す
 */
export function formatIngredientAmount(amount: number, unit: string): string {
  if (!amount || amount === 0) return unit;
  return `${amount} ${unit}`;
}
