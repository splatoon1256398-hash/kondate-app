import { NextResponse } from "next/server";
import type { ApiFailure, ApiResponse, ApiSuccess } from "@/types/common";

function normalizeInit(defaultStatus: number, init?: number | ResponseInit): ResponseInit {
  if (typeof init === "number") {
    return { status: init };
  }

  return {
    status: init?.status ?? defaultStatus,
    headers: init?.headers,
    statusText: init?.statusText,
  };
}

export function apiSuccess<T>(
  data: T,
  init?: number | ResponseInit
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    { data, error: null } satisfies ApiResponse<T>,
    normalizeInit(200, init)
  );
}

export function apiError(
  message: string,
  init?: number | ResponseInit
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { data: null, error: message } satisfies ApiFailure,
    normalizeInit(500, init)
  );
}
