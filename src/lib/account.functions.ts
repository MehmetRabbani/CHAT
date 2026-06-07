import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Permanently delete the authenticated user's account.
// Reserves their username+tag so it can never be reused (prevents impersonation),
// then deletes the auth user (cascades to profile/messages via FKs/RLS-safe paths).
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // 1. fetch the profile to reserve username+tag
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("username, tag")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    if (prof) {
      const { error: rErr } = await supabaseAdmin
        .from("reserved_tags")
        .upsert({ username: prof.username, tag: prof.tag }, { onConflict: "username,tag" });
      if (rErr) throw new Error(rErr.message);
    }

    // 2. delete the auth user (cascades to profiles via FK)
    const { error: dErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (dErr) throw new Error(dErr.message);

    return { ok: true };
  });
