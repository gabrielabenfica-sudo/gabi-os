import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gabi OS — Central de Gestão",
    short_name: "Gabi OS",
    start_url: "/",
    display: "standalone",
    background_color: "#F4EFEC",
    theme_color: "#373039",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
