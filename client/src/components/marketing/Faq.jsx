import { ChevronDown } from "lucide-react";
import { FAQS } from "./landingData";

export default function Faq() {
  return (
    <div className="lp-faq">
      {FAQS.map((f) => (
        <details key={f.q} name="lp-faq">
          <summary>
            <span>{f.q}</span>
            <ChevronDown size={20} aria-hidden="true" />
          </summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}
