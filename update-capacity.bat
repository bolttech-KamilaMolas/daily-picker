@echo off
echo ================================
echo   ALFinator - Aktualizacja pliku
echo ================================
echo.

REM Kopiuj najnowszy plik xlsx z folderu Pobrane do repo
echo Szukam pliku capacity w Pobranych...
set "DOWNLOADS=%USERPROFILE%\Downloads"
set "TARGET=c:\Users\kamila.molas\Kirus\daily-picker\data\capacity.xlsx"

REM Szukaj najnowszego pliku xlsx w Pobrane (dowolna nazwa)
set "FOUND="
for /f "delims=" %%F in ('dir /b /o-d "%DOWNLOADS%\*.xlsx" 2^>nul') do (
    if not defined FOUND (
        set "FOUND=%DOWNLOADS%\%%F"
    )
)

if not defined FOUND (
    echo.
    echo [!] Nie znaleziono pliku .xlsx w folderze Pobrane.
    echo     Pobierz plik z SharePoint i uruchom skrypt ponownie.
    echo.
    start "" "https://digitalcarepl.sharepoint.com/:x:/s/RND/IQCIGRMMoA8VQrf-JLfqtMzpAUFLNubkKagObaL7WUXllHs?download=1"
    pause
    exit /b 1
)

echo Znaleziono: %FOUND%
echo Kopiuje jako capacity.xlsx...
copy /y "%FOUND%" "%TARGET%"
echo Skopiowano do repo.
echo.

REM Git commit i push
cd /d "c:\Users\kamila.molas\Kirus\daily-picker"
git add data\capacity.xlsx
git commit -m "Update capacity data %date%"
git push

echo.
echo ================================
echo   Gotowe! Dane zaktualizowane.
echo ================================
pause