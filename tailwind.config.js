/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 10px 40px -10px rgba(16, 185, 129, 0.4)'
      }
    }
  },
  plugins: []
}



