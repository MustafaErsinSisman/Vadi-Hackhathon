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

const express