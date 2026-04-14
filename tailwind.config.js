/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0F1E',
        surface: '#111827',
        surface2: '#0F1524',
        primary: '#3B82F6',
        accent: '#F59E0B',
        muted: '#6B7280',
        border: '#1F2937',
        text: '#F9FAFB',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 400ms ease-out both',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
