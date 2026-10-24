import test from "node:test";
import assert from "node:assert/strict";
import Attendance from "../models/attendance.js";
import LeaveRequest from "../models/leaveRequest.js";
import Settings from "../models/setting.js";
import User from "../models/user.js";
import { escapeCsv, parseCsv } from "../utils/csv.js";

test("CSV parser handles quoted commas, escaped quotes and CRLF rows", () => {
  const csv = 'name,email\r\n"Ayesha, Khan",ayesha@example.com\r\n"Sam ""Ace"" Lee",sam@example.com\r\n';
  assert.deepEqual(parseCsv(csv), [
    { rowNumber: 2, values: { name: "Ayesha, Khan", email: "ayesha@example.com" } },
    { rowNumber: 3, values: { name: 'Sam "Ace" Lee', email: "sam@example.com" } }
  ]);
  assert.equal(escapeCsv('Sam "Ace", Lee'), '"Sam ""Ace"", Lee"');
});

test("CSV parser rejects malformed quoting and mismatched columns", () => {
  assert.throws(() => parseCsv('name,email\n"Ayesha,ayesha@example.com'), /unclosed quoted field/);
  assert.throws(() => parseCsv('name,email\nAy"esha,ayesha@example.com'), /quote inside an unquoted field/);
  assert.throws(() => parseCsv('name,email\n"Ayesha"x,ayesha@example.com'), /unexpected characters/);
  assert.throws(() => parseCsv("name,email\nAyesha,ayesha@example.com,extra"), /same number of columns/);
});

test("new users default to active employee accounts", async () => {
  const user = new User({ name: "Ayesha", email: "AYESHA@example.com", password: "hashed-password" });
  assert.equal(user.role, "EMPLOYEE");
  assert.equal(user.isActive, true);
  assert.equal(user.email, "ayesha@example.com");
  await user.validate();
});

test("user roles are limited to the supported access levels", async () => {
  const user = new User({ name: "Sam", email: "sam@example.com", password: "hashed-password", role: "SUPERUSER" });
  await assert.rejects(user.validate(), (error) => error.errors.role.kind === "enum");
});

test("company settings include the required office defaults", async () => {
  const settings = new Settings({ companyName: "People Co." });
  assert.equal(settings.officeStart, "09:00");
  assert.equal(settings.graceMinutes, 15);
  assert.deepEqual(settings.weekend, ["Saturday", "Sunday"]);
  await settings.validate();
});

test("attendance rejects statuses outside the attendance rules", async () => {
  const attendance = new Attendance({
    employee: "507f1f77bcf86cd799439011",
    date: "2026-10-24",
    checkIn: new Date(),
    status: "VACATION"
  });
  await assert.rejects(attendance.validate(), (error) => error.errors.status.kind === "enum");
});

test("leave requests default to pending and require a valid configurable leave type", async () => {
  const leave = new LeaveRequest({
    employee: "507f1f77bcf86cd799439011",
    type: "ANNUAL",
    startDate: "2026-10-26",
    endDate: "2026-10-26",
    days: 1,
    reason: "Family event"
  });
  assert.equal(leave.status, "PENDING");
  await leave.validate();

  const customLeave = new LeaveRequest({ ...leave.toObject(), type: "BEREAVEMENT" });
  await customLeave.validate();

  const invalidLeave = new LeaveRequest({ ...leave.toObject(), type: "BAD TYPE" });
  await assert.rejects(invalidLeave.validate(), (error) => error.errors.type.kind === "regexp");
});
