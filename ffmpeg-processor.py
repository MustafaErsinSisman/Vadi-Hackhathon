import os
import subprocess
import json
import time
from datetime import datetime
import threading
import queue
import sys

class VideoProcessor:
    def __init__(self, config_path='config.json'):
        self.config = self.load_config(config_path)
        self.task_queue = queue.Queue()
        self.running = True
        
        # İşlemci thread'ini başlat
        self.processor_thread = threading.Thread(target=self.process_queue)
        self.processor_thread.daemon = True
        self.processor_thread.start()
    
    def load_config(self, config_path):
        default_config = {
            'input_folder': 'uploads/videos',
            'output_folder': 'uploads/processed',
            'thumbnail_folder': 'uploads/thumbnails',
            'compression_presets': {
                'low': {'crf': 28, 'preset': 'fast', 'audio_bitrate': '96k'},
                'medium': {'crf': 23, 'preset': 'medium', 'audio_bitrate': '128k'},
                'high': {'crf': 18, 'preset': 'slow', 'audio_bitrate': '192k'}
            },
            'thumbnail_times': ['00:00:05', '00:01:00', '00:05:00'],
            'max_concurrent_jobs': 2,
            'supported_formats': ['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm']
        }
        
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                user_config = json.load(f)
                default_config.update(user_config)
        
        return default_config
    
    def add_task(self, video_path, task_type='process', options=None):
        """Video işleme görevi ekle"""
        task = {
            'video_path': video_path,
            'task_type': task_type,
            'options': options or {},
            'added_at': datetime.now().isoformat(),
            'status': 'pending'
        }
        
        self.task_queue.put(task)
        return task
    
    def process_queue(self):
        """Kuyruktaki görevleri işle"""
        while self.running:
            try:
                task = self.task_queue.get(timeout=1)
                self.execute_task(task)
                self.task_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Görev işleme hatası: {e}")
    
    def execute_task(self, task):
        """Tekil görevi çalıştır"""
        try:
            task['status'] = 'processing'
            task['started_at'] = datetime.now().isoformat()
            
            if task['task_type'] == 'process':
                self.process_video(task)
            elif task['task_type'] == 'thumbnail':
                self.generate_thumbnails(task)
            elif task['task_type'] == 'compress':
                self.compress_video(task)
            elif task['task_type'] == 'convert':
                self.convert_format(task)
            elif task['task_type'] == 'info':
                self.get_video_info(task)
            
            task['status'] = 'completed'
            task['completed_at'] = datetime.now().isoformat()
            
        except Exception as e:
            task['status'] = 'failed'
            task['error'] = str(e)
            print(f"Görev başarısız: {e}")
    
    def process_video(self, task):
        """Tam video işleme pipeline'ı"""
        video_path = task['video_path']
        options = task['options']
        
        # Video bilgilerini al
        info = self.get_video_info_sync(video_path)
        
        # Format kontrolü
        if not self.is_supported_format(video_path):
            raise ValueError("Desteklenmeyen video formatı")
        
        # Video sıkıştır
        compress_options = options.get('compression', 'medium')
        output_path = self.compress_video_sync(video_path, compress_options)
        
        # Thumbnail'lar oluştur
        thumbnails = self.generate_thumbnails_sync(output_path)
        
        # HLS formatına çevir (isteğe bağlı)
        if options.get('create_hls', False):
            hls_folder = self.create_hls_stream(output_path)
        
        task['result'] = {
            'info': info,
            'compressed_path': output_path,
            'thumbnails': thumbnails,
            'original_size': os.path.getsize(video_path),
            'compressed_size': os.path.getsize(output_path),
            'compression_ratio': f"{os.path.getsize(output_path) / os.path.getsize(video_path) * 100:.1f}%"
        }
    
    def get_video_info_sync(self, video_path):
        """Video bilgilerini senkron olarak al"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                video_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                raise Exception(f"FFprobe hatası: {result.stderr}")
            
            return json.loads(result.stdout)
            
        except Exception as e:
            print(f"Video bilgisi alınamadı: {e}")
            return None
    
    def compress_video_sync(self, input_path, quality='medium'):
        """Video sıkıştırma"""
        preset = self.config['compression_presets'].get(quality, self.config['compression_presets']['medium'])
        
        # Çıktı dosyası adı
        filename = os.path.basename(input_path)
        name, ext = os.path.splitext(filename)
        output_filename = f"{name}_compressed_{quality}{ext}"
        output_path = os.path.join(self.config['output_folder'], output_filename)
        
        os.makedirs(self.config['output_folder'], exist_ok=True)
        
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-c:v', 'libx264',
            '-crf', str(preset['crf']),
            '-preset', preset['preset'],
            '-c:a', 'aac',
            '-b:a', preset['audio_bitrate'],
            '-movflags', '+faststart',
            '-y',
            output_path
        ]
        
        try:
            print(f"Sıkıştırılıyor: {filename} -> {quality} kalitesi")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(f"Sıkıştırma tamamlandı: {output_filename}")
            return output_path
        except subprocess.CalledProcessError as e:
            raise Exception(f"Sıkıştırma hatası: {e.stderr}")
    
    def generate_thumbnails_sync(self, video_path, times=None):
        """Birden fazla thumbnail oluştur"""
        if times is None:
            times = self.config['thumbnail_times']
        
        thumbnails = []
        os.makedirs(self.config['thumbnail_folder'], exist_ok=True)
        
        filename = os.path.basename(video_path)
        name, _ = os.path.splitext(filename)
        
        for i, time_code in enumerate(times):
            thumbnail_name = f"{name}_thumb_{i+1}.jpg"
            thumbnail_path = os.path.join(self.config['thumbnail_folder'], thumbnail_name)
            
            cmd = [
                'ffmpeg',
                '-i', video_path,
                '-ss', time_code,
                '-vframes', '1',
                '-vf', 'scale=640:-1',
                '-y',
                thumbnail_path
            ]
            
            try:
                subprocess.run(cmd, capture_output=True, check=True)
                thumbnails.append({
                    'time': time_code,
                    'path': thumbnail_path,
                    'filename': thumbnail_name
                })
            except Exception as e:
                print(f"Thumbnail oluşturulamadı ({time_code}): {e}")
        
        return thumbnails
    
    def create_hls_stream(self, video_path):
        """HLS formatında stream oluştur (adaptive streaming için)"""
        output_dir = os.path.join(self.config['output_folder'], 'hls', os.path.basename(video_path).split('.')[0])
        os.makedirs(output_dir, exist_ok=True)
        
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-profile:v', 'baseline',
            '-level', '3.0',
            '-start_number', '0',
            '-hls_time', '10',
            '-hls_list_size', '0',
            '-f', 'hls',
            os.path.join(output_dir, 'stream.m3u8')
        ]
        
        try:
            subprocess.run(cmd, capture_output=True, check=True)
            return output_dir
        except Exception as e:
            print(f"HLS oluşturma hatası: {e}")
            return None
    
    def is_supported_format(self, video_path):
        """Video formatı destekleniyor mu kontrol et"""
        ext = video_path.split('.')[-1].lower()
        return ext in self.config['supported_formats']
    
    def stop(self):
        """İşlemciyi durdur"""
        self.running = False
        self.processor_thread.join()

# Kullanım örneği
if __name__ == '__main__':
    processor = VideoProcessor()
    
    # Test görevi ekle
    test_video = 'test_video.mp4'  # Test için bir video dosyası
    if os.path.exists(test_video):
        task = processor.add_task(
            test_video,
            task_type='process',
            options={
                'compression': 'medium',
                'create_hls': True
            }
        )
        
        # Görevin tamamlanmasını bekle
        time.sleep(2)
        
        # Durumu kontrol et
        print(f"Görev durumu: {task['status']}")
        if task.get('result'):
            print(f"Sonuç: {json.dumps(task['result'], indent=2)}")
    else:
        print(f"Test videosu bulunamadı: {test_video}")