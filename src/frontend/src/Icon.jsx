const paths = {
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M15 8V4H4v11h4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  key: (
    <>
      <circle cx="8" cy="9" r="4" />
      <path d="m11 12 8 8m-3-3 3-3m-6 0 3-3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  external: (
    <>
      <path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  inbox: (
    <>
      <path d="m5 5-3 9v5h20v-5l-3-9zM2 14h6l2 3h4l2-3h6" />
      <path d="M9 5h6" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  github: (
    <>
      <path d="M9 19c-5 2-5-3-7-3m14 6v-4a3 3 0 0 0-1-2c4 0 7-2 7-6a5 5 0 0 0-2-4 5 5 0 0 0 0-4s-2 0-4 2a14 14 0 0 0-8 0C6 2 4 2 4 2a5 5 0 0 0 0 4 5 5 0 0 0-2 4c0 4 3 6 7 6a3 3 0 0 0-1 2v4" />
    </>
  ),
};
export default function Icon({ name, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] ?? paths.mail}
    </svg>
  );
}
