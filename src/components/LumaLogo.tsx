const VH = 28;
const ICON_SIZE = 20;

interface LumaLogoProps {
  scale?: number;
  showWordmark?: boolean;
}

export function LumaLogo({ scale = 1, showWordmark = true }: LumaLogoProps) {
  const vw = showWordmark ? 130 : ICON_SIZE;
  return (
    <svg
      width={vw * scale}
      height={VH * scale}
      viewBox={`0 0 ${vw} ${VH}`}
      fill="none"
    >
      <rect x={1} y={5} width={18} height={18} rx={5} fill="#2A2825" />
      <path d="M6.5 9.5V18.5H13V16H9.5V9.5H6.5Z" fill="#E8803A" />
      <path d="M13 10.5C15.3 10.5 17.2 12.4 17.2 14.7C17.2 17 15.3 18.9 13 18.9" stroke="#E8803A" strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <circle cx={13} cy={18.9} r={1.1} fill="#4A4640" />
      {showWordmark && (
        <text
          x={28}
          y={20}
          fontFamily="Outfit"
          fontSize={17}
          fontWeight={700}
          fill="currentColor"
          letterSpacing="-0.025em"
        >
          Luma
        </text>
      )}
    </svg>
  );
}

export function LumaLogoIcon() {
  const size = 32;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <rect width={size} height={size} fill="var(--bg-root)" rx={4} />
      <rect x={6} y={6} width={20} height={20} rx={6} fill="#2A2825" />
      <path d="M11 10.5V21.5H18.2V18.7H14.1V10.5H11Z" fill="#E8803A" />
      <path d="M18.3 12C21 12 23 14 23 16.7C23 19.4 21 21.4 18.3 21.4" stroke="#E8803A" strokeWidth={2} strokeLinecap="round" fill="none" />
      <circle cx={18.3} cy={21.4} r={1.2} fill="#4A4640" />
    </svg>
  );
}
