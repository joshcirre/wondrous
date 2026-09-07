import { defineConfig } from "vite";
import { randomUUID } from "node:crypto";
import laravel from "laravel-vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
    plugins: [
        laravel({ input: ["resources/js/app.tsx"], refresh: true }),
        {
            name: "wondrous-release",
            apply: "build",
            generateBundle() {
                this.emitFile({
                    type: "asset",
                    fileName: "release.json",
                    source: JSON.stringify({ version: randomUUID() }),
                });
            },
        },
        react(),
        tailwindcss(),
    ],
    server: { host: "127.0.0.1" },
});
