// One-time first-admin claim screen — not content, keep it out of the index.
export const metadata = {
  robots: { index: false, follow: false }
};

export default function SetupLayout({ children }) {
  return <>{children}</>;
}
