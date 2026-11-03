import { useEffect, useState } from "react";
import { Bell, KeyRound, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNotificationPrefs, useProfile } from "@/lib/queries";
import { PageHeader } from "@/components/common/page-parts";

const WEEK_DAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Recife", "America/Belem"];

export default function Ajustes() {
  const { user, signOut, changePassword } = useAuth();
  const { data: profile } = useProfile();
  const { data: prefs } = useNotificationPrefs();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [password, setPassword] = useState("");
  const [prefsState, setPrefsState] = useState({
    daily_enabled: true,
    daily_time: "07:00",
    weekly_enabled: true,
    weekly_day: 0,
    monthly_enabled: true,
    monthly_day: 1,
    in_app_enabled: true,
    email_enabled: false,
    bill_due_days_before: 3,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setTimezone(profile.timezone ?? "America/Sao_Paulo");
    }
  }, [profile?.id, profile?.name, profile?.timezone]);

  useEffect(() => {
    if (prefs) setPrefsState((current) => ({ ...current, ...prefs }));
  }, [prefs?.daily_time, prefs?.daily_enabled]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim(), timezone })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Dados atualizados.");
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  const savePrefs = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notification_prefs")
        .upsert({ ...prefsState, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Preferências salvas."),
    onError: () => toast.error("Não foi possível salvar as preferências."),
  });

  const updatePassword = useMutation({
    mutationFn: async () => {
      await changePassword(password);
    },
    onSuccess: () => {
      setPassword("");
      toast.success("Senha atualizada.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("at least")) {
        toast.error("A senha precisa de pelo menos 6 caracteres.");
      } else if (message.toLowerCase().includes("not allowed") || message.toLowerCase().includes("session")) {
        toast.error("Sua sessão expirou. Saia e entre novamente para trocar a senha.");
      } else {
        toast.error("Não foi possível atualizar a senha.");
      }
    },
  });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Ajustes"
        title="Como o app fala com você"
        description="Seu nome, fuso, avisos e segurança do acesso."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <UserRound className="size-4 text-primary" /> Seu perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Nome</Label>
              <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fuso horário</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone.replace("America/", "").replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>E-mail de acesso</Label>
              <Input readOnly value={user?.email ?? ""} className="bg-secondary/50" />
            </div>
            <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
              Salvar perfil
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <Bell className="size-4 text-primary" /> Avisos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Resumo diário</p>
                <p className="text-[11px] text-muted-foreground">rotina, tarefas e hábitos</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={prefsState.daily_time}
                  onChange={(event) =>
                    setPrefsState({ ...prefsState, daily_time: event.target.value })
                  }
                  className="h-8 w-24 text-xs"
                />
                <Switch
                  checked={prefsState.daily_enabled}
                  onCheckedChange={(checked) =>
                    setPrefsState({ ...prefsState, daily_enabled: checked })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Revisão semanal</p>
                <p className="text-[11px] text-muted-foreground">fecha a semana com clareza</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={String(prefsState.weekly_day)}
                  onValueChange={(value) =>
                    setPrefsState({ ...prefsState, weekly_day: Number(value) })
                  }
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEK_DAYS.map((day, index) => (
                      <SelectItem key={day} value={String(index)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch
                  checked={prefsState.weekly_enabled}
                  onCheckedChange={(checked) =>
                    setPrefsState({ ...prefsState, weekly_enabled: checked })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Fechamento mensal</p>
                <p className="text-[11px] text-muted-foreground">metas, finanças e conteúdo</p>
              </div>
              <Switch
                checked={prefsState.monthly_enabled}
                onCheckedChange={(checked) =>
                  setPrefsState({ ...prefsState, monthly_enabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Avisos dentro do app</p>
                <p className="text-[11px] text-muted-foreground">sem enviar e-mail</p>
              </div>
              <Switch
                checked={prefsState.in_app_enabled}
                onCheckedChange={(checked) =>
                  setPrefsState({ ...prefsState, in_app_enabled: checked })
                }
              />
            </div>

            <Button onClick={() => savePrefs.mutate()} disabled={savePrefs.isPending}>
              Salvar preferências
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <KeyRound className="size-4 text-primary" /> Senha
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="mínimo de 6 caracteres"
              />
            </div>
            <Button
              onClick={() => updatePassword.mutate()}
              disabled={password.length < 6 || updatePassword.isPending}
            >
              Atualizar senha
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Se você entrou com a senha temporária, troque agora por uma sua.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <LogOut className="size-4 text-primary" /> Acesso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Este app é pessoal: sua conta vê apenas os seus dados. Encerre a sessão quando usar um
              dispositivo compartilhado.
            </p>
            <Button variant="outline" onClick={() => void signOut()}>
              <LogOut className="size-4" /> Sair da conta
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
