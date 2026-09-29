import type { Config } from "tailwindcss";

// Vertex Mail design tokens
// Color: confident routing-blue primary + a restrained teal accent for
// verified/success/unread states. Deep navy for chrome (sidebars, admin
// nav) instead of pure black. Kept out of the cream/terracotta and
// pure-black/neon defaults.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#4F5FE0",
          600: "#2952E3", // primary
          700: "#2140B8",
          800: "#1B3391",
          900: "#182B72",
        },
        ink: {
          50: "#F7F8FB",
          100: "#EEF0F6",
          200: "#E4E7EE",
          300: "#CBD0DC",
          400: "#9AA1B4",
          500: "#6B7280",
          600: "#4B5165",
          700: "#343A4D",
          800: "#20243333",
          900: "#12172B", // near-black navy, used for headline text
          950: "#0B0F1F", // sidebar / dark chrome
        },
        accent: {
          teal: "#17B897",
          amber: "#E39A2B",
          rose: "#E35D6A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Manrope", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(18, 23, 43, 0.06), 0 1px 0 rgba(18, 23, 43, 0.04)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
