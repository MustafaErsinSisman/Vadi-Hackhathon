const express = require("express");
const multer = require("multer");

const app = express();
const upload = multer({ dest: "uploads/" });

app.post("/upload", upload.single("file"), (req, res) => {
  res.send("Dosya sunucuya geldi");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
