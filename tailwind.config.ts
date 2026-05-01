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
        },
        "sori-surface": {
          base: "var(--sori-surface-base)",
          panel: "var(--sori-surface-panel)",
          main: "var(--sori-surface-main)",
          elevated: "var(--sori-surface-elevated)",
          hover: "var(--sori-surface-hover)",
          active: "var(--sori-surface-active)",
          selected: "var(--sori-surface-selected)",
          "accent-subtle": "var(--sori-surface-accent-subtle)",
          "danger-subtle": "var(--sori-surface-danger-subtle)",
          "success-subtle": "var(--sori-surface-success-subtle)",
          "warning-subtle": "var(--sori-surface-warning-subtle)",
          overlay: "var(--sori-surface-overlay)"
        },
        "sori-border": {
          subtle: "var(--sori-border-subtle)",
          medium: "var(--sori-border-medium)",
          strong: "var(--sori-border-strong)",
          accent: "var(--sori-border-accent)",
          danger: "var(--sori-border-danger)"
        },
        "sori-text": {
          primary: "var(--sori-text-primary)",
          muted: "var(--sori-text-muted)",
          dim: "var(--sori-text-dim)",
          strong: "var(--sori-text-strong)",
          "on-primary": "#05060a",
          "on-accent": "#ffffff"
        },
        "sori-accent": {
          primary: "var(--sori-accent-primary)",
          secondary: "var(--sori-accent-secondary)",
          danger: "var(--sori-accent-danger)",
          success: "var(--sori-accent-success)",
          warning: "var(--sori-accent-warning)"
        },
        "sori-accent-primary-subtle": "#32345c",
        "sori-accent-secondary-subtle": "#2d4c47",
        "sori-accent-danger-subtle": "#472d2d",
        "sori-accent-success-subtle": "#2d4733",
        "sori-accent-warning-subtle": "#47412d",
        "sori-chat-bubble-me": "#353652",
        "sori-chat-bubble-me-border": "#3b3c5a"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 36px rgba(163, 166, 255, 0.18)"
      }
    }
  },
  plugins: []
} satisfies Config;
