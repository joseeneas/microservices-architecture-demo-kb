/** @type {import('tailwindcss').Config} */

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'even:bg-gray-100',
    'odd:bg-white',
    'hover:bg-gray-200',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1E40AF',
        secondary: '#F59E0B',
        darkblue: '#1e3a5f'
      },
      backgroundColor: {
        'custom-bg': '#f5f5f5',
        'dark-bg': '#1a1a1a',
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      },
      page: {
        padding: '2rem',
      },
    },
  },
  plugins: [],
}