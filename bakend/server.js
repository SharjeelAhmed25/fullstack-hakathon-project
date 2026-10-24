import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import dns from "dns";
import cors from "cors";
import setupRoutes from "./routes/setupRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import appRoutes from "./routes/appRoutes.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
const app = express();
const port = Number(process.env.PORT) || 3000;
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/setup", setupRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", appRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 11000) {
    return res.status(409).json({ message: "An account with this email already exists." });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }
  return res.status(error.status || 500).json({
    message: error.status ? error.message : "An unexpected server error occurred."
  });
});

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required. Add your MongoDB connection string to bakend/.env.");
  }
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required. Add a private signing key to bakend/.env.");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected successfully");
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
});
