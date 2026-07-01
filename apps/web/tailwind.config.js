/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Ported directly from the design system tokens (foundations.css)
      colors: {
        brand: 'var(--brand)',
        'brand-hover': 'var(--brand-hover)',
        'brand-ink': 'var(--brand-ink)',
        'accent-cyan': 'var(--accent-cyan)',
        'app-bg': 'var(--app-bg)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        'ink-900': 'var(--ink-900)',
        'ink-700': 'var(--ink-700)',
        'ink-500': 'var(--ink-500)',
        'ink-400': 'var(--ink-400)',
        'ink-300': 'var(--ink-300)',
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['Montserrat', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
    },
  },
  plugins: [],
};
