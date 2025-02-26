import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        light : {
          from_color: "zinc-100",
          to_color: "zinc-200",
          element: "",
          text: "",
          button: "",
          button_text: ""
        },
        dark : {
          from_color: "zinc-800",
          to_color: "zinc-900",
          element: "",
          text: "",
          button: "",
          button_text: ""
        }
      },
    },
  },
  plugins: [],
} satisfies Config;
