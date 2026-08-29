import eslint from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
  globalIgnores(['dist/**', 'node_modules/**', 'src-tauri/target/**', 'src-tauri/gen/**']),
])
