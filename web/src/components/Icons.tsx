import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4.8 19 12 7.5 19.2Z" fill="currentColor" />
  </Svg>
);

export const IconPlayOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4.8 19 12 7.5 19.2Z" />
  </Svg>
);

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" strokeWidth={3.4} />
  </Svg>
);

export const IconSkipPrev = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 5v14" strokeWidth={3} />
    <path d="M19 5.8 10 12l9 6.2Z" fill="currentColor" />
  </Svg>
);

export const IconSkipNext = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 5v14" strokeWidth={3} />
    <path d="M5 5.8 14 12l-9 6.2Z" fill="currentColor" />
  </Svg>
);

export const IconRewind10 = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 0-2.5 5.8" />
    <path d="M4.5 3.5V8H9" />
    <text x="12" y="15.5" fontSize="8.5" fontWeight="800" fill="currentColor" stroke="none" textAnchor="middle">
      10
    </text>
  </Svg>
);

export const IconForward10 = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 1 2.5 5.8" />
    <path d="M19.5 3.5V8H15" />
    <text x="12" y="15.5" fontSize="8.5" fontWeight="800" fill="currentColor" stroke="none" textAnchor="middle">
      10
    </text>
  </Svg>
);

export const IconFullscreen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5L19.5 7" strokeWidth={3.2} />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5 7.5 12l7 7" strokeWidth={3} />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5 7 7-7 7" strokeWidth={3} />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M6.5 10.5 12 16l5.5-5.5M4.5 20h15" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconVideo = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="15" rx="2" />
    <path d="M3 9.5h18M8 5l2 4.5M13.5 5l2 4.5" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" fill="currentColor" stroke="none" />
    <path d="m4.5 17.5 4.5-4.5 3.5 3.5 3-3 4 4" />
  </Svg>
);

export const IconFileText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6Z" />
    <path d="M14 3v4h4M9.5 12.5h5M9.5 16h5" />
  </Svg>
);

export const IconAudio = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 17.5V6l10-2v11.5" />
    <circle cx="6.7" cy="17.5" r="2.8" />
    <circle cx="16.7" cy="15.5" r="2.8" />
  </Svg>
);

export const IconBrush = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12.5 11.5 8-8" strokeWidth={3} />
    <path d="M11 13c-2.2-.4-4.5 1-4.8 3.4-.2 1.3-1 2-2.2 2.3 1.6 1.6 5.2 2.6 7.3.6 1.6-1.5 1.3-4.2-.3-6.3Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPalette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 .3 18c1.6 0 2-1.1 1.3-2.2-.8-1.3.1-2.8 1.8-2.8h2.1A3.7 3.7 0 0 0 21 12.5C20.7 7 16.8 3 12 3Z" />
    <circle cx="8" cy="9" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="7" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="9.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="7.5" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v11h14V9M9.5 13.5h5" />
  </Svg>
);

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6Z" />
    <path d="M14 3v4h4" />
  </Svg>
);

export const IconPaperclip = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8.5 12.5 7-7a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a5.4 5.4 0 0 1-7.6-7.6L11 4.4" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M18.5 2.5v4.6H14" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20v-4L15.5 4.5a2.4 2.4 0 0 1 3.4 0l.6.6a2.4 2.4 0 0 1 0 3.4L8 20H4Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" strokeWidth={3} />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M6.5 9.5 12 4l5.5 5.5M4.5 20h15" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
  </Svg>
);

export const IconTypography = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <text x="12" y="16" fontSize="10" fontWeight="800" fill="currentColor" stroke="none" textAnchor="middle">
      Aa
    </text>
  </Svg>
);

/** Logo: A de Arte com um play no lugar do vão */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="14" fill="#8b5cf6" stroke="#05070c" strokeWidth="4" />
      <path
        d="M17 49 32 13 47 49"
        stroke="#fff"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M27.5 33.5v11.5l10.5-5.75Z" fill="#fff" />
    </svg>
  );
}
