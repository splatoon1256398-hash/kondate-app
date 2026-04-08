import type { FunctionDeclaration, Type } from "@google/genai";

const T: Record<string, Type> = {
  STRING: "STRING" as Type,
  INTEGER: "INTEGER" as Type,
  NUMBER: "NUMBER" as Type,
  BOOLEAN: "BOOLEAN" as Type,
  OBJECT: "OBJECT" as Type,
  ARRAY: "ARRAY" as Type,
};

const recipeSchema = {
  type: T.OBJECT,
  properties: {
    title: { type: T.STRING },
    description: { type: T.STRING },
    servings_base: { type: T.INTEGER },
    cook_method: { type: T.STRING, enum: ["hotcook", "stove", "other"] },
    hotcook_menu_number: { type: T.STRING },
    hotcook_unit: { type: T.STRING },
    prep_time_min: { type: T.INTEGER },
    cook_time_min: { type: T.INTEGER },
    ingredients: {
      type: T.ARRAY,
      items: {
        type: T.OBJECT,
        properties: {
          name: { type: T.STRING },
          amount: { type: T.NUMBER },
          unit: { type: T.STRING },
          sort_order: { type: T.INTEGER },
        },
        required: ["name", "amount", "unit", "sort_order"],
      },
    },
    steps: {
      type: T.ARRAY,
      items: {
        type: T.OBJECT,
        properties: {
          step_number: { type: T.INTEGER },
          instruction: { type: T.STRING },
          tip: { type: T.STRING },
        },
        required: ["step_number", "instruction"],
      },
    },
  },
  required: ["title", "servings_base", "cook_method", "ingredients", "steps"],
};

const slotSchema = {
  type: T.OBJECT,
  properties: {
    date: { type: T.STRING, description: "日付 YYYY-MM-DD" },
    meal_type: { type: T.STRING, enum: ["lunch", "dinner"] },
    servings: { type: T.INTEGER, description: "人数 1 or 2" },
    is_skipped: { type: T.BOOLEAN, description: "外食等でスキップ" },
    memo: { type: T.STRING },
    recipe_id: {
      type: T.STRING,
      description: "既存DBレシピのID（UUID）。これが指定されている場合、recipeフィールドは省略すること。DBに合うレシピがある場合は必ずこちらを使う。",
    },
    recipe: recipeSchema,
  },
  required: ["date", "meal_type", "servings"],
};

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "propose_weekly_menu",
    description: "1週間の献立を提案する。ユーザーに確認してもらうためのプレビュー表示用。DBには保存しない。",
    parameters: {
      type: T.OBJECT,
      properties: {
        week_start_date: {
          type: T.STRING,
          description: "週の開始日（月曜）。YYYY-MM-DD形式",
        },
        slots: {
          type: T.ARRAY,
          description: "各食事枠の提案",
          items: slotSchema,
        },
      },
      required: ["week_start_date", "slots"],
    },
  },
  {
    name: "save_weekly_menu",
    description: "ユーザーが「確定」「これでOK」と言った時のみ呼ぶ。提案した献立をDBに保存する。",
    parameters: {
      type: T.OBJECT,
      properties: {
        week_start_date: {
          type: T.STRING,
          description: "週の開始日（月曜）。YYYY-MM-DD形式",
        },
        slots: {
          type: T.ARRAY,
          description: "確定する全食事枠",
          items: slotSchema,
        },
      },
      required: ["week_start_date", "slots"],
    },
  },
  {
    name: "generate_shopping_list",
    description: "献立確定後に自動で呼ばれる。全レシピの食材を集約して買い物リストを生成する。",
    parameters: {
      type: T.OBJECT,
      properties: {
        weekly_menu_id: {
          type: T.STRING,
          description: "save_weekly_menuで返されたweekly_menu_id",
        },
      },
      required: ["weekly_menu_id"],
    },
  },
];
