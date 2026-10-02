/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Poppins",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif"
        ]
      },

      colors: {
        /*
         * BAURA LIGHT PREMIUM THEME
         */
        bauraCanvas: "#F7F4EF",
        bauraCanvas2: "#FCFAF7",
        bauraSurface: "#FFFFFF",
        bauraSidebar: "#FFFDF9",

        bauraPrimary: "#5B3A29",
        bauraPrimaryDark: "#452B1F",
        bauraPrimarySoft: "#F4ECE5",
        bauraPrimarySoft2: "#FAF5F0",

        bauraGold: "#C79A59",
        bauraGoldDark: "#A87837",
        bauraGoldSoft: "#F7EBD9",

        bauraInk: "#2D2926",
        bauraInk2: "#4C433D",

        bauraMuted: "#8F857D",
        bauraMuted2: "#B0A69E",

        bauraBorder: "#EAE3DA",

        bauraSuccess: "#2F9E72",
        bauraSuccessSoft: "#EBF8F2",

        bauraWarning: "#D69332",
        bauraWarningSoft: "#FFF5E5",

        bauraDanger: "#D75661",
        bauraDangerSoft: "#FFF0F1",

        /*
         * COMPATIBILITY TOKENS
         *
         * Old pages keep working while inheriting
         * the new light Baura palette.
         */
        bauraCream: "#F7F4EF",
        bauraSoft: "#FCFAF7",

        bauraBrown: "#2D2926",
        bauraBrown2: "#5B3A29",
        bauraBrown3: "#7A5A48",

        bauraPosDark: "#33271F"
      },

      boxShadow: {
        bauraCard:
          "0 12px 35px rgba(63, 46, 36, 0.065)",

        bauraCardHover:
          "0 16px 42px rgba(63, 46, 36, 0.095)",

        bauraButton:
          "0 8px 20px rgba(91, 58, 41, 0.18)",

        bauraToast:
          "0 15px 45px rgba(50, 39, 32, 0.16)"
      }
    }
  },

  plugins: []
};