/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        luxury: {
          navy: '#111111',
          onyx: '#111111',
          charcoal: '#2C2A27',
          gold: '#C9A961',
          'gold-dark': '#B89951',
          'gold-light': '#D4B976',
          cream: '#F9F9F8',
          ivory: '#F9F9F8',
          alabaster: '#F9F9F8',
          beige: '#E0DDD8',
          'gray-light': '#B0ABA4',
          'gray-medium': '#7A7268',
          'gray-dark': '#4A4540',
          'green-success': '#2D5016',
          earth: '#8B7355',
        },
      },
    },
  },
  plugins: [],
};
