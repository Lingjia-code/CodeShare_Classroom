document.getElementById("azureLoginBtn").addEventListener("click", () => {
    //window.location.href = "student.html";
    console.log("Azure sign-in mock")
})

document.getElementById("joinBtn").addEventListener("click", () => {
    const roomCode = document.getElementById("roomCodeInput").value.trim();

    window.location.href = `student.html?roomId=${roomCode}`
})