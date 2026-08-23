import "./sistema.css";
import RegistrarSW from "./registrar-sw";

export const metadata = {
  title: "Sistema de ventas",
  description: "Punto de venta e inventario de El Galpón de Marcela.",
  // El sistema interno no debe aparecer en los buscadores.
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#1d4d33",
  // El sistema se usa con el dedo en un teléfono: que un doble toque no
  // acerque la pantalla en medio de un cobro.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LayoutSistema({ children }) {
  return (
    <>
      <RegistrarSW />
      {children}
    </>
  );
}
