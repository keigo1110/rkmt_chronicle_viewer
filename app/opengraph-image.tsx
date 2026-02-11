import { ImageResponse } from "next/og";
import { SITE_NAME } from "./site";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  const ogSubtitle =
    "Browse an ultra high-resolution timeline image with Deep Zoom and jump to matched text regions using OCR search.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          color: "#eff2f8",
          background:
            "radial-gradient(900px 420px at 12% 0%, rgba(65, 98, 170, 0.7) 0%, transparent 60%), linear-gradient(160deg, #0f1119 0%, #151923 50%, #090a0f 100%)"
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 1.2,
            opacity: 0.95
          }}
        >
          Deep Zoom + OCR Search
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "90%" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{SITE_NAME}</div>
          <div style={{ fontSize: 30, color: "#cbd7ef", lineHeight: 1.35 }}>{ogSubtitle}</div>
        </div>
        <div style={{ fontSize: 24, color: "#8be6ff" }}>Fast timeline navigation for large images</div>
      </div>
    ),
    size
  );
}
