import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Tipos são checados em um passo próprio do CI (npm run typecheck)
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["@node-rs/argon2"],
  // Extratos OFX/CSV de até 2 MB são enviados por Server Action (texto ~ até 3 MB com codificação)
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
