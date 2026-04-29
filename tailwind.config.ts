import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sori: {
          bg: "#090b10",
          panel: "#121621",
          elevated: "#181d2a",
          hover: "#202638",
          border: "#2a3144",
          muted: "#8b95ad",
          text: "#eef3ff",
          dim: "#59637a",
          primary: "#7c5cff",
          secondary: "#34d3c5",
          danger: "#ff5d73",
          warning: "#f5c451"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 36px rgba(124, 92, 255, 0.24)"
      }
    }
  },
  plugins: []
} satisfies Config;
