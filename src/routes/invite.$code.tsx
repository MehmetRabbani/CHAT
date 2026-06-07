import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { redeemInvite } from "@/lib/invites.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$code")({
  ssr: false,
  component: InvitePage,
});

function InvitePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        sessionStorage.setItem("chatly.pendingInvite", code);
        navigate({ to: "/auth" });
        return;
      }
      try {
        await redeemInvite({ data: { code } });
        toast.success("Kanala katıldın");
      } catch (e) {
        toast.error((e as Error).message);
      }
      navigate({ to: "/chat" });
    })();
  }, [code, navigate]);
  return <div className="h-dvh grid place-items-center text-muted-foreground">Davet işleniyor…</div>;
}
