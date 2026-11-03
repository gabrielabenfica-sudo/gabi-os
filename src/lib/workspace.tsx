import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useWorkspaces } from "./queries";
import type { Workspace } from "./types";

type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeId: string | null;
  active: Workspace | null;
  setActiveId: (id: string) => void;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem("gabi.activeWorkspace"),
  );

  useEffect(() => {
    if (!workspaces.length) return;
    const stored = workspaces.find((workspace) => workspace.id === activeId);
    if (!stored) setActiveId(workspaces[0].id);
  }, [workspaces, activeId]);

  useEffect(() => {
    if (activeId) localStorage.setItem("gabi.activeWorkspace", activeId);
  }, [activeId]);

  const value = useMemo(() => {
    const active = workspaces.find((workspace) => workspace.id === activeId) ?? null;
    return { workspaces, activeId, active, setActiveId, loading: isLoading };
  }, [workspaces, activeId, isLoading]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace precisa estar dentro de WorkspaceProvider");
  return context;
}

export function useWorkspaceMap(workspaces: Workspace[]) {
  return useMemo(() => {
    const map = new Map<string, Workspace>();
    workspaces.forEach((workspace) => map.set(workspace.id, workspace));
    return map;
  }, [workspaces]);
}
