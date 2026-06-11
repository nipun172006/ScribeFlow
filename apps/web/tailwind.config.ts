import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--sf-bg) / <alpha-value>)",
        surface: "rgb(var(--sf-surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--sf-surface-raised) / <alpha-value>)",
        border: "rgb(var(--sf-border) / <alpha-value>)",
        primary: "rgb(var(--sf-text-primary) / <alpha-value>)",
        muted: "rgb(var(--sf-text-muted) / <alpha-value>)",
        accent: "rgb(var(--sf-accent) / <alpha-value>)",
        "accent-contrast": "rgb(var(--sf-accent-contrast) / <alpha-value>)",
        success: "rgb(var(--sf-success) / <alpha-value>)",
        warning: "rgb(var(--sf-warning) / <alpha-value>)",
        danger: "rgb(var(--sf-danger) / <alpha-value>)",
      },
      borderRadius: {
        control: "var(--sf-radius-control)",
        card: "var(--sf-radius-card)",
        panel: "var(--sf-radius-panel)",
      },
      boxShadow: {
        soft: "var(--sf-shadow-soft)",
        focus: "0 0 0 3px rgb(var(--sf-accent) / 0.32)",
      },
      transitionDuration: {
        fast: "var(--sf-motion-fast)",
        normal: "var(--sf-motion-normal)",
      },
    },
  },
  plugins: [],
} satisfies Config;
