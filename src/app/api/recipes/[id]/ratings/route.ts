import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeRating, CreateRating } from "@/types/rating";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/recipes/[id]/ratings
 * そのレシピの評価一覧
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("recipe_ratings")
      .select("*")
      .eq("recipe_id", id)
      .order("user_name");

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data as RecipeRating[], error: null } satisfies ApiResponse<RecipeRating[]>,
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

/**
 * POST /api/recipes/[id]/ratings
 * 評価登録（UPSERT: 同ユーザーなら上書き）
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: CreateRating = await request.json();

    if (!body.user_name || !body.rating || body.rating < 1 || body.rating > 5) {
      return NextResponse.json(
        { data: null, error: "user_name and rating (1-5) are required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("recipe_ratings")
      .upsert(
        {
          recipe_id: id,
          user_name: body.user_name,
          rating: body.rating,
          comment: body.comment || null,
        },
        { onConflict: "recipe_id,user_name" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // Auto-favorite: 両方の平均が4.5以上なら殿堂入り
    const { data: allRatings } = await supabase
      .from("recipe_ratings")
      .select("rating")
      .eq("recipe_id", id);

    if (allRatings && allRatings.length >= 2) {
      const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
      await supabase
        .from("recipes")
        .update({ is_favorite: avg >= 4.5 })
        .eq("id", id);
    }

    return NextResponse.json(
      { data: data as RecipeRating, error: null } satisfies ApiResponse<RecipeRating>,
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
