# 🤖 OpenClaw Skill Guide: ASUS Mesh WiFi Analyzer

> **Für OpenClaw AI Assistants** - Diese Anleitung erklärt wie du diesen Skill optimal nutzt, um Nutzern bei WiFi-Problemen zu helfen.

---

## 📋 Inhaltsverzeichnis

1. [Quick Start](#-quick-start)
2. [Empfohlener Workflow](#-empfohlener-workflow)
3. [Alle Actions im Detail](#-alle-actions-im-detail)
4. [Daten visualisieren](#-daten-visualisieren)
5. [Typische Use Cases](#-typische-use-cases)
6. [Fehlerbehandlung](#-fehlerbehandlung)

---

## 🚀 Quick Start

### Erster Schritt: Immer mit Full Scan starten

```json
{
  "action": "full_intelligence_scan",
  "params": {
    "targets": ["minimize_interference", "protect_zigbee"]
  }
}
```

Dieser Scan sammelt **alle verfügbaren Daten** und gibt dir:
- Environment Score (0-100)
- Spectrum-Übersicht (Congestion pro Band)
- Zigbee-Status und Konflikte
- Top 5 Recommendations mit Confidence-Score

**Zeige dem User immer zuerst den Environment Score!**

---

## 🔄 Empfohlener Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW WORKFLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1️⃣ VERSTEHEN ─────────────────────────────────────────────  │
│     └─ full_intelligence_scan                                │
│        → Zeige Environment Score + Hauptprobleme             │
│                                                              │
│  2️⃣ DETAILS ───────────────────────────────────────────────  │
│     ├─ get_problems (wenn Score < 70)                        │
│     ├─ get_frequency_conflicts (wenn Zigbee vorhanden)       │
│     └─ get_channel_scan (bei Interferenz-Problemen)          │
│                                                              │
│  3️⃣ LÖSEN ─────────────────────────────────────────────────  │
│     ├─ get_optimization_suggestions                          │
│     └─ apply_optimization (mit confirm=true)                 │
│                                                              │
│  4️⃣ VERIFIZIEREN ──────────────────────────────────────────  │
│     └─ scan_network → Neuen Score zeigen                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Alle Actions im Detail

### 🔍 Analyse Actions

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `full_intelligence_scan` | **Immer zuerst!** Bei jedem neuen Gespräch | Environment Score, Recommendations |
| `scan_network` | Quick-Refresh der Netzwerk-Daten | Nodes, Devices, Settings |
| `get_network_health` | Health-Score mit Kategorien | Score 0-100 pro Kategorie |
| `get_device_list` | Alle verbundenen Geräte | MAC, IP, Signal, Typ |
| `get_mesh_nodes` | Status aller Mesh-Knoten | Nodes mit CPU, RAM, Clients |
| `get_wifi_settings` | Aktuelle WiFi-Konfiguration | Kanäle, Breiten, Features |

### 🔬 Diagnose Actions

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `get_problems` | Bei Score < 70 oder User klagt | Liste mit Severity |
| `get_frequency_conflicts` | Bei Zigbee-Problemen | WiFi/Zigbee Overlap-Analyse |
| `get_channel_scan` | Bei Interferenz | Nachbar-Netzwerke pro Kanal |
| `get_device_details` | Für spezifisches Gerät | Signal-History, Connection |
| `get_connection_stability` | Bei Verbindungsabbrüchen | Disconnect-Events, Roaming |
| `scan_rogue_iot` | IoT-Geräte in Setup-Modus | Setup-APs die stören könnten |

### ⚡ Optimierung Actions

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `get_optimization_suggestions` | Nach Analyse | Priorisierte Vorschläge |
| `apply_optimization` | Mit User-Bestätigung | Änderung anwenden |
| `set_wifi_channel` | Direkte Kanal-Änderung | Ergebnis |
| `sync_mesh_settings` | Alle Nodes synchronisieren | Sync-Status |
| `restart_wireless` | Nach Änderungen | Wireless-Neustart |

### 📊 Visualisierung Actions

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `get_heatmap` | Signal-Abdeckung zeigen | Heatmap-Daten (siehe unten) |
| `get_spatial_map` | Geräte-Positionen | Triangulierte Positionen |
| `get_environment_summary` | Quick Markdown Summary | Formatierter Text |

### 🏠 Smart Home Actions

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `scan_zigbee` | Zigbee-Netzwerk scannen | Devices, Links, LQI |
| `get_zigbee_devices` | Zigbee-Geräte-Liste | Alle Zigbee-Devices |
| `analyze_network_topology` | SNMP-Topologie | Switches, Bottlenecks |
| `run_benchmark` | Performance-Test | iPerf3 Ergebnisse |

---

## 🎨 Daten visualisieren

### Environment Score anzeigen

```
🌐 Netzwerk-Gesundheit: 72/100

┌────────────────────────────────────────┐
│ ████████████████████░░░░░░░░ 72%      │
└────────────────────────────────────────┘

📊 Kategorien:
  • WiFi Health:        85/100 ✅
  • Spectrum Clarity:   45/100 ⚠️
  • Cross-Protocol:     90/100 ✅
  • Stability:          68/100 ⚠️
```

### Heatmap als ASCII-Art

Wenn `get_heatmap` aufgerufen wird, zeige die Daten so:

```
📡 Signal-Heatmap (Erdgeschoss)

    0   5   10  15  20  25  30 (Meter)
  ┌─────────────────────────────────┐
0 │ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░ │
2 │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░ │
4 │ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░ │  🔴 Router
6 │ ▓▓▓▓░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
8 │ ░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │  🟡 Node 1
10│ ░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
  └─────────────────────────────────┘

Legende: ▓ Exzellent (>80%) ▒ Gut (50-80%) ░ Schwach (<50%)

⚠️ Dead Zone erkannt bei (12, 4) - Radius: 3m
💡 Empfehlung: Mesh-Node in der Nähe von Position (10, 5) platzieren
```

### Nachbar-Netzwerke visualisieren

```
📻 Kanal-Belegung 2.4 GHz

Ch 1  │████████░░░░│ 3 Netzwerke  ← Empfohlen
Ch 2  │░░░░░░░░░░░░│ 0
Ch 3  │░░░░░░░░░░░░│ 0
Ch 4  │░░░░░░░░░░░░│ 0
Ch 5  │░░░░░░░░░░░░│ 0
Ch 6  │████████████████████│ 8 Netzwerke ⚠️ Überlastet
Ch 7  │████░░░░░░░░│ 1
...
Ch 11 │████████████│ 5 Netzwerke

🔴 Dein Netzwerk: Kanal 6 (stark überlastet!)
💡 Wechsel zu Kanal 1 würde Interferenz um ~40% reduzieren
```

### WiFi/Zigbee Konflikt anzeigen

```
⚠️ Frequenz-Konflikt erkannt!

┌─────────────────────────────────────────────────────────────┐
│  2.4 GHz Spektrum                                            │
│                                                              │
│  WiFi Ch 6        Zigbee Ch 15                              │
│  ████████████     ████████                                  │
│  ────────────────────────────────────────────────────────── │
│  2412 MHz   2437 MHz   2462 MHz        2525 MHz             │
│              ↑                          ↑                    │
│              └────── OVERLAP! ──────────┘                    │
│                                                              │
│  Überlappung: 45% → Konflikt-Stufe: HOCH                    │
└─────────────────────────────────────────────────────────────┘

🛠️ Lösungen:
  1. WiFi auf Kanal 1 wechseln (kein Overlap mit Zigbee 15)
  2. Zigbee auf Kanal 25 wechseln (kein Overlap mit WiFi 6)
```

### Geräte-Liste formatieren

```
📱 Verbundene Geräte (48 total)

┌─────────────────────────────────────────────────────────────┐
│ Gerät                  │ Signal │ Band    │ Node          │
├─────────────────────────────────────────────────────────────┤
│ 📱 iPhone-Max          │ -52dBm │ 5GHz    │ Wohnzimmer    │
│ 💻 MacBook-Pro         │ -45dBm │ 5GHz    │ Hauptrouter   │
│ 🔌 Shelly-Plug-1       │ -71dBm │ 2.4GHz  │ Küche         │
│ 📺 Samsung-TV          │ -58dBm │ 5GHz    │ Wohnzimmer    │
│ ⚠️ ESP-Setup           │ -65dBm │ 2.4GHz  │ -             │ ← Setup-AP!
└─────────────────────────────────────────────────────────────┘

⚠️ 3 Geräte mit schwachem Signal (<-70dBm)
⚠️ 1 Gerät im Setup-Modus (könnte WiFi stören)
```

---

## 💡 Typische Use Cases

### Use Case 1: "Mein Internet ist langsam"

```
1. full_intelligence_scan
   → Zeige Environment Score
   → Identifiziere Hauptproblem (meist Interferenz)

2. get_channel_scan
   → Zeige Kanal-Belegung
   → Erkläre welche Kanäle überlastet sind

3. get_optimization_suggestions
   → Zeige beste Lösung

4. apply_optimization (mit confirm=true)
   → Wende an

5. "Änderung angewendet. Bitte teste dein Internet in 2-3 Minuten."
```

### Use Case 2: "Zigbee-Geräte reagieren langsam"

```
1. full_intelligence_scan mit targets: ["protect_zigbee"]
   → Prüfe hasConflictWithWifi

2. get_frequency_conflicts
   → Zeige Overlap-Visualisierung

3. Erkläre das Problem:
   "Dein WiFi Kanal 6 überlappt mit Zigbee Kanal 15. 
    Das stört deine Smart Home Geräte."

4. Biete Lösungen an:
   - WiFi Kanal ändern (empfohlen)
   - Oder Zigbee Kanal ändern (komplizierter)
```

### Use Case 3: "In der Küche hab ich kein WLAN"

```
1. get_heatmap mit floor: 0
   → Zeige ASCII-Heatmap

2. get_mesh_nodes
   → Zeige Position der Nodes

3. Erkläre Dead Zone:
   "Die Küche ist zu weit vom nächsten Mesh-Node entfernt."

4. Empfehle:
   - Mesh-Node näher platzieren
   - Oder zusätzlichen Node kaufen
```

### Use Case 4: "Welche Geräte sind verbunden?"

```
1. get_device_list
   → Zeige formatierte Geräte-Tabelle

2. Gruppiere nach:
   - Band (2.4GHz vs 5GHz)
   - Signal-Stärke
   - Node

3. Hebe Probleme hervor:
   - Schwache Signale
   - Setup-APs
   - Unbekannte Geräte
```

### Use Case 5: "Mein Gerät X verbindet sich ständig neu"

```
1. get_device_details mit macAddress
   → Signal-History

2. get_connection_stability mit macAddress
   → Disconnect-Events

3. Analysiere:
   - Roaming zwischen Nodes?
   - Signal-Schwankungen?
   - Bestimmte Uhrzeiten?

4. Lösungen vorschlagen:
   - Band Steering aktivieren
   - Node näher platzieren
   - 5GHz bevorzugen
```

---

## ⚠️ Fehlerbehandlung

### SSH-Verbindung fehlgeschlagen

```
Wenn: "SSH connection failed"
Dann: 
  1. Prüfe ob Router erreichbar ist
  2. Prüfe SSH-Credentials in .env
  3. Merlin-Firmware erforderlich!
  
Sage dem User:
  "Ich kann keine Verbindung zum Router herstellen. 
   Bitte stelle sicher, dass SSH aktiviert ist 
   (Router-Webinterface → Administration → System → SSH-Daemon aktivieren)"
```

### Home Assistant nicht erreichbar

```
Wenn: errors enthält "Home Assistant"
Dann:
  - Zigbee-Features sind eingeschränkt
  - WiFi-Analyse funktioniert trotzdem!
  
Sage dem User:
  "Home Assistant ist nicht erreichbar. Zigbee-Analyse ist deaktiviert,
   aber ich kann trotzdem dein WiFi-Netzwerk analysieren."
```

### Kein Building Config für Heatmap

```
Wenn: get_heatmap gibt leere points zurück
Dann:
  - Zeige die Recommendations aus dem Placeholder
  
Sage dem User:
  "Für eine detaillierte Signal-Heatmap benötige ich die Gebäude-Maße.
   Kannst du mir sagen wie groß dein Zuhause ungefähr ist? (z.B. 120m², 2 Stockwerke)"
```

---

## 🎯 Best Practices

1. **Immer mit full_intelligence_scan starten** - gibt dir den kompletten Überblick

2. **Environment Score zuerst zeigen** - User versteht sofort ob es Probleme gibt

3. **Visualisiere komplexe Daten** - ASCII-Art ist besser als JSON

4. **Erkläre das "Warum"** - Nicht nur was, sondern warum es ein Problem ist

5. **Biete konkrete Lösungen** - Mit Confidence-Score wenn möglich

6. **Bestätigung vor Änderungen** - Immer `confirm=true` nur mit User-OK

7. **Nach Änderungen verifizieren** - Neuer Scan zeigt Verbesserung

---

## 📊 Response-Format Empfehlung

Strukturiere deine Antworten so:

```
## 📊 Netzwerk-Status

[Environment Score Visualisierung]

## 🔍 Erkannte Probleme

1. **Problem A** (Schweregrad: Hoch)
   - Erklärung was das Problem ist
   - Warum es auftritt

2. **Problem B** (Schweregrad: Mittel)
   ...

## 💡 Empfehlungen

1. **Beste Lösung** [Confidence: 90%]
   - Was geändert wird
   - Erwartete Verbesserung
   
   Soll ich das anwenden? (Ja/Nein)

2. **Alternative** [Confidence: 70%]
   ...
```

---

*Diese Anleitung wird automatisch aktualisiert wenn neue Features hinzugefügt werden.*
