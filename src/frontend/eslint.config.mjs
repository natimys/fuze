import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      // Provider artwork is served from dynamic third-party hosts that cannot be
      // safely enumerated in Next's build-time image allowlist.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
]);
