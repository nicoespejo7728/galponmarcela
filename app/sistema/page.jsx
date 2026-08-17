"use client";

import dynamic from "next/dynamic";

/* El sistema de ventas es una aplicación de navegador de punta a punta: usa
   cámara, almacenamiento de sesión y consulta Supabase desde el cliente. Se
   carga sin renderizado en el servidor para que no intente ejecutarse allá. */
const SistemaVentas = dynamic(() => import("@/components/sistema-ventas"), {
  ssr: false,
  loading: () => <Aviso>Cargando el sistema…</Aviso>,
});

function Aviso({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f1ece0",
        color: "#8a8271",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 14,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

/* Sin las claves de Supabase el sistema no puede hacer nada. En vez de mostrar
   una pantalla de ingreso que falla en silencio al primer intento, se dice qué
   falta y dónde cargarlo. Next.js reemplaza estas variables al compilar, así
   que alcanza con mirarlas acá. */
const FALTA_CONFIGURACION =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function PaginaSistema() {
  if (FALTA_CONFIGURACION) {
    return (
      <Aviso>
        <div style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#1b2420", marginBottom: 10 }}>
            El sistema todavía no está conectado
          </div>
          <p style={{ margin: "0 0 14px", lineHeight: 1.6 }}>
            Faltan las claves de la base de datos. Se cargan en Vercel, en
            Settings → Environment Variables, y después hay que volver a
            desplegar para que tomen efecto.
          </p>
          <div
            style={{
              background: "#fff",
              border: "1.5px solid #d9cfb8",
              borderRadius: 8,
              padding: "12px 14px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12.5,
              color: "#2a352f",
              textAlign: "left",
              lineHeight: 1.9,
            }}
          >
            NEXT_PUBLIC_SUPABASE_URL
            <br />
            NEXT_PUBLIC_SUPABASE_ANON_KEY
            <br />
            SUPABASE_SERVICE_ROLE_KEY
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 12.5 }}>
            El sitio del almacén funciona igual mientras tanto.
          </p>
        </div>
      </Aviso>
    );
  }

  return <SistemaVentas />;
}
