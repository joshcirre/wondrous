import { useEffect, useState } from "react";
import { Eyebrow } from "./Shell";
import { LESSON_FADE_MS, lessonKey } from "../lib/statusCues";
import type { Lesson } from "../types";

export function LessonCard({
    lesson,
    onDismiss,
}: {
    lesson: Lesson;
    onDismiss: () => void;
}) {
    const [shown, setShown] = useState(lesson);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        if (lessonKey(lesson) === lessonKey(shown)) {
            return;
        }
        const reduce =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) {
            setShown(lesson);
            setFading(false);
            return;
        }
        setFading(true);
        const swap = window.setTimeout(() => {
            setShown(lesson);
            setFading(false);
        }, LESSON_FADE_MS);
        return () => window.clearTimeout(swap);
    }, [lesson, shown]);

    return (
        <aside
            className={`lesson-card${fading ? " is-fading" : ""}`}
            data-lesson-step={shown.step}
            data-lesson-variant={shown.variant ?? ""}
        >
            <Eyebrow>Lesson {shown.step}</Eyebrow>
            <h3>{shown.title}</h3>
            <p>{shown.body}</p>
            <button type="button" className="lesson-dismiss" onClick={onDismiss}>
                Dismiss
            </button>
        </aside>
    );
}
