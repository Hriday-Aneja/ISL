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
        // the rest of the app (how-it-works) stays on the light `paper`
        // surface above.
        room: {
          bg: '#0E1513',
          surface: '#152220',
          raised: '#1C2B28',
          border: '#263733',
          text: '#EDF3F1',
          'text-soft': '#9FB3AD',
        },
        // Landing page palette (midnight + saffron + mint).
        night: {
          DEFAULT: '#0A0C16',
          card: '#11152A',
        },
        saffron: '#FFB547',
        mint: '#4DE3C1',
        mist: '#A7ADC2',
        cream: '#F4F1EA',
      },
      fontFamily: {
        display: ['"Manrope"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        bricolage: ['"Bricolage Grotesque"', 'sans-serif'],
        dm: ['"DM Sans"', 'sans-serif'],
        deva: ['"Noto Sans Devanagari"', 'sans-serif'],
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
        orb: '0 50px 140px rgba(0,0,0,0.6), 0 0 0 1px rgba(77,227,193,0.08), 0 0 80px rgba(77,227,193,0.10)',
        glass: '0 24px 60px rgba(0,0,0,0.5)',
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
        // ---- landing page ----
        'word-rise': {
          from: { opacity: '0', transform: 'translateY(26px)' },
          to: { opacity: '1', transform: 'none' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        tilt: {
          '0%, 100%': { transform: 'rotateY(-7deg) rotateX(3deg)' },
          '50%': { transform: 'rotateY(5deg) rotateX(-2deg) translateY(-8px)' },
        },
        'blob-drift': {
          '0%': { transform: 'translate(0,0)' },
          '100%': { transform: 'translate(50px,36px)' },
        },
        'dot-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.6)', opacity: '0.5' },
        },
        eqr: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1.15)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.7' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        cycle: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '4%, 30%': { opacity: '1', transform: 'none' },
          '34%, 100%': { opacity: '0' },
        },
        grow: {
          '0%': { width: '8%' },
          '55%, 100%': { width: '98%' },
        },
        shine: {
          '0%, 60%': { left: '-60%' },
          '100%': { left: '130%' },
        },
        marquee: {
          to: { transform: 'translateX(-50%)' },
        },
        draw: {
          to: { strokeDashoffset: '0' },
        },
        'ring-spin': {
          to: { transform: 'translate(-50%, -50%) rotate(360deg)' },
        },
        'bar-eq': {
          '0%, 100%': { height: '6px' },
          '50%': { height: '24px' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        'pulse-ring-amber': 'pulse-ring-amber 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-up': 'fade-up 0.25s ease-out',
        drift: 'drift 5s ease-in-out infinite',
        'word-rise': 'word-rise 0.9s cubic-bezier(0.2,0.7,0.2,1) both',
        float: 'float 6s ease-in-out infinite',
        tilt: 'tilt 9s ease-in-out infinite',
        'blob-drift': 'blob-drift 16s ease-in-out infinite alternate',
        'dot-pulse': 'dot-pulse 2.4s ease-in-out infinite',
        eqr: 'eqr 1.6s ease-in-out infinite',
        ripple: 'ripple 3.2s ease-out infinite',
        cycle: 'cycle 9s infinite',
        grow: 'grow 4s ease-in-out infinite',
        shine: 'shine 3.5s ease-in-out infinite',
        marquee: 'marquee 44s linear infinite',
        draw: 'draw 1.2s 0.9s ease forwards',
        'ring-spin': 'ring-spin 60s linear infinite',
        'bar-eq': 'bar-eq 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};