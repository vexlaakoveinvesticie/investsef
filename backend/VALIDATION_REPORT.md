# Phase 4 — Backtesting & Validation Engine: výsledky a metodika

Cieľ tejto fázy nebol maximalizovať win rate, ale **poctivo zistiť, či má systém
kladnú matematickú výhodu (Expected Value)** — a postaviť validáciu tak, aby sa
nedala oklamať sama sebou (look-ahead, overfitting, ignorovanie nákladov).

> **Zásadné upozornenie:** V tomto prostredí nemám prístup k reálnym dátam
> (Yahoo/Stooq domény nie sú dostupné), takže všetky nižšie uvedené čísla sú zo
> **syntetických dát**. Validujú, že *engine a backtester fungujú správne a bez
> look-ahead*, ale **nevalidujú reálnu trhovú hodnotu**. Tá sa musí potvrdiť na
> živých dátach po nasadení, predtým než sa uvažuje o akomkoľvek live tradingu.

---

## 1. Ako je backtester postavený, aby neklamal

Väčšina amatérskych backtestov nadhodnocuje výsledky štyrmi chybami — všetky sú
tu ošetrené:

1. **Žiadny look-ahead.** V rozhodovacom bare `i` engine vidí len `df[:i+1]`.
   Vstup sa plní až na **otvorení baru `i+1`** (nedá sa vyplniť okamžite na
   signálovom bare). Exity sa kontrolujú bar po bare.
2. **Konzervatívne riešenie same-bar konfliktu.** Ak v jednom bare cena zasiahne
   aj SL aj TP, počíta sa **SL ako prvý** (najhorší prípad) — odstraňuje to
   optimistické skreslenie.
3. **Transakčné náklady + slippage** (default 6 bps round-trip) sa odpočítavajú
   z každého obchodu. Bez nákladov backtest luže.
4. **Time-stop** zatvára obchody, ktoré sa „zaseknú", na trhu — žiadne nekonečne
   držané pozície.

---

## 2. Integrity / Null test (najdôležitejšia časť)

Systém som pustil na troch syntetických procesoch. Kľúčový je **null test na
čistom náhodnom pohybe bez driftu**: korektný, look-ahead-free systém tam musí
po nákladoch **strácať** (žiadny technický systém nemá edge na čistom šume). Ak
by ukázal zisk, znamená to únik budúcich dát.

| Proces | EV / obchod | Profit Factor | Win rate | Obchody | Očakávané | Výsledok |
|---|---|---|---|---|---|---|
| **Random walk (NULL)** | **−0.13 %** | **0.55** | 28 % | 65 | ~0 alebo záporné | **PASS ✓** |
| **Trending** | **+0.40 %** | 6.5 | 81 % | ~290 | kladné | PASS ✓ |
| **Mean-reverting** | **−0.27 %** | 0.24 | 17 % | ~37 | slabé/záporné | PASS ✓ |

**Interpretácia:** Systém stráca na náhodnom pohybe (správne), zarába tam, kde
existujú perzistentné trendy (správne), a trápi sa v mean-reverting režime
(správne pre trend-following systém). Toto je podpis **legitímneho systému bez
look-ahead bias**.

**Prečo neveriť trend číslam doslova:** PF 6.5 a win rate 81 % sú nereálne
vysoké. Je to preto, že syntetický trendový proces má príliš čistú, príliš
perzistentnú autokoreláciu. Reálne trhy sú oveľa hlučnejšie — reálne výsledky
budú **rádovo skromnejšie** (a Sharpe 20+ v reportoch je čistý artefakt
syntetických dát, nie predpoveď).

---

## 3. Walk-forward (ochrana pred overfittingom)

Rule-based engine nemá fitované váhy, takže jediné, čo sa dá pretrénovať, je
**prah skóre** pre vstup. Preto:

1. Na **tréningovej časti (70 %)** sa nájde prah, ktorý maximalizuje EV.
2. Ten istý prah sa **zamrazí** a aplikuje na **testovaciu časť (30 %)**.
3. Porovná sa in-sample vs out-of-sample. Ak OOS výrazne klesne, edge nebol
   reálny.

V testoch bola degradácia IS→OOS malá (napr. NVDA 0.48 %→0.24 %, TSLA
0.43 %→0.31 %), čo naznačuje, že prah nebol drasticky pretrénovaný — ale vzorky
boli často pod hranicou štatistickej významnosti.

---

## 4. Honest recommendation logika

Report pre každú dvojicu (asset × timeframe) vydá go/no-go verdikt. Kritériá sú
zámerne prísne — systém **odmietne** odporučiť live trading, ak:

- OOS obchodov < 30 (štatisticky nevýznamné), **alebo**
- Expected Value ≤ 0, **alebo**
- Profit factor < 1.20, **alebo**
- silná degradácia medzi tréningom a testom (možný overfitting).

V testovacom behu napr. TSLA malo skvelé čísla (EV +0.31 %, PF 4.3), no systém
ho aj tak označil **„NEODPORÚČAM live trading"** — lebo malo len 28 OOS
obchodov. Presne takto to má fungovať: čísla nestačia, treba dosť dát.

---

## 5. Trading Performance Report — polia

Pre každý (asset, timeframe) sa generuje report s presne požadovanými poľami:
Asset, Period, Trades, Win rate, Profit factor, Maximum drawdown, Best setup,
Worst setup, Recommendation — plus Expected Value, IS→OOS EV zmena a Sharpe.

---

## 6. Záver a ďalší krok

**Čo je dokázané:** Backtester je korektný a bez look-ahead (potvrdené null
testom). Engine reálne rozlišuje medzi trendovým, náhodným a mean-reverting
prostredím. Validačná vrstva vie poctivo povedať „nie".

**Čo NIE je dokázané:** Reálna prediktívna hodnota na živých trhoch — na to
treba spustiť validáciu na reálnych yfinance/Stooq dátach.

**Odporúčanie podľa zadania:** Keďže výsledky sú zatiaľ len zo syntetických dát,
**nenapájame na live trading.** Postup je: (1) nasadiť backend s reálnym dátovým
tokom, (2) spustiť túto istú walk-forward validáciu na reálnej histórii, (3) len
ak OOS EV vyjde kladné a nad prahmi na dostatočnej vzorke, prejsť na **paper
trading** (nie hneď live). Až potom má zmysel napájať frontend na živé
rozhodnutia.

Ako spustiť validáciu:

```bash
cd backend
python -m tests.run_validation     # null testy + walk-forward reporty
```
