import "../css/app.css";
import "@fontsource-variable/inter";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import { createInertiaApp } from "@inertiajs/react";
import { createRoot } from "react-dom/client";
import PageRecoveryBoundary from "./components/PageRecoveryBoundary";
import ReleaseNotice from "./components/ReleaseNotice";
const pages = import.meta.glob("./pages/*.tsx");
createInertiaApp({
    title: (title) => (title ? `${title} · Wondrous` : "Wondrous"),
    resolve: (name) =>
        pages[`./pages/${name}.tsx`]().then((module: any) => module.default),
    setup({ el, App, props }) {
        createRoot(el).render(
            <>
                <PageRecoveryBoundary>
                    <App {...props} />
                </PageRecoveryBoundary>
                <ReleaseNotice
                    initialVersion={String(
                        props.initialPage.props.release ?? "development",
                    )}
                />
            </>,
        );
    },
    progress: { color: "#d3b278" },
});
