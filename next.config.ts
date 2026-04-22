import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "better-sqlite3", "@napi-rs/canvas", "sharp"],
};

export default nextConfig;
