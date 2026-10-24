import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Attendance from "../models/attendance.js";
import AttendanceCorrection from "../models/attendanceCorrection.js";
import Announcement from "../models/announcement.js";
import AiLog from "../models/aiLog.js";
import AuditLog from "../models/auditLog.js";
import LeaveRequest from "../models/leaveRequest.js";
import Notification from "../models/notification.js";
import PayrollRun from "../models/payrollRun.js";
import Settings from "../models/setting.js";
import User from "../models/user.js";
import { escapeCsv, parseCsv } from "../utils/csv.js";
import { allowRoles, audit, requireAuth } from "./middleware.js";
import { publicUser } from "./authRoutes.js";

const router = express.Router();
router.use(requireAuth);
const OFFICE_TIME_ZONE = process.env.OFFICE_TIME_ZONE || "Asia/Karachi";

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function isNumericInput(value) {
  return (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value));
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function officeDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function officeMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function datesBetween(start, end, weekend = ["Saturday", "Sunday"], holidays = []) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (cursor > last) fail(400, "End date must be on or after the start date.");
  if ((last - cursor) / 86400000 > 366) fail(400, "Date range cannot exceed one year.");
  while (cursor <= last) {
    const day = cursor.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const isoDate = cursor.toISOString().slice(0, 10);
    if (!weekend.includes(day) && !holidays.includes(isoDate)) dates.push(isoDate);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function createNotification(user, title, body, type, link = "") {
  await Notification.create({ user, title, body, type, link });
}

async function notifyRoles(roles, title, body, type, link = "") {
  const users = await User.find({ role: { $in: roles }, isActive: { $ne: false } }).select("_id");
  if (users.length) await Notification.insertMany(users.map(({ _id }) => ({ user: _id, title, body, type, link })));
}

async function notifyUserIds(userIds, title, body, type, link = "") {
  const uniqueIds = [...new Set(userIds.map((id) => id.toString()))];
  if (uniqueIds.length) await Notification.insertMany(uniqueIds.map((user) => ({ user, title, body, type, link })));
}

async function writeAiLog(user, action, outcome, inputLength, provider = "local") {
  await AiLog.create({ user: user._id, action, outcome, inputLength, provider });
}

async function aiCompletion(messages, maxTokens = 250) {
  if (!process.env.AI_API_KEY) return null;
  const endpoint = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.AI_MODEL || "gpt-4o-mini", messages, temperature: 0.2, max_tokens: maxTokens }),
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`AI provider returned HTTP ${response.status}.`);
      error.status = 502;
      throw error;
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("AI provider returned an empty response.");
    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function taxForAnnualGross(annualGross) {
  if (annualGross <= 600000) return 0;
  if (annualGross <= 1200000) return (annualGross - 600000) * 0.05;
  if (annualGross <= 2400000) return 30000 + (annualGross - 1200000) * 0.15;
  if (annualGross <= 3600000) return 210000 + (annualGross - 2400000) * 0.25;
  return 510000 + (annualGross - 3600000) * 0.35;
}

router.get("/settings", allowRoles("ADMIN", "HR"), async (_req, res) => {
  const settings = await Settings.findOne({ isSetupDone: true });
  res.json({ settings });
});

router.patch("/settings", allowRoles("ADMIN"), async (req, res) => {
  const fields = ["companyName", "officeStart", "graceMinutes", "weekend", "officeLatitude", "officeLongitude", "officeRadius", "departments", "leavePolicies", "publicHolidays"];
  const updates = {};
  for (const field of fields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.companyName !== undefined && (typeof updates.companyName !== "string" || !updates.companyName.trim() || updates.companyName.trim().length > 120)) fail(400, "Company name must be between 1 and 120 characters.");
  if (updates.companyName !== undefined) updates.companyName = updates.companyName.trim();
  if (updates.officeStart !== undefined && (typeof updates.officeStart !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(updates.officeStart))) fail(400, "Office start must use HH:mm format.");
  if (updates.graceMinutes !== undefined && (!isNumericInput(updates.graceMinutes) || !Number.isInteger(Number(updates.graceMinutes)) || Number(updates.graceMinutes) < 0 || Number(updates.graceMinutes) > 240)) fail(400, "Grace time must be between 0 and 240 minutes.");
  if (updates.weekend !== undefined && (!Array.isArray(updates.weekend) || updates.weekend.length > 6 || updates.weekend.some((day) => !["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(day)) || new Set(updates.weekend).size !== updates.weekend.length)) fail(400, "Weekend must contain unique valid weekday names.");
  if (updates.officeRadius !== undefined && (!isNumericInput(updates.officeRadius) || Number(updates.officeRadius) < 1 || Number(updates.officeRadius) > 100000)) fail(400, "Office radius must be between 1 and 100000 metres.");
  if (updates.departments !== undefined && (!Array.isArray(updates.departments) || updates.departments.length > 100 || updates.departments.some((name) => typeof name !== "string" || !name.trim() || name.trim().length > 80) || new Set(updates.departments.map((name) => typeof name === "string" ? name.trim().toLowerCase() : "")).size !== updates.departments.length)) fail(400, "Departments must be a list of up to 100 unique non-empty names.");
  if (updates.leavePolicies !== undefined && (!Array.isArray(updates.leavePolicies) || updates.leavePolicies.length < 1 || updates.leavePolicies.length > 20 || updates.leavePolicies.some((policy) => !policy || typeof policy.type !== "string" || !/^[A-Z][A-Z0-9_]{1,29}$/.test(policy.type.toUpperCase()) || !isNumericInput(policy.annualQuota) || Number(policy.annualQuota) < 0 || Number(policy.annualQuota) > 366 || typeof policy.paid !== "boolean") || new Set(updates.leavePolicies.map((policy) => policy.type.toUpperCase())).size !== updates.leavePolicies.length)) fail(400, "Leave policies need unique types and quotas between 0 and 366 days.");
  if (updates.publicHolidays !== undefined && (!Array.isArray(updates.publicHolidays) || updates.publicHolidays.length > 250 || updates.publicHolidays.some((holiday) => !holiday || typeof holiday.name !== "string" || !holiday.name.trim() || holiday.name.trim().length > 120 || !validDate(holiday.date)) || new Set(updates.publicHolidays.map((holiday) => holiday?.date)).size !== updates.publicHolidays.length)) fail(400, "Public holidays need unique dates, a name of at most 120 characters, and valid YYYY-MM-DD dates.");
  for (const field of ["officeLatitude", "officeLongitude"]) {
    if (updates[field] !== undefined && updates[field] !== null && (!isNumericInput(updates[field]) || Number(updates[field]) < (field === "officeLatitude" ? -90 : -180) || Number(updates[field]) > (field === "officeLatitude" ? 90 : 180))) fail(400, `${field} is invalid.`);
    if (updates[field] !== undefined && updates[field] !== null) updates[field] = Number(updates[field]);
  }
  if (updates.graceMinutes !== undefined) updates.graceMinutes = Number(updates.graceMinutes);
  if (updates.officeRadius !== undefined) updates.officeRadius = Number(updates.officeRadius);
  const settings = await Settings.findOne({ isSetupDone: true });
  if (!settings) fail(404, "Company setup has not been completed.");
  const before = Object.fromEntries(Object.keys(updates).map((field) => [field, settings[field]]));
  Object.assign(settings, updates);
  await settings.save();
  await audit(req.user, "settings.updated", "settings", settings._id, { before, after: updates });
  res.json({ settings });
});

router.get("/departments", allowRoles("ADMIN", "HR"), async (_req, res) => {
  const settings = await Settings.findOne({ isSetupDone: true }).select("departments leavePolicies publicHolidays");
  res.json({
    departments: settings?.departments || [],
    leavePolicies: settings?.leavePolicies || [],
    publicHolidays: settings?.publicHolidays || []
  });
});

router.post("/departments", allowRoles("ADMIN"), async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 80) fail(400, "Department name must be 1 to 80 characters.");
  const settings = await Settings.findOne({ isSetupDone: true });
  if (!settings) fail(404, "Company setup has not been completed.");
  if (settings.departments.some((department) => department.toLowerCase() === name.toLowerCase())) fail(409, "That department already exists.");
  settings.departments.push(name);
  await settings.save();
  await audit(req.user, "department.created", "department", name);
  res.status(201).json({ departments: settings.departments });
});

router.delete("/departments/:name", allowRoles("ADMIN"), async (req, res) => {
  const name = decodeURIComponent(req.params.name).trim();
  const settings = await Settings.findOne({ isSetupDone: true });
  if (!settings || !settings.departments.includes(name)) fail(404, "Department was not found.");
  if (await User.exists({ department: name, isActive: { $ne: false } })) fail(409, "Move active team members to another department before removing this one.");
  settings.departments = settings.departments.filter((department) => department !== name);
  await settings.save();
  await audit(req.user, "department.deleted", "department", name);
  res.json({ departments: settings.departments });
});

router.get("/users", async (req, res) => {
  if (req.user.role === "EMPLOYEE") {
    return res.json({ users: [publicUser(req.user)] });
  }
  const query = { role: { $ne: "ADMIN" } };
  if (req.user.role === "HR") query.isActive = { $ne: false };
  if (req.query.search) {
    const safe = String(req.query.search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [{ name: new RegExp(safe, "i") }, { email: new RegExp(safe, "i") }, { department: new RegExp(safe, "i") }];
  }
  if (req.query.department) query.department = String(req.query.department).slice(0, 80);
  const users = await User.find(query).select("-password").sort({ name: 1 }).limit(200);
  res.json({ users });
});

function validateEmployeeRows(rows, settings, existingEmails = new Set(), existingCodes = new Set()) {
  const seenEmails = new Set();
  const seenCodes = new Set();
  return rows.map(({ rowNumber, values }) => {
    const errors = [];
    const name = values.name || "";
    const email = (values.email || "").toLowerCase();
    const department = values.department || "";
    const code = (values.employeeCode || "").trim();
    const salary = Number(values.basicSalary);
    if (!name || name.length > 120) errors.push({ field: "name", reason: "Required; 120 characters maximum." });
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: "email", reason: "A valid email address of at most 254 characters is required." });
    else if (existingEmails.has(email) || seenEmails.has(email)) errors.push({ field: "email", reason: "This email is already in use." });
    if (!department || !settings.departments.some((known) => known.toLowerCase() === department.toLowerCase())) errors.push({ field: "department", reason: "Choose a known company department." });
    if (!values.designation || values.designation.length > 120) errors.push({ field: "designation", reason: "A job title of at most 120 characters is required." });
    if (!Number.isFinite(salary) || salary <= 0) errors.push({ field: "basicSalary", reason: "Salary must be greater than zero." });
    if (!values.password || values.password.length < 8 || values.password.length > 128) errors.push({ field: "password", reason: "Temporary password must contain 8 to 128 characters." });
    if (code && (existingCodes.has(code.toLowerCase()) || seenCodes.has(code.toLowerCase()))) errors.push({ field: "employeeCode", reason: "This employee code is already in use." });
    if (values.joinedAt && !validDate(values.joinedAt)) errors.push({ field: "joinedAt", reason: "Join date must use a real YYYY-MM-DD date." });
    if (!errors.some(({ field }) => field === "email")) seenEmails.add(email);
    if (code) seenCodes.add(code.toLowerCase());
    return { rowNumber, values: { ...values, email, employeeCode: code }, errors };
  });
}

async function prepareEmployeeCsv(text) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch (error) {
    fail(400, error.message);
  }
  const settings = await Settings.findOne({ isSetupDone: true }).select("departments");
  if (!settings) fail(404, "Company setup has not been completed.");
  const emails = rows.map(({ values }) => String(values.email || "").trim().toLowerCase()).filter(Boolean);
  const codes = rows.map(({ values }) => String(values.employeeCode || "").trim()).filter(Boolean);
  const [existingUsers, existingCodeUsers] = await Promise.all([
    User.find({ email: { $in: emails } }).select("email"),
    codes.length ? User.find({ employeeCode: { $in: codes } }).select("employeeCode") : []
  ]);
  return validateEmployeeRows(
    rows, settings,
    new Set(existingUsers.map((user) => user.email.toLowerCase())),
    new Set(existingCodeUsers.map((user) => user.employeeCode.toLowerCase()))
  ).map((row) => {
    const department = settings.departments.find((name) => name.toLowerCase() === row.values.department.toLowerCase());
    return { ...row, values: { ...row.values, department: department || row.values.department } };
  });
}

router.get("/users/csv/template", allowRoles("ADMIN", "HR"), (_req, res) => {
  const headers = ["name", "email", "department", "designation", "basicSalary", "employeeCode", "joinedAt", "password"];
  res.type("text/csv").attachment("hcm-employees-template.csv").send(`${headers.join(",")}\r\n`);
});

router.get("/users/csv/export", allowRoles("ADMIN", "HR"), async (_req, res) => {
  const users = await User.find({ role: "EMPLOYEE" }).select("-password").sort({ name: 1 });
  const headers = ["name", "email", "department", "designation", "basicSalary", "employeeCode", "joinedAt", "isActive"];
  const lines = users.map((user) => [
    user.name, user.email, user.department, user.designation, user.basicSalary,
    user.employeeCode || "", user.joinedAt?.toISOString().slice(0, 10) || "", user.isActive
  ].map(escapeCsv).join(","));
  res.type("text/csv").attachment("hcm-employees.csv").send([headers.join(","), ...lines].join("\r\n"));
});

router.post("/users/csv/dry-run", allowRoles("HR"), express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }), async (req, res) => {
  const rows = await prepareEmployeeCsv(req.body);
  const errors = rows.flatMap((row) => row.errors.map((error) => ({ row: row.rowNumber, ...error })));
  res.json({ total: rows.length, valid: rows.filter((row) => row.errors.length === 0).length, invalid: rows.filter((row) => row.errors.length > 0).length, errors });
});

router.post("/users/csv/import", allowRoles("HR"), express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }), async (req, res) => {
  const rows = await prepareEmployeeCsv(req.body);
  const errors = rows.flatMap((row) => row.errors.map((error) => ({ row: row.rowNumber, ...error })));
  if (errors.length) return res.status(422).json({ message: "Fix the row errors before importing. No employees were created.", total: rows.length, valid: rows.length - new Set(errors.map((error) => error.row)).size, invalid: new Set(errors.map((error) => error.row)).size, errors });
  const users = await User.insertMany(await Promise.all(rows.map(async ({ values }) => ({
    name: values.name,
    email: values.email,
    password: await bcrypt.hash(values.password, 12),
    role: "EMPLOYEE",
    department: values.department,
    designation: values.designation,
    basicSalary: Number(values.basicSalary),
    employeeCode: values.employeeCode || undefined,
    joinedAt: values.joinedAt ? new Date(`${values.joinedAt}T00:00:00.000Z`) : new Date(),
    passwordChangeRequired: true
  }))));
  await audit(req.user, "employees.csv_imported", "employee", "bulk", { count: users.length });
  await notifyRoles(["ADMIN"], "Employee import complete", `${users.length} employee accounts were imported.`, "SYSTEM", "/employees");
  res.status(201).json({ imported: users.length });
});

router.post("/users", allowRoles("ADMIN", "HR"), async (req, res) => {
  const { name, email, password, role, department, designation, basicSalary, phone, employeeCode } = req.body;
  const allowedRole = req.user.role === "ADMIN" ? role === "HR" : role === undefined || role === "EMPLOYEE";
  if (!allowedRole) fail(403, "Admins can create HR accounts; HR can register employee accounts.");
  if (![name, email, password].every((value) => typeof value === "string" && value.trim())) fail(400, "Name, email and a temporary password are required.");
  if (name.trim().length > 120 || email.trim().length > 254 || password.length < 8 || password.length > 128) fail(400, "Name must be at most 120 characters, email at most 254, and password 8 to 128 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fail(400, "Enter a valid email address.");
  if (basicSalary !== undefined && !isNumericInput(basicSalary)) fail(400, "Employee basic salary must be a valid number.");
  const salary = Number(basicSalary || 0);
  if (!Number.isFinite(salary) || salary < 0 || salary > 1000000000 || (role !== "HR" && req.user.role !== "ADMIN" && salary <= 0)) fail(400, "Employee basic salary must be a valid amount between zero and 1,000,000,000.");
  if ([department, designation, phone].some((value) => value !== undefined && typeof value !== "string") || String(department || "").trim().length > 80 || String(designation || "").trim().length > 120 || String(phone || "").trim().length > 40) fail(400, "Department, job title, or phone number is invalid or too long.");
  if (req.user.role === "HR") {
    const settings = await Settings.findOne({ isSetupDone: true }).select("departments");
    if (!settings.departments.some((value) => value.toLowerCase() === String(department || "").trim().toLowerCase())) fail(400, "Select a department configured by your administrator.");
  }
  if (employeeCode !== undefined && (typeof employeeCode !== "string" || employeeCode.trim().length > 50)) fail(400, "Employee code must be 50 characters or fewer.");
  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: await bcrypt.hash(password, 12),
    role: role || "EMPLOYEE",
    department: String(department || "").trim(),
    employeeCode: employeeCode?.trim() || undefined,
    designation: String(designation || "").trim(),
    basicSalary: salary,
    phone: String(phone || "").trim(),
    passwordChangeRequired: true
  });
  await audit(req.user, "user.created", "user", user._id, { name: user.name, role: user.role });
  await createNotification(req.user._id, "Account created", `${user.name}'s ${user.role.toLowerCase()} account is ready.`, "SYSTEM", "/employees");
  res.status(201).json({ user: { ...user.toObject(), password: undefined } });
});

router.patch("/users/:id", allowRoles("ADMIN", "HR"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid user id.");
  const user = await User.findById(req.params.id);
  if (!user || user.role === "ADMIN") fail(404, "Employee was not found.");
  if (req.user.role === "HR" && user.role !== "EMPLOYEE") fail(403, "HR can only manage employee accounts.");
  const fields = ["name", "email", "department", "designation", "phone", "address", "basicSalary", "isActive"];
  const changed = {};
  const before = {};
  for (const field of fields) {
    if (req.body[field] === undefined) continue;
    before[field] = user[field];
    if (field === "basicSalary") {
      if (!isNumericInput(req.body[field])) fail(400, "Salary must be a valid number.");
      const value = Number(req.body[field]);
      if (value < 0 || value > 1000000000) fail(400, "Salary must be between zero and 1,000,000,000.");
      user[field] = value;
    } else if (field === "isActive") {
      if (typeof req.body[field] !== "boolean") fail(400, "isActive must be true or false.");
      user[field] = req.body[field];
    } else if (field === "email") {
      if (typeof req.body[field] !== "string") fail(400, "Enter a valid email address.");
      const value = req.body[field].trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(400, "Enter a valid email address.");
      user[field] = value;
    } else {
      const maximum = { name: 120, department: 80, designation: 120, phone: 40, address: 200 }[field];
      if (typeof req.body[field] !== "string" || (["name", "department", "designation"].includes(field) && !req.body[field].trim()) || req.body[field].trim().length > maximum) fail(400, `${field} is invalid.`);
      user[field] = req.body[field].trim();
    }
    changed[field] = user[field];
  }
  if (changed.department !== undefined) {
    const settings = await Settings.findOne({ isSetupDone: true }).select("departments");
    if (!settings?.departments.some((department) => department.toLowerCase() === user.department.toLowerCase())) fail(400, "Select a department configured by your administrator.");
    user.department = settings.departments.find((department) => department.toLowerCase() === user.department.toLowerCase());
    changed.department = user.department;
  }
  await user.save();
  await audit(req.user, "user.updated", "user", user._id, { before, after: changed });
  res.json({ user: { ...user.toObject(), password: undefined } });
});

router.patch("/users/:id/password", allowRoles("ADMIN", "HR"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid user id.");
  const { newPassword } = req.body;
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) fail(400, "Temporary password must contain 8 to 128 characters.");
  const user = await User.findById(req.params.id);
  if (!user || user.role === "ADMIN") fail(404, "Account was not found.");
  if (req.user.role === "HR" && user.role !== "EMPLOYEE") fail(403, "HR can only reset employee passwords.");
  user.password = await bcrypt.hash(newPassword, 12);
  user.passwordChangeRequired = true;
  await user.save();
  await audit(req.user, "user.password_reset", "user", user._id, { role: user.role });
  res.json({ message: "Temporary password set. The employee must change it after signing in." });
});

router.get("/attendance", async (req, res) => {
  const query = {};
  if (req.user.role === "EMPLOYEE") query.employee = req.user._id;
  else if (req.query.employeeId) query.employee = req.query.employeeId;
  if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
    query.date = { $gte: `${req.query.month}-01`, $lte: `${req.query.month}-31` };
  }
  if (req.query.date && validDate(req.query.date)) query.date = req.query.date;
  const attendance = await Attendance.find(query).populate("employee", "name email department designation").sort({ date: -1 }).limit(500);
  res.json({ attendance });
});

router.post("/attendance/check-in", allowRoles("EMPLOYEE", "HR"), async (req, res) => {
  const date = officeDate();
  const existing = await Attendance.findOne({ employee: req.user._id, date });
  if (existing) fail(409, "You have already checked in today.");
  const settings = await Settings.findOne({ isSetupDone: true });
  const [hours, minutes] = (settings?.officeStart || "09:00").split(":").map(Number);
  const current = new Date();
  const lateAfter = hours * 60 + minutes + (settings?.graceMinutes ?? 15);
  const checkInMinutes = officeMinutes(current);
  const attendance = await Attendance.create({
    employee: req.user._id,
    date,
    checkIn: current,
    status: checkInMinutes > lateAfter ? "LATE" : "PRESENT"
  });
  await audit(req.user, "attendance.checked_in", "attendance", attendance._id);
  res.status(201).json({ attendance });
});

router.post("/attendance/check-out", allowRoles("EMPLOYEE", "HR"), async (req, res) => {
  const date = officeDate();
  const attendance = await Attendance.findOne({ employee: req.user._id, date });
  if (!attendance) fail(404, "Check in before checking out.");
  if (attendance.checkOut) fail(409, "You have already checked out today.");
  attendance.checkOut = new Date();
  attendance.hoursWorked = Math.max(0, Number(((attendance.checkOut - attendance.checkIn) / 3600000).toFixed(2)));
  if (attendance.hoursWorked < 5) attendance.status = "HALF_DAY";
  await attendance.save();
  await audit(req.user, "attendance.checked_out", "attendance", attendance._id, { hoursWorked: attendance.hoursWorked });
  res.json({ attendance });
});

router.get("/leaves", async (req, res) => {
  const query = req.user.role === "EMPLOYEE" ? { employee: req.user._id } : {};
  if (req.query.status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(req.query.status)) query.status = req.query.status;
  const leaves = await LeaveRequest.find(query).populate("employee", "name email department").populate("reviewer", "name").sort({ createdAt: -1 }).limit(300);
  res.json({ leaves });
});

router.get("/leaves/balance", async (req, res) => {
  const yearStart = `${officeDate().slice(0, 4)}-01-01`;
  const yearEnd = `${officeDate().slice(0, 4)}-12-31`;
  const settings = await Settings.findOne({ isSetupDone: true }).select("leavePolicies publicHolidays");
  const approved = await LeaveRequest.find({
    employee: req.user._id, status: "APPROVED", type: { $ne: "UNPAID" }, startDate: { $lte: yearEnd }, endDate: { $gte: yearStart }
  });
  const policies = (settings?.leavePolicies || []).filter((policy) => policy.paid);
  const used = Object.fromEntries(policies.map(({ type }) => [type, approved.filter((leave) => leave.type === type).reduce((sum, leave) => sum + leave.days, 0)]));
  res.json({
    balance: Object.fromEntries(policies.map(({ type, annualQuota }) => [type, Math.max(0, annualQuota - (used[type] || 0))])),
    used,
    policies: settings?.leavePolicies || [],
    publicHolidays: settings?.publicHolidays || []
  });
});

router.post("/leaves", allowRoles("EMPLOYEE"), async (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  if (typeof type !== "string" || !/^[A-Z][A-Z0-9_]{1,29}$/.test(type)) fail(400, "Choose a valid leave type.");
  if (!validDate(startDate) || !validDate(endDate) || typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) fail(400, "Valid dates and a reason of at most 500 characters are required.");
  const settings = await Settings.findOne({ isSetupDone: true });
  const policy = settings?.leavePolicies.find((leavePolicy) => leavePolicy.type === type);
  if (!policy) fail(400, "Choose a leave type configured by your administrator.");
  const holidayDates = settings.publicHolidays.map((holiday) => holiday.date);
  const days = datesBetween(startDate, endDate, settings?.weekend || ["Saturday", "Sunday"], holidayDates);
  if (days.length === 0) fail(422, "The selected dates contain no working days.");
  const conflict = await LeaveRequest.exists({
    employee: req.user._id, status: { $in: ["PENDING", "APPROVED"] },
    startDate: { $lte: endDate }, endDate: { $gte: startDate }
  });
  if (conflict) fail(422, "This request overlaps an existing pending or approved leave.");
  if (policy.paid) {
    const quota = policy.annualQuota;
    const yearStart = `${startDate.slice(0, 4)}-01-01`;
    const yearEnd = `${startDate.slice(0, 4)}-12-31`;
    const used = await LeaveRequest.aggregate([
      { $match: { employee: req.user._id, type, status: { $in: ["PENDING", "APPROVED"] }, startDate: { $lte: yearEnd }, endDate: { $gte: yearStart } } },
      { $group: { _id: null, days: { $sum: "$days" } } }
    ]);
    if ((used[0]?.days || 0) + days.length > quota) fail(422, `This request exceeds your ${type.toLowerCase()} leave balance.`);
  }
  const leave = await LeaveRequest.create({ employee: req.user._id, type, startDate, endDate, days: days.length, reason: reason.trim() });
  await audit(req.user, "leave.created", "leave", leave._id, { type, startDate, endDate, days: days.length });
  await notifyRoles(["HR"], "New time-off request", `${req.user.name} requested ${days.length} day(s) of ${type.toLowerCase()}.`, "LEAVE", "/leaves");
  res.status(201).json({ leave });
});

router.patch("/leaves/:id/review", allowRoles("HR"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid leave request id.");
  const { status, comment = "" } = req.body;
  if (!["APPROVED", "REJECTED"].includes(status)) fail(400, "Choose approve or reject.");
  const leave = await LeaveRequest.findById(req.params.id);
  if (!leave || leave.status !== "PENDING") fail(409, "This request is no longer pending.");
  if (typeof comment !== "string" || comment.length > 500) fail(400, "Review comment must be 500 characters or fewer.");
  if (status === "APPROVED") {
    const conflict = await LeaveRequest.exists({
      _id: { $ne: leave._id }, employee: leave.employee, status: "APPROVED",
      startDate: { $lte: leave.endDate }, endDate: { $gte: leave.startDate }
    });
    if (conflict) fail(422, "Another approved leave overlaps these dates.");
  }
  leave.status = status;
  leave.reviewer = req.user._id;
  leave.reviewComment = comment.trim();
  await leave.save();
  await audit(req.user, `leave.${status.toLowerCase()}`, "leave", leave._id, { comment: leave.reviewComment });
  await createNotification(leave.employee, `Time-off ${status.toLowerCase()}`, `Your ${leave.type.toLowerCase()} request was ${status.toLowerCase()}.${leave.reviewComment ? ` ${leave.reviewComment}` : ""}`, "LEAVE", "/leaves");
  res.json({ leave });
});

router.patch("/leaves/:id/cancel", allowRoles("EMPLOYEE"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid leave request id.");
  const leave = await LeaveRequest.findOne({ _id: req.params.id, employee: req.user._id });
  if (!leave || leave.status !== "PENDING") fail(409, "Only your pending requests can be cancelled.");
  leave.status = "CANCELLED";
  await leave.save();
  await audit(req.user, "leave.cancelled", "leave", leave._id);
  await notifyRoles(["HR"], "Time-off request cancelled", `${req.user.name} cancelled a pending leave request.`, "LEAVE", "/leaves");
  res.json({ leave });
});

router.get("/payroll", async (req, res) => {
  const month = req.query.month ? String(req.query.month) : undefined;
  const query = month && /^\d{4}-\d{2}$/.test(month) ? { month } : {};
  const runs = await PayrollRun.find(query).sort({ month: -1 }).limit(24);
  if (req.user.role === "EMPLOYEE") {
    return res.json({ runs: runs.map((run) => ({
      id: run._id, month: run.month, status: run.status,
      payslip: run.status === "FINALIZED" ? run.items.find((item) => item.employee.toString() === req.user._id.toString()) || null : null
    })).filter((run) => run.payslip) });
  }
  res.json({ runs });
});

router.post("/payroll/draft", allowRoles("HR"), async (req, res) => {
  const { month } = req.body;
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400, "Payroll month must use YYYY-MM format.");
  const start = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const end = `${month}-${String(last).padStart(2, "0")}`;
  const settings = await Settings.findOne({ isSetupDone: true });
  const holidayDates = settings?.publicHolidays.map((holiday) => holiday.date) || [];
  const workingDays = datesBetween(start, end, settings?.weekend || ["Saturday", "Sunday"], holidayDates);
  const users = await User.find({ role: "EMPLOYEE", isActive: { $ne: false } }).select("name department basicSalary joinedAt");
  const items = [];
  for (const employee of users) {
    const basic = employee.basicSalary || 0;
    const gross = basic * 1.5;
    const eligibleDays = workingDays.filter((date) => date >= employee.joinedAt.toISOString().slice(0, 10));
    const attendance = await Attendance.find({ employee: employee._id, date: { $gte: start, $lte: end } }).select("date status");
    const attended = new Map(attendance.map((record) => [record.date, record.status]));
    const leaves = await LeaveRequest.find({
      employee: employee._id, status: "APPROVED", startDate: { $lte: end }, endDate: { $gte: start }
    }).select("type startDate endDate");
    const approvedLeaveDays = new Map();
    const leavePolicies = new Map((settings?.leavePolicies || []).map((policy) => [policy.type, policy]));
    for (const leave of leaves) {
      for (const day of datesBetween(leave.startDate < start ? start : leave.startDate, leave.endDate > end ? end : leave.endDate, settings?.weekend || ["Saturday", "Sunday"], holidayDates)) {
        approvedLeaveDays.set(day, leavePolicies.get(leave.type)?.paid === false ? "UNPAID" : "PAID");
      }
    }
    let absentDays = 0, halfDays = 0, unpaidDays = 0;
    for (const day of eligibleDays) {
      const leaveType = approvedLeaveDays.get(day);
      if (leaveType === "UNPAID") unpaidDays++;
      else if (leaveType) continue;
      else if (attended.get(day) === "HALF_DAY") halfDays++;
      else if (!attended.has(day)) absentDays++;
    }
    const perDay = workingDays.length ? gross / workingDays.length : 0;
    const deductions = Number((perDay * (absentDays + unpaidDays + halfDays * 0.5)).toFixed(2));
    const monthlyTax = Number((taxForAnnualGross(gross * 12) / 12).toFixed(2));
    items.push({
      employee: employee._id, name: employee.name, department: employee.department,
      basic, gross: Number(gross.toFixed(2)), absentDays, halfDays, unpaidDays,
      deductions, tax: monthlyTax, net: Number(Math.max(0, gross - deductions - monthlyTax).toFixed(2))
    });
  }
  let run = await PayrollRun.findOne({ month });
  if (run?.status === "FINALIZED") fail(409, "This payroll run is finalized and locked.");
  if (run) {
    run.items = items;
    run.createdBy = req.user._id;
    await run.save();
  } else {
    run = await PayrollRun.create({ month, items, createdBy: req.user._id });
  }
  await audit(req.user, "payroll.draft_created", "payroll", run._id, { month, employees: items.length });
  res.status(201).json({ run, workingDays: workingDays.length });
});

router.post("/payroll/:id/finalize", allowRoles("ADMIN"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid payroll run id.");
  const run = await PayrollRun.findOneAndUpdate(
    { _id: req.params.id, status: "DRAFT" },
    { $set: { status: "FINALIZED", finalizedBy: req.user._id, finalizedAt: new Date() } },
    { new: true }
  );
  if (!run) {
    if (await PayrollRun.exists({ _id: req.params.id })) fail(409, "This payroll run has already been finalized.");
    fail(404, "Payroll run was not found.");
  }
  await audit(req.user, "payroll.finalized", "payroll", run._id, { month: run.month });
  const employeeIds = run.items.map((item) => item.employee);
  await notifyUserIds(employeeIds, "Your payslip is ready", `Your ${run.month} payslip has been finalized.`, "PAYROLL", "/payroll");
  res.json({ run });
});

router.get("/dashboard", async (req, res) => {
  if (req.user.role === "EMPLOYEE") {
    const today = officeDate();
    const [attendance, leaves, balance, runs, settings] = await Promise.all([
      Attendance.find({ employee: req.user._id, date: { $gte: today.slice(0, 8) + "01", $lte: today } }).select("date status hoursWorked").sort({ date: -1 }),
      LeaveRequest.find({ employee: req.user._id, status: "PENDING" }).countDocuments(),
      LeaveRequest.find({ employee: req.user._id, status: "APPROVED", type: { $ne: "UNPAID" }, startDate: { $lte: `${today.slice(0, 4)}-12-31` }, endDate: { $gte: `${today.slice(0, 4)}-01-01` } }),
      PayrollRun.find({ status: "FINALIZED", "items.employee": req.user._id }).sort({ month: -1 }).limit(1),
      Settings.findOne({ isSetupDone: true }).select("leavePolicies")
    ]);
    const leavePolicies = (settings?.leavePolicies || []).filter((policy) => policy.paid);
    const leaveBalance = Object.fromEntries(leavePolicies.map((policy) => [
      policy.type,
      Math.max(0, policy.annualQuota - balance.filter((leave) => leave.type === policy.type).reduce((sum, leave) => sum + leave.days, 0))
    ]));
    const todayRecord = attendance.find((record) => record.date === today);
    const hoursThisMonth = attendance.reduce((sum, record) => sum + record.hoursWorked, 0);
    const payslip = runs[0]?.items.find((item) => item.employee.toString() === req.user._id.toString()) || null;
    return res.json({
      role: "EMPLOYEE", today: todayRecord || null, hoursThisMonth,
      lateThisMonth: attendance.filter((record) => record.status === "LATE").length,
      leaveBalance, leavePolicies,
      pendingLeaves: leaves, latestPayslip: payslip, attendance
    });
  }

  const today = officeDate();
  const month = today.slice(0, 7);
  const [headcount, attendance, pendingLeaves, departmentCounts, lateRecords, payrollRuns] = await Promise.all([
    User.countDocuments({ role: "EMPLOYEE", isActive: { $ne: false } }),
    Attendance.find({ date: today }).populate("employee", "department name"),
    LeaveRequest.find({ status: "PENDING" }).countDocuments(),
    User.aggregate([{ $match: { role: "EMPLOYEE", isActive: { $ne: false } } }, { $group: { _id: { $ifNull: ["$department", "Unassigned"] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Attendance.find({ date: { $gte: `${month}-01`, $lte: `${month}-31` }, status: "LATE" }).populate("employee", "name department").sort({ date: -1 }).limit(5),
    PayrollRun.find({ month, status: "FINALIZED" })
  ]);
  const presentToday = attendance.filter((record) => ["PRESENT", "LATE", "HALF_DAY", "MISSING_CHECKOUT"].includes(record.status)).length;
  const onLeaveToday = await LeaveRequest.countDocuments({ status: "APPROVED", startDate: { $lte: today }, endDate: { $gte: today } });
  const absentees = Math.max(0, headcount - presentToday - onLeaveToday);
  const payrollCost = payrollRuns.flatMap((run) => run.items).reduce((sum, item) => sum + item.gross, 0);
  res.json({
    role: req.user.role, headcount, presentToday, lateToday: attendance.filter((record) => record.status === "LATE").length,
    onLeaveToday, absentees, pendingLeaves, attendanceRate: headcount ? Math.round(presentToday / headcount * 100) : 0,
    departmentCounts, topLateComers: lateRecords.map((record) => ({ name: record.employee?.name, department: record.employee?.department, date: record.date })),
    payrollCost, payrollMonth: month
  });
});

router.get("/attendance/corrections", async (req, res) => {
  const query = req.user.role === "EMPLOYEE" ? { employee: req.user._id } : {};
  if (req.query.status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(req.query.status)) query.status = req.query.status;
  const corrections = await AttendanceCorrection.find(query)
    .populate("employee", "name email department")
    .populate({ path: "attendance", select: "date checkIn checkOut status" })
    .populate("reviewer", "name")
    .sort({ createdAt: -1 }).limit(200);
  res.json({ corrections });
});

router.post("/attendance/:id/corrections", allowRoles("EMPLOYEE"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid attendance record id.");
  const attendance = await Attendance.findOne({ _id: req.params.id, employee: req.user._id });
  if (!attendance) fail(404, "Your attendance record was not found.");
  const { checkIn, checkOut, reason } = req.body;
  if ((checkIn === undefined && checkOut === undefined) || typeof reason !== "string" || !reason.trim() || reason.length > 500) fail(400, "Provide a corrected check-in or check-out and a reason.");
  const parseRequestedTime = (value, label) => {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || officeDate(date) !== attendance.date) fail(400, `${label} must be a valid time on ${attendance.date}.`);
    return date;
  };
  const requestedCheckIn = parseRequestedTime(checkIn, "Check-in");
  const requestedCheckOut = parseRequestedTime(checkOut, "Check-out");
  const effectiveCheckIn = requestedCheckIn || attendance.checkIn;
  const effectiveCheckOut = requestedCheckOut || attendance.checkOut;
  if (effectiveCheckOut && effectiveCheckOut <= effectiveCheckIn) fail(400, "Check-out must be later than check-in.");
  if (await AttendanceCorrection.exists({ employee: req.user._id, attendance: attendance._id, status: "PENDING" })) fail(409, "A correction is already waiting for review.");
  const correction = await AttendanceCorrection.create({
    employee: req.user._id, attendance: attendance._id, requestedCheckIn, requestedCheckOut, reason: reason.trim()
  });
  await audit(req.user, "attendance_correction.created", "attendance_correction", correction._id, { attendance: attendance._id, reason: reason.trim() });
  await notifyRoles(["HR"], "Attendance correction requested", `${req.user.name} requested an attendance correction for ${attendance.date}.`, "ATTENDANCE", "/attendance/corrections");
  res.status(201).json({ correction });
});

router.patch("/attendance/corrections/:id/review", allowRoles("HR"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid correction request id.");
  const { status, comment = "" } = req.body;
  if (!["APPROVED", "REJECTED"].includes(status)) fail(400, "Choose approve or reject.");
  if (typeof comment !== "string" || comment.length > 500) fail(400, "Review comment must be 500 characters or fewer.");
  const correction = await AttendanceCorrection.findById(req.params.id);
  if (!correction || correction.status !== "PENDING") fail(409, "This correction request is no longer pending.");
  const attendance = await Attendance.findById(correction.attendance).select("date checkIn checkOut status hoursWorked employee");
  if (!attendance) fail(404, "The attendance record for this correction no longer exists.");
  correction.status = status;
  correction.reviewer = req.user._id;
  correction.reviewComment = comment.trim();
  if (status === "APPROVED") {
    if (!attendance.employee.equals(correction.employee)) fail(409, "The attendance record no longer belongs to this employee.");
    if (correction.requestedCheckIn) attendance.checkIn = correction.requestedCheckIn;
    if (correction.requestedCheckOut) attendance.checkOut = correction.requestedCheckOut;
    if (attendance.checkOut) {
      attendance.hoursWorked = Math.max(0, Number(((attendance.checkOut - attendance.checkIn) / 3600000).toFixed(2)));
      const settings = await Settings.findOne({ isSetupDone: true }).select("officeStart graceMinutes");
      const [hours, minutes] = (settings?.officeStart || "09:00").split(":").map(Number);
      const lateAfter = hours * 60 + minutes + (settings?.graceMinutes ?? 15);
      attendance.status = attendance.hoursWorked < 5 ? "HALF_DAY" : officeMinutes(attendance.checkIn) > lateAfter ? "LATE" : "PRESENT";
    } else {
      const settings = await Settings.findOne({ isSetupDone: true }).select("officeStart graceMinutes");
      const [hours, minutes] = (settings?.officeStart || "09:00").split(":").map(Number);
      attendance.status = officeMinutes(attendance.checkIn) > hours * 60 + minutes + (settings?.graceMinutes ?? 15) ? "LATE" : "PRESENT";
    }
    await attendance.save();
  }
  await correction.save();
  await audit(req.user, `attendance_correction.${status.toLowerCase()}`, "attendance_correction", correction._id, { comment: correction.reviewComment });
  await createNotification(correction.employee, `Attendance correction ${status.toLowerCase()}`, `Your attendance correction for ${attendance.date} was ${status.toLowerCase()}.${correction.reviewComment ? ` ${correction.reviewComment}` : ""}`, "ATTENDANCE", "/attendance/corrections");
  res.json({ correction });
});

router.get("/announcements", async (req, res) => {
  const announcements = await Announcement.find({
    archived: false, audience: { $in: ["ALL", req.user.role] }
  }).sort({ createdAt: -1 }).limit(100);
  res.json({ announcements });
});

router.post("/announcements", allowRoles("ADMIN", "HR"), async (req, res) => {
  const { title, body, audience = "ALL" } = req.body;
  if (typeof title !== "string" || !title.trim() || title.length > 120 || typeof body !== "string" || !body.trim() || body.length > 3000) fail(400, "Announcement title and message are required.");
  if (!["ALL", "HR", "EMPLOYEE"].includes(audience)) fail(400, "Choose a valid announcement audience.");
  const announcement = await Announcement.create({
    title: title.trim(), body: body.trim(), audience, author: req.user._id, authorName: req.user.name
  });
  const recipientRoles = audience === "ALL" ? ["ADMIN", "HR", "EMPLOYEE"] : audience === "HR" ? ["HR"] : ["EMPLOYEE"];
  const recipients = await User.find({ role: { $in: recipientRoles }, isActive: { $ne: false }, _id: { $ne: req.user._id } }).select("_id");
  await notifyUserIds(recipients.map((user) => user._id), announcement.title, announcement.body.slice(0, 500), "ANNOUNCEMENT", "/announcements");
  await audit(req.user, "announcement.created", "announcement", announcement._id, { audience });
  res.status(201).json({ announcement });
});

router.delete("/announcements/:id", allowRoles("ADMIN", "HR"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid announcement id.");
  const announcement = await Announcement.findOneAndUpdate(
    { _id: req.params.id, archived: false }, { $set: { archived: true } }, { new: true }
  );
  if (!announcement) fail(404, "Announcement was not found.");
  await audit(req.user, "announcement.archived", "announcement", announcement._id);
  res.json({ message: "Announcement archived." });
});

router.get("/notifications", async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ user: req.user._id, readAt: null })
  ]);
  res.json({ notifications, unreadCount });
});

router.patch("/notifications/read-all", async (req, res) => {
  const result = await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ updated: result.modifiedCount });
});

router.patch("/notifications/:id/read", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(400, "Invalid notification id.");
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } }, { new: true }
  );
  if (!notification) fail(404, "Notification was not found.");
  res.json({ notification });
});

async function buildAiContext(user, prompt) {
  const query = prompt.toLowerCase();
  if (user.role === "EMPLOYEE" && /(salary|payroll|payslip).*(colleague|coworker|team|other|someone)|(?:colleague|coworker).*(salary|payroll|payslip)/i.test(prompt)) {
    return { tool: "private_salary_refusal", data: { message: "You can only view your own finalized payslips." } };
  }
  if (/(policy|policy|rule|rules|quota|balance|leave type|office start|grace|late|half.day)/i.test(query) && !/(how many|who is|who came|show|salary|attendance this month)/i.test(query)) {
    const settings = await Settings.findOne({ isSetupDone: true }).select("officeStart graceMinutes weekend leavePolicies publicHolidays");
    return {
      tool: "company_policy",
      data: {
        officeStart: settings?.officeStart || "09:00", graceMinutes: settings?.graceMinutes ?? 15,
        weekend: settings?.weekend || ["Saturday", "Sunday"], leavePolicies: settings?.leavePolicies || [],
        publicHolidays: settings?.publicHolidays || [], halfDayUnderHours: 5
      }
    };
  }
  if (user.role === "EMPLOYEE") {
    const year = officeDate().slice(0, 4);
    const [attendance, leaveRequests, approvedLeaves, finalizedRuns] = await Promise.all([
      Attendance.find({ employee: user._id, date: { $gte: `${officeDate().slice(0, 7)}-01`, $lte: officeDate() } }).select("date status hoursWorked"),
      LeaveRequest.find({ employee: user._id, status: "PENDING" }).select("type startDate endDate days status"),
      LeaveRequest.find({ employee: user._id, status: "APPROVED", startDate: { $lte: `${year}-12-31` }, endDate: { $gte: `${year}-01-01` } }).select("type days"),
      PayrollRun.find({ status: "FINALIZED", "items.employee": user._id }).sort({ month: -1 }).limit(12)
    ]);
    const settings = await Settings.findOne({ isSetupDone: true }).select("leavePolicies");
    const leaveBalance = Object.fromEntries((settings?.leavePolicies || []).filter((policy) => policy.paid).map((policy) => [
      policy.type, Math.max(0, policy.annualQuota - approvedLeaves.filter((leave) => leave.type === policy.type).reduce((sum, leave) => sum + leave.days, 0))
    ]));
    const ownPayslips = finalizedRuns.flatMap((run) => run.items.filter((item) => item.employee.toString() === user._id.toString()).map((item) => ({ month: run.month, net: item.net })));
    return { tool: "get_my_leave_balance", data: { attendance, pendingLeaves: leaveRequests, leaveBalance, ownPayslips } };
  }
  if (/(pay|salary|payroll|gross|net|tax)/i.test(query)) {
    const runs = await PayrollRun.find({ status: "FINALIZED" }).sort({ month: -1 }).limit(12);
    return {
      tool: "get_payroll_summary",
      data: runs.map((run) => ({
        month: run.month,
        employeeCount: run.items.length,
        gross: run.items.reduce((sum, item) => sum + item.gross, 0),
        net: run.items.reduce((sum, item) => sum + item.net, 0)
      }))
    };
  }
  if (/(leave|on leave|time off)/i.test(query)) {
    const today = officeDate();
    const leaves = await LeaveRequest.find({
      status: { $in: ["PENDING", "APPROVED"] }, startDate: { $lte: today }, endDate: { $gte: today }
    }).populate("employee", "name department");
    return { tool: "get_leave_summary", data: leaves.map((leave) => ({ name: leave.employee.name, department: leave.employee.department, type: leave.type, status: leave.status })) };
  }
  if (/(late|tardy)/i.test(query)) {
    const month = officeDate().slice(0, 7);
    const matches = await Attendance.find({ date: { $gte: `${month}-01`, $lte: `${month}-31` }, status: "LATE" }).populate("employee", "name department").select("date employee");
    const counts = new Map();
    for (const record of matches) {
      const key = record.employee._id.toString();
      const item = counts.get(key) || { name: record.employee.name, department: record.employee.department, count: 0 };
      item.count++;
      counts.set(key, item);
    }
    return { tool: "get_late_comers", data: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10) };
  }
  if (/(attendance|present|absent|check.in|check in|headcount|employee|team member|how many)/i.test(query)) {
    const settings = await Settings.findOne({ isSetupDone: true }).select("departments");
    const departmentMatch = settings.departments.find((department) => query.includes(department.toLowerCase()));
    const employeeQuery = { role: "EMPLOYEE", isActive: { $ne: false }, ...(departmentMatch ? { department: departmentMatch } : {}) };
    const headcount = await User.countDocuments(employeeQuery);
    const month = officeDate().slice(0, 7);
    const attendance = await Attendance.find({ date: { $gte: `${month}-01`, $lte: `${month}-31` } }).populate("employee", "name department").select("date employee status");
    const filtered = departmentMatch ? attendance.filter((record) => record.employee.department === departmentMatch) : attendance;
    return {
      tool: query.includes("who") ? "search_employees" : "get_attendance_summary",
      data: { headcount, department: departmentMatch || "All departments", month, attendanceCount: filtered.length, present: filtered.filter((record) => ["PRESENT", "LATE"].includes(record.status)).length, late: filtered.filter((record) => record.status === "LATE").length }
    };
  }
  return {
    tool: "assistant_help",
    data: {
      message: "I can help with your leave balance and requests, office hours and grace period, attendance, current time off, and payroll. Try asking a specific question, such as “What are the office hours?” or “How much leave do I have left?” For a company rule not shown in the workspace, please ask HR."
    }
  };
}

function describeAiContext(context) {
  const { tool, data } = context;
  if (tool === "private_salary_refusal") return "You can only see your own compensation. I can't share a colleague's salary.";
  if (tool === "assistant_help") return data.message;
  if (tool === "company_policy") {
    const policies = data.leavePolicies.map((policy) => `${policy.type.toLowerCase()}: ${policy.paid ? `${policy.annualQuota} paid days per year` : "unpaid"}`).join(", ");
    return `Company policy: office starts at ${data.officeStart}; ${data.graceMinutes} minutes grace; weekends: ${data.weekend.join(" and ")}; half day is under ${data.halfDayUnderHours} hours. Leave: ${policies || "ask HR"}.`;
  }
  if (tool === "get_my_leave_balance") {
    const balance = Object.entries(data.leaveBalance).map(([type, days]) => `${type.toLowerCase()}: ${days} days remaining`).join(", ");
    return `Your remaining leave: ${balance || "No paid leave policies are configured"}. You have ${data.pendingLeaves.length} pending request(s).`;
  }
  if (tool === "get_payroll_summary") return data.length ? data.map((run) => `${run.month}: ${run.employeeCount} employees, gross ${Math.round(run.gross)}, net ${Math.round(run.net)}`).join("; ") : "There are no finalized payroll runs yet.";
  if (tool === "get_leave_summary") return data.length ? `${data.length} leave request(s) include today: ${data.slice(0, 8).map((leave) => `${leave.name} (${leave.type.toLowerCase()}, ${leave.status.toLowerCase()})`).join(", ")}.` : "No approved or pending leave requests include today.";
  if (tool === "get_late_comers") return data.length ? `Most late arrivals this month: ${data.map((entry) => `${entry.name} (${entry.count})`).join(", ")}.` : "No late check-ins have been recorded this month.";
  if (tool === "get_attendance_summary") return `This month in ${data.department}: ${data.headcount} active employees, ${data.attendanceCount} attendance records, ${data.present} present/late check-ins and ${data.late} late check-ins.`;
  return String(data.message || "I couldn't find matching workspace records.");
}

router.post("/ai/chat", async (req, res) => {
  const prompt = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!prompt || prompt.length > 1500) fail(400, "Enter a question of 1 to 1500 characters.");
  const windowStart = new Date(Date.now() - 60 * 60 * 1000);
  if (await AiLog.countDocuments({ user: req.user._id, createdAt: { $gte: windowStart } }) >= 20) fail(429, "AI limit reached. Please try again in an hour.");
  const context = await buildAiContext(req.user, prompt);
  let answer = describeAiContext(context);
  let outcome = "FALLBACK";
  let provider = "local";
  if (process.env.AI_API_KEY && context.tool !== "assistant_help") {
    try {
      answer = await aiCompletion([
        { role: "system", content: `You are the HCM Lite assistant. Answer briefly using only the provided tool result and approved policy. Never infer or reveal other employees' private data. If the data cannot answer, say so. Label the response AI-generated. Tool: ${context.tool}; result: ${JSON.stringify(context.data)}` },
        { role: "user", content: prompt }
      ]);
      outcome = "SUCCESS";
      provider = process.env.AI_MODEL || "openai-compatible";
    } catch (error) {
      console.error("AI provider unavailable; returning scoped workspace data:", error.message);
      answer = `${describeAiContext(context)} (AI provider is unavailable; this answer uses verified workspace data.)`;
    }
  }
  await writeAiLog(req.user, "CHAT", outcome, prompt.length, provider);
  res.json({ answer, aiGenerated: outcome === "SUCCESS", source: context.tool });
});

router.post("/ai/summary", allowRoles("ADMIN", "HR"), async (req, res) => {
  const metrics = req.body.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics) || Object.keys(metrics).length > 20) fail(400, "Provide current dashboard KPI data.");
  const safeMetrics = Object.fromEntries(Object.entries(metrics).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)));
  const data = [
    `${safeMetrics.headcount ?? 0} active people across your workspace.`,
    `${safeMetrics.attendanceRate ?? 0}% attendance today (${safeMetrics.presentToday ?? 0} present; ${safeMetrics.onLeaveToday ?? 0} on leave).`,
    `${safeMetrics.pendingLeaves ?? 0} time-off request(s) pending review.`,
    `${safeMetrics.lateToday ?? 0} late check-in(s) recorded today.`
  ];
  let summary = data;
  let outcome = "FALLBACK";
  let provider = "local";
  if (process.env.AI_API_KEY) {
    try {
      const response = await aiCompletion([
        { role: "system", content: "Summarize this HCM dashboard as 3-5 concise factual bullets. Use only the supplied KPI numbers; do not add assumptions. Return JSON array of strings." },
        { role: "user", content: JSON.stringify(safeMetrics) }
      ], 180);
      const parsed = JSON.parse(response);
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 5 || parsed.some((item) => typeof item !== "string")) throw new Error("AI summary did not return a valid bullet list.");
      summary = parsed;
      outcome = "SUCCESS";
      provider = process.env.AI_MODEL || "openai-compatible";
    } catch (error) {
      console.error("AI summary unavailable; returning dashboard facts:", error.message);
    }
  }
  await writeAiLog(req.user, "SUMMARY", outcome, JSON.stringify(safeMetrics).length, provider);
  res.json({ summary, aiGenerated: outcome === "SUCCESS" });
});

function nextWeekday(baseDate, weekdayName) {
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = names.indexOf(weekdayName.toLowerCase());
  if (target < 0) return null;
  const date = new Date(`${baseDate}T00:00:00.000Z`);
  let delta = (target - date.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

router.post("/ai/smart-leave", allowRoles("EMPLOYEE"), async (req, res) => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 500) fail(400, "Describe your leave in 1 to 500 characters.");
  const lowered = text.toLowerCase();
  const type = /\b(sick|ill|medical|bimar|tabiyat)\b/.test(lowered) ? "SICK" : /\b(unpaid|without pay)\b/.test(lowered) ? "UNPAID" : /\b(annual|vacation|holiday)\b/.test(lowered) ? "ANNUAL" : "CASUAL";
  const baseDate = officeDate();
  const dates = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]).filter(validDate);
  let startDate = dates[0] || null;
  let endDate = dates[1] || startDate;
  const weekdays = [...lowered.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)].map((match) => match[0]);
  if (!startDate && /\btomorrow\b|\bkal\b/.test(lowered)) {
    const tomorrow = new Date(`${baseDate}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    startDate = endDate = tomorrow.toISOString().slice(0, 10);
  }
  if (!startDate && weekdays.length) {
    const first = nextWeekday(baseDate, weekdays[0]);
    startDate = first;
    endDate = weekdays.length > 1 ? nextWeekday(first, weekdays[1]) : first;
  }
  const settings = await Settings.findOne({ isSetupDone: true }).select("leavePolicies weekend publicHolidays");
  const policy = settings?.leavePolicies.find((item) => item.type === type);
  const holidayDates = settings?.publicHolidays.map((holiday) => holiday.date) || [];
  const validRange = startDate && endDate && validDate(startDate) && validDate(endDate) && new Date(`${startDate}T00:00:00Z`) >= new Date(`${baseDate}T00:00:00Z`);
  const workingDayCount = validRange ? datesBetween(startDate, endDate, settings?.weekend || ["Saturday", "Sunday"], holidayDates).length : 0;
  const reason = text.replace(/\b(?:i need|need|i want|want|please|apply for|request|take|off|leave|chutti|chhutti|ki chhutti|mujhe|meri|liye)\b/gi, " ").replace(/\s+/g, " ").trim();
  const suggestion = { type, startDate: validRange ? startDate : "", endDate: validRange ? endDate : "", reason: reason || "Personal commitment" };
  const response = process.env.AI_API_KEY ? await aiCompletion([
    { role: "system", content: "Extract a leave request as JSON only with keys type, startDate, endDate, reason. Types: ANNUAL, SICK, CASUAL, UNPAID. Dates use YYYY-MM-DD. If uncertain, preserve the safe prefilled values. Do not submit the request." },
    { role: "user", content: `Current date: ${baseDate}. Validated suggested form: ${JSON.stringify(suggestion)}. User words: ${text}` }
  ], 120).catch((error) => {
    console.error("Smart leave AI unavailable; returning the validated form:", error.message);
    return null;
  }) : null;
  let form = suggestion;
  let aiGenerated = false;
  if (response) {
    try {
      const parsed = JSON.parse(response);
      const parsedPolicy = settings?.leavePolicies.find((item) => item.type === parsed.type);
      if (parsedPolicy && typeof parsed.reason === "string" && validDate(parsed.startDate) && validDate(parsed.endDate) && parsed.startDate >= baseDate && parsed.endDate >= parsed.startDate) {
        form = { type: parsed.type, startDate: parsed.startDate, endDate: parsed.endDate, reason: parsed.reason.slice(0, 500) };
        aiGenerated = true;
      }
    } catch {
      form = suggestion;
    }
  }
  await writeAiLog(req.user, "SMART_LEAVE", aiGenerated ? "SUCCESS" : "FALLBACK", text.length, aiGenerated ? process.env.AI_MODEL || "openai-compatible" : "local");
  res.json({ form, needsConfirmation: true, workingDays: validDate(form.startDate) && validDate(form.endDate) ? datesBetween(form.startDate, form.endDate, settings?.weekend || ["Saturday", "Sunday"], holidayDates).length : 0, aiGenerated });
});

router.get("/audit", allowRoles("ADMIN"), async (_req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
  res.json({ logs });
});

export default router;
