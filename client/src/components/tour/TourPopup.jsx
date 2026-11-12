import { useEffect, useId, useRef, useState } from "react";
import "../../styles/tour.css";

export default function TourPopup({ tour, steps, onClose }) {
  const ref = useRef(null);
  const closingRef = useRef(false);
  const [index, setIndex] = useState(0);
  const titleId = useId();
  const textId = useId();
  const step = steps[index];
  const last = index === steps.length - 1;

  // Skip, Done, Esc and a click on the backdrop all end here, once.
  function dismiss() {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("[data-autofocus]")?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="tu"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onClose={dismiss}
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
    >
      <div className="tu__body">
        <p className="tu__kicker">{tour.title}</p>
        <h2 className="tu__title" id={titleId}>
          {step.title}
        </h2>
        <p className="tu__text" id={textId}>
          {step.text}
        </p>

        <div className="tu__foot">
          <div className="tu__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.title}
                className={`tu__dot ${i === index ? "is-active" : ""}`}
              />
            ))}
          </div>
          <p className="tu__count" aria-live="polite">
            Step {index + 1} of {steps.length}
          </p>
        </div>

        <div className="tu__actions">
          {!last && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={dismiss}
            >
              Skip tutorial
            </button>
          )}
          <div className="tu__nav">
            {index > 0 && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setIndex((n) => n - 1)}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary btn--sm"
              data-autofocus
              onClick={last ? dismiss : () => setIndex((n) => n + 1)}
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
