import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  officeStart: { type: String, default: "09:00" },
  graceMinutes: { type: Number, default: 15 },
  weekend: { type: [String], default: ["Saturday", "Sunday"] },
  officeLatitude: { type: Number, default: null },
  officeLongitude: { type: Number, default: null },
  officeRadius: { type: Number, default: 150 },
  departments: { type: [String], default: ["People", "Engineering", "Operations", "Finance", "Design"] },
  leavePolicies: {
    type: [{
      type: { type: String, required: true, uppercase: true, trim: true },
      annualQuota: { type: Number, min: 0, required: true },
      paid: { type: Boolean, default: true }
    }],
    default: [
      { type: "ANNUAL", annualQuota: 14, paid: true },
      { type: "SICK", annualQuota: 8, paid: true },
      { type: "CASUAL", annualQuota: 10, paid: true },
      { type: "UNPAID", annualQuota: 0, paid: false }
    ]
  },
  publicHolidays: {
    type: [{ name: { type: String, required: true, trim: true }, date: { type: String, required: true } }],
    default: []
  },
  isSetupDone: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("Settings", settingsSchema);