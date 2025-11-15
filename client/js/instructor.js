// Create classroom
document.getElementById("createClassBtn").addEventListener("click", async () => {
  const res = await fetch("/api/classrooms", { method: "POST" });
  const data = await res.json();

  document.getElementById("createResult").innerText =
    `Created! Join code: ${data.roomCode}`;

  loadClassrooms();
});

// Load instructor classrooms
async function loadClassrooms() {
  const res = await fetch("/api/classrooms");
  const data = await res.json();

  const list = document.getElementById("classList");
  list.innerHTML = "";

  data.forEach(c => {
    const li = document.createElement("li");
    li.innerHTML = `
      Classroom: ${c.roomCode}
      <button onclick="openClass('${c._id}')">Open</button>
    `;
    list.appendChild(li);
  });
}

function openClass(id) {
  window.location.href = `instructorClass.html?roomId=${id}`;
}

loadClassrooms();
