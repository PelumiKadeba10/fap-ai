import { createServerClient, type CookieOptions } from "@supabase/ssr";import { cookies } from "next/headers";

/** Supabase client for server components, server actions and route handlers (acts as the signed-in coordinator). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component: cookies are read-only there. The middleware refreshes the session.
        }
      },
    },
  });
}

/** Returns the signed-in user or null. */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
