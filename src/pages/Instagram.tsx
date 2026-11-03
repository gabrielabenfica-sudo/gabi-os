import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownRight, ArrowUpRight, Instagram as InstagramIcon, Plus, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSocialProfiles, useSocialSnapshots } from "@/lib/queries";
import { useCreateSocialProfile } from "@/lib/mutations";
import { useWorkspace } from "@/lib/workspace";
import { formatNumber, todayISO } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/common/page-parts";
import type { SocialProfile, SocialSnapshot } from "@/lib/types";

const trimZeros = (value: string) => value.replace(/,0+$/, "");

const compact = (value: number) => {
  if (!value) return "0";
  if (value >= 1_000_000) return `${trimZeros((value / 1_000_000).toFixed(2).replace(".", ","))}M`;
  if (value >= 1_000) return `${trimZeros((value / 1_000).toFixed(1).replace(".", ","))}k`;
  return String(Math.round(value));
};

function GrowthChart({
  data,
  dataKey,
  color,
  label,
}: {
  data: Array<{ label: string; followers: number | null; reach: number | null }>;
  dataKey: "followers" | "reach";
  color: string;
  label: string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-[132px] items-center justify-center rounded-lg border border-dashed border-border/70 text-center">
        <p className="px-4 text-[11px] leading-snug text-muted-foreground">
          Registre {label.toLowerCase()} em pelo menos dois dias para ver a curva.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[132px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={["auto", "auto"]}
            tickCount={4}
            allowDecimals={false}
          />
          <ChartTooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
              background: "hsl(var(--card))",
            }}
            formatter={(value: number) => [formatNumber(value), label]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProfileCard({
  profile,
  snapshots,
  onRegister,
}: {
  profile: SocialProfile;
  snapshots: SocialSnapshot[];
  onRegister: (profileId: string) => void;
}) {
  const history = snapshots
    .filter((snapshot) => snapshot.profile_id === profile.id)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  const delta = (key: "followers" | "reach") => {
    const current = latest?.[key];
    const before = previous?.[key];
    if (current == null || before == null) return null;
    return current - before;
  };

  const chartData = history.map((snapshot) => ({
    label: format(parseISO(snapshot.snapshot_date), "dd/MM"),
    followers: snapshot.followers,
    reach: snapshot.reach,
  }));

  const followerDelta = delta("followers");
  const reachDelta = delta("reach");

  return (
    <Card className="border-border/70 shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
            {profile.username?.slice(0, 2).toUpperCase() ?? "IG"}
          </span>
          <div>
            <CardTitle className="font-display text-lg">{profile.name}</CardTitle>
            <p className="text-xs text-muted-foreground">@{profile.username}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {history.length} {history.length === 1 ? "registro" : "registros"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-secondary/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Seguidores</p>
            <p className="font-display text-xl text-foreground">{formatNumber(latest?.followers)}</p>
            {followerDelta !== null ? (
              <span
                className={
                  followerDelta >= 0
                    ? "flex items-center gap-0.5 text-[10px] text-primary"
                    : "flex items-center gap-0.5 text-[10px] text-destructive"
                }
              >
                {followerDelta >= 0 ? <ArrowUpRight className="size-2.5" /> : <ArrowDownRight className="size-2.5" />}
                {followerDelta > 0 ? "+" : ""}
                {formatNumber(followerDelta)} no último registro
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">sem comparação ainda</span>
            )}
          </div>
          <div className="rounded-xl bg-secondary/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Alcance</p>
            <p className="font-display text-xl text-foreground">{formatNumber(latest?.reach)}</p>
            {reachDelta !== null ? (
              <span
                className={
                  reachDelta >= 0
                    ? "flex items-center gap-0.5 text-[10px] text-primary"
                    : "flex items-center gap-0.5 text-[10px] text-destructive"
                }
              >
                {reachDelta >= 0 ? <ArrowUpRight className="size-2.5" /> : <ArrowDownRight className="size-2.5" />}
                {reachDelta > 0 ? "+" : ""}
                {formatNumber(reachDelta)}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">sem comparação ainda</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <TrendingUp className="size-3" /> Crescimento de seguidores
          </p>
          <GrowthChart data={chartData} dataKey="followers" color="hsl(var(--primary))" label="Seguidores" />
        </div>

        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <TrendingUp className="size-3" /> Crescimento de alcance
          </p>
          <GrowthChart data={chartData} dataKey="reach" color="hsl(300 9% 35%)" label="Alcance" />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-[11px] text-muted-foreground">
            {latest
              ? `último registro em ${format(parseISO(latest.snapshot_date), "dd 'de' MMM", { locale: ptBR })}`
              : "nenhum registro ainda"}
          </p>
          <Button size="sm" variant="outline" onClick={() => onRegister(profile.id)}>
            <Plus className="size-3.5" /> Registrar números
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Instagram() {
  const { activeId } = useWorkspace();
  const { data: profiles = [] } = useSocialProfiles();
  const { data: snapshots = [] } = useSocialSnapshots();
  const createProfile = useCreateSocialProfile();
  const queryClient = useQueryClient();

  const [numbersOpen, setNumbersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [entry, setEntry] = useState({ profile: "", date: todayISO(), followers: "", reach: "" });
  const [newProfile, setNewProfile] = useState({ name: "", username: "" });

  const orderedProfiles = useMemo(
    () => profiles.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [profiles],
  );

  const openNumbers = (profileId: string) => {
    setEntry({ profile: profileId, date: todayISO(), followers: "", reach: "" });
    setNumbersOpen(true);
  };

  const saveNumbers = async () => {
    if (!entry.profile || !entry.date) return;
    const { error } = await supabase.from("social_snapshots").upsert(
      {
        id: `${entry.profile}_${entry.date}`,
        profile_id: entry.profile,
        snapshot_date: entry.date,
        followers: entry.followers ? Number(entry.followers) : null,
        reach: entry.reach ? Number(entry.reach) : null,
        source: "MANUAL",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      toast.error("Não foi possível salvar os números.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["social-snapshots"] });
    toast.success("Números registrados.");
    setNumbersOpen(false);
  };

  const saveProfile = () => {
    if (!newProfile.name.trim() || !newProfile.username.trim()) return;
    createProfile.mutate(
      {
        name: newProfile.name.trim(),
        username: newProfile.username.trim().replace(/^@/, ""),
        platform: "instagram",
        workspace_id: activeId,
        archived: false,
      },
      {
        onSuccess: () => {
          toast.success("Perfil adicionado.");
          setNewProfile({ name: "", username: "" });
          setProfileOpen(false);
        },
        onError: () => toast.error("Não foi possível adicionar o perfil."),
      },
    );
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Instagram"
        title="Crescimento perfil por perfil"
        description="Você registra os números e o app desenha a curva de seguidores e alcance de cada conta — separadamente, com escala."
        actions={
          <>
            <Button variant="outline" onClick={() => setProfileOpen(true)}>
              <Plus className="size-4" /> Adicionar perfil
            </Button>
            <Button
              onClick={() => openNumbers(profiles[0]?.id ?? "")}
              disabled={!profiles.length}
            >
              <TrendingUp className="size-4" /> Registrar números
            </Button>
          </>
        }
      />

      {orderedProfiles.length === 0 ? (
        <EmptyState
          icon={<InstagramIcon className="size-5" />}
          title="Nenhum perfil ainda"
          description="Adicione o primeiro perfil para começar a acompanhar seguidores e alcance."
          action={
            <Button size="sm" onClick={() => setProfileOpen(true)}>
              Adicionar perfil
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {orderedProfiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              snapshots={snapshots}
              onRegister={openNumbers}
            />
          ))}
        </div>
      )}

      <Dialog open={numbersOpen} onOpenChange={setNumbersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar números</DialogTitle>
            <DialogDescription>
              Um registro por dia e por perfil. Se já existir registro na data, ele é atualizado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select value={entry.profile} onValueChange={(value) => setEntry({ ...entry, profile: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher perfil" />
                </SelectTrigger>
                <SelectContent>
                  {orderedProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      @{profile.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ig-date">Data</Label>
              <Input
                id="ig-date"
                type="date"
                value={entry.date}
                onChange={(event) => setEntry({ ...entry, date: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ig-followers">Seguidores</Label>
                <Input
                  id="ig-followers"
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={entry.followers}
                  onChange={(event) => setEntry({ ...entry, followers: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-reach">Alcance</Label>
                <Input
                  id="ig-reach"
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={entry.reach}
                  onChange={(event) => setEntry({ ...entry, reach: event.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => void saveNumbers()} disabled={!entry.profile}>
              Salvar registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar perfil</DialogTitle>
            <DialogDescription>
              Cada perfil tem seus próprios gráficos — nada é somado entre contas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                value={newProfile.name}
                onChange={(event) => setNewProfile({ ...newProfile, name: event.target.value })}
                placeholder="Ex.: Turbo Digital"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-username">@ do perfil</Label>
              <Input
                id="profile-username"
                value={newProfile.username}
                onChange={(event) => setNewProfile({ ...newProfile, username: event.target.value })}
                placeholder="turbodigitaloficial"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={saveProfile} disabled={createProfile.isPending}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
