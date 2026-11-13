/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0e14',
          secondary: '#111720',
          tertiary: '#161e2a',
          card: '#1a2332',
          hover: '#1e293b',
        },
        border: {
          subtle: '#1e293b',
          DEFAULT: '#2a3a4f',
          strong: '#3a4f6b',
        },
        accent: {
          primary: '#3b82f6',
          hover: '#2563eb',
          muted: '#1e3a5f',
        },
        success: {
          DEFAULT: '#10b981',
          muted: '#064e3b',
          text: '#34d399',
        },
        danger: {
          DEFAULT: '#ef4444',
          muted: '#7f1d1d',
          text: '#f87171',
        },
        warning: {
          DEFAULT: '#f59e0b',
          muted: '#78350f',
          text: '#fbbf24',
        },
        text: {
          primary: '#e2e8f0',
          secondary: '#94a3b8',
          muted: '#64748b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Vazirmatn', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
