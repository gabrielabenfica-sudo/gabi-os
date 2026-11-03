import { Navigate, Outlet } from "react-router-dom";
import { AppLoading, AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth";
import { WorkspaceProvider } from "@/lib/workspace";

export function ProtectedLayout() {
  const { session, loading } = useAuth();
  if (loading) return <AppLoading />;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <WorkspaceProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspaceProvider>
  );
}
