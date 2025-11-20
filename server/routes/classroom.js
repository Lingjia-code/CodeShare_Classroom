import express from "express";
import Classroom from "../models/Classroom.js";

const router = express.Router();

/*router.post("/classrooms/:roomId/join", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { studentId } = req.body;

    const classroom = await Classroom.findById(roomId);
    if (!classroom) {
      return res.status(404).json({ error: "Classroom not found" });
    }

    // Only add student if not already in the class
    if (!classroom.students.includes(studentId)) {
      classroom.students.push(studentId);
      await classroom.save();
    }

    return res.json({ message: "Joined classroom successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error joining classroom" });
  }
});

export default router;*/

/* ------------------------------
   MOCK DATABASE (No MongoDB)
--------------------------------*/
let mockClassroom = {
  _id: "67b25987fd29044acfb12345",
  instructor: "instructor001",
  students: [],
  files: [
    {
      student: "student001",
      filename: "main.js",
      content: "// welcome to the mock classroom",
      lastUpdated: new Date(),
    }
  ]
};

/* ------------------------------
   JOIN CLASSROOM
--------------------------------*/
router.post("/:id/join", (req, res) => {
  const roomId = req.params.id;
  const { studentId } = req.body;

  if (roomId !== mockClassroom._id) {
    return res.status(404).json({ error: "Classroom not found" });
  }

  if (!mockClassroom.students.includes(studentId)) {
    mockClassroom.students.push(studentId);

    // Add empty file for new student
    mockClassroom.files.push({
      student: studentId,
      filename: "main.js",
      content: "",
      lastUpdated: new Date()
    });
  }

  return res.json({
    message: "Joined classroom successfully",
    classroomId: roomId,
  });
});

/* ------------------------------
   REFRESH (GET SAVED CODE)
--------------------------------*/
router.get("/:id/code/:studentId", (req, res) => {
  const { id, studentId } = req.params;

  if (id !== mockClassroom._id)
    return res.status(404).json({ error: "Classroom not found" });

  const file = mockClassroom.files.find((f) => f.student === studentId);

  return res.json({
    code: file?.content || "// No saved code yet"
  });
});

/* ------------------------------
   SAVE CODE
--------------------------------*/
router.post("/:id/code/:studentId", (req, res) => {
  const { id, studentId } = req.params;
  const { code } = req.body;

  if (id !== mockClassroom._id)
    return res.status(404).json({ error: "Classroom not found" });

  const file = mockClassroom.files.find((f) => f.student === studentId);

  if (file) {
    file.content = code;
    file.lastUpdated = new Date();
  }

  return res.json({
    message: "Code saved!",
    updatedCode: code
  });
});

export default router;
