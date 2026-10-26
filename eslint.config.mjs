import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Navigation goes through i18n/navigation: its Link and router keep the
  // locale and switch on the pending state (lib/navProgress) at the click.
  // A next/link Link or a next/navigation router would navigate silently.
  {
    files: ["app/[[]locale]/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "next/link", importNames: ["default"], message: "Use Link from @/i18n/navigation (locale + navigation pending state)." },
            { name: "next/navigation", importNames: ["useRouter"], message: "Use useRouter from @/i18n/navigation (locale + navigation pending state)." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/mediapipe/**",
  ]),
]);

export default eslintConfig;
