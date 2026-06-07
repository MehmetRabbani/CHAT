import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Giriş Yap — Chatly" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/chat`,
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Hesap oluşturuldu! E-postanı kontrol et.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/chat" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/chat`,
    });
    if (res.error) toast.error("Google ile giriş başarısız");
    else if (!res.redirected) navigate({ to: "/chat" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-server-rail to-background">
      <Card className="w-full max-w-md p-8 bg-card border-border">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-brand flex items-center justify-center mb-3 shadow-lg shadow-brand/30">
            <MessageCircle className="w-7 h-7 text-brand-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Chatly'e Hoş Geldin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Devam etmek için giriş yap" : "Yeni bir hesap oluştur"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <Label htmlFor="username">Kullanıcı adı</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ornek_kullanici" className="mt-1" />
            </div>
          )}
          <div>
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="password">Şifre</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-brand text-brand-foreground hover:bg-brand/90">
            {loading ? "..." : mode === "login" ? "Giriş Yap" : "Kayıt Ol"}
          </Button>
        </form>

        <div className="flex items-center gap-2 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">veya</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Google ile devam et
        </Button>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {mode === "login" ? "Hesabın yok mu? " : "Zaten hesabın var mı? "}
          <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-brand hover:underline font-medium">
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
      </Card>
    </div>
  );
}
