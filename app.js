class VideoUploader {
    constructor() {
        this.currentPage = window.location.pathname;
        this.chunkSize = 5 * 1024 * 1024; // 5MB chunks
        this.chunks = [];
        this.file = null;
        this.fileId = null;
        this.totalChunks = 0;
        this.uploadedChunks = 0;
        this.uploadInProgress = false;
        this.init();
    }

    init() {
        if (this.currentPage.includes('upload.html')) {
            this.initUploadPage();
        } else {
            this.loadVideos();
        }
    }

    initUploadPage() {
        // ... (önceki kod aynı, sadece upload işlemi değişecek)
        
        // Upload button click - GÜNCELLENDİ
        uploadBtn.addEventListener('click', async () => {
            if (!selectedFile) return;
            
            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();

            if (!title) {
                this.showMessage('Lütfen video başlığı girin', 'error');
                return;
            }

            // Büyük dosyalar için chunked upload
            if (selectedFile.size > 10 * 1024 * 1024) { // 10MB'dan büyükse
                await this.uploadChunked(selectedFile, title, description);
            } else {
                await this.uploadSingle(selectedFile, title, description);
            }
        });
    }

    async uploadChunked(file, title, description) {
        this.file = file;
        this.totalChunks = Math.ceil(file.size / this.chunkSize);
        this.uploadedChunks = 0;
        this.chunks = [];
        
        // Benzersiz bir file ID oluştur
        this.fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const progressBar = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const progressContainer = document.querySelector('.progress-container');
        const uploadBtn = document.getElementById('upload-btn');
        
        progressContainer.style.display = 'block';
        uploadBtn.disabled = true;
        this.uploadInProgress = true;
        
        try {
            // Önce video metadata'sını gönder
            const metadata = {
                fileId: this.fileId,
                filename: file.name,
                totalSize: file.size,
                totalChunks: this.totalChunks,
                chunkSize: this.chunkSize,
                title: title,
                description: description,
                mimeType: file.type
            };
            
            const metadataResponse = await fetch('http://localhost:5000/api/init-upload', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(metadata)
            });
            
            const metadataResult = await metadataResponse.json();
            
            if (!metadataResult.success) {
                throw new Error(metadataResult.error);
            }
            
            // Tüm chunk'ları yükle
            for (let chunkIndex = 0; chunkIndex < this.totalChunks; chunkIndex++) {
                if (!this.uploadInProgress) {
                    throw new Error('Yükleme kullanıcı tarafından durduruldu');
                }
                
                const start = chunkIndex * this.chunkSize;
                const end = Math.min(start + this.chunkSize, file.size);
                const chunk = file.slice(start, end);
                
                const chunkData = new FormData();
                chunkData.append('fileId', this.fileId);
                chunkData.append('chunkIndex', chunkIndex);
                chunkData.append('totalChunks', this.totalChunks);
                chunkData.append('chunk', chunk);
                chunkData.append('filename', file.name);
                
                let retryCount = 0;
                const maxRetries = 3;
                
                while (retryCount < maxRetries) {
                    try {
                        const response = await fetch('http://localhost:5000/api/upload-chunk', {
                            method: 'POST',
                            body: chunkData
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            this.uploadedChunks++;
                            
                            // Progress güncelle
                            const percent = Math.round((this.uploadedChunks / this.totalChunks) * 100);
                            progressBar.style.width = percent + '%';
                            progressText.textContent = `%${percent} (${this.uploadedChunks}/${this.totalChunks} parça)`;
                            break;
                        } else {
                            throw new Error(result.error);
                        }
                    } catch (error) {
                        retryCount++;
                        if (retryCount === maxRetries) {
                            throw new Error(`Chunk ${chunkIndex} yüklenemedi: ${error.message}`);
                        }
                        await this.sleep(1000 * retryCount); // Exponential backoff
                    }
                }
            }
            
            // Tüm chunk'lar yüklendi, birleştirme ve işleme için istek gönder
            const completeResponse = await fetch('http://localhost:5000/api/complete-upload', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    fileId: this.fileId,
                    title: title,
                    description: description
                })
            });
            
            const completeResult = await completeResponse.json();
            
            if (completeResult.success) {
                this.showMessage('✅ Video başarıyla yüklendi ve işleniyor!', 'success');
                
                // İşlem durumunu takip et
                this.trackProcessing(completeResult.videoId);
            } else {
                throw new Error(completeResult.error);
            }
            
        } catch (error) {
            this.showMessage(`❌ Hata: ${error.message}`, 'error');
            progressContainer.style.display = 'none';
            uploadBtn.disabled = false;
            this.uploadInProgress = false;
        }
    }

    async trackProcessing(videoId) {
        const checkInterval = setInterval(async () => {
            try {
                const response = await fetch(`http://localhost:5000/api/video-status/${videoId}`);
                const data = await response.json();
                
                if (data.status === 'processed') {
                    clearInterval(checkInterval);
                    this.showMessage('✅ Video işlendi! Ana sayfaya yönlendiriliyorsunuz...', 'success');
                    
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 2000);
                } else if (data.status === 'error') {
                    clearInterval(checkInterval);
                    this.showMessage(`❌ Video işlenirken hata: ${data.error}`, 'error');
                }
                // "processing" durumunda devam et
            } catch (error) {
                console.error('Durum kontrol hatası:', error);
            }
        }, 2000); // 2 saniyede bir kontrol et
    }

    async uploadSingle(file, title, description) {
        // ... (önceki single upload kodu)
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ... (diğer fonksiyonlar aynı)
}