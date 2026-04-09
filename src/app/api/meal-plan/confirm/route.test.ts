import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  executeSaveWeeklyMenu: vi.fn(),
  executeGenerateShoppingList: vi.fn(),
  validateSaveArgs: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/gemini/handlers", () => ({
  executeSaveWeeklyMenu: mocks.executeSaveWeeklyMenu,
  executeGenerateShoppingList: mocks.executeGenerateShoppingList,
  validateSaveArgs: mocks.validateSaveArgs,
}));

import { POST } from "./route";

describe("POST /api/meal-plan/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when validation fails", async () => {
    mocks.validateSaveArgs.mockReturnValue({
      success: false,
      error: "slots is required",
    });

    const response = await POST(
      new Request("http://localhost/api/meal-plan/confirm", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: "slots is required",
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns partial success when shopping list generation fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = { name: "supabase" };

    mocks.validateSaveArgs.mockReturnValue({
      success: true,
      data: { week_start_date: "2026-04-06", slots: [] },
    });
    mocks.createSupabaseServerClient.mockReturnValue(supabase);
    mocks.executeSaveWeeklyMenu.mockResolvedValue({
      weekly_menu_id: "menu-1",
      saved_slots: 7,
    });
    mocks.executeGenerateShoppingList.mockRejectedValue(new Error("boom"));

    const response = await POST(
      new Request("http://localhost/api/meal-plan/confirm", {
        method: "POST",
        body: JSON.stringify({ week_start_date: "2026-04-06", slots: [] }),
        headers: { "Content-Type": "application/json" },
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        weekly_menu_id: "menu-1",
        saved_slots: 7,
        shopping_list_id: null,
      },
      error: null,
    });
    expect(mocks.executeSaveWeeklyMenu).toHaveBeenCalledWith(supabase, {
      week_start_date: "2026-04-06",
      slots: [],
    });
    expect(mocks.executeGenerateShoppingList).toHaveBeenCalledWith(supabase, {
      weekly_menu_id: "menu-1",
    });

    consoleSpy.mockRestore();
  });
});
