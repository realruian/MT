import type { Config } from "tailwindcss";
import { tailwindExtend } from "./lib/design-tokens";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      ...tailwindExtend,
    },
  },
};

export default config;
