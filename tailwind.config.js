/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        ink: '#1a1a2e',
        cloud: '#F2F2F2',
        slate: '#5b6573',
        teal: { DEFAULT: '#0378A6', light: '#0388A6' },
        green: { DEFAULT: '#76BF6B', soft: '#A8D9A0' },
        mist: '#e2e8ec',
      },
      fontFamily: {
        display: ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
