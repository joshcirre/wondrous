import "../css/app.css";
import "@fontsource-variable/inter";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import { createInertiaApp } from "@inertiajs/react";
import { createRoot } from "react-dom/client";
const pages = import.meta.glob("./pages/*.tsx");
createInertiaApp({
    title: (title) => (title ? `${title} · Wondrous` : "Wondrous"),
    resolve: (name) =>
        pages[`./pages/${name}.tsx`]().then((module: any) => module.default),
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
    progress: { color: "#d3b278" },
});
