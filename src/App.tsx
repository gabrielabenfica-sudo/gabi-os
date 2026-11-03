import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { RouteErrorBoundary } from "./components/error-boundary/route-error-boundary";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "./lib/auth";
import { routers } from "./router";

const AUTH_ERROR_PATTERN = /JWT expired|invalid JWT|Auth session missing|refresh_token_not_found|invalid claim/i;

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (AUTH_ERROR_PATTERN.test(message)) {
        // The stored session is no longer valid: drop it so the login screen appears.
        try {
          Object.keys(localStorage)
            .filter((key) => (key.startsWith("sb-") && key.includes("auth-token")) || key.startsWith("neon"))
            .forEach((key) => localStorage.removeItem(key));
        } catch (_storageError) {
          // ignore unavailable storage
        }
        void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      }
    },
  }),
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

// Created once so remounting App (e.g. after an error-boundary retry) never
// leaves a second router listening to history. The pathless root route is the
// shared errorElement every page bubbles up to.
const router = createBrowserRouter([
  { errorElement: <RouteErrorBoundary />, children: routers },
]);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
