export default function LogoMark({ size = "1.75rem", className = "" }) {
  return (
    <svg
      viewBox="245 250 545 525"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path
        d="M262 392 L510 266 L764 392 L510 515 L262 408 Z"
        strokeWidth="30"
      />
      <rect x="245" y="392" width="46" height="250" rx="18" stroke="none" />
      <path d="M280 508 L510 620 L752 504" fill="none" strokeWidth="56" />
      <path d="M272 626 L510 744 L752 628" fill="none" strokeWidth="56" />
    </svg>
  );
}
