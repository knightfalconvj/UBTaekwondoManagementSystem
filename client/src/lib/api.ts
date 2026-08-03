import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

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
