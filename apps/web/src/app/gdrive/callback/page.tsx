"use client";

import { useEffect } from "react";

export default function GDriveCallback() {
  useEffect(() => {
    // Extract access_token from URL hash (implicit flow)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");

    if (token) {
      // Send token to the opener window and close
      if (window.opener) {
        window.opener.postMessage({ type: "gdrive_token", token }, window.location.origin);
        window.close();
      } else {
        // Fallback: store in localStorage and redirect
        localStorage.setItem("gdrive_token", token);
        window.location.href = "/";
      }
    } else {
      // Error — close the popup
      if (window.opener) {
        window.opener.postMessage({ type: "gdrive_error", error: "No token received" }, window.location.origin);
        window.close();
      }
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="text-center">
        <div className="text-4xl mb-4">🟢</div>
        <p className="text-gray-600 text-sm">Connecting Google Drive...</p>
        <p className="text-gray-400 text-xs mt-2">This window will close automatically.</p>
      </div>
    </div>
  );
}
