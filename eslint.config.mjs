import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  {
    extends: [...next],
    ignores: [
      "components/**",
      "app/demo/**",
      "lib/demo/**",
      "app/api/**"
    ],
    rules: {
      "react/no-unescaped-entities": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/legacy_mocks/*", "**/legacy_ts_mocks/*", "**/mock-data*"],
              message: "Direct imports from mock paths are forbidden in production code. Use Supabase database tables or lib/demo wrapper guarded by DEMO_MODE."
            }
          ]
        }
      ]
    }
  }
]);
