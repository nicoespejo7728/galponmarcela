import "./sistema.css";

export const metadata = {
  title: "Sistema de ventas",
  description: "Punto de venta e inventario de El Galpón de Marcela.",
  // El sistema interno no debe aparecer en los buscadores.
  robots: { index: false, follow: false },
};

export default function LayoutSistema({ children }) {
  return children;
}
