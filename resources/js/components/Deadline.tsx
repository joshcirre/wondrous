import { useEffect, useState } from "react";

export default function Deadline({
    due,
    prefix = "Due",
}: {
    due: string | null;
    prefix?: string;
}) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(timer);
    }, [due]);
    if (!due) return null;
    const left = Math.max(0, new Date(due).getTime() - now);
    const minutes = Math.ceil(left / 60000);
    const remaining =
        minutes >= 60
            ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
            : `${minutes}m`;
    return (
        <time
            className={`deadline ${left < 3600000 ? "urgent" : ""}`}
            dateTime={due}
            title={new Date(due).toLocaleString()}
        >
            {left === 0
                ? "Deadline reached · checking result"
                : `${prefix} in ${remaining}`}
        </time>
    );
}
