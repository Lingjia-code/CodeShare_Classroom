const instructorBtn = document.getElementById("instructorBtn");
const studentBtn = document.getElementById("studentBtn");

instructorBtn.addEventListener("click", () => {
  window.location.href = "/signin?role=instructor";
});

studentBtn.addEventListener("click", () => {
  window.location.href = "/signin?role=student";
});
