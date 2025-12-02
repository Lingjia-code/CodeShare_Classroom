import express from 'express';
import Classroom from '../models/Classroom.js';
import User from '../models/User.js';
import { requireAzureLogin } from '../middleware/auth.js';

const router = express.Router();

function getAzureIdentity(req) {
  const account = req.authContext?.account || {};
  const claims = account.idTokenClaims || {};

  const azureId =
    claims.oid ||
    claims.sub ||
    account.homeAccountId ||
    account.localAccountId ||
    account.username;

  const username =
    account.name ||
    claims.name ||
    account.username ||
    claims.preferred_username ||
    'Unknown User';

  return { azureId, username };
}

async function ensureUser(req, roleHint) {
  const { azureId, username } = getAzureIdentity(req);

  if (!azureId) {
    return null;
  }

  let user = await User.findOne({ azureId });

  if (!user) {
    user = await User.create({
      azureId,
      username,
      role: roleHint || 'student',
    });
  } else if (roleHint && user.role !== roleHint) {
    user.role = roleHint;
    await user.save();
  }

  return user;
}

// POST /api/code/:roomId  → Save code
router.post('/:roomId', requireAzureLogin, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { code } = req.body;

    const student = await ensureUser(req, 'student');
    if (!student) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const classroom = await Classroom.findById(roomId);
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const file = classroom.files.find(
      (f) => f.student.toString() === student._id.toString()
    );

    if (file) {
      file.content = code;
      file.lastUpdated = new Date();
    } else {
      classroom.files.push({
        student: student._id,
        filename: 'main.js',
        content: code,
        lastUpdated: new Date(),
      });
    }

    await classroom.save();
    res.json({ success: true, message: 'Code saved' });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save code' });
  }
});

// GET /api/code/:roomId/refresh → Load saved code
router.get('/:roomId/refresh', requireAzureLogin, async (req, res) => {
  try {
    const { roomId } = req.params;

    const student = await ensureUser(req, 'student');
    if (!student) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const classroom = await Classroom.findById(roomId);
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const file = classroom.files.find(
      (f) => f.student.toString() === student._id.toString()
    );

    res.json({ code: file ? file.content : '' });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh code' });
  }
});

// GET /api/code/:roomId/student/:studentId → Load specific student's code (for instructors)
router.get('/:roomId/student/:studentId', requireAzureLogin, async (req, res) => {
  try {
    const { roomId, studentId } = req.params;

    const user = await ensureUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const classroom = await Classroom.findById(roomId);
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    // Verify user is the instructor of this classroom
    if (user.role === 'instructor' && classroom.instructor.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const file = classroom.files.find(
      (f) => f.student.toString() === studentId
    );

    res.json({
      code: file ? file.content : '',
      language: file ? file.language : 'javascript'
    });
  } catch (error) {
    console.error('Error fetching student code:', error);
    res.status(500).json({ error: 'Failed to fetch student code' });
  }
});

export default router;
