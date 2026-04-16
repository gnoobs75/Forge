/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{tsx,ts}", "./components/**/*.{tsx,ts}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: "#0a0a0f",
          surface: "#0d0d14",
          border: "rgba(255,255,255,0.08)",
          text: "#e0e0e0",
          muted: "#888888",
          accent: "#10b981",
          purple: "#8b5cf6",
          red: "#ef4444",
          amber: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
};
