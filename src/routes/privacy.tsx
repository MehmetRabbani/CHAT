import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Gizlilik — Chatly" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="min-h-dvh bg-background text-foreground p-6 max-w-2xl mx-auto">
      <Link to="/chat" className="text-sm text-primary hover:underline">← Geri</Link>
      <h1 className="text-2xl font-bold mt-4 mb-4">Gizlilik Politikası</h1>
      <div className="text-sm space-y-3 text-muted-foreground">
        <p>Yalnızca aşağıdaki verileri saklarız: e-posta adresi, kullanıcı adı, etiket, profil fotoğrafı (yüklediysen), mesajların ve kanal üyelikler.</p>
        <p>Mesajlar üye olduğun kanallarda diğer üyelerin görebileceği şekilde saklanır. RLS (satır seviyesi güvenlik) kuralları, yetkin olmayan verilere erişimini engeller.</p>
        <p>Hesabını sildiğinde, kullanıcı adı + etiket kombinasyonun başkasının seni taklit etmesini önlemek için rezerve listesinde tutulur; diğer tüm kişisel veriler silinir.</p>
        <p>Üçüncü taraflarla veri paylaşımı yapmıyoruz. Veri sızıntısı durumunda kullanıcıları bilgilendireceğiz.</p>
      </div>
    </div>
  );
}
