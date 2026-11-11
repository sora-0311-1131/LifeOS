import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.lhr.life", "**.lhr.life", "*.trycloudflare.com"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.lhr.life", "**.lhr.life", "*.trycloudflare.com", "localhost:3000"],
    },
  },
};

export default nextConfig;

