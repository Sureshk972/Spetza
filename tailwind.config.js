/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        ink: '#13141a',
        cream: '#fafaf7',
        slate: '#5b6573',
        signal: '#e85d3f',
        forest: '#2f5d50',
        mist: '#e7ecef',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
