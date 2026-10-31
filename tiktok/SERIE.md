# Serie: Horror in Du-Perspektive, 1 Minute pro Teil, Wahl am Ende

Vorbild ist die U-Bahn-Serie von @swan9863 (Teil 1: 2,2 Mio. Aufrufe, Teil 2: 1,2 Mio.):
eine 3D-Szene mit Nebel und kaltem Licht, ein ruhiger Erzähler sagt „du“, jede Folge endet mit
einem Cliffhanger und der Frage „Was würdest du tun?“. Teil 2 löst beide Antworten auf.

## Recherche: Wovor Menschen am meisten Angst haben

| Angst | Wie verbreitet | Quelle | Was die Serie daraus macht |
|---|---|---|---|
| Das Unbekannte | gilt als die grundlegendste Angst; in einer Studie mit 373 Personen der stärkste Einzelprädiktor für Angst | Carleton 2016 (Journal of Anxiety Disorders), Folgestudie 2021 | Die Bedrohung wird nie ganz gezeigt und nie erklärt |
| Geliebte Menschen sterben oder werden schwer krank | 55,3 % / 58,9 % | Chapman Survey of American Fears 2025 | Mama ist Teil der Geschichte, ihre Stimme wird zur Falle |
| Überwacht werden | 52,7 % (Staat), 50,7 % (Firmen) | Chapman 2025 | Das eigene Handy und die eigene Kamera wissen mehr als du |
| Einbruch / Mord durch Fremde | 37,5 % / 33,5 % | Chapman 2025 | Jemand ist in deiner Wohnung |
| Höhe / enge Räume / nachts allein draußen | 34,3 % / 25,4 % / 27,5 % | Chapman 2025 | Stoff für spätere Staffeln |
| Nächtliche Ängste in der Kindheit | 64 % der Kinder und Jugendlichen, am häufigsten: Einbrecher | Studie zu nächtlichen Ängsten bei Kindern | Jeder kennt das Gefühl aus der eigenen Kindheit |

Folgerung: **Eigene Wohnung, nachts, Handy, ein geliebter Mensch, keine Erklärung** trifft die
stärksten persönlichen Ängste gleichzeitig. Anders als eine U-Bahn hat jeder Zuschauer genau
diese Situation selbst: ein Bett, einen dunklen Flur, ein Handy auf dem Nachttisch.

## Konzept A (empfohlen): „PERSON DETECTED“

Du wohnst allein. Um 3:12 Uhr weckt dich dein Handy: Die Kamera im Flur meldet
„Person detected“. Der laufende Zähler ist dein **Akku**: 23 % in Teil 1. Er sinkt mit jeder Folge,
bei 0 % kommt das Staffelfinale. Jeder kennt die Panik bei leerem Akku, und sie verbindet die Folgen.

**Teil 1 (Entwurf, ca. 63 s)**

| s | Bild (3D) | Erzähler | Untertitel |
|---|---|---|---|
| 0 | Schwarz, Handy auf dem Nachttisch leuchtet auf: „Person detected · Hallway“ | „3:12 a.m. Your phone wakes you up.“ | 3:12 AM |
| 3 | Handy-Benachrichtigung groß | „Person detected. Hallway.“ | PERSON DETECTED |
| 6 | Dunkles Schlafzimmer, Tür einen Spalt offen | „You live alone.“ | YOU LIVE ALONE |
| 9 | Handy: Kamerabild vom Flur, leer, Licht an | „You open the camera. The hallway is empty.“ | EMPTY |
| 13 | Kamerabild, Deckenlampe | „But the light is on. You turned it off. You're sure.“ | THE LIGHT IS ON |
| 18 | Türspalt, Knarren | „Then the floor creaks. Right outside your door.“ | *creak* |
| 22 | Neue Benachrichtigung: „Person detected · Bedroom door“ | „Your phone buzzes again. Bedroom door.“ | BEDROOM DOOR |
| 26 | Kamerafahrt auf den Türspalt, Flurlicht geht aus | „Through the gap, the hallway light goes out.“ | |
| 31 | Schwarz, nur Türspalt | Flüstern: „Sweetie? Are you awake?“ | |
| 35 | Handy: Nachricht von Mom, 23:04 „Landed in Lisbon ❤️ call you tomorrow“ | „That's your mom's voice. But your mom is in Lisbon.“ | MOM IS IN LISBON |
| 42 | Türspalt, Atmen | Flüstern: „Open the door, sweetie. It's cold out here.“ | |
| 48 | Nahaufnahme: Türklinke geht langsam nach unten | „The handle… slowly… goes down.“ | |
| 54 | Schnitt auf Schwarz, Wahl auf dem Bildschirm | „Hold the door shut… or hide in the wardrobe? Comment A or B. Part 2 follows the majority.“ | A: HOLD THE DOOR · B: HIDE |
| 62 | Handy leuchtet wieder auf (Loop zum Anfang) | | |

**Bogen der Staffel** (Details entscheiden eure Wahlen):

| Teil | Akku | Kern | Cliffhanger |
|---|---|---|---|
| 1 | 23 % | Kamera meldet jemanden, Mamas Stimme vor der Tür | Türklinke geht runter |
| 2 | 19 % | A: Du hältst die Tür. Die App zeigt einen Clip von 23:58 Uhr: Du kommst nach Hause, und jemand geht hinter dir rein. B: Im Schrank siehst du durch den Spalt nichts, aber die Kamera zeigt eine Gestalt direkt vor deinem Schrank | Polizei anrufen oder Mama anrufen? |
| 3 | 14 % | Der Anruf: Mama nimmt ab und flüstert aus dem Flur mit | … |
| 4 | 9 % | Stromausfall, nur noch das Handylicht | … |
| 5 | 4 % | Wohnungstür: Durch den Spion ist niemand zu sehen. Die App meldet „Front door · inside“ | … |
| Finale | 1 % | Die Kamera erkennt das Gesicht: „Recognized: You.“ | Staffel 2 |

## Konzept B: „1.4 KM“

Du gehst nachts allein nach Hause (27,5 % fürchten das). Zähler: Meter bis zur Haustür und 4 % Akku.
Schritte hinter dir hören auf, sobald du stehen bleibst. Wahl jede Folge: rennen oder umdrehen,
Abkürzung durch den Park oder Hauptstraße. Gut, aber weniger Menschen kennen es aus eigener Erfahrung.

## Der optimierte Prompt

Er erzeugt eine Folge als JSON, aus der Renderer, Stimme und Sound gebaut werden. Platzhalter in `<…>`.

```text
ROLE
You write one episode of an English second-person horror series for TikTok, rendered as a
3D scene (Blender, foggy, cold light, slow camera) with a calm narrator. Every episode ends
on a cliffhanger and an A/B choice; the next part follows the majority.

SERIES BIBLE
- Series: <NAME>. Premise: <ONE SENTENCE>. Season location: <e.g. your small apartment at night>.
- Recurring elements: <e.g. the camera app notification "Person detected · <room>", Mom's voice>.
- Running counter on screen in every shot: <e.g. phone battery %, starts at 23 %, about -4 % per part>.
- Fixed set and shot list (only use these): <e.g. BED_POV, PHONE_CLOSE, DOOR_GAP, HALLWAY_CAM,
  HANDLE_CLOSE, WARDROBE_SLIT, BLACK>.
- This is part <N>. Previously: <one sentence>. Majority chose: <A/B>: <what it was>.
  Also write the opening for the losing choice, so both versions of part <N> can be rendered.

LENGTH AND RHYTHM (60-68 s, 9:16)
0-3 s    First line = time + the anomaly. No intro, no title card.
         From part 2: "Part <N>. You chose <X>." in under 2 s, then straight into the scene.
3-50 s   8-10 beats, one every 4-6 s. Each beat adds exactly one new thing you can hear,
         see or read on the phone. Every beat is worse than the one before. No calm beat.
50-56 s  The worst moment. Hard cut to black.
56-64 s  The choice, on screen and spoken: "<A>… or <B>? Comment A or B. Part <N+1> follows
         the majority." The last frame matches the first so the video loops.

FEAR RULES
- Second person, present tense, everyday details (battery %, unread message, a creak).
- The threat is never fully shown and never explained. Show less in every episode, not more.
- One familiar rule of safety breaks per episode (the camera, Mom's voice, the locked door).
- At most one loud scare per episode. No blood, no violence on screen, nothing about self-harm.
- Spoken sentences max 10 words. Whispered lines for the threat, calm lines for the narrator.

VISUAL RULES (3D)
- Dark, foggy rooms, one cold light source per shot, phone screen as the brightest thing.
- Camera moves slowly (push-in or drift); a cut every 3-6 s.
- Big white subtitles, max 4 words, in the middle of the safe area; counter top left.
- Nothing important in the right 170 px or the bottom 520 px.

OUTPUT: JSON only
{"part": N, "title": "Part N", "opening_alt": "...",
 "beats": [{"t": 0.0, "shot": "BED_POV", "camera": "push-in|drift|static",
            "light": "...", "props": "...", "phone_ui": "...", "narration": "...",
            "whisper": "...", "subtitle": "...", "sfx": "...", "battery": 23}],
 "cliffhanger": "...", "choice": {"A": "...", "B": "..."},
 "tiktok_caption": "...", "hashtags": ["..."]}
```

## Technik

- **3D:** Blender (Eevee) läuft hier. Ein Bild in voller Qualität dauert etwa 25 Sekunden
  (Testbild: `look-test-3d.jpg`). 1.900 voll animierte Bilder pro Folge wären über 13 Stunden. Daher:
  feste 3D-Sets, langsame Kamerafahrten in geringerer Auflösung, echte Animation nur für
  Schlüsselmomente (Türklinke, Licht geht aus). Etwa 1–2 Stunden Rendern pro Folge.
- **Stimme:** Kokoro (Apache 2.0, kostenlos, kommerziell nutzbar) läuft hier ohne Internet-Dienst.
  Hörproben: `stimmproben.mp4`. ElevenLabs geht über einen API-Schlüssel in den
  Umgebungseinstellungen. Der kostenlose Plan erlaubt keine kommerzielle Nutzung und verlangt
  Namensnennung; kommerziell ab dem Starter-Plan (etwa 5–6 $ im Monat).
- **Sound:** Atmo, Knarren, Atmen und Herzschlag erzeuge ich selbst, also keine Rechte-Probleme.
