// Get roomId from query params
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

document.getElementById("roomCodeDisplay").innerText =
  `Classroom ID: ${roomId}`;

// Load students
async function loadStudents() {
  const res = await fetch(`/api/classrooms/${roomId}`);
  const data = await res.json();

  const list = document.getElementById("studentList");
  list.innerHTML = "";

  if (!data.students || data.students.length === 0) {
    list.innerHTML = "<li>No students yet.</li>";
    return;
  }

  data.students.forEach(student => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${student.username}
      <button onclick="openStudentWorkspace('${student._id}')">View</button>
    `;
    list.appendChild(li);
  });
}

function openStudentWorkspace(studentId) {
  window.location.href =
    `studentWorkspace.html?roomId=${roomId}&studentId=${studentId}&instructor=1`;
}

document.getElementById("refreshStudentsBtn").onclick = loadStudents;

loadStudents();
