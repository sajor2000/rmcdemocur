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
      // Semantic-only color discipline (R12, KTD5): gap/covered/partial (plus
      // the amber/green shades LEVELS also uses in lib/coverage.ts) are the
      // ONLY colors that carry coverage meaning anywhere in the app. Every
      // other surface — chrome, borders, secondary text — uses Tailwind's
      // built-in gray/neutral scale, never a new decorative color.
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
        // Editorial takeaway headline (the "so what" above a chart/section) —
        // serif, distinct from the sans used for data labels and body (R13).
        takeaway: ["var(--font-lora)", "serif"],
        heading: ["var(--font-sora)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
