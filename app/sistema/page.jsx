"use client";

import dynamic from "next/dynamic";

/* El sistema de ventas es una aplicación de navegador de punta a punta: usa
   cámara, almacenamiento de sesión y consulta Supabase desde el cliente. Se
   carga sin renderizado en el servidor para que no intente ejecutarse allá. */
const SistemaVentas = dynamic(() => import("@/components/sistema-ventas"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f1ece0",
        color: "#8a8271",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      Cargando el sistema…
    </div>
  ),
});

export default function PaginaSistema() {
  return <SistemaVentas />;
}
