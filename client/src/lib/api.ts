import axios from "axios";

const PROD_API_FALLBACK = "https://ubtkdmis-api.onrender.com/api";

export const API_BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? PROD_API_FALLBACK : "/api");

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ubtms_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
