import axios from "axios";
import Echo from "laravel-echo";
import Pusher from "pusher-js";
axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
axios.defaults.withCredentials = true;
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
