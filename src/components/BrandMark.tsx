/**
 * App mark: the icon file itself, so the header, the browser tab and a
 * home-screen shortcut are the same drawing rather than three that have to be
 * kept in step. It is one small cached request, not bundle weight.
 */
export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon.svg`}
      alt="ChessPique"
      width={size}
      height={size}
      className="shrink-0"
    />
  )
}
