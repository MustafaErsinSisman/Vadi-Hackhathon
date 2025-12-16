const form = document.getElementById("uploadForm");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = new FormData(form);

    await fetch("/upload", {
        method: "POST", 
        body: data
    });
}); // Dosyayı binary olarak alır ve HTTP'ye uygun hale getirir.

// Sunucuya http isteği (POST + binary data) gitti ancak sunucu bunu alamıyor direkt
// pars etmesi gerek onun 

// şimdi multer gelen dosyayı pars edecek sunucu için

const express = require("express");
const multer = require("multer");

const app = express();
const upload = multer({ dest: "uploads/"});

app.post("/upload", upload.single("video"), (req, res) => {
    console.log(req.file);
    res.send("Video got!");
})

app.listen(3000);

// multer gelen binaryleri boundary'leri okudu diske yazdı