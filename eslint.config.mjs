import tseslint from 'typescript-eslint';

// تهيئة ESLint الجذرية (Flat Config) لـ packages/shared وapps/api.
// واجهة apps/web لها ملف إعداد خاص بها (apps/web/eslint.config.mjs)
// مبني على next/core-web-vitals، فلا يُستخدَم هذا الملف هناك.
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', 'apps/web/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
