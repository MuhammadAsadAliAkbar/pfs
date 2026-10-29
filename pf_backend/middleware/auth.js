const jwt = require("jsonwebtoken");
module.exports = (req, res, next) => {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: "Login required" });
  try {
    req.userId = jwt.verify(t, process.env.JWT_SECRET || "dev-secret").id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};
