/** A QR code drawn from `qrCode()` output. Always dark on white, whatever the theme: scanners need it. */
export function QrCode({
  size,
  path,
  label,
  className,
}: {
  size: number;
  path: string;
  label: string;
  className?: string;
}) {
  const quietZone = 2;
  const box = size + quietZone * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-quietZone} ${-quietZone} ${box} ${box}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x={-quietZone} y={-quietZone} width={box} height={box} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
