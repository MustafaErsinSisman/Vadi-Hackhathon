console.log("Worker servisi başlatıldı. Video işleme kuyruğu dinleniyor...");

// Docker'ın kapanmaması için sonsuz döngü simülasyonu
setInterval(() => {
    console.log("Worker ayakta: Henüz işlenecek video yok.");
}, 10000);