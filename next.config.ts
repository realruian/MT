import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min", "@napi-rs/canvas", "sharp"],
};

export default nextConfig;
