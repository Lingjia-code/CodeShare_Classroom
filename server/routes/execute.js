import express from 'express';
import axios from 'axios';

const router = express.Router();

// Judge0 API configuration
const JUDGE0_API = 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;

const LANGUAGE_IDS = {
  'javascript': 63,
  'python': 71,
  'java': 62,
  'cpp': 54,
  'c': 50     
};

// POST /api/execute - Execute code using Judge0
router.post('/', async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        error: 'Code and language are required'
      });
    }

    const languageId = LANGUAGE_IDS[language];
    if (!languageId) {
      return res.status(400).json({
        success: false,
        error: `Unsupported language: ${language}`
      });
    }

    console.log(`Executing ${language} code...`);

    // Submit code to Judge0
    const submissionResponse = await axios.post(
      `${JUDGE0_API}/submissions`,
      {
        source_code: Buffer.from(code).toString('base64'),
        language_id: languageId,
        stdin: '',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': JUDGE0_API_KEY,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        },
        params: {
          base64_encoded: 'true',
          fields: '*'
        }
      }
    );

    const token = submissionResponse.data.token;

    // Poll for result (max 10 attempts, 500ms apart)
    let result = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const resultResponse = await axios.get(
        `${JUDGE0_API}/submissions/${token}`,
        {
          headers: {
            'X-RapidAPI-Key': JUDGE0_API_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
          },
          params: {
            base64_encoded: 'true',
            fields: '*'
          }
        }
      );

      result = resultResponse.data;

      // Check if processing is complete
      if (result.status.id > 2) {
        break;
      }
    }

    if (!result) {
      return res.json({
        success: false,
        error: 'Execution timeout'
      });
    }

    // Decode output
    const stdout = result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf-8') : '';
    const stderr = result.stderr ? Buffer.from(result.stderr, 'base64').toString('utf-8') : '';
    const compile_output = result.compile_output ? Buffer.from(result.compile_output, 'base64').toString('utf-8') : '';

    // Status codes: 3=Accepted, 4=Wrong Answer, 5=Time Limit Exceeded, 6=Compilation Error, etc.
    if (result.status.id === 3) {
      // Success
      return res.json({
        success: true,
        output: stdout || '(no output)',
        exitCode: 0
      });
    } else if (result.status.id === 6) {
      // Compilation error
      return res.json({
        success: false,
        error: compile_output || stderr || 'Compilation failed'
      });
    } else if (result.status.id === 5) {
      // Time limit exceeded
      return res.json({
        success: false,
        error: 'Time limit exceeded'
      });
    } else if (result.status.id === 11 || result.status.id === 12) {
      // Runtime error
      return res.json({
        success: false,
        error: stderr || 'Runtime error occurred'
      });
    } else {
      // Other errors
      return res.json({
        success: false,
        error: stderr || compile_output || result.status.description || 'Execution failed'
      });
    }

  } catch (error) {
    console.error('Execution error:', error);

    // Handle Judge0 API errors
    if (error.response) {
      return res.json({
        success: false,
        error: `Judge0 API error: ${error.response.data?.message || error.message}`
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to execute code: ' + error.message
    });
  }
});

export default router;
