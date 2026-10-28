import PageHeader from "../components/layout/PageHeader";

export default function Placeholder({ title, subtitle, step }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <section className="card empty">
        <h2 className="card__title">
          {title} is built in Step {step}
        </h2>
        <p className="card__sub">
          The layout, navigation and theme are already in place.
        </p>
      </section>
    </>
  );
}
