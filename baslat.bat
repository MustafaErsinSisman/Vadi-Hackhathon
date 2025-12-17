@echo off
echo VadiTube Projesi Baslatiliyor...
echo.

cd ops

echo Docker Compose ile proje insa ediliyor ve baslatiliyor...
docker compose up --build

if %errorlevel% neq 0 (
    echo.
    echo HATA: Docker komutu calistirilmadi!
    echo Lutfen Docker Desktop uygulamasinin acik oldugundan emin olun.
    pause
    exit /b
)

pause