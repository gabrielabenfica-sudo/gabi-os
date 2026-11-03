import Login from "./pages/Login";
import Hoje from "./pages/Hoje";
import Rotina from "./pages/Rotina";
import Assistente from "./pages/Assistente";
import Tarefas from "./pages/Tarefas";
import Calendario from "./pages/Calendario";
import Metas from "./pages/Metas";
import Habitos from "./pages/Habitos";
import Conteudo from "./pages/Conteudo";
import Instagram from "./pages/Instagram";
import Financeiro from "./pages/Financeiro";
import Mentoria from "./pages/Mentoria";
import RodaDaVida from "./pages/RodaDaVida";
import Notas from "./pages/Notas";
import Conexoes from "./pages/Conexoes";
import Ajustes from "./pages/Ajustes";
import { ProtectedLayout } from "./components/layout/protected-layout";

export const routers = [
  { path: "/login", element: <Login /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: "/", element: <Hoje /> },
      { path: "/rotina", element: <Rotina /> },
      { path: "/assistente", element: <Assistente /> },
      { path: "/tarefas", element: <Tarefas /> },
      { path: "/calendario", element: <Calendario /> },
      { path: "/metas", element: <Metas /> },
      { path: "/habitos", element: <Habitos /> },
      { path: "/conteudo", element: <Conteudo /> },
      { path: "/instagram", element: <Instagram /> },
      { path: "/financeiro", element: <Financeiro /> },
      { path: "/mentoria", element: <Mentoria /> },
      { path: "/roda-da-vida", element: <RodaDaVida /> },
      { path: "/notas", element: <Notas /> },
      { path: "/conexoes", element: <Conexoes /> },
      { path: "/ajustes", element: <Ajustes /> },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  { path: "*", element: <Login /> },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
