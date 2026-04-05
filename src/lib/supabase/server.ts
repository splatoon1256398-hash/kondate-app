import { createClient } from "@supabase/supabase-js";

/**
 * サーバー側 admin クライアント（service_role key）
 * - RLSをバイパスして全テーブルにアクセス可能
 * - API Routes 専用。フロントエンドでは絶対に使わない。
 */
export function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase Dashboard > Settings > API > service_role)"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // service_role key を直接使用し、GoTrueClient の getSession() をバイパス
    // Next.js 16 の fetch パッチとの ByteString 競合を回避
    accessToken: async () => serviceRoleKey,
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: "no-store" as RequestCache }),
    },
  });
}
