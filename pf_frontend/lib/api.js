const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
let token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

export const setToken = (t) => {
  token = t;
  if (typeof window === "undefined") return;
  t ? localStorage.setItem("token", t) : localStorage.removeItem("token");
};
export const getToken = () => token;

async function req(path, opts = {}) {
  const r = await fetch(BASE + "/api" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

export const api = {
  register: (b) => req("/auth/register", { method: "POST", body: b }),
  login: (b) => req("/auth/login", { method: "POST", body: b }),
  me: () => req("/auth/me"),
  filter: (image, filter, amount) => req("/image/filter", { method: "POST", body: { image, filter, amount } }),
  projects: () => req("/projects"),
  project: (id) => req("/projects/" + id),
  create: (b) => req("/projects", { method: "POST", body: b }),
  update: (id, b) => req("/projects/" + id, { method: "PUT", body: b }),
  remove: (id) => req("/projects/" + id, { method: "DELETE" }),
};
