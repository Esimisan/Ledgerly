import { Link } from "react-router-dom";
import PageHeader from "../components/layout/PageHeader";

export function NoAccess() {
  return (
    <>
      <PageHeader title="No access" />
      <section className="card empty">
        <h2 className="card__title">
          You don't have permission to view this page
        </h2>
        <p className="card__sub">Ask the business owner if you need access.</p>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <div className="fullpage">
      <div className="stack" style={{ textAlign: "center" }}>
        <h1>Page not found</h1>
        <Link to="/">Back to Overview</Link>
      </div>
    </div>
  );
}
