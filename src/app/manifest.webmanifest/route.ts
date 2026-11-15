export function GET() {
  const manifest = {
    name: "Adsvio Personal Assistant System",
    short_name: "Assistant",
    start_url: "/today",
    display: "standalone",
    background_color: "#FCFAF6",
    theme_color: "#E8590C",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json" } });
}
