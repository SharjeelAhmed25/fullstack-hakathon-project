import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { requireAuth } from "./middleware.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  designation: user.designation,
  passwordChangeRequired: user.passwordChangeRequired
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password || email.trim().length > 254 || password.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ message: "Email and password are required." });
  }
  const user = await User.findOne({ email: email.trim().toLowerCase(), isActive: { $ne: false } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }
  const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || currentPassword.length > 128 || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ message: "Current password and a new password of at least 8 characters are required." });
  }
  if (!(await bcrypt.compare(currentPassword, req.user.password))) {
    return res.status(400).json({ message: "Current password is incorrect." });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "Choose a new password different from your current password." });
  }
  req.user.password = await bcrypt.hash(newPassword, 12);
  req.user.passwordChangeRequired = false;
  await req.user.save();
  res.json({ message: "Password updated successfully." });
});

export { publicUser };
export default router;
