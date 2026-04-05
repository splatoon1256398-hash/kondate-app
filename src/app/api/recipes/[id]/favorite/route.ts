import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/recipes/[id]/favorite
 * 殿堂入り手動切替
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: { is_favorite: boolean } = await request.json();

    const { error } = await supabase
      .from("recipes")
      .update({ is_favorite: body.is_favorite })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { id, is_favorite: body.is_favorite }, error: null } satisfies ApiResponse<{ id: string; is_favorite: boolean }>,
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
