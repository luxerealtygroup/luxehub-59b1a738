import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

/**
 * Tenant isolation gate.
 *
 * Runs on production builds only, has no npm dependencies (so it cannot break
 * the deploy image the way `vitest` did) and fails the build HARD if the live
 * isolation probe finds a cross-tenant leak.
 *
 * If ISOLATION_TEST_TOKEN is not present in the build environment the gate
 * cannot run: it prints a loud UNVERIFIED banner instead of failing, so a
 * missing secret never blocks a deploy. The scheduled daily `isolation-check`
 * cron (Slack alert on failure) is the backstop for that case.
 */
function isolationGate(): Plugin {
  return {
    name: "tenant-isolation-gate",
    apply: "build",
    async buildStart() {
      if (process.env.SKIP_ISOLATION_GATE === "1") return;
      const { runIsolationGate } = await import("./scripts/isolation-gate.mjs");
      const out = await runIsolationGate();
      const bar = "=".repeat(72);
      if (out.status === "pass") {
        console.log("\nTENANT ISOLATION GATE: PASS — zero cross-tenant rows, positive controls returned rows.\n");
        return;
      }
      if (out.status === "fail") {
        console.error(`\n${bar}\nTENANT ISOLATION GATE: FAIL — BUILD BLOCKED\n${bar}`);
        for (const f of out.failures) console.error(`  ${f}`);
        console.error(`${bar}\n`);
        this.error("Tenant isolation gate failed — cross-tenant leak detected. Build blocked.");
      }
      console.warn(`\n${bar}\nTENANT ISOLATION GATE: UNVERIFIED (not blocking)\n  ${out.reason}\n${bar}\n`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
    mode !== "development" && isolationGate(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

