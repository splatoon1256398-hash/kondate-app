import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeIngredientsFromPantry } from "@/lib/utils/pantry-sync";
import type { ApiResponse } from "@/types/common";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/recipes/[id]/cooked
 * 「作った！」→ 在庫から食材を自動差し引き
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: { servings: number } = await request.json();

    await consumeIngredientsFromPantry(supabase, id, body.servings || 2);

    return NextResponse.json(
      { data: { consumed: true }, error: null } satisfies ApiResponse<{ consumed: boolean }>,
      { status: 200 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: message } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
