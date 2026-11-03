"use client";

// Last-resort error screen (replaces the whole page, so it carries its own <html> and styles).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F7F8FB", color: "#080B18" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 340 }}>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ margin: "0 0 24px", color: "#4A5164", fontSize: 15 }}>Check your internet connection and try again.</p>
            <button
              onClick={() => reset()}
              style={{ width: "100%", border: 0, borderRadius: 12, background: "#2952E3", color: "#fff", fontSize: 16, fontWeight: 600, padding: "13px 28px" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
