import "bootstrap/dist/css/bootstrap.css";
import "~/app/globals.css";
import { Quicksand, Roboto } from "next/font/google";
import Providers from "~/app/components/Providers.tsx";
// Prevent server-side rendering bug with FA icons, where the icons flash as very large before full page load
import "@fortawesome/fontawesome-svg-core/styles.css";
// Prevent FA from adding its CSS since we did it manually above
import { config } from "@fortawesome/fontawesome-svg-core";
import Script from "next/script";

config.autoAddCss = false;

const quicksand = Quicksand();
const roboto = Roboto();

export const metadata = {
  title: {
    template: `%s | ${process.env.NEXT_PUBLIC_PROJECT_NAME}`,
    default: process.env.NEXT_PUBLIC_PROJECT_NAME,
  },
  description: process.env.METADATA_DESCRIPTION,
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL!),
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en" className={`${quicksand.className} ${roboto.className}`}>
      <head>
        {process.env.ANALYTICS_SCRIPT_SRC && <Script src={process.env.ANALYTICS_SCRIPT_SRC} />}
        {process.env.ANALYTICS_SCRIPT_CONTENT && (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: this is required
          <script dangerouslySetInnerHTML={{ __html: process.env.ANALYTICS_SCRIPT_CONTENT }} />
        )}
      </head>

      <Providers>{children}</Providers>
    </html>
  );
}
