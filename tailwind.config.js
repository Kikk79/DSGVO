/** @type {import('tailwindcss').Config} */

// Farben kommen als RGB-Kanäle aus CSS-Variablen (src/styles/globals.css),
// damit Tailwinds Deckkraft-Modifikatoren (z. B. bg-tafel-900/60) funktionieren.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: token('paper'), deep: token('paper-deep') },
        surface: token('surface'),
        ink: { DEFAULT: token('ink'), muted: token('ink-muted') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        tafel: {
          900: token('tafel-900'),
          800: token('tafel-800'),
          700: token('tafel-700'),
          600: token('tafel-600'),
          100: token('tafel-100'),
        },
        kreide: { DEFAULT: token('kreide'), muted: token('kreide-muted') },
        marker: { DEFAULT: token('marker'), soft: token('marker-soft') },
        rotstift: {
          DEFAULT: token('rotstift'),
          dark: token('rotstift-dark'),
          soft: token('rotstift-soft'),
        },
      },
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"Fraunces Variable"', 'Georgia', '"Times New Roman"', 'serif'],
      },
      fontSize: {
        // Name: [Größe, { Zeilenhöhe, ... }]
        meta: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.08em', fontWeight: '600' }],
        small: ['0.8125rem', { lineHeight: '1.125rem' }],
        ui: ['0.9375rem', { lineHeight: '1.375rem' }],
        body: ['1rem', { lineHeight: '1.625rem' }],
        name: ['1.1875rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em' }],
        title: ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.01em' }],
        heading: ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.015em' }],
        display: ['2.75rem', { lineHeight: '3rem', letterSpacing: '-0.02em' }],
        numeral: ['3.25rem', { lineHeight: '3.25rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        full: '9999px',
      },
      maxWidth: {
        measure: '68ch',
        page: '60rem',
      },
      spacing: {
        sidebar: '15.5rem',
        margin: '4.5rem',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'fade-in': 'fade-in 160ms ease-out both',
      },
    },
  },
  plugins: [],
}
