import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { PantryItem, CreatePantryItem } from "@/types/pantry";

/**
 * GET /api/pantry
 * 在庫一覧
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("pantry_items")
      .select("*")
      .order("category")
      .order("name");

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data as PantryItem[], error: null } satisfies ApiResponse<PantryItem[]>,
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
 * POST /api/pantry
 * 手動追加
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: CreatePantryItem = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { data: null, error: "name is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("pantry_items")
      .insert({
        name: body.name.trim(),
        amount: body.amount ?? null,
        unit: body.unit ?? null,
        category: body.category ?? "other",
        expiry_date: body.expiry_date ?? null,
        source: "manual",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data as PantryItem, error: null } satisfies ApiResponse<PantryItem>,
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: message } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
