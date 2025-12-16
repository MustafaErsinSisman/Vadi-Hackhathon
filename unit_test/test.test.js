// Tarayıcı ortamını taklit et (Mocking Browser Globals)
global.window = {
    location: {
        pathname: '/upload.html'
    }
};

global.document = {
    getElementById: jest.fn((id) => ({
        value: 'Test Değeri',
        addEventListener: jest.fn(),
        style: {},
        disabled: false,
        textContent: ''
    })),
    querySelector: jest.fn(() => ({
        style: {}
    }))
};

// Fetch API ve FormData'yı taklit et
global.fetch = jest.fn();
global.FormData = class FormData {
    append = jest.fn();
};

// Test edilecek sınıfı içe aktar (Bir üst dizindeki app.js)
const VideoUploader = require('../app');

describe('VideoUploader Unit Testleri', () => {
    let uploader;

    beforeEach(() => {
        // Her testten önce mock'ları temizle ve yeni bir instance oluştur
        jest.clearAllMocks();
        global.fetch.mockReset();
        
        uploader = new VideoUploader();
        
        // UI ile etkileşime giren metodları mockla (DOM hatalarını önlemek için)
        uploader.showMessage = jest.fn();
        uploader.trackProcessing = jest.fn();
    });

    test('Sınıf varsayılan değerlerle doğru şekilde başlatılmalı', () => {
        expect(uploader.chunkSize).toBe(5 * 1024 * 1024); // 5MB
        expect(uploader.chunks).toEqual([]);
        expect(uploader.uploadedChunks).toBe(0);
        expect(uploader.uploadInProgress).toBe(false);
        expect(uploader.currentPage).toBe('/upload.html');
    });

    test('sleep fonksiyonu belirtilen süre kadar beklemeli', async () => {
        const start = Date.now();
        await uploader.sleep(100);
        const end = Date.now();
        const duration = end - start;
        
        // 100ms civarında bir süre geçmeli (küçük sapmalar olabilir)
        expect(duration).toBeGreaterThanOrEqual(90);
    });

    test('uploadChunked fonksiyonu büyük dosyaları parçalara ayırıp yüklemeli', async () => {
        // 12MB'lık sahte bir dosya oluştur (3 parça: 5MB + 5MB + 2MB)
        const mockFile = {
            name: 'test-video.mp4',
            size: 12 * 1024 * 1024,
            type: 'video/mp4',
            slice: jest.fn().mockReturnValue('fake-chunk-content')
        };

        // Fetch çağrılarının sırasıyla vereceği yanıtları ayarla
        fetch
            .mockResolvedValueOnce({ // 1. init-upload yanıtı
                json: () => Promise.resolve({ success: true })
            })
            .mockResolvedValueOnce({ // 2. chunk 0 yükleme yanıtı
                json: () => Promise.resolve({ success: true })
            })
            .mockResolvedValueOnce({ // 3. chunk 1 yükleme yanıtı
                json: () => Promise.resolve({ success: true })
            })
            .mockResolvedValueOnce({ // 4. chunk 2 yükleme yanıtı
                json: () => Promise.resolve({ success: true })
            })
            .mockResolvedValueOnce({ // 5. complete-upload yanıtı
                json: () => Promise.resolve({ success: true, videoId: 'video-123' })
            });

        // Fonksiyonu çalıştır
        await uploader.uploadChunked(mockFile, 'Test Başlık', 'Test Açıklama');

        // Kontroller (Assertions)
        expect(fetch).toHaveBeenCalledTimes(5); // Toplam 5 istek atılmalı
        
        // İlk isteğin (init) doğru parametrelerle atıldığını kontrol et
        expect(fetch).toHaveBeenNthCalledWith(1, 
            'http://localhost:5000/api/init-upload', 
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"totalChunks":3')
            })
        );

        // İşlem takibinin başladığını kontrol et
        expect(uploader.trackProcessing).toHaveBeenCalledWith('video-123');
        expect(uploader.showMessage).toHaveBeenCalledWith(expect.stringContaining('başarıyla yüklendi'), 'success');
    });

    test('uploadChunked sunucu hatası durumunda işlemi durdurmalı', async () => {
        const mockFile = {
            name: 'fail.mp4',
            size: 1024,
            slice: jest.fn()
        };

        // Sunucunun hata döndürdüğünü simüle et
        fetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: false, error: 'Sunucu Hatası' })
        });

        await uploader.uploadChunked(mockFile, 'Başlık', 'Açıklama');

        // Hata mesajının gösterildiğini ve yüklemenin durduğunu kontrol et
        expect(uploader.showMessage).toHaveBeenCalledWith(expect.stringContaining('Sunucu Hatası'), 'error');
        expect(uploader.uploadInProgress).toBe(false);
    });

    // YENİ EKLENEN TEST: uploadSingle
    test('uploadSingle fonksiyonu küçük dosyaları tek seferde yüklemeli', async () => {
        const mockFile = {
            name: 'small.mp4',
            size: 1024 * 1024, // 1MB
            type: 'video/mp4'
        };

        // Fetch yanıtını ayarla (Başarılı yükleme simülasyonu)
        fetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true })
        });

        await uploader.uploadSingle(mockFile, 'Küçük Video', 'Açıklama');

        // Fetch çağrısını kontrol et
        expect(fetch).toHaveBeenCalledTimes(1);
        
        // Endpoint URL'i ve metodunu kontrol et
        // Not: URL'in '/api/upload' veya benzeri bir şey içerdiğini varsayıyoruz
        expect(fetch).toHaveBeenCalledWith(
            expect.stringMatching(/upload/), 
            expect.objectContaining({
                method: 'POST',
                body: expect.any(FormData)
            })
        );
        
        // Başarı mesajının gösterildiğini kontrol et
        expect(uploader.showMessage).toHaveBeenCalledWith(expect.stringContaining('yüklendi'), 'success');
    });
});
