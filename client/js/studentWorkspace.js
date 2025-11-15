// Get roomId & studentId
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

// Save code
document.getElementById("saveBtn").addEventListener("click", async () => {
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
});
