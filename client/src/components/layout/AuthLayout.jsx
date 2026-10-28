import { ThemeIconButton } from "../ui/ThemeToggle";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <div className="auth__theme">
        <ThemeIconButton />
      </div>
      <div className="auth__panel">
        <div className="auth__brand">
          <span className="wordmark">LEDGERLY</span>
        </div>
        <div className="card auth__card">
          <div className="auth__head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <p className="auth__footer">{footer}</p>}
      </div>
    </div>
  );
}
