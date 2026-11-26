/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172638',
        muted: '#718096',
        line: '#e6ebf0',
        brand: {
          50: '#eef8f7',
          100: '#d6efeb',
          500: '#258a7e',
          600: '#1e736a',
          700: '#195d57'
        }
      },
      boxShadow: {
        panel: '0 10px 32px rgba(22, 38, 56, 0.06)'
      }
    }
  },
  plugins: []
};
