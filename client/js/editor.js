let editor;

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});

require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: "// start coding...",
    language: "javascript"
  });
});

function getEditorContent() {
  return editor.getValue();
}

function setEditorContent(text) {
  editor.setValue(text);
}