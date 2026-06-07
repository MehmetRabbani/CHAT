import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { redeemInvite } from "@/lib/invites.functions";
import { I18nProvider, useT } from "@/i18n";
import { toast } from "sonner";
import {
  Hash, Plus, Settings, LogOut, Compass, Send, MoreVertical, Trash2, Pencil,
  Shield, ShieldOff, Ban, UserMinus, Crown, Copy, Globe, Lock, Mail, Upload, X, Check, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/chat")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: () => (
    <I18nProvider>
      <ChatRoot />
    </I18nProvider>
  ),
});

// ---------- types ----------
type Profile = {
  id: string; username: string; tag: string; avatar_url: string | null;
  locale: string; policy_accepted_at: string | null;
};
type Channel = {
  id: string; name: string; description: string | null; slug: string;
  visibility: "public" | "invite" | "private";
  is_official: boolean; owner_id: string | null; icon_url: string | null;
};
type Member = { channel_id: string; user_id: string; role: "owner" | "mod" | "member" | "banned" };
type Message = {
  id: string; channel_id: string; user_id: string; content: string;
  created_at: string; edited_at: string | null;
};
type Invite = { code: string; channel_id: string; uses: number; max_uses: number | null; expires_at: string | null };

// ---------- helpers ----------
const HUES = [210, 260, 320, 20, 60, 140, 180];
const colorFor = (id: string) => {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `hsl(${HUES[Math.abs(h) % HUES.length]}, 70%, 55%)`;
};
const initials = (n: string) => n.slice(0, 2).toUpperCase();
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 7);

// signed-url cache for private storage buckets
const urlCache = new Map<string, { url: string; exp: number }>();
async function getSignedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const key = `${bucket}/${path}`;
  const now = Date.now();
  const c = urlCache.get(key);
  if (c && c.exp > now) return c.url;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (data?.signedUrl) {
    urlCache.set(key, { url: data.signedUrl, exp: now + 3500_000 });
    return data.signedUrl;
  }
  return null;
}

function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    getSignedUrl(bucket, path).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [bucket, path]);
  return url;
}

// ---------- root ----------
function ChatRoot() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Profile | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [memberships, setMemberships] = useState<Member[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showDiscover, setShowDiscover] = useState(false);

  // initial load
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/auth" }); return; }
      const { data: p } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (p) setMe(p as Profile);

      const { data: m } = await supabase.from("channel_members").select("*").eq("user_id", u.user.id);
      setMemberships((m ?? []) as Member[]);

      const { data: ch } = await supabase
        .from("channels")
        .select("*")
        .order("is_official", { ascending: false })
        .order("name");
      setChannels((ch ?? []) as Channel[]);

      // auto-join official channels
      const myIds = new Set((m ?? []).map(x => x.channel_id));
      const toJoin = (ch ?? []).filter(c => c.is_official && !myIds.has(c.id));
      if (toJoin.length) {
        for (const c of toJoin) {
          await supabase.from("channel_members").insert({ channel_id: c.id, user_id: u.user.id, role: "member" });
        }
        const { data: m2 } = await supabase.from("channel_members").select("*").eq("user_id", u.user.id);
        setMemberships((m2 ?? []) as Member[]);
      }

      const first = (ch ?? []).find(c => c.is_official) ?? (ch ?? [])[0];
      if (first) setActiveId(first.id);
    })();

    // realtime: channel list updates
    const ch = supabase.channel("rt-channels-members")
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, async () => {
        const { data: list } = await supabase.from("channels").select("*").order("is_official", { ascending: false }).order("name");
        setChannels((list ?? []) as Channel[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members" }, async () => {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { data: m } = await supabase.from("channel_members").select("*").eq("user_id", u.user.id);
        setMemberships((m ?? []) as Member[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [navigate]);

  if (!me) return <div className="h-dvh grid place-items-center bg-background text-muted-foreground">Yükleniyor…</div>;

  if (!me.policy_accepted_at) return <PolicyGate me={me} onAccept={(p) => setMe(p)} />;

  const myChannelIds = new Set(memberships.filter(m => m.role !== "banned").map(m => m.channel_id));
  const myChannels = channels.filter(c => myChannelIds.has(c.id));
  const active = channels.find(c => c.id === activeId) ?? null;
  const myRole = active ? memberships.find(m => m.channel_id === active.id)?.role ?? null : null;

  return (
    <div className="h-dvh flex bg-background text-foreground overflow-hidden">
      <ServerRail
        me={me}
        myChannels={myChannels}
        activeId={activeId}
        onSelect={(id) => { setActiveId(id); setShowDiscover(false); }}
        onDiscover={() => setShowDiscover(true)}
        onCreated={(id) => { setActiveId(id); setShowDiscover(false); }}
      />
      {showDiscover ? (
        <Discover
          me={me}
          channels={channels}
          memberships={memberships}
          onClose={() => setShowDiscover(false)}
          onOpen={(id) => { setActiveId(id); setShowDiscover(false); }}
        />
      ) : active ? (
        <ChannelView key={active.id} me={me} channel={active} role={myRole} onLeave={() => {
          const next = myChannels.find(c => c.id !== active.id);
          setActiveId(next?.id ?? null);
        }} onDeleted={() => {
          const next = myChannels.find(c => c.id !== active.id);
          setActiveId(next?.id ?? null);
        }} />
      ) : (
        <div className="flex-1 grid place-items-center text-muted-foreground">Bir kanal seç</div>
      )}
      <UserBar me={me} onUpdated={(p) => setMe(p)} />
    </div>
  );
}

// ---------- policy gate ----------
function PolicyGate({ me, onAccept }: { me: Profile; onAccept: (p: Profile) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="h-dvh grid place-items-center bg-background p-6">
      <div className="max-w-lg w-full rounded-xl border bg-card p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-2">{t("policy.title")}</h2>
        <p className="text-sm text-muted-foreground mb-6">{t("policy.body")}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>{t("policy.decline")}</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            const { data, error } = await supabase
              .from("profiles")
              .update({ policy_accepted_at: new Date().toISOString() })
              .eq("id", me.id).select("*").single();
            setBusy(false);
            if (error) { toast.error(error.message); return; }
            onAccept(data as Profile);
          }}>{t("policy.accept")}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- server rail ----------
function ServerRail({
  me, myChannels, activeId, onSelect, onDiscover, onCreated,
}: {
  me: Profile;
  myChannels: Channel[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDiscover: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useT();
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <aside className="w-[72px] bg-sidebar shrink-0 flex flex-col items-center py-3 gap-2 border-r">
      <RailIcon icon={<Compass className="size-5" />} tip={t("nav.discover")} onClick={onDiscover} />
      <div className="h-px w-8 bg-border my-1" />
      <ScrollArea className="flex-1 w-full">
        <div className="flex flex-col items-center gap-2 px-2">
          {myChannels.map(c => (
            <RailChannel key={c.id} channel={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
          ))}
        </div>
      </ScrollArea>
      <div className="h-px w-8 bg-border my-1" />
      <RailIcon
        icon={<Plus className="size-5" />}
        tip={t("nav.create")}
        onClick={() => setCreateOpen(true)}
      />
      <CreateChannelDialog
        meId={me.id}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onCreated}
      />
    </aside>
  );
}

function RailIcon({ icon, tip, onClick, active }: { icon: React.ReactNode; tip: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={tip}
      onClick={onClick}
      className={`size-12 rounded-2xl grid place-items-center transition-all ${
        active ? "bg-primary text-primary-foreground rounded-xl" : "bg-muted hover:bg-primary hover:text-primary-foreground hover:rounded-xl text-muted-foreground"
      }`}
    >{icon}</button>
  );
}

function RailChannel({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  const icon = useSignedUrl("channel-icons", channel.icon_url);
  return (
    <button
      title={`#${channel.name}`}
      onClick={onClick}
      className={`size-12 rounded-2xl grid place-items-center transition-all overflow-hidden ring-2 ring-transparent ${
        active ? "bg-primary text-primary-foreground rounded-xl ring-primary/40" : "bg-muted hover:rounded-xl hover:bg-primary/20"
      }`}
      style={!icon && !active ? { background: colorFor(channel.id), color: "white" } : undefined}
    >
      {icon ? <img src={icon} alt="" className="size-full object-cover" /> : <span className="font-semibold text-sm">{initials(channel.name)}</span>}
    </button>
  );
}

// ---------- create channel ----------
function CreateChannelDialog({
  meId, open, onOpenChange, onCreated,
}: { meId: string; open: boolean; onOpenChange: (b: boolean) => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [visibility, setVisibility] = useState<"public" | "invite" | "private">("public");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2 || n.length > 32) { toast.error("Kanal adı 2-32 karakter"); return; }
    setBusy(true);
    const { data, error } = await supabase
      .from("channels")
      .insert({ name: n, description: desc.trim() || null, slug: slugify(n), visibility, owner_id: meId })
      .select("*").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onOpenChange(false); setName(""); setDesc(""); setVisibility("public");
    onCreated(data!.id);
    toast.success("Kanal oluşturuldu");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("channel.new")}</DialogTitle>
          <DialogDescription>{t("app.tagline")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("channel.name")}</label>
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={32} required autoFocus />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("channel.description")}</label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} rows={2} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("channel.visibility")}</label>
            <Select value={visibility} onValueChange={(v: "public" | "invite" | "private") => setVisibility(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public"><Globe className="inline size-3 mr-2" />{t("channel.visibility.public")}</SelectItem>
                <SelectItem value="invite"><Mail className="inline size-3 mr-2" />{t("channel.visibility.invite")}</SelectItem>
                <SelectItem value="private"><Lock className="inline size-3 mr-2" />{t("channel.visibility.private")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={busy}>{t("channel.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- discover ----------
function Discover({
  me, channels, memberships, onClose, onOpen,
}: {
  me: Profile; channels: Channel[]; memberships: Member[];
  onClose: () => void; onOpen: (id: string) => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const myIds = new Set(memberships.filter(m => m.role !== "banned").map(m => m.channel_id));
  const visible = useMemo(() => {
    return channels
      .filter(c => c.visibility === "public" || c.is_official)
      .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.description ?? "").toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => Number(b.is_official) - Number(a.is_official) || a.name.localeCompare(b.name));
  }, [channels, q]);

  async function joinPublic(c: Channel) {
    if (myIds.has(c.id)) { onOpen(c.id); return; }
    const { error } = await supabase.from("channel_members").insert({ channel_id: c.id, user_id: me.id, role: "member" });
    if (error) { toast.error(error.message); return; }
    onOpen(c.id);
  }
  async function joinByCode() {
    if (!code.trim()) return;
    try {
      const r = await redeemInvite({ data: { code: code.trim() } });
      toast.success("Katıldın");
      onOpen(r.channel_id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="h-14 border-b flex items-center px-4 gap-2">
        <Compass className="size-5" />
        <h1 className="font-semibold">{t("discover.title")}</h1>
        <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onClose}><X className="size-5" /></button>
      </div>
      <div className="p-4 max-w-3xl w-full mx-auto space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t("discover.search")} className="pl-9" />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder={t("discover.invite_code")} className="max-w-xs" />
          <Button onClick={joinByCode}>{t("discover.join_by_code")}</Button>
        </div>
        <div className="grid gap-2">
          {visible.length === 0 && <p className="text-muted-foreground text-sm">{t("discover.empty")}</p>}
          {visible.map(c => (
            <div key={c.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <div className="size-10 rounded-lg grid place-items-center text-white font-semibold" style={{ background: colorFor(c.id) }}>
                {initials(c.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">#{c.name}</span>
                  {c.is_official && <Badge variant="secondary" className="text-xs">{t("channel.official")}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{c.description || "—"}</p>
              </div>
              <Button size="sm" variant={myIds.has(c.id) ? "secondary" : "default"} onClick={() => joinPublic(c)}>
                {myIds.has(c.id) ? t("channel.joined") : t("channel.join")}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- channel view ----------
function ChannelView({
  me, channel, role, onLeave, onDeleted,
}: {
  me: Profile; channel: Channel; role: Member["role"] | null;
  onLeave: () => void; onDeleted: () => void;
}) {
  const { t } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const isOwner = channel.owner_id === me.id;
  const isMod = role === "owner" || role === "mod";
  const isBanned = role === "banned";

  // load messages + members
  useEffect(() => {
    (async () => {
      const { data: msgs } = await supabase.from("messages").select("*")
        .eq("channel_id", channel.id).order("created_at").limit(200);
      setMessages((msgs ?? []) as Message[]);
      const { data: mem } = await supabase.from("channel_members").select("*").eq("channel_id", channel.id);
      setMembers((mem ?? []) as Member[]);
      // load profiles for everyone involved
      const ids = new Set<string>();
      (msgs ?? []).forEach(m => ids.add(m.user_id));
      (mem ?? []).forEach(m => ids.add(m.user_id));
      if (ids.size) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", Array.from(ids));
        const map: Record<string, Profile> = {};
        (profs ?? []).forEach(p => map[p.id] = p as Profile);
        setProfiles(map);
      }
    })();

    const sub = supabase.channel(`ch-${channel.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, async (p) => {
        const m = p.new as Message;
        setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        if (!profiles[m.user_id]) {
          const { data } = await supabase.from("profiles").select("*").eq("id", m.user_id).maybeSingle();
          if (data) setProfiles(prev => ({ ...prev, [data.id]: data as Profile }));
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, (p) => {
        const m = p.new as Message;
        setMessages(prev => prev.map(x => x.id === m.id ? m : x));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, (p) => {
        const m = p.old as Message;
        setMessages(prev => prev.filter(x => x.id !== m.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members", filter: `channel_id=eq.${channel.id}` }, async () => {
        const { data: mem } = await supabase.from("channel_members").select("*").eq("channel_id", channel.id);
        setMembers((mem ?? []) as Member[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || isBanned) return;
    setText("");
    const { error } = await supabase.from("messages").insert({ channel_id: channel.id, user_id: me.id, content: t.slice(0, 2000) });
    if (error) toast.error(error.message);
  }

  async function saveEdit(id: string) {
    const v = editText.trim();
    if (!v) return;
    const { error } = await supabase.from("messages").update({ content: v.slice(0, 2000), edited_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
  }

  async function deleteMsg(id: string) {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  async function leave() {
    if (isOwner) { toast.error("Sahip kanaldan ayrılamaz, kanalı silmelisin"); return; }
    const { error } = await supabase.from("channel_members").delete()
      .eq("channel_id", channel.id).eq("user_id", me.id);
    if (error) { toast.error(error.message); return; }
    onLeave();
  }

  // group messages by author within 5 min
  const groups = useMemo(() => {
    const out: { author: string; items: Message[] }[] = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      const lastTime = last ? new Date(last.items[last.items.length - 1].created_at).getTime() : 0;
      if (last && last.author === m.user_id && new Date(m.created_at).getTime() - lastTime < 5 * 60_000) {
        last.items.push(m);
      } else {
        out.push({ author: m.user_id, items: [m] });
      }
    }
    return out;
  }, [messages]);

  const icon = useSignedUrl("channel-icons", channel.icon_url);

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b flex items-center px-4 gap-3 shrink-0">
          {icon ? <img src={icon} className="size-7 rounded-md object-cover" alt="" /> : <Hash className="size-5 text-muted-foreground" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold truncate">{channel.name}</h1>
              {channel.is_official && <Badge variant="secondary" className="text-xs">{t("channel.official")}</Badge>}
              {channel.visibility === "invite" && <Mail className="size-3 text-muted-foreground" />}
              {channel.visibility === "private" && <Lock className="size-3 text-muted-foreground" />}
            </div>
            {channel.description && <p className="text-xs text-muted-foreground truncate">{channel.description}</p>}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {isOwner && <ChannelSettingsDialog channel={channel} onDeleted={onDeleted} />}
            {!isOwner && role && <Button size="sm" variant="ghost" onClick={leave}>{t("channel.leave")}</Button>}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {messages.length === 0 && <p className="text-muted-foreground text-sm text-center py-12">{t("messages.empty")}</p>}
            {groups.map((g, i) => {
              const p = profiles[g.author];
              return (
                <div key={i} className="flex gap-3 group/g">
                  <UserAvatar profile={p} fallbackId={g.author} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold" style={{ color: colorFor(g.author) }}>{p?.username ?? "?"}</span>
                      <span className="text-xs text-muted-foreground">#{p?.tag ?? "------"}</span>
                      <span className="text-xs text-muted-foreground">{new Date(g.items[0].created_at).toLocaleString()}</span>
                    </div>
                    {g.items.map(m => (
                      <div key={m.id} className="group/m flex items-start gap-2 -ml-1 px-1 rounded hover:bg-muted/40">
                        <div className="flex-1 min-w-0 break-words">
                          {editingId === m.id ? (
                            <div className="flex gap-2 py-1">
                              <Input value={editText} onChange={e => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); saveEdit(m.id); }
                                  if (e.key === "Escape") setEditingId(null);
                                }} autoFocus />
                              <Button size="sm" onClick={() => saveEdit(m.id)}><Check className="size-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="size-4" /></Button>
                            </div>
                          ) : (
                            <span className="whitespace-pre-wrap">
                              {m.content}
                              {m.edited_at && <span className="text-xs text-muted-foreground ml-1">{t("messages.edited")}</span>}
                            </span>
                          )}
                        </div>
                        {(m.user_id === me.id || isMod) && editingId !== m.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="opacity-0 group-hover/m:opacity-100 text-muted-foreground hover:text-foreground">
                                <MoreVertical className="size-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {m.user_id === me.id && (
                                <DropdownMenuItem onClick={() => { setEditingId(m.id); setEditText(m.content); }}>
                                  <Pencil className="size-4 mr-2" />{t("messages.edit")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMsg(m.id)}>
                                <Trash2 className="size-4 mr-2" />{t("messages.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <form onSubmit={send} className="p-3 border-t shrink-0">
          {isBanned ? (
            <div className="text-sm text-destructive p-2 text-center">{t("messages.banned")}</div>
          ) : (
            <div className="flex gap-2">
              <Input value={text} onChange={e => setText(e.target.value)}
                placeholder={`#${channel.name} — ${t("messages.placeholder")}`} maxLength={2000} />
              <Button type="submit" disabled={!text.trim()}><Send className="size-4" /></Button>
            </div>
          )}
        </form>
      </div>
      <MemberList channel={channel} members={members} profiles={profiles} myRole={role} meId={me.id} />
    </div>
  );
}

function UserAvatar({ profile, fallbackId }: { profile: Profile | undefined; fallbackId: string }) {
  const path = profile?.avatar_url ?? null;
  // avatars stored as path or full URL (legacy google)
  const isFull = path?.startsWith("http");
  const signed = useSignedUrl("avatars", isFull ? null : path);
  const src = isFull ? path : signed;
  return (
    <Avatar className="size-9 shrink-0">
      {src && <AvatarImage src={src} />}
      <AvatarFallback style={{ background: colorFor(profile?.id ?? fallbackId), color: "white" }}>
        {initials(profile?.username ?? "?")}
      </AvatarFallback>
    </Avatar>
  );
}

// ---------- member list ----------
function MemberList({
  channel, members, profiles, myRole, meId,
}: {
  channel: Channel; members: Member[]; profiles: Record<string, Profile>;
  myRole: Member["role"] | null; meId: string;
}) {
  const { t } = useT();
  const isOwner = channel.owner_id === meId;
  const canMod = myRole === "owner" || myRole === "mod";

  const sorted = [...members].sort((a, b) => {
    const order = { owner: 0, mod: 1, member: 2, banned: 3 } as const;
    return order[a.role] - order[b.role];
  });

  async function setRole(uid: string, role: Member["role"]) {
    const { error } = await supabase.from("channel_members").update({ role })
      .eq("channel_id", channel.id).eq("user_id", uid);
    if (error) toast.error(error.message);
  }
  async function kick(uid: string) {
    const { error } = await supabase.from("channel_members").delete()
      .eq("channel_id", channel.id).eq("user_id", uid);
    if (error) toast.error(error.message);
  }

  return (
    <aside className="w-60 border-l hidden md:flex flex-col shrink-0">
      <div className="h-14 border-b flex items-center px-3 text-xs uppercase tracking-wider text-muted-foreground">
        Üyeler — {sorted.length}
      </div>
      <ScrollArea className="flex-1">
        <ul className="py-1">
          {sorted.map(m => {
            const p = profiles[m.user_id];
            return (
              <li key={m.user_id} className="px-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left">
                      <UserAvatar profile={p} fallbackId={m.user_id} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 truncate">
                          <span className="text-sm font-medium truncate" style={{ color: colorFor(m.user_id) }}>{p?.username ?? "…"}</span>
                          {m.role === "owner" && <Crown className="size-3 text-yellow-500" />}
                          {m.role === "mod" && <Shield className="size-3 text-blue-500" />}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          #{p?.tag ?? "------"} {m.role === "banned" && `· ${t("member.banned")}`}
                        </div>
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  {canMod && m.user_id !== meId && m.role !== "owner" && (
                    <DropdownMenuContent align="end">
                      {isOwner && m.role === "member" && (
                        <DropdownMenuItem onClick={() => setRole(m.user_id, "mod")}>
                          <Shield className="size-4 mr-2" />{t("member.make_mod")}
                        </DropdownMenuItem>
                      )}
                      {isOwner && m.role === "mod" && (
                        <DropdownMenuItem onClick={() => setRole(m.user_id, "member")}>
                          <ShieldOff className="size-4 mr-2" />{t("member.remove_mod")}
                        </DropdownMenuItem>
                      )}
                      {m.role !== "banned" && (
                        <DropdownMenuItem onClick={() => setRole(m.user_id, "banned")}>
                          <Ban className="size-4 mr-2" />{t("member.ban")}
                        </DropdownMenuItem>
                      )}
                      {m.role === "banned" && isOwner && (
                        <DropdownMenuItem onClick={() => setRole(m.user_id, "member")}>
                          <Check className="size-4 mr-2" />{t("member.unban")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => kick(m.user_id)}>
                        <UserMinus className="size-4 mr-2" />{t("member.kick")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  )}
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </aside>
  );
}

// ---------- channel settings dialog (owner) ----------
function ChannelSettingsDialog({ channel, onDeleted }: { channel: Channel; onDeleted: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(channel.name);
  const [desc, setDesc] = useState(channel.description ?? "");
  const [visibility, setVisibility] = useState(channel.visibility);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [iconUploading, setIconUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("channel_invites").select("*").eq("channel_id", channel.id)
      .then(({ data }) => setInvites((data ?? []) as Invite[]));
  }, [open, channel.id]);

  async function save() {
    const { error } = await supabase.from("channels").update({
      name: name.trim().slice(0, 32),
      description: desc.trim().slice(0, 200) || null,
      visibility,
    }).eq("id", channel.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kaydedildi");
  }

  async function uploadIcon(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setIconUploading(true);
    const ext = f.name.split(".").pop() || "png";
    const path = `${channel.id}/icon-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("channel-icons").upload(path, f, { upsert: true, contentType: f.type });
    if (upErr) { setIconUploading(false); toast.error(upErr.message); return; }
    const { error } = await supabase.from("channels").update({ icon_url: path }).eq("id", channel.id);
    setIconUploading(false);
    if (error) toast.error(error.message);
    else toast.success("İkon güncellendi");
  }

  async function createInvite() {
    const code = Math.random().toString(36).slice(2, 10);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("channel_invites").insert({
      code, channel_id: channel.id, created_by: u.user!.id,
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    }).select("*").single();
    if (error) { toast.error(error.message); return; }
    setInvites(prev => [data as Invite, ...prev]);
    const url = `${window.location.origin}/invite/${code}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success(t("channel.invite_copied"));
  }

  async function deleteInvite(code: string) {
    await supabase.from("channel_invites").delete().eq("code", code);
    setInvites(prev => prev.filter(i => i.code !== code));
  }

  async function deleteChannel() {
    const { error } = await supabase.from("channels").delete().eq("id", channel.id);
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    onDeleted();
    toast.success("Kanal silindi");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title={t("channel.settings")}><Settings className="size-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("channel.settings")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("channel.name")}</label>
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={32} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("channel.description")}</label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} rows={2} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("channel.visibility")}</label>
            <Select value={visibility} onValueChange={(v: "public" | "invite" | "private") => setVisibility(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t("channel.visibility.public")}</SelectItem>
                <SelectItem value="invite">{t("channel.visibility.invite")}</SelectItem>
                <SelectItem value="private">{t("channel.visibility.private")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">İkon</label>
            <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted">
              <Upload className="size-4" /> {iconUploading ? t("common.loading") : "Yükle"}
              <input type="file" accept="image/*" className="hidden" onChange={uploadIcon} />
            </label>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Davetler</h3>
              <Button size="sm" onClick={createInvite}>{t("channel.invite_create")}</Button>
            </div>
            <ul className="space-y-1 max-h-32 overflow-auto">
              {invites.map(i => (
                <li key={i.code} className="flex items-center gap-2 text-xs">
                  <code className="bg-muted px-2 py-1 rounded">{i.code}</code>
                  <span className="text-muted-foreground">{i.uses} kullanım</span>
                  <button className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${i.code}`)}>
                    <Copy className="size-3" />
                  </button>
                  <button className="text-destructive" onClick={() => deleteInvite(i.code)}><X className="size-3" /></button>
                </li>
              ))}
              {invites.length === 0 && <li className="text-xs text-muted-foreground">Henüz davet yok.</li>}
            </ul>
          </div>

          <ChannelTagsManager channelId={channel.id} />
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm"><Trash2 className="size-4 mr-1" />{t("channel.delete")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Kanalı silmek istiyor musun?</AlertDialogTitle>
                <AlertDialogDescription>Bu işlem geri alınamaz. Tüm mesajlar silinir.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={deleteChannel}>{t("common.delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={save}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelTagsManager({ channelId }: { channelId: string }) {
  const { t } = useT();
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7c3aed");
  useEffect(() => {
    supabase.from("channel_tags").select("*").eq("channel_id", channelId)
      .then(({ data }) => setTags((data ?? []) as typeof tags));
  }, [channelId]);
  async function add() {
    if (!name.trim()) return;
    const { data, error } = await supabase.from("channel_tags")
      .insert({ channel_id: channelId, name: name.trim().slice(0, 24), color })
      .select("*").single();
    if (error) { toast.error(error.message); return; }
    setTags(prev => [...prev, data as any]); setName("");
  }
  async function remove(id: string) {
    await supabase.from("channel_tags").delete().eq("id", id);
    setTags(prev => prev.filter(t => t.id !== id));
  }
  return (
    <div className="border-t pt-3">
      <h3 className="text-sm font-semibold mb-2">{t("channel.tags")}</h3>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map(tag => (
          <span key={tag.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: tag.color + "33", color: tag.color }}>
            {tag.name}
            <button onClick={() => remove(tag.id)}><X className="size-3" /></button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">Etiket yok.</span>}
      </div>
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("channel.tag_name")} maxLength={24} />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-9 rounded border cursor-pointer" />
        <Button size="sm" onClick={add}>{t("channel.tag_add")}</Button>
      </div>
    </div>
  );
}

// ---------- bottom user bar ----------
function UserBar({ me, onUpdated }: { me: Profile; onUpdated: (p: Profile) => void }) {
  const { t, lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const path = me.avatar_url;
  const isFull = path?.startsWith("http");
  const signed = useSignedUrl("avatars", isFull ? null : path);
  const src = isFull ? path : signed;

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="fixed left-2 bottom-2 z-40 flex items-center gap-2 bg-card border rounded-xl px-2 py-1 shadow-lg w-[64px] md:w-auto">
      <Avatar className="size-8">
        {src && <AvatarImage src={src} />}
        <AvatarFallback style={{ background: colorFor(me.id), color: "white" }}>{initials(me.username)}</AvatarFallback>
      </Avatar>
      <div className="hidden md:block min-w-0 max-w-[160px]">
        <div className="text-sm font-semibold truncate">{me.username}</div>
        <div className="text-xs text-muted-foreground">#{me.tag}</div>
      </div>
      <div className="flex items-center">
        <Button size="icon" variant="ghost" onClick={() => setOpen(true)} title={t("nav.settings")}><Settings className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={logout} title={t("nav.logout")}><LogOut className="size-4" /></Button>
      </div>
      <SettingsDialog open={open} onOpenChange={setOpen} me={me} onUpdated={onUpdated} lang={lang} setLang={setLang} />
    </div>
  );
}

function SettingsDialog({
  open, onOpenChange, me, onUpdated, lang, setLang,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  me: Profile; onUpdated: (p: Profile) => void;
  lang: string; setLang: (l: string) => void;
}) {
  const { t } = useT();
  const [username, setUsername] = useState(me.username);
  const [busy, setBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const path = me.avatar_url;
  const isFull = path?.startsWith("http");
  const signed = useSignedUrl("avatars", isFull ? null : path);
  const src = isFull ? path : signed;
  const navigate = useNavigate();

  async function save() {
    setBusy(true);
    const { data, error } = await supabase.from("profiles")
      .update({ username: username.trim().slice(0, 24), locale: lang })
      .eq("id", me.id).select("*").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onUpdated(data as Profile);
    toast.success(t("settings.save"));
  }

  async function uploadAvatar(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 4_000_000) { toast.error("Maks 4MB"); return; }
    setBusy(true);
    const ext = (f.name.split(".").pop() || "png").toLowerCase();
    const path = `${me.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, f, { upsert: true, contentType: f.type });
    if (upErr) { setBusy(false); toast.error(upErr.message); return; }
    const { data, error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", me.id).select("*").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onUpdated(data as Profile);
  }

  async function deleteAccount() {
    if (!deletePassword) { toast.error("Şifre gerekli"); return; }
    setBusy(true);
    // verify password
    const { error: vErr } = await supabase.auth.signInWithPassword({
      email: (await supabase.auth.getUser()).data.user?.email || "", password: deletePassword,
    });
    if (vErr) { setBusy(false); toast.error("Şifre yanlış"); return; }
    try {
      await deleteMyAccount();
      await supabase.auth.signOut();
      toast.success("Hesabın silindi");
      navigate({ to: "/auth" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("nav.settings")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-16">
              {src && <AvatarImage src={src} />}
              <AvatarFallback style={{ background: colorFor(me.id), color: "white" }}>{initials(me.username)}</AvatarFallback>
            </Avatar>
            <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted text-sm">
              <Upload className="size-4" />{t("settings.avatar_upload")}
              <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
            </label>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">{t("settings.username")}</label>
            <Input value={username} onChange={e => setUsername(e.target.value)} maxLength={24} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("settings.tag")}</label>
            <Input value={`#${me.tag}`} disabled />
            <p className="text-xs text-muted-foreground mt-1">Etiket değişmez; başkalarının seni taklit etmesini önler.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("settings.language")}</label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tr">Türkçe</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-3">
            <h3 className="text-sm font-semibold text-destructive mb-1">{t("settings.danger")}</h3>
            <p className="text-xs text-muted-foreground mb-2">{t("settings.delete_confirm")}</p>
            <div className="flex gap-2">
              <Input type="password" placeholder={t("auth.password")} value={deletePassword} onChange={e => setDeletePassword(e.target.value)} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={busy || !deletePassword}>{t("settings.delete_button")}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Emin misin?</AlertDialogTitle>
                    <AlertDialogDescription>Hesabın ve mesajların kalıcı olarak silinecek. Kullanıcı adı + etiket kombinasyonun bir daha kullanılamayacak.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteAccount}>{t("common.delete")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            <Link to="/terms" className="hover:underline">Şartlar</Link> · <Link to="/privacy" className="hover:underline">Gizlilik</Link>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={busy} onClick={save}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
