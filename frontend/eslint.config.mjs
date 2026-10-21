import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Admin/product confirmations must use branded UI, never browser-native prompts.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["alert","confirm","prompt"].map(name => ({
          name,
          message: "Use the branded SiteActionDialog or an inline status message instead."
        }))
      ],
      "no-restricted-properties": [
        "error",
        ...["alert","confirm","prompt"].flatMap(property => [
          {object:"window",property,message:"Use the branded SiteActionDialog instead."},
          {object:"globalThis",property,message:"Use the branded SiteActionDialog instead."}
        ])
      ]
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
