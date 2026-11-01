"""Rechner: Wie kommt das Faceless-TikTok-Business auf 1.000 Euro am Tag?

Alle Zahlen sind Annahmen, keine Garantie. Passe die Werte unten an und starte:

    python3 rechner.py
"""

ZIEL_PRO_TAG = 1_000.00

# --- Annahmen: TikTok Shop Affiliate ----------------------------------------
WARENKORB = 25.00        # Ø Bestellwert in Euro
PROVISION = 0.15         # Affiliate-Provision (meist 10-20 %, legt der Händler fest)
BESTELLRATE = 0.0010     # Bestellungen pro Aufruf eines Shop-Videos (0,10 % = 1 von 1.000)

SHOP_VIDEOS_PRO_TAG = 4
AUFRUFE_PRO_SHOP_VIDEO = 45_000

LIVE_STUNDEN_PRO_TAG = 2
LIVE_BESTELLUNGEN_PRO_STUNDE = 20

# --- Annahmen: Creator Rewards Program --------------------------------------
CRP_RPM = 0.50           # Euro pro 1.000 qualifizierte Aufrufe (variiert stark)
CRP_VIDEOS_PRO_TAG = 2
QUALI_AUFRUFE_PRO_CRP_VIDEO = 175_000

# --- Annahmen: eigenes Produkt im TikTok Shop (Ausbaustufe) -----------------
EIGEN_PREIS_BRUTTO = 29.90
MWST = 0.19
EIGEN_KOSTEN = {
    "Ware + Verpackung": 6.00,
    "Versand / Fulfillment": 5.00,
    "TikTok-Verkaufsprovision (ca. 9 % vom Brutto)": 0.09 * EIGEN_PREIS_BRUTTO,
    "Creator-Provision 15 % auf die Hälfte der Verkäufe": 0.5 * 0.15 * EIGEN_PREIS_BRUTTO,
    "Retouren / Schwund (5 %)": 0.05 * EIGEN_PREIS_BRUTTO,
    "Muster / Werbung": 2.00,
}


def euro(wert: float) -> str:
    text = f"{wert:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{text} €"


def zahl(wert: float) -> str:
    return f"{wert:,.0f}".replace(",", ".")


def main() -> None:
    pro_bestellung = WARENKORB * PROVISION
    shop_rpm = BESTELLRATE * 1_000 * pro_bestellung

    shop_aufrufe = SHOP_VIDEOS_PRO_TAG * AUFRUFE_PRO_SHOP_VIDEO
    shop_bestellungen = shop_aufrufe * BESTELLRATE
    shop_euro = shop_bestellungen * pro_bestellung

    live_bestellungen = LIVE_STUNDEN_PRO_TAG * LIVE_BESTELLUNGEN_PRO_STUNDE
    live_euro = live_bestellungen * pro_bestellung

    crp_aufrufe = CRP_VIDEOS_PRO_TAG * QUALI_AUFRUFE_PRO_CRP_VIDEO
    crp_euro = crp_aufrufe / 1_000 * CRP_RPM

    summe = shop_euro + live_euro + crp_euro

    print("=== Wert eines Aufrufs ===")
    print(f"Provision pro Bestellung:        {euro(pro_bestellung)}")
    print(f"Shop: Euro pro 1.000 Aufrufe:    {euro(shop_rpm)}")
    print(f"CRP:  Euro pro 1.000 Aufrufe:    {euro(CRP_RPM)}")
    faktor = f"{shop_rpm / CRP_RPM:.1f}".replace(".", ",")
    print(f"-> Ein Shop-Aufruf ist {faktor}-mal so viel wert wie ein CRP-Aufruf.\n")

    print("=== Zielbild pro Tag (Monat 9-12) ===")
    print(f"Shop-Videos: {SHOP_VIDEOS_PRO_TAG} x {zahl(AUFRUFE_PRO_SHOP_VIDEO)} Aufrufe = "
          f"{zahl(shop_aufrufe)} -> {zahl(shop_bestellungen)} Bestellungen -> {euro(shop_euro)}")
    print(f"LIVE:        {LIVE_STUNDEN_PRO_TAG} h x {LIVE_BESTELLUNGEN_PRO_STUNDE} Bestellungen = "
          f"{zahl(live_bestellungen)} Bestellungen -> {euro(live_euro)}")
    print(f"CRP:         {CRP_VIDEOS_PRO_TAG} x {zahl(QUALI_AUFRUFE_PRO_CRP_VIDEO)} qual. Aufrufe = "
          f"{zahl(crp_aufrufe)} -> {euro(crp_euro)}")
    print(f"SUMME pro Tag: {euro(summe)}   |   pro Monat (30 T.): {euro(summe * 30)}")
    print(f"Aufrufe pro Monat: Shop {zahl(shop_aufrufe * 30)}, CRP {zahl(crp_aufrufe * 30)}\n")

    print("=== Nötige Aufrufe pro Tag, wenn nur EINE Quelle die 1.000 € bringen müsste ===")
    print(f"Nur CRP:  {zahl(ZIEL_PRO_TAG / CRP_RPM * 1_000)} qualifizierte Aufrufe pro Tag")
    print(f"Nur Shop: {zahl(ZIEL_PRO_TAG / shop_rpm * 1_000)} Shop-Aufrufe pro Tag "
          f"({zahl(ZIEL_PRO_TAG / pro_bestellung)} Bestellungen)\n")

    print("=== Empfindlichkeit: Shop-Aufrufe pro Tag für 1.000 € (nur Shop) ===")
    raten = (0.0005, 0.0010, 0.0020)
    print("Warenkorb x Provision | " + " | ".join(f"Bestellrate {r * 100:.2f} %".replace(".", ",") for r in raten))
    for korb, prov in ((15, 0.10), (25, 0.15), (35, 0.20)):
        werte = [ZIEL_PRO_TAG / (korb * prov * r) for r in raten]
        print(f"{korb} € x {prov * 100:.0f} %".ljust(22) + "| " + " | ".join(zahl(w).rjust(19) for w in werte))
    print()

    netto = EIGEN_PREIS_BRUTTO / (1 + MWST)
    kosten = sum(EIGEN_KOSTEN.values())
    marge = netto - kosten
    print("=== Ausbaustufe: eigenes Produkt im TikTok Shop ===")
    print(f"Preis {euro(EIGEN_PREIS_BRUTTO)} brutto = {euro(netto)} netto")
    for name, betrag in EIGEN_KOSTEN.items():
        print(f"  - {name}: {euro(betrag)}")
    print(f"Gewinn pro Stück vor Steuern: {euro(marge)}")
    print(f"-> {zahl(ZIEL_PRO_TAG / marge)} Bestellungen pro Tag für 1.000 € Gewinn")


if __name__ == "__main__":
    main()
