import { requireUser } from "@/server/auth/current";
import { getPrefs, listNotifications } from "@/server/notifications";
import { NotificationsClient } from "./notifications-client";

export const metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const [items, prefs] = await Promise.all([listNotifications(user.id, { take: 100 }), getPrefs(user.id)]);
  return (
    <NotificationsClient
      items={items.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        body: i.body,
        link: i.link,
        data: i.data as unknown,
        readAt: i.readAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      }))}
      prefs={{
        dailyEnabled: prefs.dailyEnabled,
        dailyTime: prefs.dailyTime,
        weeklyEnabled: prefs.weeklyEnabled,
        weeklyDay: prefs.weeklyDay,
        monthlyEnabled: prefs.monthlyEnabled,
        monthlyDay: prefs.monthlyDay,
        inAppEnabled: prefs.inAppEnabled,
        billDueDaysBefore: prefs.billDueDaysBefore,
      }}
      tz={user.timezone}
    />
  );
}
