import type { NextConfig } from "next";

// Opening the dev server through an HTTPS tunnel (needed for TikTok's redirect URI): allow that host in development.
const tunnelHost = (() => {
  try {
    const host = new URL(process.env.APP_URL || "").hostname;
    return host && host !== "localhost" && host !== "127.0.0.1" ? [host] : [];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: tunnelHost,
  serverExternalPackages: ["@prisma/client"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
