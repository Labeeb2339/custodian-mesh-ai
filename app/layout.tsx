import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CustodianMesh AI | Federated decision-support demo",
  description:
    "A deterministic, synthetic demonstration of policy-gated analytics across agency-owned agriculture, energy, and biodiversity nodes.",
  applicationName: "CustodianMesh AI",
  keywords: [
    "federated analytics",
    "responsible AI",
    "data custodianship",
    "policy enforcement",
  ],
  openGraph: {
    title: "CustodianMesh AI",
    description:
      "Policy-gated analytics across synthetic agriculture, energy, and biodiversity custodians.",
    type: "website",
    images: [
      {
        url: "/custodian-mesh-social.png",
        width: 1731,
        height: 909,
        alt: "Three independent data custodians connected through a central policy gateway",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CustodianMesh AI",
    description:
      "A deterministic, aggregate-only federated decision-support demo.",
    images: ["/custodian-mesh-social.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#07130f",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
