import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { MOCK_SUPABASE } from "@/lib/mock/config";
import { createMockClient } from "@/lib/mock/db";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function createSupabaseClient(cookieStore: CookieStore) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component から呼ばれた場合は無視（proxy でセッションを更新する）
        }
      },
    },
  });
}

export async function createClient() {
  const cookieStore = await cookies();
  // Supabase のキーがない場合はデモ用の簡易DBで動かす
  if (MOCK_SUPABASE) return createMockClient(cookieStore) as unknown as ReturnType<typeof createSupabaseClient>;
  return createSupabaseClient(cookieStore);
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
