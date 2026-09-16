/** @type {import('tailwindcss').Config} */
// TailwindCSS の設定
// content には index.html と src 配下の全 TS/TSX を対象に含める。
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
