import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import MarketingNav from "../../components/marketing/MarketingNav";
import Showcase from "../../components/marketing/Showcase";
import { HERO_IMAGE } from "../../components/marketing/landingImages";
import Faq from "../../components/marketing/Faq";
import { scrollToSection } from "../../components/marketing/scrollToSection";
import {
  BENEFITS,
  FEATURE_GROUPS,
  NAV_LINKS,
  PROBLEMS,
  STEPS,
} from "../../components/marketing/landingData";
import "../../styles/landing.css";

const TITLE = "Ledgerly – Run your business, understand every number";

export default function LandingPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  const go = (id) => (e) => {
    e.preventDefault();
    scrollToSection(id);
  };

  return (
    <div className="lp">
      <MarketingNav />

      <main>
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-container">
            <div className="lp-hero__top">
              <h1 id="hero-title">
                Run Your Business.
                <span className="lp-muted-line">Understand Every Number.</span>
              </h1>
              <div className="lp-hero__side">
                <p>
                  From tracking sales and managing inventory to monitoring
                  expenses and understanding business performance, Ledgerly
                  brings your business operations together in one place.
                </p>
                <div className="lp-hero__cta">
                  <Link to="/signup" className="lp-btn lp-btn--primary">
                    Get started
                  </Link>
                  <a
                    href="#features"
                    className="lp-btn lp-btn--secondary"
                    onClick={go("features")}
                  >
                    Explore features
                  </a>
                </div>
              </div>
            </div>

            <div className="lp-hero__preview">
              <figure className="lp-frame lp-frame--hero">
                <img
                  src={HERO_IMAGE.src}
                  width={HERO_IMAGE.w}
                  height={HERO_IMAGE.h}
                  alt="Ledgerly dashboard with revenue, expenses, net profit, orders and a sales chart"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              </figure>
            </div>
          </div>
        </section>

        <section className="lp-section" id="problems">
          <div className="lp-container lp-split">
            <div>
              <p className="lp-eyebrow">The problem</p>
              <h2>Running a business shouldn’t mean piecing it together</h2>
              <p className="lp-lead">
                Most small businesses start with whatever is at hand. It works
                until the records are spread across too many places to trust.
              </p>
            </div>
            <ol className="lp-problems">
              {PROBLEMS.map((p, i) => (
                <li key={p.title}>
                  <span className="lp-problems__n">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section--alt" id="features">
          <div className="lp-container">
            <header className="lp-head">
              <p className="lp-eyebrow">Features</p>
              <h2>Everything in one place, built for daily use</h2>
              <p className="lp-lead">
                Ledgerly covers the whole routine of a small business, from the
                first product you add to the report you read at month end.
              </p>
            </header>
            <div className="lp-features">
              {FEATURE_GROUPS.map((g) => {
                const Icon = g.icon;
                return (
                  <article key={g.title} className="lp-feature">
                    <div className="lp-feature__head">
                      <span className="lp-feature__icon">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <h3>{g.title}</h3>
                    </div>
                    <ul>
                      {g.items.map((item) => (
                        <li key={item}>
                          <Check size={16} aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-section" id="product">
          <div className="lp-container">
            <header className="lp-head">
              <p className="lp-eyebrow">The product</p>
              <h2>See Ledgerly at work</h2>
              <p className="lp-lead">
                This is the real application, not a mockup. Pick a screen to
                look closer.
              </p>
            </header>
            <Showcase />
          </div>
        </section>

        <section className="lp-section lp-section--alt" id="benefits">
          <div className="lp-container">
            <header className="lp-head">
              <p className="lp-eyebrow">Why Ledgerly</p>
              <h2>Clearer records, calmer decisions</h2>
            </header>
            <div className="lp-why">
              {BENEFITS.map((b) => (
                <div key={b.title} className="lp-why__item">
                  <h3>{b.title}</h3>
                  <p>{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="how-it-works">
          <div className="lp-container">
            <header className="lp-head">
              <p className="lp-eyebrow">How it works</p>
              <h2>Three steps to a clearer business</h2>
            </header>
            <ol className="lp-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="lp-step">
                  <span className="lp-step__n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section--alt" id="faq">
          <div className="lp-container">
            <header className="lp-head lp-head--center">
              <p className="lp-eyebrow">FAQ</p>
              <h2>Questions, answered</h2>
            </header>
            <Faq />
          </div>
        </section>

        <section className="lp-cta lp-container" aria-labelledby="cta-title">
          <div className="lp-cta__panel">
            <h2 id="cta-title">Take Control of Your Business Operations.</h2>
            <p>
              Bring your business records, sales, inventory and expenses
              together with Ledgerly.
            </p>
            <Link to="/signup" className="lp-btn lp-btn--light">
              Get started
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer__grid">
            <div>
              <Link to="/" className="lp-brand">
                <img src="/favicon-96x96.png" width="32" height="32" alt="" />
                <span className="lp-brand__name">LEDGERLY</span>
              </Link>
              <p>
                Business management for small businesses: sales, inventory,
                expenses, customers and reports in one place.
              </p>
            </div>
            <nav aria-label="Footer">
              {NAV_LINKS.map((l) => (
                <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>
                  {l.label}
                </a>
              ))}
              <Link to="/login">Login</Link>
              <Link to="/signup">Sign up</Link>
            </nav>
          </div>
          <p className="lp-footer__copy">
            © {new Date().getFullYear()} Ledgerly. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
