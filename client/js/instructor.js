// Create classroom
document.getElementById("createClassBtn").addEventListener("click", async () => {
  const res = await fetch("/api/classrooms", { method: "POST" });

  if (!res.ok) {
    document.getElementById("createResult").innerText =
      "Please sign in first (Instructor).";
    window.location.href = "/signin?role=instructor";
    return;
  }

  const data = await res.json();

  document.getElementById("createResult").innerText =
    `Created! Join code: ${data.roomCode}`;

  loadClassrooms();
});

// Load instructor classrooms
async function loadClassrooms() {
  try {
    const res = await fetch("/api/classrooms", {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!res.ok) {
      console.error('Failed to load classrooms:', res.status, res.statusText);
      document.getElementById("classList").innerHTML =
        "<li>Please sign in to view your classrooms.</li>";
      return;
    }

    const data = await res.json();
    console.log('Loaded classrooms:', data);

    const list = document.getElementById("classList");
    list.innerHTML = "";

    if (data.length === 0) {
      list.innerHTML = "<li>No classrooms yet. Create one to get started!</li>";
      return;
    }

    data.forEach(c => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>Classroom: ${c.roomCode}</span>
          <div style="display: flex; gap: 10px;">
            <button onclick="openClass('${c._id}')" style="padding: 8px 16px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer;">Open</button>
            <button onclick="deleteClassroom('${c._id}')" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading classrooms:', err);
    document.getElementById("classList").innerHTML =
      "<li>Error loading classrooms. Please try again.</li>";
  }
}

function openClass(id) {
  window.location.href = `instructorClass.html?roomId=${id}`;
}

async function deleteClassroom(id) {
  if (!confirm('Are you sure you want to delete this classroom?')) {
    return;
  }

  try {
    const res = await fetch(`/api/classrooms/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      alert('Failed to delete classroom');
      return;
    }

    loadClassrooms();
  } catch (err) {
    console.error('Error deleting classroom:', err);
    alert('Error deleting classroom');
  }
}

document.getElementById('signOutBtn').addEventListener('click', async () => {
  try {
    await fetch('/signout', { method: 'POST' });
  } catch (err) {
    console.error('Sign out error:', err);
  }
  window.location.href = '/';
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadClassrooms();
});

loadClassrooms();
