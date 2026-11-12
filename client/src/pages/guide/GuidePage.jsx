import { useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { TOURS } from "../../config/tours";
import { useTours } from "../../lib/tourContext";
import { visibleSteps } from "../../lib/tourMatch";
import "../../styles/guide.css";

export default function GuidePage() {
  const { can } = useAuth();
  const { openTour, replayAll } = useTours();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });

  const tours = Object.entries(TOURS)
    .map(([key, tour]) => ({ key, tour, steps: visibleSteps(tour, can) }))
    .filter((t) => t.steps.length > 0);

  async function onReplay() {
    setBusy(true);
    const { error } = await replayAll();
    setBusy(false);
    setConfirming(false);
    setMessage(
      error
        ? {
            kind: "danger",
            text: "Could not reset the tutorials. Please try again.",
          }
        : {
            kind: "success",
            text: "Done. Each tutorial will show again the next time you open its page.",
          },
    );
  }

  return (
    <>
      <PageHeader
        title="Guide"
        subtitle="Short tutorials for each page. Open one again whenever you need it."
      />

      {message.text && (
        <div
          className={`alert alert--${message.kind}`}
          role={message.kind === "danger" ? "alert" : "status"}
        >
          {message.text}
        </div>
      )}

      <div className="gd-toolbar">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setConfirming(true)}
        >
          Replay all tutorials
        </button>
      </div>

      <div className="gd-list">
        {tours.map(({ key, tour, steps }) => (
          <section className="card" key={key}>
            <div className="gd-head">
              <h2 className="card__title">{tour.title}</h2>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => openTour(key)}
              >
                Show again
              </button>
            </div>
            <ol className="gd-steps">
              {steps.map((s) => (
                <li key={s.title}>
                  <span className="gd-step__title">{s.title}</span>
                  <span className="gd-step__text">{s.text}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Replay all tutorials?"
      >
        <p className="card__sub">
          The tutorial popups will appear again the next time you open each
          page.
        </p>
        <div className="gd-confirm">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onReplay}
            disabled={busy}
          >
            {busy ? "Working…" : "Replay all"}
          </button>
        </div>
      </Modal>
    </>
  );
}
