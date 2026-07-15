# Nasadenie na hosting (bez inštalácie čohokoľvek na Macu)

Celé to zvládneš v prehliadači za ~10 minút. Frontend aj backend pobežia
ako jedna služba na jednej adrese, zadarmo.

## Krok 1 — GitHub (úložisko kódu)

1. Vytvor si účet na https://github.com (ak nemáš)
2. Klikni na **+** vpravo hore → **New repository**
3. Názov napr. `ai-trading-terminal`, nechaj **Public**, klikni **Create repository**
4. Na stránke nového repozitára klikni na odkaz **uploading an existing file**
5. Otvor si vo Finderi rozbalený priečinok `ai-trading-app` a **potiahni myšou
   celý jeho obsah** (priečinky backend, frontend + súbory Dockerfile,
   render.yaml, ...) do okna prehliadača
6. Počkaj, kým sa všetko nahrá, dole klikni **Commit changes**

## Krok 2 — Render (samotný hosting)

1. Choď na https://render.com → **Sign up with GitHub** (prihlásiš sa GitHub účtom)
2. Klikni **New +** → **Web Service**
3. Vyber svoj repozitár `ai-trading-terminal` → **Connect**
4. Render sám zistí, že projekt má Dockerfile — nič nemeň
5. Dole vyber **Free** plán a klikni **Deploy Web Service**
6. Prvý build trvá 5–10 minút (Render sťahuje Node, builduje frontend,
   inštaluje Python knižnice — všetko za teba)

Po dokončení dostaneš adresu typu `https://ai-trading-terminal.onrender.com`
— otvor ju a aplikácia beží s reálnymi dátami (frontend si backend na
rovnakej adrese nájde automaticky).

## Dátové zdroje

Primárny zdroj je **Finnhub** (kľúč je už nastavený v projekte — v `backend/.env`
pre lokálny beh a v `render.yaml` pre Render). Ak Finnhub niečo nevie dodať
(limit, nedostupný endpoint), systém automaticky prejde na **Yahoo → Stooq**
bez zásahu používateľa. Ak si kľúč na finnhub.io vymeníš, prepíš ho na
Renderi v **Environment → FINNHUB_API_KEY** (má prednosť pred kódom).

## Dobré vedieť

- **Free plán zaspáva:** ak appku ~15 minút nikto nepoužíva, Render ju uspí.
  Prvé načítanie potom trvá ~30–60 sekúnd. Pre jedného používateľa to stačí.
- **SQLite databáza** (história signálov) sa na free pláne pri reštarte
  vymaže. Journal a portfólio v aplikácii sa ukladajú v tvojom prehliadači,
  tie zostanú.
- Zmeny v kóde: stačí nahrať nové súbory na GitHub, Render automaticky
  nasadí novú verziu.
