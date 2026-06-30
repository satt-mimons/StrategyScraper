import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // Hide the floating Next.js dev-tools indicator (the "N" badge). It's a framework
  // dev affordance with no app function and never appears in production anyway.
  devIndicators: false,
};

export default nextConfig;
