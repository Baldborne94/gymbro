export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--surface)" />
      <g transform="rotate(-20 256 256)" fill="var(--accent)">
        <rect x="84" y="243" width="344" height="26" rx="13" />
        <rect x="128" y="180" width="38" height="152" rx="13" />
        <rect x="178" y="146" width="44" height="220" rx="15" />
        <rect x="290" y="146" width="44" height="220" rx="15" />
        <rect x="346" y="180" width="38" height="152" rx="13" />
      </g>
    </svg>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div className="logo" aria-label="GymBro">
      <LogoMark size={size} />
      <span className="logo-word" style={{ fontSize: size * 0.95 }} aria-hidden="true">
        GYM<em>BRO</em>
      </span>
    </div>
  );
}
