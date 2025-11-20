import express from "express";
import Classroom from "../models/Classroom.js";
import { requireAzureLogin } from "../middleware/auth.js";

const router = express.Router();

// POST /api/code/:roomId  → Save code
router.post("/:roomId", requireAzureLogin, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { code } = req.body;

    // Azure logged-in user ID
    const studentId = req.session.account.homeAccountId;

    // Find classroom
    const classroom = await Classroom.findById(roomId);
    if (!classroom) return res.status(404).json({ error: "Classroom not found" });

    // Look for this student’s file
    const file = classroom.files.find(f => f.student.toString() === studentId);

    if (file) {
      // Update existing file
      file.content = code;
      file.lastUpdated = new Date();
    } else {
      // Add new file
      classroom.files.push({
        student: studentId,
        filename: "main.js",
        content: code,
      });
    }

    await classroom.save();
    res.json({ success: true, message: "Code saved" });

  } catch (error) {
    console.error("Save error:", error);
    res.status(500).json({ error: "Failed to save code" });
  }
});

// GET /api/code/:roomId/refresh → Load saved code
router.get("/:roomId/refresh", requireAzureLogin, async (req, res) => {
  try {
    const { roomId } = req.params;
    const studentId = req.session.account.homeAccountId;

    const classroom = await Classroom.findById(roomId);
    if (!classroom) return res.status(404).json({ error: "Classroom not found" });

    const file = classroom.files.find(f => f.student.toString() === studentId);

    res.json({ code: file ? file.content : "" });

  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({ error: "Failed to refresh code" });
  }
});

export default router;
