/*document.getElementById("joinBtn").addEventListener("click", async () => {
  const code = document.getElementById("joinCodeInput").value.trim();
  if (!code) return alert("Enter a classroom code");

  const res = await fetch(`/api/classrooms/${code}/join`, { method: "POST" });
  const data = await res.json();

  if (data.success) {
    window.location.href = `studentWorkspace.html?roomId=${data.classroomId}`;
  } else {
    alert("Invalid join code");
  }
});*/

/* ------------------------------
   For hardcoded testing without MongoDB
--------------------------------*/
const roomId = "67b25987fd29044acfb12345";
const studentId = "student999";  // hardcoded

document.getElementById("joinBtn").addEventListener("click", async () => {
  const res = await fetch(`/api/classrooms/${roomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId })
  });

  const data = await res.json();
  console.log(data);

  // redirect to workspace
  window.location.href = `studentWorkspace.html?roomId=${roomId}&studentId=${studentId}`;
});

