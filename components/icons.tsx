/**
 * One drawn icon set. 20x20 frame, 1.5 stroke, butt caps and mitre joins —
 * the vocabulary of a drawing pen, not a rounded UI kit.
 */
type IconProps = React.SVGProps<SVGSVGElement>;

function Frame({ children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconDatum(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="10" cy="10" r="6.25" />
      <path d="M10 1.5v4M10 14.5v4M1.5 10h4M14.5 10h4" />
    </Frame>
  );
}

export function IconArm(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.5 17.5h6M5.5 17.5V12l5-4.5V3.5" />
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="10.5" cy="7.5" r="1.6" />
      <path d="M8 3.5h5" />
    </Frame>
  );
}

export function IconTally(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.5 16.5V8M7.5 16.5V3.5M12.5 16.5v-6M17.5 16.5V6" />
    </Frame>
  );
}

export function IconLedger(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M3.5 2.5h13v15h-13z" />
      <path d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4" />
    </Frame>
  );
}

export function IconPolicy(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M10 2.2 17.3 6v8L10 17.8 2.7 14V6z" />
      <path d="M2.7 6 10 9.8 17.3 6M10 9.8v8" />
    </Frame>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M3.5 10.5 8 15l8.5-10" />
    </Frame>
  );
}

export function IconCross(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
    </Frame>
  );
}

export function IconArrow(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M3 10h14M12 5l5 5-5 5" />
    </Frame>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.5 5.5h15v11h-15z" />
      <path d="M2.5 5.5 13 2.8v2.7M13 11h3" />
    </Frame>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </Frame>
  );
}
