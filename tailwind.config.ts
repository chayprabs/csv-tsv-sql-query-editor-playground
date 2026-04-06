import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f1e7",
        panel: "#fffaf1",
        ink: "#17110e",
        accent: "#c55d2d",
        accentSoft: "#f2d6bf",
        line: "#d9ccb8",
        muted: "#6a5f55",
      },
      boxShadow: {
        panel: "0 18px 45px rgba(30, 19, 11, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
