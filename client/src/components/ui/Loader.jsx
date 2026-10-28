export function FullPageLoader() {
  return (
    <div className="fullpage" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
