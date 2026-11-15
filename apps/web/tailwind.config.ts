import type { Config } from 'tailwindcss';

// نعتمد على خصائص Tailwind المنطقية (ms-/me-/ps-/pe-/start-/end-) بدل
// اليسار/اليمين الصريح، حتى تعمل الواجهة تلقائيًا في RTL (عربي) وLTR
// (إنجليزي) دون أي أصناف مكررة (القسم 6 من الخطة التقنية).
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eff8ff',
          100: '#dbeefe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
      },
    },
  },
  plugins: [],
};

export default config;
