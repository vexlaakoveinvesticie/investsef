# AI Trading Intelligence Terminal — kompletný projekt

Tento balík obsahuje **frontend** (React aplikácia — to, čo si videl v Claude ako
artifact) aj **backend** (Python FastAPI engine s reálnymi dátami).

Súbor `.jsx` sa nedá otvoriť dvojklikom — je to React komponent, ktorý potrebuje
bežať vo vývojom prostredí. Tento projekt je už pripravený tak, aby stačilo
nainštalovať závislosti a spustiť.

---

## Čo potrebuješ nainštalovať (raz)

1. **Node.js** (verzia 18+) — https://nodejs.org (stiahni LTS verziu)
2. **Python** (verzia 3.10+) — https://python.org

---

## 1) Spustenie frontendu (aplikácia v prehliadači)

Otvor terminál / príkazový riadok a napíš:

```bash
cd frontend
npm install        # prvý raz, chvíľu to trvá
npm run dev
```

Potom otvor v prehliadači adresu, ktorú Vite vypíše (typicky
**http://localhost:5173**). Aplikácia beží v DEMO režime, kým nepripojíš backend.

---

## 2) Spustenie backendu (reálne dáta Yahoo → Stooq)

V druhom termináli:

```bash
cd backend
pip install -r requirements.txt

# najprv over, že dátový tok funguje (potrebuje internet):
python -m tests.smoke_test

# potom spusti API:
uvicorn app.main:app --reload --port 8000
```

Swagger dokumentácia API: **http://localhost:8000/docs**

---

## 3) Prepojenie frontendu s backendom

V bežiacej aplikácii choď do záložky **Nastavenia** a zadaj adresu backendu:

```
http://localhost:8000
```

Tým sa aplikácia prepne z DEMO režimu na reálne dáta.

---

## Poznámky

- Ukladanie (journal, portfólio, obchody) funguje lokálne cez `localStorage`
  prehliadača — dáta zostanú uložené aj po zatvorení stránky, ale len v tom
  istom prehliadači na tom istom počítači.
- Backend ukladá signály do SQLite súboru priamo v priečinku `backend/`.
- Podrobnosti o backende (endpointy, nasadenie na Railway/Render, Docker)
  nájdeš v `backend/README.md`.

> Nejde o investičné poradenstvo. Výstupy sú pravdepodobnostné scenáre.
