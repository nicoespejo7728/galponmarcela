import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://www.galponmarcela.cl"),
  title: {
    default: "El Galpón de Marcela — Almacén de barrio",
    template: "%s · El Galpón de Marcela",
  },
  description:
    "El Galpón de Marcela, tu almacén de barrio: frutas y verduras frescas, " +
    "bebidas, lácteos y despensa, cerca de ti.",
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "El Galpón de Marcela",
    images: ["/img/logo-galpon.png"],
  },
  icons: { icon: "/img/logo-galpon.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b2420",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
