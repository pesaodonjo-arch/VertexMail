import type { Config } from "tailwindcss";

// Vertex Mail design tokens
// Color: confident routing-blue primary + a restrained teal accent for
// verified/success/unread states. Deep navy for chrome (sidebars, admin
// nav) instead of pure black. Kept out of the cream/terracotta and
// pure-black/neon defaults.
// Palette lives in CSS variables (see globals.css) so the whole UI can switch
// between light and dark. `<alpha-value>` keeps opacity modifiers like bg-brand-600/30 working.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          300: v("brand-300"),
          400: v("brand-400"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
        },
        ink: {
          50: v("ink-50"),
          100: v("ink-100"),
          200: v("ink-200"),
          300: v("ink-300"),
          400: v("ink-400"),
          500: v("ink-500"),
          600: v("ink-600"),
          700: v("ink-700"),
          800: v("ink-800"),
          900: v("ink-900"),
          950: v("ink-950"),
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
