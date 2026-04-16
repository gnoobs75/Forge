/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Core palette — inspired by ronin.consulting
        forge: {
          bg: '#18181C',
          surface: '#1e1e24',
          'surface-hover': '#2a2a32',
          'surface-light': '#242430',
          border: '#3F465B',
          'text-primary': '#e2e8f0',
          'text-secondary': '#BDBEC8',
          'text-muted': '#8891a0',
          accent: '#C52638',
          'accent-blue': '#C52638',
        },
        // Agent colors
        agent: {
          'solutions-architect': '#0EA5E9',
          'backend-engineer': '#3B82F6',
          'frontend-engineer': '#F59E0B',
          'devops-engineer': '#06B6D4',
          'data-engineer': '#7C3AED',
          'security-auditor': '#EF4444',
          'qa-lead': '#DC2626',
          'product-owner': '#EAB308',
          'ux-researcher': '#8B5CF6',
          'api-designer': '#22C55E',
          'performance-engineer': '#F97316',
          'technical-writer': '#EC4899',
          'project-manager': '#3B82F6',
          'code-reviewer': '#D4A574',
        },
        // Phase colors
        phase: {
          discovery: '#8B5CF6',
          design: '#06B6D4',
          build: '#3B82F6',
          test: '#EAB308',
          deploy: '#F97316',
          maintain: '#22C55E',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out backwards',
        'slide-down': 'slide-down 0.3s ease-out backwards',
        'slide-left': 'slide-left 0.25s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'attention-ring': 'attention-ring 1.8s ease-in-out infinite',
        'attention-badge': 'attention-badge 1.2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: 0.6 },
          '50%': { opacity: 1 },
        },
        'attention-ring': {
          '0%, 100%': { opacity: 0.4 },
          '50%': { opacity: 1 },
        },
        'attention-badge': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.2)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        'slide-left': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
