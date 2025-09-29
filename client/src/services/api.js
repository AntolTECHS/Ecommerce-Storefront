// src/services/api.js
import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL
    ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")}/api`
    : "http://localhost:5000/api",
  withCredentials: true, // optional if you use cookies
});

// Safety: remove any default Content-Type that might interfere with FormData uploads
if (API.defaults.headers) {
  try {
    if (API.defaults.headers.post) delete API.defaults.headers.post["Content-Type"];
    if (API.defaults.headers.common) delete API.defaults.headers.common["Content-Type"];
  } catch (e) {
    /* ignore */
  }
}

// Dev helper to print FormData entries (only in development)
function logFormData(fd) {
  if (process.env.NODE_ENV !== "development") return;
  try {
    // Build a small preview (don't stringify blobs)
    const entries = [];
    for (const pair of fd.entries()) {
      const [k, v] = pair;
      if (v instanceof File) {
        entries.push({ key: k, filename: v.name, size: v.size, type: v.type });
      } else {
        entries.push({ key: k, value: String(v) });
      }
    }
    console.debug("[API] FormData entries:", entries);
  } catch (err) {
    console.debug("[API] Could not log FormData", err);
  }
}

// Request interceptor: if payload is FormData, remove Content-Type header so browser sets boundary
API.interceptors.request.use(
  (config) => {
    try {
      const data = config.data;
      // Detect FormData
      if (typeof FormData !== "undefined" && data instanceof FormData) {
        // Remove Content-Type so axios/browser will set multipart boundary correctly
        if (config.headers) {
          delete config.headers["Content-Type"];
          delete config.headers.common;
          // keep Authorization etc. intact
        }
        logFormData(data);
      }
    } catch (err) {
      // don't block request on logging errors
      console.debug("[API] request interceptor error:", err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor (simple logging for dev)
API.interceptors.response.use(
  (res) => {
    if (process.env.NODE_ENV === "development") {
      console.debug("[API] response:", { url: res.config?.url, status: res.status });
    }
    return res;
  },
  (err) => {
    if (process.env.NODE_ENV === "development") {
      console.error("[API] response error:", err?.response?.status, err?.response?.data || err.message);
    }
    return Promise.reject(err);
  }
);

export default API;
