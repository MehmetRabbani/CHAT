import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Şartlar — Chatly" }] }),
  component: Terms,
});

function Terms() {
  return (
    <div className="min-h-dvh bg-background text-foreground p-6 max-w-2xl mx-auto">
      <Link to="/chat" className="text-sm text-primary hover:underline">← Geri</Link>
      <h1 className="text-2xl font-bold mt-4 mb-4">Kullanım Şartları & Uyarı</h1>
      <div className="prose prose-invert text-sm space-y-3 text-muted-foreground">
        <p>Chatly deneysel bir sohbet platformudur. Kullanmaya başlayarak aşağıdaki koşulları kabul edersin.</p>
        <h2 className="text-foreground font-semibold">1. Sorumluluk reddi</h2>
        <p>Platformda paylaşılan içerikler tamamen kullanıcıların sorumluluğundadır. Sağlayıcı, kullanıcılar tarafından üretilen içerik nedeniyle oluşabilecek hiçbir zarardan sorumlu tutulamaz.</p>
        <h2 className="text-foreground font-semibold">2. İçerik uyarısı</h2>
        <p>Açık kanallar tamamen moderasyonsuz olabilir. Anarşik, uygunsuz veya rahatsız edici içerikle karşılaşabilirsin. 18 yaşından küçükse veya bunlara hoşgörün yoksa platformu kullanma.</p>
        <h2 className="text-foreground font-semibold">3. Hesap güvenliği</h2>
        <p>Şifreni güvenli tut. Etiketin (#000000) asla değiştirilemez ve hesabın silinse bile başka bir kullanıcıya verilmez. Bu, başkalarının seni taklit etmesini önler.</p>
        <h2 className="text-foreground font-semibold">4. Veri silme</h2>
        <p>Ayarlardan hesabını istediğin zaman silebilirsin. Silme işlemi geri alınamaz.</p>
        <h2 className="text-foreground font-semibold">5. Deneysel kapsam</h2>
        <p>Bu yazılım test aşamasındadır; özellikler değişebilir, veri kaybı yaşanabilir. Yedek tutman tavsiye edilir.</p>
      </div>
    </div>
  );
}
