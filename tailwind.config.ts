import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rush: {
          green: "#00843D",
          "green-dark": "#006B30",
          dark: "#353535",
          medium: "#494949",
          light: "#f5f5f5",
          yellow: "#FFD100",
        },
        gap: { red: "#DC2626" },
        covered: { green: "#16A34A" },
        partial: { yellow: "#D97706" },
      },
      fontFamily: {
        heading: ["var(--font-sora)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
