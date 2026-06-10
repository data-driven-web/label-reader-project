/** @type {import('tailwindcss').Config} */
// Tailwind v3 (stable LTS line) chosen over v4 as the conservative,
// widely documented option for a government prototype.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Institutional palette: navy + gray primaries.
        // Red/yellow/green reserved exclusively for risk indicators.
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          600: '#1f3a5f',
          700: '#16294a',
          800: '#102040',
          900: '#0a1830'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
};
