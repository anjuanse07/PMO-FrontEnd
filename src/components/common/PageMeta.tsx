import { HelmetProvider, Helmet } from "react-helmet-async";

// The browser tab title is intentionally fixed and does NOT use the `title`
// prop below - every page still passes its own `title` (kept in the type
// so none of the ~15+ call sites across the app need to change), but it's
// no longer rendered into <title>, so the tab stays "PMO - EG1 | SJL" no
// matter which page you're on instead of changing on every navigation.
const APP_TITLE = "PMO - EG1 | SJL";

const PageMeta = ({
  // title,
  description,
}: {
  // title: string;
  description: string;
}) => (
  <Helmet>
    <title>{APP_TITLE}</title>
    <meta name="description" content={description} />
  </Helmet>
);

export const AppWrapper = ({ children }: { children: React.ReactNode }) => (
  <HelmetProvider>{children}</HelmetProvider>
);

export default PageMeta;
