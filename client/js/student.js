const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

console.log("roomId:",roomId)

document.getElementById("saveBtn").addEventListener("click", () => {
    const code = getEditorContent();
    console.log("SAVE pressed. Code: ", code);
    // POST /api/code/:roomId
})

document.getElementById("refreshBtn").addEventListener("click", () => {
    console.log("REFRESH pressed");
    // GET /api/code/:roomId/refresh -> setEditorContent()
})