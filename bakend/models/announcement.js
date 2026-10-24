import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  body: { type: String, required: true, trim: true, maxlength: 3000 },
  audience: { type: String, enum: ["ALL", "HR", "EMPLOYEE"], default: "ALL" },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  authorName: { type: String, required: true },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("Announcement", announcementSchema);
