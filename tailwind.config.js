/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        crimson: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#B42318', // Primary brand crimson
          700: '#991B1B',
          800: '#7F1D1D',
          900: '#450A0A',
        },
        ink: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A', // Main dark ink text
          950: '#020617',
        },
        status: {
          feasible: {
            bg: '#ECFDF5',
            border: '#A7F3D0',
            text: '#065F46',
            icon: '#059669',
            ring: '#10B981',
          },
          risk: {
            bg: '#FFFBEB',
            border: '#FDE68A',
            text: '#92400E',
            icon: '#D97706',
            ring: '#F59E0B',
          },
          infeasible: {
            bg: '#FEF2F2',
            border: '#FECACA',
            text: '#991B1B',
            icon: '#DC2626',
            ring: '#EF4444',
          },
          reserved: {
            bg: '#EFF6FF',
            border: '#BFDBFE',
            text: '#1E40AF',
            icon: '#2563EB',
            ring: '#3B82F6',
          },
          transit: {
            bg: '#F5F3FF',
            border: '#DDD6FE',
            text: '#5B21B6',
            icon: '#7C3AED',
            ring: '#8B5CF6',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        card: '14px',
        panel: '14px',
        badge: '6px',
        pill: '9999px',
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
        card: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
        elevated: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
        drawer: '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
}
