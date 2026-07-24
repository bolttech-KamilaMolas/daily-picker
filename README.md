# ALFinator — Daily Standup Picker

Aplikacja do losowania osoby prowadzącej daily standup w zespole ALF.

## URL

**https://bolttech-kamilamolas.github.io/alfinator/**

## Jak działa

1. Apka automatycznie pobiera plik Excel (`data/capacity.xlsx`) z repozytorium GitHub
2. Parsuje zakładkę "capacity" — filtruje zespół ALF, odczytuje dostępność per tydzień
3. Użytkownik widzi listę dostępnych osób (na podstawie bieżącego tygodnia)
4. Może odznaczyć nieobecnych (lokalne, resetuje się codziennie)
5. Klika "Losuj!" — losuje osobę spośród dostępnych, które jeszcze nie prowadziły
6. Historia losowań jest wspólna dla wszystkich (Firebase Realtime Database)
7. Gdy wszyscy dostępni zostaną wylosowani — historia kasuje się automatycznie (nowa runda)

## Architektura

```
┌─────────────────────────────────────┐
│  GitHub Pages (hosting)             │
│  bolttech-kamilamolas.github.io     │
│                                     │
│  index.html / styles.css / app.js   │
│  data/capacity.xlsx                 │
│  alf.png                            │
└────────────────┬────────────────────┘
                 │
    ┌────────────┼────────────────┐
    │            │                │
    ▼            ▼                ▼
 SheetJS      Firebase         Przeglądarka
 (parsowanie  (wspólna         (localStorage:
  Excela)      historia)        odznaczeni
                                nieobecni)
```

## Tech stack

- **HTML/CSS/JS** — statyczna strona, zero backendu
- **SheetJS (xlsx)** — parsowanie plików Excel w przeglądarce
- **Firebase Realtime Database** — wspólna historia losowań (real-time)
- **GitHub Pages** — hosting
- **Kolorystyka** — bolttech (cyan, navy, yellow)

## Firebase

- Projekt: `alfinator`
- Plan: Spark (darmowy)
- Database URL: `https://alfinator-default-rtdb.europe-west1.firebasedatabase.app`
- Konsola: https://console.firebase.google.com/project/alfinator/database

## Wykluczeni z losowania

W pliku `app.js`, stała `EXCLUDED_MEMBERS`:
- Kamila Molas (lider)
- Adrian Słabicki (inny projekt)
- Szymon Bartnik (inny projekt)

Aby dodać/usunąć — edytuj tablicę, commit, push.

## Aktualizacja pliku capacity (cotygodniowo)

### Sposób 1: Skrypt (najłatwiej)
1. Pobierz plik Excel z SharePoint
2. Dwuklik na `update-capacity.bat`
   - Skrypt znajdzie najnowszy .xlsx w folderze Pobrane
   - Skopiuje go jako `data/capacity.xlsx`
   - Zrobi git commit + push

### Sposób 2: Ręcznie
```bash
cd c:\Users\kamila.molas\Kirus\daily-picker
# skopiuj plik do data/capacity.xlsx
git add data/capacity.xlsx
git commit -m "Update capacity"
git push
```

## Źródło danych

SharePoint: https://digitalcarepl.sharepoint.com/:x:/s/RND/IQCIGRMMoA8VQrf-JLfqtMzpAUFLNubkKagObaL7WUXllHs

Zakładka: `capacity`

Struktura: NAME | SURNAME | FULL NAME | SKILLSET | TEAM | DATE | tydzień1 | tydzień2 | ...

- TEAM = "ALF" → brane pod uwagę
- Wartość 100% / 85% = dostępna
- Wartość 0% / puste / zielone tło = niedostępna (urlop)

## Logika losowania

1. Apka wykrywa bieżący tydzień na podstawie dat w nagłówkach Excela
2. Filtruje osoby z TEAM=ALF i dostępnością > 0% w tym tygodniu
3. Usuwa osoby z `EXCLUDED_MEMBERS`
4. Użytkownik może odznaczyć kogoś ręcznie (nieobecny ad hoc)
5. Z puli dostępnych usuwa tych, którzy już prowadzili (historia Firebase)
6. Losuje spośród pozostałych
7. Po wyczerpaniu wszystkich — auto-reset historii

## Struktura plików

```
daily-picker/
├── index.html              # Strona główna
├── styles.css              # Style (bolttech colors)
├── app.js                  # Cała logika
├── alf.png                 # Logo ALFa
├── preview.html            # Standalone preview do testowania (mock data)
├── update-capacity.bat     # Skrypt do aktualizacji danych
└── data/
    └── capacity.xlsx       # Plik z dostępnością (aktualizowany co tydzień)
```

## Historia projektu (21.07.2026)

1. Stworzenie apki z uploadem pliku Excel
2. Dodanie wykluczonych (Kamila, Adrian, Szymon)
3. Deploy na GitHub Pages
4. Rebranding na ALFinator + ikonka ALFa
5. Auto-fetch Excela z repo (zero uploadu dla userów)
6. Checkboxy do odznaczania nieobecnych
7. Usunięcie selektora tygodnia (auto-detect dziś)
8. Firebase Realtime Database — wspólna historia dla wszystkich
9. Logika: odznaczenia resetują się codziennie, historia do wyczerpania puli
10. Zmiana nazwy repo na `alfinator`
11. Usunięcie ręcznego czyszczenia historii dla użytkowników — tylko auto-clear + admin
12. Audit log w Firebase (`audit_log`) — logowanie zdarzeń: auto_clear, admin_clear

## Tryb administratora

Przycisk "Wyczyść historię" jest ukryty dla zwykłych użytkowników. Aby uzyskać dostęp:

```
https://bolttech-kamilamolas.github.io/alfinator/?admin
```

Dodanie `?admin` do URL pokazuje przycisk czyszczenia historii. Każde czyszczenie (ręczne i automatyczne) jest logowane w Firebase w węźle `audit_log`.

### Audit log (Firebase)

Ścieżka: `audit_log/`

Rejestrowane zdarzenia:
- `auto_clear` — historia wyczyszczona automatycznie (wszyscy wylosowani)
- `admin_clear` — historia wyczyszczona ręcznie przez admina

Każdy wpis zawiera:
- `action` — typ zdarzenia
- `timestamp` — data i godzina (ISO 8601)
- `details` — dodatkowe info (np. ile wpisów było w historii)

Podgląd: [Firebase Console → Realtime Database → audit_log](https://console.firebase.google.com/project/alfinator/database/alfinator-default-rtdb/data/~2Faudit_log)
