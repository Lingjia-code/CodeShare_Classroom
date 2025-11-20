// Get roomId & studentId
/*const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");*/

//hard code roomId for testing!!! REMOVE LATER!!!!!
//const roomId = "67b25987fd29044acfb12345"; // ← your real Classroom _id


// Save code
/*document.getElementById("saveBtn").addEventListener("click", async () => {
  const code = getEditorContent();

  const res = await fetch(`/api/code/${roomId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  const data = await res.json();
  console.log("Save:", data);
});

// Refresh code
document.getElementById("refreshBtn").addEventListener("click", async () => {
  const res = await fetch(`/api/code/${roomId}/refresh`);
  const data = await res.json();
  setEditorContent(data.code || "// No saved code found");
});*/

const roomId = new URLSearchParams(window.location.search).get("roomId");
const studentId = new URLSearchParams(window.location.search).get("studentId");

// SAVE
document.getElementById("saveBtn").addEventListener("click", async () => {
  const code = getEditorContent();

  const res = await fetch(`/api/classrooms/${roomId}/code/${studentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  console.log(await res.json());
});

// REFRESH
document.getElementById("refreshBtn").addEventListener("click", async () => {
  const res = await fetch(`/api/classrooms/${roomId}/code/${studentId}`);
  const data = await res.json();

  setEditorContent(data.code);
});

