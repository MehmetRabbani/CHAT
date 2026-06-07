import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RedeemSchema = z.object({ code: z.string().min(4).max(64).regex(/^[A-Za-z0-9_-]+$/) });

// Redeem an invite code: adds the caller as a member of the linked channel.
// Uses the admin client to bypass the policy that restricts member insert to
// public channels / mods. The invite code itself is the authorization.
export const redeemInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => RedeemSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: invite, error: iErr } = await supabaseAdmin
      .from("channel_invites")
      .select("*")
      .eq("code", data.code)
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!invite) throw new Error("Davet bulunamadı");
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error("Davet süresi doldu");
    if (invite.max_uses && invite.uses >= invite.max_uses) throw new Error("Davet kullanım hakkı doldu");

    // Check ban
    const { data: existing } = await supabaseAdmin
      .from("channel_members")
      .select("role")
      .eq("channel_id", invite.channel_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.role === "banned") throw new Error("Bu kanaldan yasaklısın");

    if (!existing) {
      const { error: mErr } = await supabaseAdmin
        .from("channel_members")
        .insert({ channel_id: invite.channel_id, user_id: userId, role: "member" });
      if (mErr) throw new Error(mErr.message);
    }

    await supabaseAdmin
      .from("channel_invites")
      .update({ uses: invite.uses + 1 })
      .eq("code", data.code);

    return { ok: true, channel_id: invite.channel_id };
  });
