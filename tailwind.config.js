/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: { 'brand-blue': '#0D2B4C', 'brand-yellow': '#FFD700' },
    },
  },
  plugins: [],
}