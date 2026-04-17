const VH = 30;
const ICON_SIZE = 22;

interface LumaLogoProps {
  scale?: number;
  showWordmark?: boolean;
}

export function LumaLogo({ scale = 1, showWordmark = true }: LumaLogoProps) {
  const vw = showWordmark ? 138 : ICON_SIZE;
  return (
    <svg
      width={vw * scale}
      height={VH * scale}
      viewBox={`0 0 ${vw} ${VH}`}
      fill="none"
    >
      <rect x={1} y={4} width={20} height={20} rx={6} fill="#2A2825" />
      <path d="M7 9.2V19.2H14.5V16.7H9.8V9.2H7Z" fill="#E8803A" />
      <path d="M14.6 10.5C17.1 10.5 19.1 12.5 19.1 15C19.1 17.5 17.1 19.5 14.6 19.5" stroke="#E8803A" strokeWidth={2} strokeLinecap="round" fill="none" />
      <circle cx={14.6} cy={19.5} r={1.15} fill="#4A4640" />
      {showWordmark && (
        <text
          x={31}
          y={21}
          fontFamily="Outfit"
          fontSize={18}
          fontWeight={800}
          fill="currentColor"
          letterSpacing="-0.03em"
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
