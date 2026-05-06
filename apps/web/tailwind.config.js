/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bauraCream: "#f9f4e0",
        bauraBrown: "#372619",
        bauraGold: "#c59a4a",
        bauraSoft: "#fffaf0",
        bauraPosDark: "#18110c"
      }
    }
  },
  plugins: []
};