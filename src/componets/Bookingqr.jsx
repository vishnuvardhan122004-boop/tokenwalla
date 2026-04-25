import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";


// Install if not already: npm install qrcode.react

export default function BookingQR({
  token,
  doctorName,
  hospital,
  date,
  slot,
  variant = "button", // "button" = show/hide toggle | "inline" = always visible
}) {
  const [show, setShow] = useState(variant === "inline");

  if (!token) return null;

  const qrValue = JSON.stringify({
    token_code:  token,
    doctor_name: doctorName,
    hospital:    hospital,
    date:        date,
    slot:        slot,
  });

  return (
    <div>
      {variant === "button" && (
        <button
          onClick={() => setShow(p => !p)}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            6,
            background:     show ? "var(--blue-50, #EFF6FF)" : "#fff",
            border:         "1px solid var(--blue-200, #BFDBFE)",
            borderRadius:   9,
            padding:        "8px 16px",
            fontSize:       13,
            fontWeight:     600,
            color:          "var(--blue-700, #1D4ED8)",
            cursor:         "pointer",
            transition:     "all 0.15s",
            fontFamily:     "inherit",
          }}
        >
          ⬛ {show ? "Hide QR" : "Show QR"}
        </button>
      )}

      {show && (
        <div style={{
          marginTop:     12,
          background:    "#fff",
          border:        "1px solid var(--blue-100, #DBEAFE)",
          borderRadius:  16,
          padding:       20,
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           12,
          boxShadow:     "0 2px 12px rgba(0,0,0,0.06)",
        }}>

          {/* QR Code */}
          <div style={{
            padding:      12,
            background:   "#fff",
            borderRadius: 12,
            border:       "1px solid var(--blue-100, #DBEAFE)",
            boxShadow:    "0 1px 6px rgba(0,0,0,0.06)",
          }}>
            <QRCodeSVG
              value={qrValue}
              size={160}
              bgColor="#ffffff"
              fgColor="#111827"
              level="M"
            />
          </div>

          {/* Token code */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
              Token
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--blue-600, #2563EB)", letterSpacing: 3, fontFamily: "monospace" }}>
              {token}
            </div>
          </div>

          {/* Booking details */}
          <div style={{
            width:        "100%",
            borderTop:    "1px solid #F3F4F6",
            paddingTop:   12,
            display:      "flex",
            flexDirection:"column",
            gap:          6,
          }}>
            {[
              { label: "Doctor",   value: `Dr. ${doctorName}` },
              { label: "Hospital", value: hospital             },
              { label: "Date",     value: date                 },
              { label: "Slot",     value: slot                 },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#6B7280" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "#111827", textAlign: "right", maxWidth: "60%" }}>{value || "—"}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", margin: 0 }}>
            Show this QR at hospital reception
          </p>
        </div>
      )}
    </div>
  );
}