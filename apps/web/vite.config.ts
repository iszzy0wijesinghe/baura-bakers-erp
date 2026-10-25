import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: env.VITE_APP_BASE_PATH || "/",
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: env.ERP_API_PROXY_TARGET || "http://127.0.0.1:3101",
          changeOrigin: true
        }
      }
    }
  };
});
