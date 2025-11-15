document.getElementById("joinBtn").addEventListener("click", async () => {
  const code = document.getElementById("joinCodeInput").value.trim();
  if (!code) return alert("Enter a classroom code");

  const res = await fetch(`/api/classrooms/${code}/join`, { method: "POST" });
  const data = await res.json();

  if (data.success) {
    window.location.href = `studentWorkspace.html?roomId=${data.classroomId}`;
  } else {
    alert("Invalid join code");
  }
});
