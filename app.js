class VideoUploader {
    constructor() {
        this.currentPage = window.location.pathname;
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
        const dropArea = document.getElementById('drop-area');
        const fileInput = document.getElementById('file-input');
        const uploadBtn = document.getElementById('upload-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const previewPlayer = document.getElementById('preview-player');
        const videoPreview = document.getElementById('video-preview');
        
        let selectedFile = null;

        // Drag & drop events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, unhighlight, false);
        });

        function highlight() {
            dropArea.classList.add('drag-over');
        }

        function unhighlight() {
            dropArea.classList.remove('drag-over');
        }

        // File drop
        dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });

        // File selection handler
        const handleFileSelect = (file) => {
            if (!file.type.startsWith('video/')) {
                this.showMessage('Lütfen bir video dosyası seçin', 'error');
                return;
            }

            if (file.size > 100 * 1024 * 1024) { // 100MB limit
                this.showMessage('Dosya boyutu 100MB\'dan küçük olmalıdır', 'error');
                return;
            }

            selectedFile = file;
            
            // Show file info
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-size').textContent = this.formatFileSize(file.size);
            document.getElementById('file-type').textContent = file.type;

            // Show preview
            videoPreview.style.display = 'block';
            previewPlayer.src = URL.createObjectURL(file);

            // Enable upload button
            uploadBtn.disabled = false;
            
            this.showMessage('Video seçildi. Bilgileri doldurup yükleyebilirsiniz.', 'success');
        };

        // Upload button click
        uploadBtn.addEventListener('click', () => {
            if (!selectedFile) return;
            
            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();

            if (!title) {
                this.showMessage('Lütfen video başlığı girin', 'error');
                return;
            }

            this.uploadVideo(selectedFile, title, description);
        });

        // Cancel button
        cancelBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // Click drop area to select file
        dropArea.addEventListener('click', () => {
            fileInput.click();
        });
    }

    async uploadVideo(file, title, description) {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('title', title);
        formData.append('description', description);

        const progressBar = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const progressContainer = document.querySelector('.progress-container');
        const uploadBtn = document.getElementById('upload-btn');

        // Show progress bar
        progressContainer.style.display = 'block';
        uploadBtn.disabled = true;
        
        try {
            const response = await fetch('http://localhost:5000/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.success) {
                this.showMessage('✅ Video başarıyla yüklendi! Ana sayfaya yönlendiriliyorsunuz...', 'success');
                
                // Redirect to home page after 2 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                throw new Error(data.error || 'Yükleme başarısız');
            }
        } catch (error) {
            this.showMessage(`❌ Hata: ${error.message}`, 'error');
            progressContainer.style.display = 'none';
            uploadBtn.disabled = false;
        }
    }

    async loadVideos() {
        const videoList = document.getElementById('video-list');
        
        try {
            const response = await fetch('http://localhost:5000/videos');
            const videos = await response.json();

            if (videos.length === 0) {
                videoList.innerHTML = '<div class="loading">Henüz video yüklenmedi. İlk video yükleyen siz olun!</div>';
                return;
            }

            videoList.innerHTML = videos.map(video => `
                <div class="video-card">
                    <div class="video-thumbnail">
                        🎬
                    </div>
                    <div class="video-content">
                        <h3>${video.title}</h3>
                        <p><strong>Dosya:</strong> ${video.filename}</p>
                        <p><strong>Boyut:</strong> ${this.formatFileSize(video.size)}</p>
                        <p><strong>Tarih:</strong> ${new Date(video.uploaded).toLocaleDateString('tr-TR')}</p>
                        ${video.description ? `<p>${video.description}</p>` : ''}
                    </div>
                </div>
            `).join('');
        } catch (error) {
            videoList.innerHTML = '<div class="loading">Videolar yüklenirken hata oluştu. Server çalışıyor mu?</div>';
        }
    }

    showMessage(text, type = 'info') {
        const messageDiv = document.getElementById('message');
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        
        if (type !== 'success') {
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 5000);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VideoUploader();
});
