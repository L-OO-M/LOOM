// Auth screens are functional, not content — keep them out of the index.
export const metadata = {
  robots: { index: false, follow: false }
};

export default function AuthLayout({ children }) {
  return <>{children}</>;
}
