import express from "express";
import bcrypt from "bcryptjs";
import Settings from "../models/setting.js";
import User from "../models/user.js";

const router = express.Router();

router.get("/status", async (_req, res) => {
  const settings = await Settings.findOne().select("isSetupDone companyName");
  res.json({ isSetupDone: Boolean(settings?.isSetupDone), companyName: settings?.companyName || "" });
});

router.post("/", async (req, res) => {
  const { companyName, adminName, adminEmail, adminPassword, officeStart, graceMinutes } = req.body;
  if (![companyName, adminName, adminEmail, adminPassword].every((value) => typeof value === "string" && value.trim())) {
    return res.status(400).json({ message: "Company name, admin name, email and password are required." });
  }
  if (adminPassword.length < 8) {
    return res.status(400).json({ message: "Admin password must be at least 8 characters." });
  }
  if (adminPassword.length > 128 || companyName.trim().length > 120 || adminName.trim().length > 120) {
    return res.status(400).json({ message: "Names must be 120 characters or fewer and passwords 128 characters or fewer." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()) || adminEmail.trim().length > 254) {
    return res.status(400).json({ message: "Enter a valid email address of 254 characters or fewer." });
  }
  if (officeStart !== undefined && (typeof officeStart !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(officeStart))) {
    return res.status(400).json({ message: "Office start must use HH:mm format." });
  }
  if (graceMinutes !== undefined && ((typeof graceMinutes !== "number" && (typeof graceMinutes !== "string" || !graceMinutes.trim())) || !Number.isInteger(Number(graceMinutes)) || Number(graceMinutes) < 0 || Number(graceMinutes) > 240)) {
    return res.status(400).json({ message: "Grace time must be between 0 and 240 minutes." });
  }
  if (await Settings.exists({ isSetupDone: true })) {
    return res.status(409).json({ message: "System is already set up." });
  }

  const settings = await Settings.create({
    companyName: companyName.trim(),
    officeStart: officeStart || "09:00",
    graceMinutes: graceMinutes === undefined ? 15 : Number(graceMinutes),
    isSetupDone: false
  });
  let admin;
  try {
    admin = await User.create({
      name: adminName.trim(),
      email: adminEmail.trim().toLowerCase(),
      password: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN"
    });
    settings.isSetupDone = true;
    await settings.save();
    res.status(201).json({ message: "Company setup complete. You can now sign in.", userId: admin._id });
  } catch (error) {
    if (admin) await User.deleteOne({ _id: admin._id });
    await Settings.deleteOne({ _id: settings._id });
    throw error;
  }
});

export default router;
