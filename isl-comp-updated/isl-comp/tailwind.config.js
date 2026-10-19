/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F8F5',
        'paper-dim': '#EEF1ED',
        ink: '#17211F',
        'ink-soft': '#66736F',
        line: '#DDE4E1',
        signal: {
          DEFAULT: '#0F766E',
          soft: '#E6F4F1',
          deep: '#115E59',
        },
        voice: {
          DEFAULT: '#D6A84B',
          soft: '#FBF1DD',
          deep: '#A87B26',
        },
        alert: {
          DEFAULT: '#DC4C4C',
          soft: '#FBE7E7',
        },
        // Immersive dark shell used only inside the Communication Room —
        // the rest of the app (landing, how-it-works) stays on the light
        // `paper` surface above.
        room: {
          bg: '#0E1513',
          surface: '#152220',
          raised: '#1C2B28',
          border: '#263733',
          text: '#EDF3F1',
          'text-soft': '#9FB3AD',
        },
      },
      fontFamily: {
        display: ['"Manrope"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '9px',
        md: '14px',
        lg: '20px',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(23,33,31,0.04), 0 1px 0 rgba(23,33,31,0.04)',
        stage: '0 1px 2px rgba(0,0,0,0.2), 0 12px 32px -16px rgba(0,0,0,0.45)',
        float: '0 8px 24px -10px rgba(23,33,31,0.18)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(15,118,110,0.35)' },
          '100%': { boxShadow: '0 0 0 8px rgba(15,118,110,0)' },
        },
        'pulse-ring-amber': {
          '0%': { boxShadow: '0 0 0 0 rgba(214,168,75,0.35)' },
          '100%': { boxShadow: '0 0 0 8px rgba(214,168,75,0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        'pulse-ring-amber': 'pulse-ring-amber 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-up': 'fade-up 0.25s ease-out',
        drift: 'drift 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
