"""Narration templates: insight type x variant x language x persona.

Rules (enforced by tests/test_narrate.py):
  * every {placeholder} is a fact key the detector provides
  * no digits in template text: every number must come from a fact, so the
    validator can prove it
  * casual = plain words, few numbers; analyst = metrics and definitions

Malay (ms) and Spanish (es) were written for the hackathon; have a native
speaker check them before a broadcast.
"""

from __future__ import annotations

LANGS = ("en", "ms", "es")

# T[type][variant][lang] = {"headline", "casual", "analyst", "why": [...], "why_casual"}
# variant "*" is the default for any variant not listed.
T: dict[str, dict[str, dict[str, dict]]] = {
    "goal": {
        "against_run": {
            "en": {"headline": "Against the run of play: {team} score",
                   "why": ["{opponent} had been on top, so this goal changes the story.",
                           "Win chance for {team}: {win_before} → {win_after}."]},
            "ms": {"headline": "Di luar jangkaan: {team} menjaringkan gol",
                   "why": ["{opponent} lebih menguasai permainan sebelum ini, jadi gol ini "
                           "mengubah cerita perlawanan.",
                           "Peluang {team} untuk menang: {win_before} → {win_after}."]},
            "es": {"headline": "Contra la corriente: gol de {team}",
                   "why": ["{opponent} dominaba, así que este gol cambia la historia del partido.",
                           "Probabilidad de victoria de {team}: {win_before} → {win_after}."]},
        },
        "deserved": {
            "en": {"headline": "{team} make it count",
                   "why": ["{team} had created more: {team_xg} xG to {opp_xg}.",
                           "Win chance for {team}: {win_before} → {win_after}."]},
            "ms": {"headline": "{team} akhirnya berjaya",
                   "why": ["{team} mencipta lebih banyak peluang: {team_xg} xG berbanding "
                           "{opp_xg}.",
                           "Peluang {team} untuk menang: {win_before} → {win_after}."]},
            "es": {"headline": "{team} lo convierten",
                   "why": ["{team} habían generado más: {team_xg} xG frente a {opp_xg}.",
                           "Probabilidad de victoria de {team}: {win_before} → {win_after}."]},
        },
        "*": {
            "en": {"headline": "Goal for {team}",
                   "why": ["A chance like this goes in about {chance_pct} of the time.",
                           "Win chance for {team}: {win_before} → {win_after}."]},
            "ms": {"headline": "Gol untuk {team}",
                   "why": ["Kebarangkalian peluang seperti ini menjadi gol: {chance_pct}.",
                           "Peluang {team} untuk menang: {win_before} → {win_after}."]},
            "es": {"headline": "Gol de {team}",
                   "why": ["Una ocasión así acaba en gol cerca del {chance_pct} de las veces.",
                           "Probabilidad de victoria de {team}: {win_before} → {win_after}."]},
        },
        "_all": {
            "en": {"casual": "{player} scores for {team}. It's {score}.",
                   "analyst": "{player} scores from a {xg} xG chance, struck at {speed}. "
                              "Score: {score}.",
                   "why_casual": "Their chance of winning moves from {win_before} to "
                                 "{win_after}."},
            "ms": {"casual": "{player} menjaringkan gol untuk {team}. Kedudukan kini {score}.",
                   "analyst": "{player} menjaringkan gol daripada peluang {xg} xG, dengan "
                              "kelajuan {speed}. Kedudukan: {score}.",
                   "why_casual": "Peluang mereka untuk menang berubah daripada {win_before} "
                                 "kepada {win_after}."},
            "es": {"casual": "{player} marca para {team}. Marcador: {score}.",
                   "analyst": "{player} marca con una ocasión de {xg} xG, golpeada a {speed}. "
                              "Marcador: {score}.",
                   "why_casual": "Su probabilidad de ganar pasa del {win_before} al "
                                 "{win_after}."},
        },
    },
    "red_card": {
        "*": {
            "en": {"headline": "{team} down to ten",
                   "casual": "{player} is sent off. {team} have to play on with ten.",
                   "analyst": "Red card for {player} at {score}. Projection for {team}: "
                              "{win_before} → {win_after}.",
                   "why": ["The projection lowers their scoring rate and raises the "
                           "opponent's for the rest of the match."],
                   "why_casual": "Their chance of winning drops from {win_before} to "
                                 "{win_after}."},
            "ms": {"headline": "{team} tinggal sepuluh pemain",
                   "casual": "{player} dibuang padang. {team} perlu bermain dengan sepuluh "
                             "orang.",
                   "analyst": "Kad merah untuk {player} ketika {score}. Unjuran untuk {team}: "
                              "{win_before} → {win_after}.",
                   "why": ["Unjuran menurunkan kadar jaringan mereka dan menaikkan kadar "
                           "pihak lawan untuk baki perlawanan."],
                   "why_casual": "Peluang mereka untuk menang jatuh daripada {win_before} "
                                 "kepada {win_after}."},
            "es": {"headline": "{team} se quedan con diez",
                   "casual": "{player} es expulsado. {team} tendrán que jugar con diez.",
                   "analyst": "Roja para {player} con {score}. Proyección para {team}: "
                              "{win_before} → {win_after}.",
                   "why": ["La proyección reduce su ritmo goleador y aumenta el del rival "
                           "para el resto del partido."],
                   "why_casual": "Su probabilidad de ganar baja del {win_before} al "
                                 "{win_after}."},
        },
    },
    "big_chance": {
        "saved": {
            "en": {"casual": "{player} is denied by the keeper."},
            "ms": {"casual": "Percubaan {player} diselamatkan oleh penjaga gol."},
            "es": {"casual": "El portero le niega el gol a {player}."},
        },
        "blocked": {
            "en": {"casual": "{player} has the shot blocked."},
            "ms": {"casual": "Rembatan {player} disekat."},
            "es": {"casual": "Le bloquean el disparo a {player}."},
        },
        "*": {
            "en": {"casual": "{player} misses the target from a great position."},
            "ms": {"casual": "{player} gagal menepati sasaran dari kedudukan yang baik."},
            "es": {"casual": "{player} no encuentra la portería desde una gran posición."},
        },
        "_all": {
            "en": {"headline": "Big chance for {team}",
                   "analyst": "{player} misses a {xg} xG chance.",
                   "why": ["A chance like this goes in about {chance_pct} of the time."],
                   "why_casual": "That was a real chance to score."},
            "ms": {"headline": "Peluang keemasan untuk {team}",
                   "analyst": "{player} mensia-siakan peluang {xg} xG.",
                   "why": ["Kebarangkalian peluang seperti ini menjadi gol: {chance_pct}."],
                   "why_casual": "Itu peluang sebenar untuk menjaringkan gol."},
            "es": {"headline": "Ocasión clara para {team}",
                   "analyst": "{player} falla una ocasión de {xg} xG.",
                   "why": ["Una ocasión así acaba en gol cerca del {chance_pct} de las veces."],
                   "why_casual": "Era una ocasión de verdad."},
        },
    },
    "shot_speed": {
        "*": {
            "en": {"headline": "{speed} strike from {player}",
                   "casual": "{player} hits one at {speed} from {distance} out.",
                   "analyst": "{player}: shot at {speed} from {distance}.",
                   "why": ["Ball speed from the synthetic feed; at this pace the keeper has "
                           "very little time to react."]},
            "ms": {"headline": "Rembatan {speed} oleh {player}",
                   "casual": "{player} melepaskan rembatan {speed} dari jarak {distance}.",
                   "analyst": "{player}: rembatan {speed} dari jarak {distance}.",
                   "why": ["Kelajuan bola daripada suapan sintetik; pada kelajuan ini penjaga "
                           "gol hampir tiada masa untuk bertindak."]},
            "es": {"headline": "Disparo a {speed} de {player}",
                   "casual": "{player} dispara a {speed} desde {distance}.",
                   "analyst": "{player}: disparo a {speed} desde {distance}.",
                   "why": ["Velocidad del balón según el feed sintético; a este ritmo el "
                           "portero apenas tiene tiempo de reaccionar."]},
        },
    },
    "pass_of_the_moment": {
        "*": {
            "en": {"headline": "Pass of the moment: {player}",
                   "casual": "{player} picks out a {length} pass most players wouldn't try.",
                   "analyst": "{player}: {length} pass at {speed}, difficulty {difficulty}, "
                              "adds {xt} xT.",
                   "why": ["Difficulty is one minus the expected completion rate, from length, "
                           "depth and pressure."],
                   "why_casual": "It moved {team} much closer to a scoring chance."},
            "ms": {"headline": "Hantaran terbaik: {player}",
                   "casual": "{player} melepaskan hantaran {length} yang jarang dicuba pemain "
                             "lain.",
                   "analyst": "{player}: hantaran {length} pada {speed}, kesukaran "
                              "{difficulty}, menambah {xt} xT.",
                   "why": ["Kesukaran ialah satu tolak kadar jangkaan hantaran berjaya, "
                           "berdasarkan jarak, kedalaman dan tekanan."],
                   "why_casual": "Hantaran ini membawa {team} lebih dekat kepada peluang "
                                 "menjaringkan gol."},
            "es": {"headline": "El pase del momento: {player}",
                   "casual": "{player} encuentra un pase de {length} que pocos intentarían.",
                   "analyst": "{player}: pase de {length} a {speed}, dificultad {difficulty}, "
                              "suma {xt} xT.",
                   "why": ["La dificultad es uno menos la probabilidad esperada de completar "
                           "el pase, según distancia, profundidad y presión."],
                   "why_casual": "Acercó mucho a {team} a una ocasión de gol."},
        },
    },
    "momentum_flip": {
        "first": {
            "en": {"headline": "{team} take the initiative"},
            "ms": {"headline": "{team} mula mengambil inisiatif"},
            "es": {"headline": "{team} toman la iniciativa"},
        },
        "*": {
            "en": {"headline": "Momentum swings to {team}"},
            "ms": {"headline": "Momentum beralih kepada {team}"},
            "es": {"headline": "El impulso pasa a {team}"},
        },
        "_all": {
            "en": {"casual": "{team} are on top now.",
                   "analyst": "{team} have {share} of the recent threat: {team_threat} v "
                              "{opp_threat} over the last {window} minutes.",
                   "why": ["Momentum weights recent threat (xT gained plus xG) most heavily, "
                           "so it reacts quickly."],
                   "why_casual": "Most of the dangerous play is now coming from {team}."},
            "ms": {"casual": "{team} kini menguasai permainan.",
                   "analyst": "{team} memiliki {share} daripada ancaman terkini: {team_threat} "
                              "berbanding {opp_threat} dalam {window} minit terakhir.",
                   "why": ["Momentum memberi pemberat lebih kepada ancaman terkini (xT "
                           "ditambah xG), jadi ia cepat berubah."],
                   "why_casual": "Kebanyakan serangan berbahaya kini datang daripada {team}."},
            "es": {"casual": "{team} mandan ahora.",
                   "analyst": "{team} acumulan el {share} de la amenaza reciente: {team_threat} "
                              "frente a {opp_threat} en los últimos {window} minutos.",
                   "why": ["El impulso pondera más la amenaza reciente (xT ganado más xG), "
                           "así que reacciona rápido."],
                   "why_casual": "Casi todo el peligro llega ahora de {team}."},
        },
    },
    "control_shift": {
        "*": {
            "en": {"headline": "{team} take control",
                   "casual": "{team} have the ball and the territory.",
                   "analyst": "Control {control} over the last {window} minutes: {possession} "
                              "possession, {tilt} field tilt.",
                   "why": ["Control blends possession, field tilt and pass retention over the "
                           "last {window} minutes."],
                   "why_casual": "They are dictating where the game is played."},
            "ms": {"headline": "{team} menguasai permainan",
                   "casual": "{team} menguasai bola dan kawasan.",
                   "analyst": "Kawalan {control} dalam {window} minit terakhir: {possession} "
                              "penguasaan bola, {tilt} kecondongan padang.",
                   "why": ["Kawalan menggabungkan penguasaan bola, kecondongan padang dan "
                           "ketepatan hantaran dalam {window} minit terakhir."],
                   "why_casual": "Mereka menentukan di mana permainan dimainkan."},
            "es": {"headline": "{team} toman el control",
                   "casual": "{team} tienen el balón y el territorio.",
                   "analyst": "Control del {control} en los últimos {window} minutos: "
                              "{possession} de posesión, {tilt} de inclinación del campo.",
                   "why": ["El control combina posesión, inclinación del campo y retención "
                           "del pase en los últimos {window} minutos."],
                   "why_casual": "Deciden dónde se juega el partido."},
        },
    },
    "chaos_phase": {
        "*": {
            "en": {"headline": "Chaos phase",
                   "casual": "The game has broken up: the ball keeps changing hands and chances "
                             "are flying in.",
                   "analyst": "Chaos index {chaos}: {turnovers} turnovers and {shots} shots in "
                              "the last {window} minutes.",
                   "why": ["Chaos blends turnovers, momentum swings and combined threat. "
                           "Nobody is in control."],
                   "why_casual": "Neither {home} nor {away} can keep the ball."},
            "ms": {"headline": "Fasa huru-hara",
                   "casual": "Permainan menjadi terbuka: bola sering bertukar tangan dan "
                             "peluang datang silih berganti.",
                   "analyst": "Indeks huru-hara {chaos}: {turnovers} kehilangan bola dan "
                              "{shots} rembatan dalam {window} minit terakhir.",
                   "why": ["Huru-hara menggabungkan kehilangan bola, perubahan momentum dan "
                           "jumlah ancaman. Tiada pasukan yang menguasai permainan."],
                   "why_casual": "{home} dan {away} sama-sama tidak dapat mengawal bola."},
            "es": {"headline": "Fase caótica",
                   "casual": "El partido se ha roto: el balón cambia de dueño sin parar y "
                             "llueven las ocasiones.",
                   "analyst": "Índice de caos {chaos}: {turnovers} pérdidas y {shots} disparos "
                              "en los últimos {window} minutos.",
                   "why": ["El caos combina pérdidas, vaivenes del impulso y amenaza total. "
                           "Nadie controla el partido."],
                   "why_casual": "Ni {home} ni {away} consiguen quedarse el balón."},
        },
    },
    "pressure_spike": {
        "*": {
            "en": {"headline": "{team} turn up the press",
                   "casual": "{team} are hunting the ball high up the pitch.",
                   "analyst": "PPDA {ppda} over the last {window} minutes: {ball_wins} high "
                              "ball wins, {forced_errors} forced errors.",
                   "why": ["PPDA is opponent passes allowed per defensive action; lower means "
                           "more intense pressing."],
                   "why_casual": "They are winning the ball back quickly."},
            "ms": {"headline": "{team} meningkatkan tekanan",
                   "casual": "{team} memburu bola jauh di kawasan lawan.",
                   "analyst": "PPDA {ppda} dalam {window} minit terakhir: {ball_wins} rampasan "
                              "bola di kawasan tinggi, {forced_errors} kesilapan dipaksa.",
                   "why": ["PPDA ialah bilangan hantaran lawan yang dibenarkan bagi setiap "
                           "tindakan bertahan; lebih rendah bermakna tekanan lebih kuat."],
                   "why_casual": "Mereka cepat merampas semula bola."},
            "es": {"headline": "{team} aprietan la presión",
                   "casual": "{team} salen a cazar el balón arriba.",
                   "analyst": "PPDA de {ppda} en los últimos {window} minutos: {ball_wins} "
                              "recuperaciones altas, {forced_errors} errores forzados.",
                   "why": ["PPDA son los pases rivales permitidos por cada acción defensiva; "
                           "cuanto más bajo, más intensa la presión."],
                   "why_casual": "Recuperan el balón muy rápido."},
        },
    },
    "win_prob_swing": {
        "up": {
            "en": {"headline": "Chances rising for {team}"},
            "ms": {"headline": "Peluang {team} semakin cerah"},
            "es": {"headline": "Crecen las opciones de {team}"},
        },
        "*": {
            "en": {"headline": "Chances fading for {team}"},
            "ms": {"headline": "Peluang {team} semakin pudar"},
            "es": {"headline": "Se apagan las opciones de {team}"},
        },
        "_all": {
            "en": {"casual": "Without a goal, the chance of {team} winning has moved from "
                             "{win_before} to {win_after}.",
                   "analyst": "{team}: {win_before} → {win_after} in {window} minutes. "
                              "{minutes_left} minutes left at {score}; creating {xg_rate} xG "
                              "per ninety.",
                   "why": ["The projection blends pre-match strength with live chance "
                           "creation and the time left."]},
            "ms": {"casual": "Tanpa sebarang gol, peluang {team} untuk menang berubah daripada "
                             "{win_before} kepada {win_after}.",
                   "analyst": "{team}: {win_before} → {win_after} dalam {window} minit. "
                              "{minutes_left} minit berbaki pada kedudukan {score}; mencipta "
                              "{xg_rate} xG setiap sembilan puluh minit.",
                   "why": ["Unjuran menggabungkan kekuatan sebelum perlawanan dengan peluang "
                           "yang dicipta secara langsung dan masa berbaki."]},
            "es": {"casual": "Sin goles, la probabilidad de victoria de {team} ha pasado del "
                             "{win_before} al {win_after}.",
                   "analyst": "{team}: {win_before} → {win_after} en {window} minutos. Quedan "
                              "{minutes_left} minutos con {score}; generan {xg_rate} xG por "
                              "noventa.",
                   "why": ["La proyección combina la fuerza previa al partido con las "
                           "ocasiones generadas en directo y el tiempo restante."]},
        },
    },
    "tempo_shift": {
        "up": {
            "en": {"headline": "The tempo rises",
                   "casual": "Both teams are moving the ball much faster now."},
            "ms": {"headline": "Rentak permainan semakin laju",
                   "casual": "Kedua-dua pasukan kini menggerakkan bola dengan lebih pantas."},
            "es": {"headline": "Sube el ritmo",
                   "casual": "Los dos equipos mueven el balón mucho más rápido."},
        },
        "*": {
            "en": {"headline": "The game slows down",
                   "casual": "The game has slowed right down."},
            "ms": {"headline": "Rentak permainan menjadi perlahan",
                   "casual": "Permainan menjadi jauh lebih perlahan."},
            "es": {"headline": "El partido se frena",
                   "casual": "El partido ha bajado mucho de ritmo."},
        },
        "_all": {
            "en": {"analyst": "{tempo} passes a minute over the last {window} minutes, "
                              "from {tempo_before}.",
                   "why": ["Tempo is passes per minute by both teams: the rhythm of the game."]},
            "ms": {"analyst": "{tempo} hantaran seminit dalam {window} minit terakhir, "
                              "berbanding {tempo_before}.",
                   "why": ["Rentak ialah jumlah hantaran seminit oleh kedua-dua pasukan."]},
            "es": {"analyst": "{tempo} pases por minuto en los últimos {window} minutos, "
                              "antes {tempo_before}.",
                   "why": ["El ritmo son los pases por minuto de ambos equipos."]},
        },
    },
    "player_milestone": {
        "passes": {
            "en": {"headline": "{player}: {count} completed passes",
                   "casual": "{player} is running the show for {team}.",
                   "analyst": "{player} reaches {count} completed passes."},
            "ms": {"headline": "{player}: {count} hantaran berjaya",
                   "casual": "{player} mengemudi permainan {team}.",
                   "analyst": "{player} mencapai {count} hantaran berjaya."},
            "es": {"headline": "{player}: {count} pases completados",
                   "casual": "{player} lleva la batuta de {team}.",
                   "analyst": "{player} alcanza {count} pases completados."},
        },
        "*": {
            "en": {"headline": "{player}: {count} ball wins",
                   "casual": "{player} keeps winning the ball back for {team}.",
                   "analyst": "{player} reaches {count} tackles and interceptions."},
            "ms": {"headline": "{player}: {count} rampasan bola",
                   "casual": "{player} terus merampas semula bola untuk {team}.",
                   "analyst": "{player} mencapai {count} terjahan dan pintasan."},
            "es": {"headline": "{player}: {count} recuperaciones",
                   "casual": "{player} no para de recuperar balones para {team}.",
                   "analyst": "{player} llega a {count} entradas e intercepciones."},
        },
    },
    "player_focus": {
        "*": {
            "en": {"headline": "{player} so far",
                   "casual": "{player} has had {touches} touches and won the ball back "
                             "{ball_wins} times.",
                   "analyst": "{player}: {touches} touches, {passes_completed} passes completed "
                              "({pass_accuracy}), {xt} xT added, {shots} shots, {ball_wins} "
                              "ball wins."},
            "ms": {"headline": "{player} setakat ini",
                   "casual": "{player} telah menyentuh bola {touches} kali dan merampas semula "
                             "bola {ball_wins} kali.",
                   "analyst": "{player}: {touches} sentuhan, {passes_completed} hantaran "
                              "berjaya ({pass_accuracy}), {xt} xT ditambah, {shots} rembatan, "
                              "{ball_wins} rampasan bola."},
            "es": {"headline": "{player} hasta ahora",
                   "casual": "{player} suma {touches} toques y ha recuperado el balón "
                             "{ball_wins} veces.",
                   "analyst": "{player}: {touches} toques, {passes_completed} pases completados "
                              "({pass_accuracy}), {xt} xT añadido, {shots} disparos, "
                              "{ball_wins} recuperaciones."},
        },
    },
}

# Optional sentences, added when the fact exists: EXTRAS[type][lang][fact_key]
EXTRAS: dict[str, dict[str, dict[str, str]]] = {
    "goal": {
        "en": {"assist": "Set up by {assist}.", "player_goals": "That's {player_goals} for "
                                                               "{player} today."},
        "ms": {"assist": "Hantaran daripada {assist}.", "player_goals": "Itu gol ke-"
                                                                       "{player_goals} untuk "
                                                                       "{player} hari ini."},
        "es": {"assist": "Asistencia de {assist}.", "player_goals": "Ya van {player_goals} de "
                                                                   "{player} hoy."},
    },
    "momentum_flip": {
        "en": {"player": "{player} is driving it."},
        "ms": {"player": "{player} menjadi penggeraknya."},
        "es": {"player": "{player} es quien tira del carro."},
    },
    "pressure_spike": {
        "en": {"ppda_before": "It was {ppda_before} in the ten minutes before."},
        "ms": {"ppda_before": "Sebelum itu ia {ppda_before} dalam sepuluh minit."},
        "es": {"ppda_before": "En los diez minutos anteriores era {ppda_before}."},
    },
}

FACT_LABELS: dict[str, dict[str, str]] = {
    "player": {"en": "Player", "ms": "Pemain", "es": "Jugador"},
    "team": {"en": "Team", "ms": "Pasukan", "es": "Equipo"},
    "opponent": {"en": "Opponent", "ms": "Lawan", "es": "Rival"},
    "home": {"en": "Home", "ms": "Tuan rumah", "es": "Local"},
    "away": {"en": "Away", "ms": "Pelawat", "es": "Visitante"},
    "assist": {"en": "Assist", "ms": "Bantuan", "es": "Asistencia"},
    "score": {"en": "Score", "ms": "Kedudukan", "es": "Marcador"},
    "xg": {"en": "Shot xG", "ms": "xG rembatan", "es": "xG del disparo"},
    "chance_pct": {"en": "Chance of scoring", "ms": "Kebarangkalian gol",
                   "es": "Probabilidad de gol"},
    "speed": {"en": "Ball speed", "ms": "Kelajuan bola", "es": "Velocidad del balón"},
    "distance": {"en": "Distance", "ms": "Jarak", "es": "Distancia"},
    "length": {"en": "Pass length", "ms": "Jarak hantaran", "es": "Longitud del pase"},
    "difficulty": {"en": "Pass difficulty", "ms": "Kesukaran hantaran",
                   "es": "Dificultad del pase"},
    "xt": {"en": "xT added", "ms": "xT ditambah", "es": "xT añadido"},
    "win_before": {"en": "Win chance before", "ms": "Peluang menang sebelum",
                   "es": "Prob. de victoria antes"},
    "win_after": {"en": "Win chance after", "ms": "Peluang menang selepas",
                  "es": "Prob. de victoria después"},
    "team_xg": {"en": "Team xG", "ms": "xG pasukan", "es": "xG del equipo"},
    "opp_xg": {"en": "Opponent xG", "ms": "xG lawan", "es": "xG del rival"},
    "player_goals": {"en": "Player's goals", "ms": "Gol pemain", "es": "Goles del jugador"},
    "share": {"en": "Share of threat", "ms": "Bahagian ancaman", "es": "Cuota de amenaza"},
    "team_threat": {"en": "Team threat", "ms": "Ancaman pasukan", "es": "Amenaza del equipo"},
    "opp_threat": {"en": "Opponent threat", "ms": "Ancaman lawan", "es": "Amenaza del rival"},
    "window": {"en": "Window (minutes)", "ms": "Tempoh (minit)", "es": "Ventana (minutos)"},
    "control": {"en": "Control", "ms": "Kawalan", "es": "Control"},
    "possession": {"en": "Possession", "ms": "Penguasaan bola", "es": "Posesión"},
    "tilt": {"en": "Field tilt", "ms": "Kecondongan padang", "es": "Inclinación del campo"},
    "chaos": {"en": "Chaos index", "ms": "Indeks huru-hara", "es": "Índice de caos"},
    "turnovers": {"en": "Turnovers", "ms": "Kehilangan bola", "es": "Pérdidas"},
    "shots": {"en": "Shots", "ms": "Rembatan", "es": "Disparos"},
    "ppda": {"en": "PPDA", "ms": "PPDA", "es": "PPDA"},
    "ppda_before": {"en": "PPDA before", "ms": "PPDA sebelum", "es": "PPDA antes"},
    "ball_wins": {"en": "Ball wins", "ms": "Rampasan bola", "es": "Recuperaciones"},
    "forced_errors": {"en": "Forced errors", "ms": "Kesilapan dipaksa",
                      "es": "Errores forzados"},
    "xg_rate": {"en": "xG per 90", "ms": "xG setiap 90", "es": "xG por 90"},
    "minutes_left": {"en": "Minutes left", "ms": "Minit berbaki", "es": "Minutos restantes"},
    "tempo": {"en": "Passes per minute", "ms": "Hantaran seminit", "es": "Pases por minuto"},
    "tempo_before": {"en": "Passes per minute before", "ms": "Hantaran seminit sebelum",
                     "es": "Pases por minuto antes"},
    "count": {"en": "Count", "ms": "Jumlah", "es": "Total"},
    "touches": {"en": "Touches", "ms": "Sentuhan", "es": "Toques"},
    "passes_completed": {"en": "Passes completed", "ms": "Hantaran berjaya",
                         "es": "Pases completados"},
    "pass_accuracy": {"en": "Pass accuracy", "ms": "Ketepatan hantaran",
                      "es": "Precisión de pase"},
    "minute": {"en": "Minute", "ms": "Minit", "es": "Minuto"},
}

PHASE_LABELS = {
    "control": {"en": "{team} in control", "ms": "{team} menguasai permainan",
                "es": "{team} controlan el partido"},
    "chaos": {"en": "Chaotic phase", "ms": "Fasa huru-hara", "es": "Fase caótica"},
    "balanced": {"en": "Evenly balanced", "ms": "Seimbang", "es": "Partido equilibrado"},
}

PROJECTION_NOTE = {
    "en": "A projection from the score, time left and chance creation, not betting odds.",
    "ms": "Unjuran berdasarkan kedudukan, masa berbaki dan peluang yang dicipta, bukan odds "
          "pertaruhan.",
    "es": "Una proyección según el marcador, el tiempo restante y las ocasiones generadas; "
          "no son cuotas de apuestas.",
}
DRIVER_LABELS = {
    "score": {"en": "Score", "ms": "Kedudukan", "es": "Marcador"},
    "minutes_left": {"en": "Minutes left", "ms": "Minit berbaki", "es": "Minutos restantes"},
    "home_rate": {"en": "{team} expected goals per 90", "ms": "Jangkaan gol {team} setiap 90",
                  "es": "Goles esperados de {team} por 90"},
    "away_rate": {"en": "{team} expected goals per 90", "ms": "Jangkaan gol {team} setiap 90",
                  "es": "Goles esperados de {team} por 90"},
    "reds": {"en": "Red cards", "ms": "Kad merah", "es": "Tarjetas rojas"},
    "live_weight": {"en": "Weight on live data", "ms": "Pemberat data langsung",
                    "es": "Peso de los datos en directo"},
}

METRIC_I18N: dict[str, dict[str, tuple[str, str]]] = {
    # key -> lang -> (label, definition); English lives in live/metrics.py
    "goals": {"ms": ("Gol", "Jumlah gol."), "es": ("Goles", "Goles marcados.")},
    "xg": {"ms": ("Jangkaan gol (xG)", "Jumlah kualiti peluang bagi setiap rembatan: "
                  "kebarangkalian rembatan itu menjadi gol."),
           "es": ("Goles esperados (xG)", "Suma de la calidad de cada disparo: la "
                  "probabilidad de que acabe en gol.")},
    "shots": {"ms": ("Rembatan", "Semua percubaan ke arah gol."),
              "es": ("Disparos", "Todos los intentos a portería.")},
    "sot": {"ms": ("Rembatan tepat", "Rembatan yang menjadi gol atau diselamatkan."),
            "es": ("Disparos a puerta", "Disparos que acabaron en gol o parada.")},
    "xt": {"ms": ("Jangkaan ancaman (xT)", "Sejauh mana hantaran berjaya menaikkan peluang "
                  "menjaringkan gol, daripada grid zon padang."),
           "es": ("Amenaza esperada (xT)", "Cuánto aumentaron los pases completados la "
                  "probabilidad de marcar, según una cuadrícula de zonas.")},
    "possession": {"ms": ("Penguasaan bola", "Bahagian daripada semua hantaran."),
                   "es": ("Posesión", "Proporción de todos los pases.")},
    "field_tilt": {"ms": ("Kecondongan padang", "Bahagian hantaran di sepertiga akhir."),
                   "es": ("Inclinación del campo", "Proporción de pases en el último tercio.")},
    "pass_accuracy": {"ms": ("Ketepatan hantaran", "Hantaran berjaya / hantaran dicuba."),
                      "es": ("Precisión de pase", "Pases completados / pases intentados.")},
    "avg_pass_length": {"ms": ("Purata jarak hantaran", "Purata jarak hantaran yang dicuba."),
                        "es": ("Longitud media del pase", "Distancia media de los pases.")},
    "pass_difficulty": {"ms": ("Purata kesukaran hantaran", "Satu tolak kebarangkalian "
                               "jangkaan hantaran berjaya."),
                        "es": ("Dificultad media del pase", "Uno menos la probabilidad "
                               "esperada de completar el pase.")},
    "ppda": {"ms": ("PPDA (tekanan)", "Hantaran lawan yang dibenarkan bagi setiap tindakan "
                    "bertahan di kawasan tinggi. Lebih rendah = tekanan lebih kuat."),
             "es": ("PPDA (presión)", "Pases rivales permitidos por acción defensiva en campo "
                    "contrario. Más bajo = presión más intensa.")},
    "pressures": {"ms": ("Tekanan", "Kali pemain menekan pembawa bola."),
                  "es": ("Presiones", "Veces que un jugador presionó al poseedor.")},
    "ball_wins": {"ms": ("Rampasan bola", "Terjahan dan pintasan."),
                  "es": ("Recuperaciones", "Entradas e intercepciones.")},
    "top_shot_speed": {"ms": ("Rembatan terpantas", "Kelajuan bola tertinggi bagi rembatan."),
                       "es": ("Disparo más rápido", "Mayor velocidad de balón en un disparo.")},
    "corners": {"ms": ("Sepakan sudut", "Sepakan sudut diperoleh."),
                "es": ("Córners", "Saques de esquina a favor.")},
    "fouls": {"ms": ("Kekasaran", "Kekasaran dilakukan."),
              "es": ("Faltas", "Faltas cometidas.")},
}

# Roll-ups: half-time / full-time briefs, catch-up, season. BRIEF[key][lang]
BRIEF: dict[str, dict[str, str]] = {
    "ht_lead": {"en": "{leader} lead {score} at the break",
                "ms": "{leader} mendahului {score} pada waktu rehat",
                "es": "{leader} ganan {score} al descanso"},
    "ht_level": {"en": "Level at {score} at the break",
                 "ms": "Seri {score} pada waktu rehat",
                 "es": "Empate a {score} al descanso"},
    "ft_win": {"en": "{winner} win {score}", "ms": "{winner} menang {score}",
               "es": "{winner} ganan {score}"},
    "ft_comeback": {"en": "{winner} come from behind to win {score}",
                    "ms": "{winner} bangkit daripada ketinggalan untuk menang {score}",
                    "es": "{winner} remontan y ganan {score}"},
    "ft_against_run": {"en": "{winner} win {score} against the run of play",
                       "ms": "{winner} menang {score} di luar jangkaan",
                       "es": "{winner} ganan {score} contra la corriente"},
    "ft_draw": {"en": "It ends {score}", "ms": "Perlawanan berakhir {score}",
                "es": "Termina {score}"},
    "summary_control": {"en": "{team} had more of the control: {team_minutes} minutes to "
                              "{opp_minutes}.",
                        "ms": "{team} lebih menguasai permainan: {team_minutes} minit berbanding "
                              "{opp_minutes}.",
                        "es": "{team} tuvieron más el control: {team_minutes} minutos frente a "
                              "{opp_minutes}."},
    "summary_even": {"en": "Neither side controlled it for long; {chaos_minutes} minutes were "
                           "chaotic.",
                     "ms": "Tiada pasukan yang menguasai permainan untuk tempoh lama; "
                           "{chaos_minutes} minit berlaku dalam keadaan huru-hara.",
                     "es": "Nadie dominó mucho tiempo; {chaos_minutes} minutos fueron de caos."},
    "summary_turn": {"en": "The key moment came at {turn_minute}': {turn_headline}.",
                     "ms": "Detik penting berlaku pada minit ke-{turn_minute}: "
                           "{turn_headline}.",
                     "es": "El momento clave llegó en el minuto {turn_minute}: "
                           "{turn_headline}."},
    "why_control_title": {"en": "Who controlled it", "ms": "Siapa yang menguasai",
                          "es": "Quién mandó"},
    "why_control": {"en": "{home} in control for {home_minutes} minutes, {away} for "
                          "{away_minutes}; {chaos_minutes} chaotic minutes.",
                    "ms": "{home} menguasai selama {home_minutes} minit, {away} selama "
                          "{away_minutes} minit; {chaos_minutes} minit huru-hara.",
                    "es": "{home} con el control durante {home_minutes} minutos, {away} "
                          "durante {away_minutes}; {chaos_minutes} minutos de caos."},
    "why_chances_title": {"en": "Chance quality", "ms": "Kualiti peluang",
                          "es": "Calidad de las ocasiones"},
    "why_chances_fair": {"en": "{team} created more, {team_xg} xG to {opp_xg}, and the score "
                               "reflects it.",
                         "ms": "{team} mencipta lebih banyak peluang, {team_xg} xG berbanding "
                               "{opp_xg}, dan kedudukan mencerminkannya.",
                         "es": "{team} generaron más, {team_xg} xG frente a {opp_xg}, y el "
                               "marcador lo refleja."},
    "why_chances_unfair": {"en": "{team} created more, {team_xg} xG to {opp_xg}, but the score "
                                 "doesn't show it.",
                           "ms": "{team} mencipta lebih banyak peluang, {team_xg} xG berbanding "
                                 "{opp_xg}, tetapi kedudukan tidak menunjukkannya.",
                           "es": "{team} generaron más, {team_xg} xG frente a {opp_xg}, pero el "
                                 "marcador no lo refleja."},
    "why_chances_even": {"en": "Chances were close: {home_xg} xG to {away_xg}.",
                         "ms": "Peluang hampir sama: {home_xg} xG berbanding {away_xg}.",
                         "es": "Ocasiones parejas: {home_xg} xG frente a {away_xg}."},
    "why_press_title": {"en": "Pressing", "ms": "Tekanan", "es": "Presión"},
    "why_press": {"en": "{team} pressed harder: PPDA {ppda} against {opp_ppda}.",
                  "ms": "{team} menekan lebih kuat: PPDA {ppda} berbanding {opp_ppda}.",
                  "es": "{team} presionaron más: PPDA de {ppda} frente a {opp_ppda}."},
    "watch_projection_title": {"en": "Projection", "ms": "Unjuran", "es": "Proyección"},
    "watch_projection": {"en": "{home} win {home_p}, draw {draw_p}, {away} win {away_p}.",
                         "ms": "{home} menang {home_p}, seri {draw_p}, {away} menang {away_p}.",
                         "es": "Gana {home} {home_p}, empate {draw_p}, gana {away} {away_p}."},
    "watch_momentum_title": {"en": "Who finished stronger", "ms": "Siapa lebih kuat di akhir",
                             "es": "Quién acabó mejor"},
    "watch_momentum": {"en": "{team} ended the half on top, with {share} of the recent threat.",
                       "ms": "{team} menamatkan separuh masa dengan lebih baik, memiliki {share} "
                             "daripada ancaman terkini.",
                       "es": "{team} acabaron la primera parte arriba, con el {share} de la "
                             "amenaza reciente."},
    "watch_momentum_even": {"en": "Neither side finished the half on top.",
                            "ms": "Tiada pasukan yang menamatkan separuh masa dengan lebih baik.",
                            "es": "Ningún equipo acabó la primera parte por encima."},
    "watch_cards_title": {"en": "Discipline", "ms": "Disiplin", "es": "Disciplina"},
    "watch_reds": {"en": "{team} are down to ten for the second half.",
                   "ms": "{team} hanya ada sepuluh pemain untuk separuh masa kedua.",
                   "es": "{team} jugarán la segunda parte con diez."},
    "watch_yellows": {"en": "{yellows} yellow cards already: someone is on thin ice.",
                      "ms": "Sudah {yellows} kad kuning: ada pemain yang perlu berhati-hati.",
                      "es": "Ya hay {yellows} amarillas: alguien juega con fuego."},
    "watch_player": {"en": "{touches} touches and {xt} xT added so far. One to watch.",
                     "ms": "{touches} sentuhan dan {xt} xT ditambah setakat ini. Pemain untuk "
                           "diperhatikan.",
                     "es": "{touches} toques y {xt} xT añadido hasta ahora. Uno a seguir."},
    "catchup": {"en": "{minute}': {home} {score} {away}. {phase}.",
                "ms": "Minit ke-{minute}: {home} {score} {away}. {phase}.",
                "es": "Minuto {minute}: {home} {score} {away}. {phase}."},
    "season_leader_title": {"en": "Top of the table", "ms": "Pendahulu liga",
                            "es": "Líder de la tabla"},
    "season_leader": {"en": "{team} lead with {points} points from {played} matches.",
                      "ms": "{team} mendahului dengan {points} mata daripada {played} "
                            "perlawanan.",
                      "es": "{team} lideran con {points} puntos en {played} partidos."},
    "season_control_title": {"en": "Masters of control", "ms": "Raja kawalan",
                             "es": "Dueños del control"},
    "season_control": {"en": "{team} are in control for {share} of their minutes, more than "
                             "anyone.",
                       "ms": "{team} menguasai {share} daripada minit perlawanan mereka, paling "
                             "tinggi dalam liga.",
                       "es": "{team} tienen el control el {share} de sus minutos, más que "
                             "nadie."},
    "season_run_title": {"en": "Winning without the ball", "ms": "Menang tanpa menguasai",
                         "es": "Ganar sin el balón"},
    "season_run": {"en": "{team} have won {count} matches while having less of the control.",
                   "ms": "{team} menang {count} perlawanan walaupun kurang menguasai permainan.",
                   "es": "{team} han ganado {count} partidos teniendo menos el control."},
    "season_finish_title": {"en": "Beating their chances", "ms": "Melebihi jangkaan",
                            "es": "Por encima de sus ocasiones"},
    "season_finish": {"en": "{team} have scored {goals} from {xg} xG: clinical, or lucky.",
                      "ms": "{team} menjaringkan {goals} gol daripada {xg} xG: tajam, atau "
                            "bernasib baik.",
                      "es": "{team} han marcado {goals} goles con {xg} xG: letales, o con "
                            "suerte."},
    "season_chaos_title": {"en": "Chaos merchants", "ms": "Pakar huru-hara",
                           "es": "Amantes del caos"},
    "season_chaos": {"en": "{team} spend {share} of their minutes in chaos, the most in the "
                           "league.",
                     "ms": "{share} daripada minit perlawanan {team} adalah huru-hara, paling "
                           "banyak dalam liga.",
                     "es": "El {share} de los minutos de {team} son caóticos, el que más."},
    "season_yours_title": {"en": "Your team", "ms": "Pasukan anda", "es": "Tu equipo"},
    "season_yours": {"en": "{team} sit in position {position} with {points} points, {xg} xG "
                           "for and {xga} against.",
                     "ms": "{team} berada di kedudukan {position} dengan {points} mata, {xg} xG "
                           "dicipta dan {xga} dibolehkan.",
                     "es": "{team} van en la posición {position} con {points} puntos, {xg} xG "
                           "a favor y {xga} en contra."},
}

FACT_LABELS.update({
    "home_minutes": {"en": "Home control minutes", "ms": "Minit kawalan tuan rumah",
                     "es": "Minutos de control local"},
    "away_minutes": {"en": "Away control minutes", "ms": "Minit kawalan pelawat",
                     "es": "Minutos de control visitante"},
    "chaos_minutes": {"en": "Chaotic minutes", "ms": "Minit huru-hara",
                      "es": "Minutos de caos"},
    "team_minutes": {"en": "Control minutes", "ms": "Minit kawalan", "es": "Minutos de control"},
    "opp_minutes": {"en": "Opponent control minutes", "ms": "Minit kawalan lawan",
                    "es": "Minutos de control rival"},
    "home_xg": {"en": "Home xG", "ms": "xG tuan rumah", "es": "xG local"},
    "away_xg": {"en": "Away xG", "ms": "xG pelawat", "es": "xG visitante"},
    "opp_ppda": {"en": "Opponent PPDA", "ms": "PPDA lawan", "es": "PPDA rival"},
    "home_p": {"en": "Home win", "ms": "Tuan rumah menang", "es": "Gana local"},
    "draw_p": {"en": "Draw", "ms": "Seri", "es": "Empate"},
    "away_p": {"en": "Away win", "ms": "Pelawat menang", "es": "Gana visitante"},
    "yellows": {"en": "Yellow cards", "ms": "Kad kuning", "es": "Amarillas"},
    "points": {"en": "Points", "ms": "Mata", "es": "Puntos"},
    "played": {"en": "Played", "ms": "Main", "es": "Jugados"},
    "position": {"en": "Position", "ms": "Kedudukan", "es": "Posición"},
    "goals": {"en": "Goals", "ms": "Gol", "es": "Goles"},
    "xga": {"en": "xG against", "ms": "xG dibolehkan", "es": "xG en contra"},
    "leader": {"en": "Leader", "ms": "Pendahulu", "es": "Líder"},
    "winner": {"en": "Winner", "ms": "Pemenang", "es": "Ganador"},
    "turn_minute": {"en": "Key minute", "ms": "Minit penting", "es": "Minuto clave"},
    "turn_headline": {"en": "Key moment", "ms": "Detik penting", "es": "Momento clave"},
    "phase": {"en": "Phase", "ms": "Fasa", "es": "Fase"},
})
