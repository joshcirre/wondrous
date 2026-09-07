import axios from "axios";
import { mutationStarted, mutationFinished, needsRefresh } from "./releases";
import Echo from "laravel-echo";
import Pusher from "pusher-js";
axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
axios.defaults.withCredentials = true;
const mutations = new WeakSet<object>();
axios.defaults.timeout = 15000;
axios.interceptors.request.use((config) => {
    if (!["get", "head", "options"].includes(config.method || "get")) {
        mutations.add(config);
        mutationStarted();
    }
    return config;
});
function completed(config: object | undefined) {
    if (config && mutations.delete(config)) mutationFinished();
}
axios.interceptors.response.use(
    (response) => {
        completed(response.config);
        return response;
    },
    (error) => {
        // Keep the board in place on expiry. A deliberate refresh restores the intended game URL.
        if ([401, 419].includes(error.response?.status))
            needsRefresh("session");
        completed(error.config);
        return Promise.reject(error);
    },
);
export const api = axios;
export const errorMessage = (e: unknown): string =>
    axios.isAxiosError(e)
        ? e.response?.data?.message ||
          "Connection interrupted. Please try again."
        : "Something went wrong. Please try again.";
let echo: Echo<"reverb"> | undefined;
export function realtime() {
    if (!import.meta.env.VITE_REVERB_APP_KEY) return;
    if (!echo) {
        (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;
        echo = new Echo({
            broadcaster: "reverb",
            key: import.meta.env.VITE_REVERB_APP_KEY,
            wsHost:
                import.meta.env.VITE_REVERB_HOST || window.location.hostname,
            wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
            wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
            forceTLS: import.meta.env.VITE_REVERB_SCHEME === "https",
            enabledTransports: ["ws", "wss"],
            authorizer: (channel) => ({
                authorize: (socketId, callback) => {
                    api.post("/broadcasting/auth", {
                        socket_id: socketId,
                        channel_name: channel.name,
                    })
                        .then((response) => callback(null, response.data))
                        .catch((error) => callback(error, null));
                },
            }),
        });
    }
    return echo;
}
