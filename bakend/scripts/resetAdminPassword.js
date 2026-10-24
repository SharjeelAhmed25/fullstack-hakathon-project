import "dotenv/config";
import dns from "node:dns";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/user.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const email = process.argv[2]?.trim().toLowerCase();
const uri = process.env.MONGODB_URI;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run reset:admin-password -- admin@example.com");
  process.exitCode = 1;
} else if (!uri) {
  console.error("MONGODB_URI is missing from bakend/.env.");
  process.exitCode = 1;
} else {
  let host;
  try {
    host = new URL(uri.replace(/^mongodb\+srv:\/\//, "https://").replace(/^mongodb:\/\//, "http://")).hostname;
  } catch {
    console.error("MONGODB_URI is not a valid MongoDB connection string.");
    process.exitCode = 1;
  }

  if (host && !host.endsWith(".mongodb.net")) {
    console.error("Password reset is restricted to the configured MongoDB Atlas cluster.");
    process.exitCode = 1;
  } else if (host) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
      const user = await User.findOne({ email, role: "ADMIN" });
      if (!user) {
        console.error("No Admin account matches that email. No changes were made.");
        process.exitCode = 1;
      } else if (user.isActive === false) {
        console.error("That Admin account is inactive. No changes were made.");
        process.exitCode = 1;
      } else {
        const temporaryPassword = randomBytes(24).toString("base64url");
        user.password = await bcrypt.hash(temporaryPassword, 12);
        user.passwordChangeRequired = true;
        await user.save();
        console.log(`Temporary password for ${user.email}: ${temporaryPassword}`);
        console.log("Sign in with it once, then choose a new password when prompted.");
      }
    } catch (error) {
      console.error(`Admin password reset failed; no password was printed. ${error.message}`);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  }
}
