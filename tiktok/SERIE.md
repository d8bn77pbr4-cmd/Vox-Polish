# Serie: zusammenhängende 1-Minuten-„What if“-Videos

## Was die Beispielvideos gemeinsam haben

| Muster | Woher | Warum es wirkt |
|---|---|---|
| Die Frage steht in den ersten 2 Sekunden | @vibecodingiseasy, What-if-Beispiele | Wer nicht sofort weiß, worum es geht, wischt weiter |
| Eine Zahl läuft die ganze Zeit mit | @vibecodingiseasy | Man will wissen, wo sie endet, also bleibt man |
| Alle 4–6 Sekunden ein neuer Schritt, jeder schlimmer als der davor | alle | Kein Moment zum Wegwischen |
| Echte Zahlen mit einem Haken | @vibecodingiseasy | Leute streiten in den Kommentaren, das pusht das Video |
| „Du“-Perspektive, ruhiger Erzähler | @swan9863 (U-Bahn) | Man fühlt sich gemeint |
| Ende mit Cliffhanger und Wahl A/B | @swan9863 Teil 1 → Teil 2 | Kommentare („B!“) und Folgen-Abos; Teil 2 hatte trotzdem 1,2 Mio. Aufrufe |
| „Teil N“ im Titel | @swan9863 | Wer Teil 2 sieht, sucht Teil 1, und umgekehrt |

Für die Creator Rewards zählen nur Videos **über 1 Minute**, deshalb sind 62–70 Sekunden das Ziel.

## Der verbesserte Prompt

Dieser Prompt erzeugt eine Folge als JSON, die der Renderer direkt in ein Video umsetzt. Platzhalter in `<…>`.

```text
ROLE
You write and storyboard one episode of a TikTok series of English "What if" simulation videos
with a narrator. The series must feel like one continuous story, not separate videos.

SERIES BIBLE
- Series: <SERIES NAME>. Season rule: <THE ONE DUMB RULE, e.g. "Gary only ever eats half of what is left">.
- Recurring character: Gary, a confident, likeable idiot. He follows the rule with total
  conviction and wrong logic that almost sounds right. He never learns.
- Running gag: <e.g. after every beat Gary says "Still hungry.">
- A counter (<e.g. BITE #>) runs through the WHOLE season. Each episode starts exactly where
  the previous one ended. Season arc: <episode list with counter ranges>.
- This is part <N>. Previously: <one sentence>. Viewers chose: <A/B + what it was>.

LENGTH AND RHYTHM (62-70 s, vertical 9:16)
0-2 s    The question is the first spoken line and on screen. Counter already visible.
         From part 2 on: "Part N. You chose <X>." (max 2 s, then straight into the action)
2-10 s   Gary states his plan with full confidence.
10-52 s  7-9 beats, one every 4-6 s. Each beat: new counter value, one real number,
         one everyday comparison object, one short Gary line. Each beat is bigger,
         worse or weirder than the one before. Never a calm beat.
52-60 s  Twist: science stops cooperating. Gary does not care.
60-68 s  Cliffhanger and a choice: "A: <...> or B: <...>? Comment A or B.
         Part <N+1> follows the majority." The last frame mirrors the first so the video loops.

HUMOR
- The joke is Gary's logic, never an insult. Dumb but lovable, like a confident toddler.
- Max 12 words per spoken sentence. Plain words a 10-year-old understands.
- Every science fact gets an everyday comparison ("about the weight of a grape").

SCIENCE
- Every number is real and can be recalculated; put the formula in science_notes.
- Leave exactly ONE point people can argue about in the comments: debatable, never false.

VISUALS (2D, readable on a phone)
- Dark background, one bold accent colour, big counter in the upper third,
  caption below it (max 6 words), comparison object next to the subject.
- The camera zooms so the subject always fills the screen, however small it gets.
- Nothing important in the right 170 px or the bottom 520 px (TikTok buttons and caption).

VOICE
- Deep, calm, deadpan documentary narrator. Gary's lines in quotes, said completely straight.

ORIGINALITY
- The idea must not be a common what-if (no "drill through the earth", no "stop spinning").

OUTPUT: JSON only
{"part": N, "title": "...", "hook": "...",
 "beats": [{"t": 0.0, "counter": "...", "narration": "...", "caption": "...",
            "visual": "...", "sfx": "chomp|whoosh|ding|boom|none"}],
 "cliffhanger": "...", "choice": {"A": "...", "B": "..."},
 "tiktok_caption": "...", "hashtags": ["..."], "science_notes": "..."}
```

## Serienidee 1 (empfohlen): „Gary’s Logic“, Staffel 1 „The Infinite Pizza“

Gary isst von seiner Pizza (800 g) immer nur die Hälfte von dem, was übrig ist. „So I never run out.“
Der Zähler BITE # läuft über alle Folgen. Rest nach Biss n: 800 g / 2ⁿ.

| Teil | Bisse | Was passiert (echte Zahlen) | Cliffhanger |
|---|---|---|---|
| 1 | 1–19 | 400 g → ein Stück (100 g, Biss 3) → eine Traube (6 g, Biss 7) → eine Büroklammer (0,8 g, Biss 10) → eine Mücke (1,5 mg, Biss 19) | Gary kann seine Pizza nicht mehr sehen. A: Lupe, B: Mikroskop |
| 2 | 19–49 | ein Salzkorn (48 µg, Biss 24) → eine menschliche Zelle (1,5 ng, Biss 39) → ein Bakterium (1,4 pg, Biss 49) | Ein Bakterium auf der Pizza ist jetzt so schwer wie die Pizza selbst. A: teilen, B: Krieg |
| 3 | 49–89 | ein Grippevirus (0,7 fg, Biss 60) → ein Protein (Biss 72) → ein Zuckermolekül (Biss 81) → leichter als ein Wasserstoffatom (Biss 89) | Es gibt nichts Kleineres als ein Atom. Oder? A: weiterbeißen, B: Atom spalten |
| 4 | 89–120 | leichter als ein Elektron (Biss 100) → leichter als ein Neutrino (Biss 120; davon fliegen jede Sekunde Hunderte Billionen durch dich) | Das Universum sagt Nein. Gary sagt „Still hungry.“ |
| 5 | Finale | Die Mathematik: alle Hälften zusammen ergeben genau eine Pizza. Gary hat die ganze Pizza gegessen, nur unendlich langsam. | Staffel 2: „Gary only walks half the way to the fridge.“ |

Der Streitpunkt für die Kommentare ist eingebaut: Ab Biss 89 ist „die Hälfte eines Atoms“ physikalisch Unsinn, mathematisch aber sauber.

## Serienidee 2: „Every Lie Makes You Taller“ (Du-Perspektive)

Du wachst auf, und jede Lüge macht dich 10 cm größer. Zähler: deine Körpergröße. Echte Biologie (Quadrat-Würfel-Gesetz): bei 2,72 m bist du größer als der größte Mensch, der je gelebt hat, danach machen Herz, Knie und Knochen nicht mehr mit. Jede Folge ist ein Teil deines Tages (Frühstück mit Mama, Schule/Arbeit, Date) und endet mit einer Wahl: A: die Wahrheit sagen, B: weiterlügen. Näher an der U-Bahn-Serie, aber lustig statt gruselig.
