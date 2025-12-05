let editor;

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});

require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: "",
    language: "javascript",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    wordWrap: "on"
  });

  // Listen for content changes
  editor.onDidChangeModelContent(() => {
    const code = editor.getValue();

    // Call onEditorChange if it exists (defined in studentWorkspace.js)
    if (typeof onEditorChange === 'function') {
      onEditorChange(code);
    }
  });
});

function getEditorContent() {
  return editor ? editor.getValue() : "";
}

function setEditorContent(content) {
  if (editor) {
    // Preserve cursor position when programmatically setting content
    const currentPosition = editor.getPosition();
    editor.setValue(content);
    if (currentPosition) {
      editor.setPosition(currentPosition);
    }
  }
}