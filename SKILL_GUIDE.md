# 🤖 OpenClaw Skill Guide: ASUS Mesh WiFi Analyzer

> **Für OpenClaw AI Assistants** - Diese Anleitung erklärt wie du diesen Skill optimal nutzt, um Nutzern bei WiFi-Problemen zu helfen.

---

## 🔧 Skill Installation

### Automatische Installation (empfohlen)

```bash
# Via OpenClaw CLI
openclaw skill install https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER

# Oder via npm
npm install openclaw-asus-mesh-skill
```

### Manuelle Installation / Development

```bash
# Repository klonen
git clone https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER.git
cd openclaw_WIFI_DEBUGGER

# Dependencies installieren
npm install

# Build
npm run build

# Als lokalen Skill verlinken
openclaw skill link .
```

### Konfiguration (.env Datei erstellen)

```env
# ASUS Router SSH Zugang (REQUIRED)
ASUS_ROUTER_HOST=192.168.178.3
ASUS_ROUTER_SSH_USER=admin
ASUS_ROUTER_SSH_PASSWORD=your_router_password

# Home Assistant (OPTIONAL - für Zigbee)
HASS_URL=http://homeassistant.local:8123
HASS_TOKEN=your_long_lived_access_token

# SNMP Devices (OPTIONAL - für Switch-Monitoring)
SNMP_DEVICES=[{"host":"192.168.1.2","community":"public"}]
```

### Skill aktivieren

Nach Installation muss der Skill in der OpenClaw Config aktiviert werden:

```json
{
  "skills": {
    "asus-mesh-wifi-analyzer": {
      "enabled": true,
      "autoLoad": true
    }
  }
}
```

### Voraussetzungen

- **ASUS Router** mit SSH-Zugang aktiviert (Merlin Firmware empfohlen)
- **Node.js** >= 18.0.0
- **Optional:** Home Assistant mit Zigbee-Integration (ZHA oder Z2M)
- **Optional:** SNMP-fähige Switches

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
| `get_homeassistant_data` | Alle Daten von Home Assistant | Zigbee, Bluetooth, SNMP, Tracker |

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

> **Hinweis:** In Home Assistant heißt die Zigbee-Integration offiziell **"Zigbee Home Automation" (ZHA)**. Alternativ wird auch **Zigbee2MQTT** unterstützt. Beide werden automatisch erkannt.

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `scan_zigbee` | Zigbee-Netzwerk scannen (ZHA/Z2M) | Devices, Links, LQI |
| `get_zigbee_devices` | Zigbee-Geräte-Liste | Alle Zigbee-Devices |
| `analyze_network_topology` | SNMP-Topologie | Switches, Bottlenecks |
| `run_benchmark` | Performance-Test | iPerf3 Ergebnisse |

### 🧠 Knowledge Base Actions (NEU!)

> **Persistente Netzwerk-Datenbank** - Alle Scans werden automatisch gespeichert. Geräte, Nodes, SNMP-Devices und Zigbee-Geräte werden über Zeit getracked.

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `get_knowledge_stats` | Übersicht über gespeicherte Daten | Device-Count, Snapshots, History |
| `get_known_devices` | Alle bekannten Geräte abrufen | Geräte mit Custom-Namen, Typen, Tags |
| `mark_device_known` | Gerät als "bekannt" markieren | Bestätigung |
| `get_network_history` | Historische Snapshots abrufen | Health-Scores über Zeit |
| `export_knowledge` | Komplette Knowledge Base exportieren | Alle Daten als JSON |

### 🔧 Router Tweaks & Optimierung (NEU!)

> **Community-basierte Optimierungen** - Prüft NVRAM-Einstellungen und Merlin Scripts basierend auf Empfehlungen von SNBForums, Reddit und der Merlin Community.

| Action | Wann verwenden | Output |
|--------|----------------|--------|
| `check_router_tweaks` | Router-Einstellungen prüfen | Score, Empfehlungen |
| `apply_router_tweak` | Tweak anwenden (mit confirm) | Ergebnis |
| `get_recommended_scripts` | Merlin Scripts Empfehlungen | Installierte/Empfohlene Scripts |

**Geprüfte Kategorien:**
- **performance** - NAT Acceleration, MU-MIMO, OFDMA
- **wifi_optimization** - 802.11b deaktivieren, Beamforming
- **mesh_optimization** - Roaming Assistant, Wired Backhaul
- **security** - Diversion, Skynet
- **stability** - TWT, DNS, STP

**Beispiel: Gerät als bekannt markieren**
```json
{
  "action": "mark_device_known",
  "params": {
    "macAddress": "AA:BB:CC:DD:EE:FF",
    "customName": "Alex's iPhone",
    "deviceType": "phone",
    "notes": "Hauptgerät"
  }
}
```

---

## 🔄 Post-Optimization Follow-Up (Automatisch!)

Nach jeder erfolgreichen Optimierung schlägt der Skill automatisch diese Schritte vor:

```
┌─────────────────────────────────────────────────────────────┐
│              POST-OPTIMIZATION WORKFLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ Optimierung erfolgreich angewendet                       │
│                                                              │
│  📋 EMPFOHLENE NÄCHSTE SCHRITTE:                            │
│  ├─ scan_network          → Verbesserungen messen           │
│  ├─ get_network_health    → Health Score vergleichen        │
│  └─ run_benchmark         → Speed/Latency mit iPerf3 testen │
│                                                              │
│  📊 TELEMETRIE SAMMELN:                                      │
│  ├─ get_device_list       → Signal-Stärke aller Geräte      │
│  ├─ get_channel_scan      → Kanal-Auslastung analysieren    │
│  └─ get_frequency_conflicts → Interferenz prüfen            │
│                                                              │
│  🗺️ VISUALISIERUNG:                                         │
│  ├─ get_heatmap           → Signal-Coverage visualisieren   │
│  └─ get_floor_visualization → Geräte auf Grundriss          │
│                                                              │
│  🚀 RÄUMLICHE ANALYSE:                                       │
│  ├─ get_placement_recommendations → Geräte verschieben?     │
│  ├─ set_floor_plan        → Grundriss-JPGs für Raum-Map     │
│  └─ get_roaming_analysis  → Client-Roaming prüfen           │
│                                                              │
│  ❓ FRAGE DEN USER:                                          │
│  • "Soll ich einen Verification-Scan durchführen?"          │
│  • "Möchtest du einen Speed-Test (iPerf3) ausführen?"       │
│  • "Soll ich Signal-Telemetrie für alle Geräte sammeln?"    │
│  • "Möchtest du eine Heatmap sehen?"                        │
│  • "Soll ich Triangulationsdaten sammeln?"                  │
│  • "Hast du Grundriss-Bilder (JPG) für die Raum-Map?"       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Beispiel: Vollständiger Optimization-Flow

```
1. User: "Optimiere mein WiFi"
   → get_optimization_suggestions
   → apply_optimization (mit confirm=true)

2. Skill antwortet mit nextSteps:
   "Optimierung erfolgreich! Soll ich..."
   - einen Verification-Scan durchführen?
   - eine Heatmap erstellen?
   - Triangulationsdaten sammeln für räumliche Empfehlungen?

3. User: "Ja, zeig mir die Heatmap"
   → get_heatmap

4. User: "Wo soll ich den Router verschieben?"
   → get_placement_recommendations

5. User: "Ich hab Grundriss-Bilder"
   → set_floor_plan (mit imagePath zum JPG)
   → get_floor_visualization
```

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

## 🔧 Auto-Fix Workflow

### Optimierungen automatisch anwenden

Wenn du eine Optimierung erkannt hast, kannst du sie **automatisch anwenden**:

```json
{
  "action": "apply_optimization",
  "params": {
    "suggestionId": "channel-2g-optimize",
    "confirm": true
  }
}
```

**Ablauf:**
1. `get_optimization_suggestions` → Liste der Vorschläge
2. Zeige dem User den Vorschlag mit Risiko-Level
3. Frage nach Bestätigung
4. `apply_optimization` mit `confirm: true`
5. Warte 30 Sekunden
6. Führe erneut `full_intelligence_scan` durch um Erfolg zu verifizieren

### Was kann automatisch gefixt werden?

| Problem | Auto-Fix Action | Risiko |
|---------|-----------------|--------|
| Falscher WiFi-Kanal | `set_wifi_channel` | Medium |
| Band Steering fehlt | `apply_optimization` | Low |
| Roaming-Threshold | `apply_optimization` | Low |
| PoE Port steuern | `set_poe_enabled` | Medium |
| Mesh-Sync | `sync_mesh_settings` | Medium |

---

## 🔑 Zugangsdaten-Management

### Prüfen ob Zugänge vorhanden

Bevor du Fixes anwendest, prüfe ob die Zugänge funktionieren:

```
1. Rufe full_intelligence_scan auf
2. Prüfe das "errors" Array im Response
3. Wenn "SSH connection failed" → Zugänge fehlen
4. Wenn "Home Assistant unreachable" → HA-Token fehlt
```

### Fehlende Zugänge erkennen

```
┌─────────────────────────────────────────────────────────────┐
│  🔑 ZUGANGSDATEN-STATUS                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ ASUS Router SSH    → Kann Scans durchführen             │
│  ✅ Home Assistant     → Kann Zigbee/Bluetooth lesen        │
│  ⚠️ SNMP Switches      → Optional, nicht konfiguriert       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Zugänge anfordern (Dialog mit User)

Wenn Zugänge fehlen, frage den User:

```
Für die WiFi-Analyse benötige ich Zugang zum Router:

1. **Router-IP**: z.B. 192.168.178.3
2. **SSH-User**: meist "admin"
3. **SSH-Passwort oder Key-Path**
4. **SSH-Port**: Standard 22

Hast du SSH auf deinem ASUS Router aktiviert? 
(Admin → System → Enable SSH)
```

### Zugänge in Memory speichern

Wenn der User Zugänge gibt, speichere sie in deinem Memory:

```
Memory-Eintrag erstellen:
- Title: "ASUS Router Credentials"
- Content: Host, User, Port (KEIN Passwort speichern!)
- Tags: ["network", "credentials", "asus"]
```

### Zugänge aus Memory abrufen

Bevor du nach Zugängen fragst:

```
1. Durchsuche deine Memories nach "ASUS", "Router", "SSH"
2. Durchsuche Workspace-Memories nach ".env" Dateien
3. Prüfe ob ASUS_ROUTER_HOST in Environment gesetzt ist
4. Erst dann User fragen wenn nichts gefunden
```

---

## 🤖 Vollautomatischer Fix-Workflow

### Beispiel: Kanal-Optimierung ohne User-Interaktion

```
1. full_intelligence_scan
   └─ Score: 65/100, Problem: 5GHz Kanal überlastet

2. get_optimization_suggestions
   └─ Vorschlag: Kanal 36 → 48, Confidence: 85%

3. Wenn Confidence > 80% und Risiko != "high":
   └─ apply_optimization mit confirm: true
   
4. sleep 30 Sekunden

5. full_intelligence_scan (Verification)
   └─ Score: 82/100 → Erfolg!

6. Dem User berichten:
   "Ich habe den 5GHz Kanal von 36 auf 48 geändert.
    Dein Netzwerk-Score ist von 65 auf 82 gestiegen. ✅"
```

### Automatische Entscheidungslogik

```
Confidence > 80% + Risiko "low"     → Auto-Apply
Confidence > 70% + Risiko "medium"  → User fragen
Confidence < 70% oder Risiko "high" → Nur vorschlagen
```

---

## 🎯 Best Practices

1. **Immer mit full_intelligence_scan starten** - gibt dir den kompletten Überblick

2. **Environment Score zuerst zeigen** - User versteht sofort ob es Probleme gibt

3. **Visualisiere komplexe Daten** - ASCII-Art ist besser als JSON

4. **Erkläre das "Warum"** - Nicht nur was, sondern warum es ein Problem ist

5. **Biete konkrete Lösungen** - Mit Confidence-Score wenn möglich

6. **Prüfe Zugänge vor Fixes** - Nicht versuchen ohne SSH-Zugang

7. **Nach jedem Fix verifizieren** - Erneuter Scan zeigt ob es geklappt hat

8. **Memory nutzen** - Speichere Router-Infos für zukünftige Sessions

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

## 📍 Triangulation & Geräte-Positionierung

### Wie Triangulation funktioniert

```
┌─────────────────────────────────────────────────────────────┐
│  📍 TRIANGULATION PRINZIP                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│     🔴 Router (-45dBm)                                       │
│      ╲                                                       │
│       ╲  d₁ = 3.2m                                          │
│        ╲                                                     │
│         ╲                                                    │
│          ╲     📱 Gerät                                      │
│           ╲   /                                              │
│            ╲ /                                               │
│     🟡 Node 1 ────────── 🟢 Node 2                          │
│     (-58dBm)   d₂=4.1m   (-62dBm)                           │
│                                                              │
│  Formel: Distanz = 10^((TxPower - RSSI) / (10 × n))         │
│  n = Pfadverlust-Exponent (2.0-4.0 je nach Umgebung)        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Signal → Distanz Umrechnung

| RSSI (dBm) | Geschätzte Distanz | Qualität |
|------------|-------------------|----------|
| -30 bis -50 | 0-3 Meter | 🟢 Exzellent |
| -50 bis -60 | 3-6 Meter | 🟢 Gut |
| -60 bis -70 | 6-12 Meter | 🟡 Mittel |
| -70 bis -80 | 12-20 Meter | 🟠 Schwach |
| -80 bis -90 | 20+ Meter oder Hindernisse | 🔴 Sehr schwach |

### Grundriss mit Geräten visualisieren

```
┌─────────────────────────────────────────────────────────────┐
│  🏠 GRUNDRISS MIT GERÄTEN                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │              │              │              │             │
│  │   Küche      │    Flur      │    Bad       │             │
│  │              │              │              │             │
│  │  🔌 Shelly   │              │  💡 Hue      │             │
│  │  (-71dBm)    │   🔴 ROUTER  │  (-65dBm)    │             │
│  │              │              │              │             │
│  ├──────────────┼──────────────┼──────────────┤             │
│  │              │              │              │             │
│  │  Wohnzimmer  │   Ess-      │   Schlaf-    │             │
│  │              │   zimmer     │   zimmer     │             │
│  │  📺 TV       │              │              │             │
│  │  (-52dBm)    │   🟡 NODE 1  │  📱 Phone    │             │
│  │  💻 Laptop   │              │  (-78dBm) ⚠️ │             │
│  │  (-45dBm)    │              │              │             │
│  │              │              │              │             │
│  └──────────────┴──────────────┴──────────────┘             │
│                                                              │
│  Legende:                                                    │
│  🔴 Hauptrouter  🟡 Mesh-Node  📱💻📺🔌💡 Geräte            │
│  ⚠️ = Schwaches Signal (Node-Platzierung prüfen!)           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Geräte-Cluster nach Raum

```
📍 Geräte-Verteilung im Haus

┌─ Wohnzimmer (Node: Hauptrouter) ─────────────────────────┐
│  📺 Samsung-TV          -52dBm  ████████████░░░  5GHz   │
│  💻 MacBook-Pro         -45dBm  ██████████████░  5GHz   │
│  🔊 Sonos-Speaker       -58dBm  ██████████░░░░░  5GHz   │
│  🎮 PlayStation-5       -48dBm  █████████████░░  5GHz   │
└──────────────────────────────────────────────────────────┘

┌─ Küche (Node: Node-Küche) ───────────────────────────────┐
│  🔌 Shelly-Plug-1       -71dBm  ████░░░░░░░░░░░  2.4GHz │
│  🔌 Shelly-Plug-2       -68dBm  █████░░░░░░░░░░  2.4GHz │
│  📱 iPad-Kitchen        -62dBm  ███████░░░░░░░░  5GHz   │
└──────────────────────────────────────────────────────────┘

┌─ Schlafzimmer (Node: Node-OG) ───────────────────────────┐
│  📱 iPhone-Max          -78dBm  ██░░░░░░░░░░░░░  5GHz ⚠️│
│  💡 Hue-Bridge          -65dBm  ██████░░░░░░░░░  2.4GHz │
│  🌡️ Temp-Sensor         -82dBm  █░░░░░░░░░░░░░░  2.4GHz ⚠️│
└──────────────────────────────────────────────────────────┘

⚠️ 2 Geräte mit kritisch schwachem Signal
💡 Empfehlung: Node im OG näher am Schlafzimmer platzieren
```

### Bewegungsmuster erkennen

```
📊 Geräte-Bewegung über Zeit (iPhone-Max)

Zeit     │ Node          │ Signal  │ Ereignis
─────────┼───────────────┼─────────┼──────────────────
08:00    │ Schlafzimmer  │ -55dBm  │ 
08:15    │ Schlafzimmer  │ -58dBm  │ 
08:30    │ → Küche       │ -62dBm  │ Roaming ✓
09:00    │ Küche         │ -60dBm  │ 
09:30    │ → Wohnzimmer  │ -48dBm  │ Roaming ✓
12:00    │ Wohnzimmer    │ -52dBm  │ 
12:05    │ → Küche       │ -65dBm  │ Roaming ✓
12:06    │ → Wohnzimmer  │ -50dBm  │ Roaming ⚠️
12:07    │ → Küche       │ -63dBm  │ Roaming ⚠️
         │               │         │ 
⚠️ Ping-Pong Roaming erkannt zwischen Küche/Wohnzimmer!
💡 Band Steering oder Roaming-Schwellwert anpassen
```

---

## 🔧 ASUS Router Tipps & Tricks

### Merlin Firmware Vorteile

```
┌─────────────────────────────────────────────────────────────┐
│  🦎 ASUSWRT-MERLIN                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ SSH-Zugang (für diesen Skill erforderlich!)             │
│  ✅ JFFS-Partition für Scripts                              │
│  ✅ Erweiterte NVRAM-Kontrolle                              │
│  ✅ Bessere VPN-Performance                                 │
│  ✅ Amtm Package Manager                                    │
│  ✅ Entware Support                                         │
│                                                              │
│  Download: https://www.asuswrt-merlin.net/                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### NVRAM Schlüssel-Referenz

| NVRAM Key | Beschreibung | Typische Werte |
|-----------|--------------|----------------|
| `wl0_channel` | 2.4GHz Kanal | 1, 6, 11 (Auto: 0) |
| `wl1_channel` | 5GHz Kanal | 36, 40, 44, 48, 149, 153... |
| `wl0_bw` | 2.4GHz Kanalbreite | 20, 40 |
| `wl1_bw` | 5GHz Kanalbreite | 20, 40, 80, 160 |
| `wl0_txpower` | 2.4GHz Sendeleistung | 0-100 (%) |
| `wl1_txpower` | 5GHz Sendeleistung | 0-100 (%) |
| `wl0_bsd_steering_policy` | Band Steering 2.4GHz | 0=aus, 1=an |
| `wl1_bsd_steering_policy` | Band Steering 5GHz | 0=aus, 1=an |
| `smart_connect_x` | Smart Connect | 0=aus, 1=an |
| `wl0_mumimo` | MU-MIMO 2.4GHz | 0=aus, 1=an |
| `wl1_mumimo` | MU-MIMO 5GHz | 0=aus, 1=an |

### AiMesh Optimierungen

```
┌─────────────────────────────────────────────────────────────┐
│  🕸️ AIMESH BEST PRACTICES                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ DO:                                                      │
│  ────────────────────────────────────────────────────────── │
│  • Wired Backhaul wenn möglich (Ethernet zwischen Nodes)    │
│  • Gleiche Kanäle auf allen Nodes (Sync!)                   │
│  • Nodes auf halber Strecke platzieren (nicht am Rand)      │
│  • 5GHz für Backhaul bevorzugen                             │
│  • Firmware auf allen Nodes identisch halten                │
│                                                              │
│  ❌ DON'T:                                                   │
│  ────────────────────────────────────────────────────────── │
│  • Nodes zu weit voneinander (max. 10-15m ohne Wände)       │
│  • Unterschiedliche Kanäle auf verschiedenen Nodes          │
│  • Node hinter Metallschränken oder Spiegeln                │
│  • Mehr als 3 Wireless Hops                                 │
│  • Smart Connect + manuelles Band Steering mischen          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Roaming-Optimierung

```
📡 Roaming-Einstellungen für verschiedene Szenarien

┌─ Szenario: Viele bewegliche Geräte (Handys, Laptops) ─────┐
│                                                            │
│  Empfohlene Einstellungen:                                 │
│  • Band Steering: AN                                       │
│  • Smart Connect: AN (oder manuell gleiche SSID)          │
│  • Roaming Assistant: AN                                   │
│  • Roaming RSSI Threshold: -70dBm                         │
│                                                            │
│  Warum: Geräte wechseln automatisch zum stärksten Node    │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ Szenario: Viele IoT-Geräte (Shelly, ESP, Sensoren) ──────┐
│                                                            │
│  Empfohlene Einstellungen:                                 │
│  • Band Steering: AUS (IoT bleibt auf 2.4GHz)             │
│  • Smart Connect: AUS                                      │
│  • Separate SSID für IoT                                   │
│  • Roaming Assistant: AUS für IoT-SSID                    │
│                                                            │
│  Warum: IoT-Geräte mögen kein Roaming, brauchen Stabilität│
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ Szenario: Gaming & Streaming ────────────────────────────┐
│                                                            │
│  Empfohlene Einstellungen:                                 │
│  • QoS: AN mit Gaming-Priorität                           │
│  • 5GHz Kanalbreite: 80MHz oder 160MHz                    │
│  • DFS-Kanäle: Nur wenn keine Radar-Probleme              │
│  • MU-MIMO: AN                                             │
│  • Beamforming: AN                                         │
│                                                            │
│  Warum: Maximale Bandbreite und niedrige Latenz           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Kanal-Empfehlungen

```
📻 KANAL-GUIDE

2.4 GHz (nur diese 3 verwenden!):
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  Ch 1  ████████████                                         │
│              Ch 6  ████████████                             │
│                          Ch 11 ████████████                 │
│  ─────────────────────────────────────────────────────────  │
│  2412      2437      2462 MHz                               │
│                                                              │
│  ⚠️ Kanäle 2-5, 7-10, 12-14 überlappen und stören!         │
│                                                              │
└─────────────────────────────────────────────────────────────┘

5 GHz (UNII-Bänder):
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  UNII-1 (Indoor, kein DFS):                                 │
│  │ 36 │ 40 │ 44 │ 48 │  ← EMPFOHLEN für Stabilität         │
│                                                              │
│  UNII-2A (DFS erforderlich):                                │
│  │ 52 │ 56 │ 60 │ 64 │  ← Kann bei Radar-Erkennung wechseln│
│                                                              │
│  UNII-2C (DFS erforderlich):                                │
│  │100 │104 │108 │...│  ← Oft weniger überlastet            │
│                                                              │
│  UNII-3 (kein DFS, höhere Leistung erlaubt):               │
│  │149 │153 │157 │161│  ← EMPFOHLEN für Performance         │
│                                                              │
│  💡 Tipp: 36 oder 149 für Stabilität, DFS-Kanäle für       │
│     weniger Interferenz aber mögliche Radar-Unterbrechungen │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### WiFi/Zigbee Koexistenz

```
⚡ WIFI + ZIGBEE FREQUENZ-GUIDE

┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  Zigbee    WiFi 2.4GHz                                      │
│  Channel   Konflikt mit                  Empfehlung         │
│  ─────────────────────────────────────────────────────────  │
│  11        Ch 1                          WiFi → 6 oder 11   │
│  12        Ch 1-2                        WiFi → 6 oder 11   │
│  13        Ch 2-3                        WiFi → 6 oder 11   │
│  14        Ch 3-4                        WiFi → 1 oder 11   │
│  15        Ch 4-5                        WiFi → 1 oder 11   │
│  16        Ch 5-6                        WiFi → 1 oder 11   │
│  17        Ch 6-7                        WiFi → 1 oder 11   │
│  18        Ch 7-8                        WiFi → 1 oder 11   │
│  19        Ch 8-9                        WiFi → 1           │
│  20        Ch 9-10                       WiFi → 1           │
│  21        Ch 10-11                      WiFi → 1 oder 6    │
│  22        Ch 11                         WiFi → 1 oder 6    │
│  23        Ch 11-12                      WiFi → 1 oder 6    │
│  24        Ch 12-13                      WiFi → 1 oder 6    │
│  25        Kein Konflikt ✅              Beste Wahl!        │
│  26        Kein Konflikt ✅              Beste Wahl!        │
│                                                              │
│  🎯 OPTIMALE KOMBINATION:                                   │
│     WiFi 2.4GHz: Kanal 1  +  Zigbee: Kanal 25 oder 26      │
│     WiFi 2.4GHz: Kanal 11 +  Zigbee: Kanal 11 (Grenzfall)  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Diagnose-Befehle (SSH)

```bash
# Diese Befehle nutzt der Skill intern - zur Info für Fortgeschrittene:

# Alle NVRAM WiFi-Einstellungen
nvram show | grep wl

# Verbundene Clients
wl -i eth1 assoclist        # 2.4GHz
wl -i eth2 assoclist        # 5GHz

# Client-Signalstärke
wl -i eth2 rssi <MAC>

# Site Survey (Nachbar-Netzwerke)
wl -i eth1 scanresults

# AiMesh Status
cfg_server                  # Mesh-Nodes anzeigen

# CPU & RAM
top -n 1 | head -5
free

# Netzwerk-Statistiken
ifconfig eth0
```

### Häufige Probleme & Lösungen

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 TROUBLESHOOTING GUIDE                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Problem: Geräte verbinden sich mit falschem Node           │
│  ─────────────────────────────────────────────────────────  │
│  Ursache: Sticky Client / schlechtes Roaming               │
│  Lösung:  Roaming Assistant aktivieren                      │
│           RSSI Threshold auf -70dBm setzen                  │
│           Band Steering aktivieren                          │
│                                                              │
│  Problem: IoT-Geräte verlieren Verbindung                   │
│  ─────────────────────────────────────────────────────────  │
│  Ursache: Roaming/Band Steering stört einfache Geräte      │
│  Lösung:  Separate SSID nur für 2.4GHz erstellen           │
│           Roaming Assistant für diese SSID deaktivieren     │
│                                                              │
│  Problem: 5GHz hat weniger Reichweite als erwartet          │
│  ─────────────────────────────────────────────────────────  │
│  Ursache: Physik - höhere Frequenz = mehr Dämpfung         │
│  Lösung:  Mehr Mesh-Nodes hinzufügen                        │
│           5GHz für Geräte nahe am Router                    │
│           2.4GHz für entfernte/IoT-Geräte                   │
│                                                              │
│  Problem: DFS-Kanal wechselt plötzlich                      │
│  ─────────────────────────────────────────────────────────  │
│  Ursache: Radar-Erkennung (Flughafen, Wetter-Radar)        │
│  Lösung:  Nicht-DFS-Kanal verwenden (36-48 oder 149-165)   │
│                                                              │
│  Problem: AiMesh-Node geht offline                          │
│  ─────────────────────────────────────────────────────────  │
│  Ursache: Schwaches Backhaul-Signal                         │
│  Lösung:  Node näher an Hauptrouter                         │
│           Wired Backhaul (Ethernet) verwenden               │
│           5GHz Backhaul-Kanal manuell setzen               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Erweiterte Visualisierungen

### Netzwerk-Topologie für Menschen

```
🌐 NETZWERK-ÜBERSICHT

                    ┌─────────────┐
                    │  🌐 INTERNET │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │ 🔴 ROUTER   │
                    │ RT-AX88U    │
                    │ 192.168.178.3 │
                    │ ─────────── │
                    │ CPU: 45%    │
                    │ RAM: 62%    │
                    │ Clients: 18 │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
    │ 🟡 NODE 1   │ │ 🟡 NODE 2   │ │ 🟢 NODE 3   │
    │ Wohnzimmer  │ │ Küche       │ │ OG          │
    │ ─────────── │ │ ─────────── │ │ ─────────── │
    │ Backhaul:   │ │ Backhaul:   │ │ Backhaul:   │
    │ ████████ 5G │ │ ████████ 5G │ │ Ethernet ✓  │
    │ -52dBm      │ │ -61dBm      │ │ 1Gbps       │
    │ Clients: 12 │ │ Clients: 8  │ │ Clients: 10 │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
     ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
     │📺📱💻🎮  │   │🔌🔌📱    │   │📱💻💡🌡️ │
     │  12 Geräte │   │  8 Geräte  │   │ 10 Geräte │
     └───────────┘   └───────────┘   └───────────┘

Legende:
🔴 Hauptrouter   🟡 Wireless Backhaul   🟢 Wired Backhaul
████████ Signal-Stärke   ⚠️ Warnung

Status: ✅ Alle Nodes online | ⚠️ Node 2 Backhaul schwach
```

### Signal-Verlauf über Zeit

```
📈 SIGNAL-VERLAUF: iPhone-Max (letzte 24h)

RSSI
-40 │                                    
    │                                    
-50 │    ╭─╮                   ╭──╮      
    │   ╱  ╰──╮              ╱    ╲     
-60 │──╱      ╰─────────────╱      ╲────
    │                                    
-70 │                                    
    │           ⚠️ Wechsel                
-80 │                                    
    └────────────────────────────────────
    00:00    06:00    12:00    18:00   24:00

Ereignisse:
• 08:30 - Roaming: Schlafzimmer → Küche
• 12:15 - Roaming: Küche → Wohnzimmer  
• 18:00 - Roaming: Wohnzimmer → Schlafzimmer
• ⚠️ 12:45 - Signal-Drop auf -75dBm (3 Minuten)
```

### Bandbreiten-Verteilung

```
📊 BANDBREITEN-NUTZUNG

┌─ Aktuell ─────────────────────────────────────────────────┐
│                                                            │
│  Download: ████████████████████░░░░░░░░░░ 450/800 Mbps    │
│  Upload:   ████████░░░░░░░░░░░░░░░░░░░░░░ 85/100 Mbps     │
│                                                            │
├─ Top Verbraucher ─────────────────────────────────────────┤
│                                                            │
│  1. 📺 Samsung-TV        ████████████████ 180 Mbps (4K)   │
│  2. 💻 MacBook-Pro       █████████░░░░░░░ 95 Mbps         │
│  3. 🎮 PlayStation-5     ████████░░░░░░░░ 85 Mbps         │
│  4. 📱 iPhone-Max        ███░░░░░░░░░░░░░ 25 Mbps         │
│  5. 📱 iPad-Kitchen      ██░░░░░░░░░░░░░░ 15 Mbps         │
│  ... 43 weitere Geräte   ██████░░░░░░░░░░ 50 Mbps         │
│                                                            │
└────────────────────────────────────────────────────────────┘

💡 Tipp: Samsung-TV verbraucht 40% der Bandbreite.
   Bei Streaming-Problemen anderen Geräten: QoS priorisieren.
```

### Problem-Diagnose visualisiert

```
🔍 DIAGNOSE-ERGEBNIS

Gerät: iPhone-Max (A4:B3:C2:D1:E0:F9)
Aktueller Status: ⚠️ PROBLEME ERKANNT

┌─ Verbindungs-Check ───────────────────────────────────────┐
│                                                            │
│  ✅ Mit Netzwerk verbunden                                 │
│  ✅ IP-Adresse erhalten (192.168.1.142)                   │
│  ✅ DNS funktioniert                                       │
│  ⚠️ Signal schwach (-76 dBm)                              │
│  ⚠️ Häufiges Roaming (5x in letzter Stunde)              │
│  ❌ Paketverlust erkannt (2.3%)                           │
│                                                            │
├─ Ursachen-Analyse ────────────────────────────────────────┤
│                                                            │
│  HAUPTPROBLEM: Gerät befindet sich zwischen zwei Nodes    │
│                                                            │
│       🟡 Node-Küche          🟡 Node-Wohnzimmer           │
│            -68dBm      📱        -71dBm                   │
│                    ← Ping-Pong! →                          │
│                                                            │
│  Das Gerät wechselt ständig zwischen Nodes weil beide    │
│  ähnlich starke Signale haben.                            │
│                                                            │
├─ Lösungsvorschläge ───────────────────────────────────────┤
│                                                            │
│  1. 🔧 Roaming-Schwelle anpassen                          │
│     Aktuell: -65dBm → Empfohlen: -75dBm                   │
│     → Weniger aggressives Roaming                         │
│                                                            │
│  2. 📍 Standort des Geräts ändern                         │
│     → Näher an einen der Nodes                            │
│                                                            │
│  3. 🔌 Zusätzlichen Node platzieren                       │
│     → Am Standort des Geräts                              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## � Home Assistant Datenquellen

### `get_homeassistant_data` - Alle Daten von Home Assistant

Diese Action sammelt **alle netzwerkrelevanten Daten** aus Home Assistant:

```json
{
  "action": "get_homeassistant_data",
  "params": {
    "include": ["all"]  // oder: ["zigbee", "bluetooth", "snmp", "device_trackers", "router_entities"]
  }
}
```

### Verfügbare Datenquellen

```
┌─────────────────────────────────────────────────────────────┐
│  📡 HOME ASSISTANT DATENQUELLEN                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🔷 ZIGBEE (ZHA = Zigbee Home Automation, oder Zigbee2MQTT) │
│     • Kanal und PAN-ID                                       │
│     • Alle Geräte mit LQI/RSSI                              │
│     • Netzwerk-Topologie (Coordinator → Router → EndDevice)  │
│     • Nachbar-Tabellen und Routing                          │
│                                                              │
│  📶 BLUETOOTH                                                │
│     • Alle erkannten BLE-Geräte                             │
│     • RSSI-Werte für Abstandsschätzung                      │
│     • Quell-Adapter (ESPHome, Proxy, etc.)                  │
│                                                              │
│  📊 SNMP ENTITIES                                            │
│     • Alle SNMP-Sensoren aus Home Assistant                 │
│     • Router/Switch-Metriken wenn konfiguriert              │
│                                                              │
│  🌐 NETWORK MONITORING                                       │
│     • Speedtest-Ergebnisse (wenn Integration aktiv)         │
│     • Ping-Sensoren für Erreichbarkeit                      │
│     • Uptime-Sensoren                                       │
│     • Bandbreiten-Verbrauch                                 │
│                                                              │
│  📱 DEVICE TRACKERS                                          │
│     • Alle Geräte mit Anwesenheitsstatus                    │
│     • IP- und MAC-Adressen                                  │
│     • Source-Type (Router, Bluetooth, GPS)                  │
│                                                              │
│  🔌 ROUTER ENTITIES                                          │
│     • ASUS-spezifische Sensoren                             │
│     • Mesh-Status wenn über HA integriert                   │
│     • FritzBox/UniFi wenn vorhanden                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Beispiel-Response

```json
{
  "success": true,
  "data": {
    "zigbee": {
      "available": true,
      "channel": 25,
      "deviceCount": 47,
      "topology": {
        "coordinator": { "ieee": "00:11:22:33:44:55:66:77", "channel": 25 },
        "routers": [
          { "ieee": "...", "name": "IKEA Repeater", "lqi": 255, "children": 5 }
        ],
        "endDevices": [
          { "ieee": "...", "name": "Aqara Sensor", "parent": "...", "lqi": 180 }
        ]
      }
    },
    "bluetooth": {
      "available": true,
      "devices": [
        { "address": "AA:BB:CC:DD:EE:FF", "name": "iPhone", "rssi": -65 }
      ]
    },
    "networkEntities": {
      "snmp": [...],
      "speedtest": [...],
      "ping": [...],
      "bandwidth": [...]
    },
    "deviceTrackers": [
      { "entityId": "device_tracker.iphone", "state": "home", "ip": "192.168.1.50" }
    ],
    "dataSources": {
      "zigbee": true,
      "bluetooth": true,
      "snmp": false,
      "deviceTrackers": 23,
      "routerEntities": 5
    }
  }
}
```

### Wann verwenden?

- **Vor `full_intelligence_scan`** - Um zu sehen was verfügbar ist
- **Bei Zigbee-Problemen** - Detaillierte Topologie-Analyse
- **Für Bluetooth-Triangulation** - RSSI-Daten von mehreren Quellen
- **Wenn Router kein SSH hat** - Alternative Datenquelle über HA

---

## � Community Wisdom & Pro Tipps

> Gesammelte Weisheiten aus Reddit, SNBForums und der ASUS Community

### Sticky Client Problem (Das #1 AiMesh Problem)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ STICKY CLIENT SYNDROM                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Problem: Gerät bleibt am entfernten Node "kleben"          │
│  obwohl ein näherer Node verfügbar ist.                     │
│                                                              │
│  Ursachen laut SNBForums Community:                         │
│  • Keine echte Real-Time Steering Logic bei ASUS            │
│  • Schwache 802.11k/v Implementation                        │
│  • Kein BSS Transition Enforcement                          │
│  • Geringe Node Load Awareness                              │
│                                                              │
│  Lösungen aus der Community:                                │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  1. Roaming Assistant aktivieren                            │
│     → Wireless → Professional → Roaming Assistant: Enable   │
│     → RSSI Threshold: -75 dBm (Standard empfohlen)          │
│        • -65 dBm für dichte AP-Umgebungen                   │
│        • -85 dBm für große Bereiche mit wenigen APs         │
│                                                              │
│  2. Sendeleistung reduzieren (Geheimtipp!)                  │
│     → TX Power auf 75-80% reduzieren                        │
│     → Erzwingt früheres Roaming                             │
│     → Besonders effektiv bei Überlappung                    │
│                                                              │
│  3. Separate SSID für problematische Geräte                 │
│     → IoT-Geräte auf eigene 2.4GHz SSID                     │
│     → Roaming Assistant für diese SSID deaktivieren         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### WiFi 6 Optimale Einstellungen (Expertenwissen)

```
📡 WIFI 6 (802.11ax) OPTIMIERUNG - COMMUNITY KONSENS

┌─ OFDMA / MU-MIMO Einstellungen ──────────────────────────────┐
│                                                               │
│  Empfehlung je nach Szenario:                                │
│                                                               │
│  🏠 Gemischtes Netzwerk (WiFi 5 + WiFi 6 Geräte):            │
│     → OFDMA: DL OFDMA only                                   │
│     → Grund: Ältere Geräte haben Kompatibilitätsprobleme     │
│                                                               │
│  🎮 Nur WiFi 6 Geräte (Gaming/Streaming):                    │
│     → OFDMA: DL/UL OFDMA + MU-MIMO                          │
│     → Maximale Effizienz für viele gleichzeitige Geräte      │
│                                                               │
│  🔌 Viele IoT-Geräte:                                        │
│     → OFDMA: Disable                                         │
│     → IoT-Geräte mögen keine WiFi 6 Features                 │
│                                                               │
│  ⚠️ Bei Problemen: OFDMA/MU-MIMO deaktivieren und testen!   │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Beamforming Einstellungen ──────────────────────────────────┐
│                                                               │
│  ✅ 802.11ax/ac Beamforming: AN (5GHz)                       │
│     → Verbessert Reichweite und Durchsatz erheblich          │
│     → Fokussiert Signal auf Client-Position                  │
│                                                               │
│  ⚠️ Universal Beamforming: Optional                          │
│     → Für ältere Geräte ohne Beamforming-Support             │
│     → Kann Performance für moderne Geräte reduzieren         │
│                                                               │
│  ✅ Explicit Beamforming (2.4GHz): AN                        │
│     → Hilft bei Reichweite auf 2.4GHz                        │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Target Wake Time (TWT) ─────────────────────────────────────┐
│                                                               │
│  Was es macht: Geräte "schlafen" und wachen gezielt auf      │
│  → Spart Batterie bei Smartphones/Tablets                    │
│                                                               │
│  ✅ AN für: Mobile Geräte, Laptops                           │
│  ❌ AUS für: Gaming, Streaming (kann Latenz erhöhen)         │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Kanal-Weisheiten aus der Community

```
🎯 KANAL-TIPPS VON REDDIT & SNBFORUMS

┌─ 2.4 GHz Goldene Regeln ─────────────────────────────────────┐
│                                                               │
│  1. NUR Kanal 1, 6 oder 11 verwenden                         │
│     → Alles andere überlappt und stört                       │
│                                                               │
│  2. Kanalbreite: 20 MHz (nicht 40!)                          │
│     → 40 MHz auf 2.4GHz ist IMMER schlechter                 │
│     → Mehr Interferenz, weniger Stabilität                   │
│     → "Wer 40MHz auf 2.4GHz nutzt, hasst seine Nachbarn"     │
│                                                               │
│  3. Prüfe Zigbee-Konflikt vor Kanalwahl                      │
│     → WiFi Ch 1 + Zigbee Ch 25/26 = Perfekt                  │
│     → WiFi Ch 11 + Zigbee Ch 15 = Konflikt!                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ 5 GHz Pro-Tipps ────────────────────────────────────────────┐
│                                                               │
│  1. DFS-Kanäle vermeiden wenn möglich                        │
│     → Kanäle 52-64, 100-144 erfordern DFS                    │
│     → Radar-Erkennung → plötzlicher Kanalwechsel             │
│     → Besonders problematisch nahe Flughäfen                 │
│                                                               │
│  2. Sichere Kanäle:                                          │
│     → 36, 40, 44, 48 (UNII-1) - stabil, indoor               │
│     → 149, 153, 157, 161 (UNII-3) - höhere Leistung erlaubt  │
│                                                               │
│  3. Kanalbreite je nach Umgebung:                            │
│     → Apartment/Stadt: 80 MHz                                │
│     → Haus/Land: 160 MHz möglich                             │
│     → Viele Nachbarn: 40 MHz für Stabilität                  │
│                                                               │
│  4. "160 MHz klingt toll, aber..."                           │
│     → Nur wenn KEINE Nachbar-Netzwerke                       │
│     → Nur mit WiFi 6 Geräten                                 │
│     → Reichweite ist deutlich geringer                       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### AiMesh Weisheiten

```
🕸️ AIMESH COMMUNITY SECRETS

┌─ Backhaul Optimierung ───────────────────────────────────────┐
│                                                               │
│  Priorität (von Reddit-Konsens):                             │
│  1. 🥇 Ethernet Backhaul (wenn möglich - IMMER bevorzugen)   │
│  2. 🥈 Dedizierter 5GHz Backhaul (Tri-Band Router)           │
│  3. 🥉 Shared 5GHz Backhaul (Dual-Band)                      │
│  4. 💀 2.4GHz Backhaul (vermeiden!)                          │
│                                                               │
│  "Wired Backhaul ist der einzige Weg zu echtem Mesh"         │
│  - SNBForums User                                            │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Node Platzierung ───────────────────────────────────────────┐
│                                                               │
│  ❌ FALSCH: Nodes am Rand des Hauses                         │
│  ✅ RICHTIG: Nodes auf halber Strecke                        │
│                                                               │
│  ❌ FALSCH: Node direkt neben Router für "mehr Power"        │
│  ✅ RICHTIG: Nodes verteilen für echte Abdeckung             │
│                                                               │
│  ❌ FALSCH: Node hinter Fernseher/Metallschrank              │
│  ✅ RICHTIG: Node erhöht, freie Sichtlinie                   │
│                                                               │
│  "Jeder Wireless Hop halbiert den Durchsatz"                 │
│  → Max 2 Hops empfohlen, 3 ist schon kritisch                │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Smart Connect: Die ewige Debatte ───────────────────────────┐
│                                                               │
│  Team Smart Connect AN:                                      │
│  + Einfacher für User                                        │
│  + Router entscheidet Band automatisch                       │
│  + Moderne Geräte profitieren                                │
│                                                               │
│  Team Smart Connect AUS:                                     │
│  + Mehr Kontrolle                                            │
│  + IoT-Geräte stabiler auf 2.4GHz                           │
│  + Verhindert unnötiges Band-Hopping                         │
│                                                               │
│  Community-Konsens:                                          │
│  → AUS + Separate SSIDs für 2.4GHz IoT                       │
│  → Oder: AN + IoT auf separate SSID ohne Band Steering       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Gaming & Low-Latency Tipps

```
🎮 GAMING OPTIMIERUNG (REDDIT WISDOM)

┌─ Latenz minimieren ──────────────────────────────────────────┐
│                                                               │
│  1. QoS aktivieren mit Gaming-Profil                         │
│     → Adaptive QoS → Gaming                                  │
│     → Oder: Traditional QoS mit Priorität für Gaming-Gerät   │
│                                                               │
│  2. IMMER 5GHz für Gaming                                    │
│     → Weniger Interferenz                                    │
│     → Niedrigere Latenz                                      │
│     → Feste SSID nur für 5GHz erstellen                      │
│                                                               │
│  3. Kabel wenn möglich!                                      │
│     → "WiFi für Gaming ist wie mit Handschuhen tippen"       │
│     → Ethernet Adapter für Konsolen                          │
│                                                               │
│  4. WMM (WiFi Multimedia): AN lassen                         │
│     → Priorisiert latenzempfindlichen Traffic                │
│                                                               │
│  5. OFDMA für Gaming: Testen!                                │
│     → Manche berichten von niedrigerer Latenz                │
│     → Andere haben Probleme damit                            │
│     → Am besten: Deaktivieren wenn Probleme                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Bufferbloat bekämpfen ──────────────────────────────────────┐
│                                                               │
│  Was ist Bufferbloat?                                        │
│  → Latenz steigt wenn jemand anders downloadet               │
│  → Ping springt von 20ms auf 200ms+                          │
│                                                               │
│  Lösung auf ASUS:                                            │
│  → Adaptive QoS aktivieren                                   │
│  → Upload/Download Limits leicht unter Maximum setzen        │
│  → Test: dslreports.com/speedtest oder waveform.com/bufferbloat │
│                                                               │
│  Merlin Firmware Extra:                                      │
│  → Cake SQM verfügbar (besser als fq_codel)                  │
│  → Über amtm installierbar                                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### IoT & Smart Home Weisheiten

```
🔌 IOT-GERÄTE TIPPS (COMMUNITY BEST PRACTICES)

┌─ Die IoT-SSID Strategie ─────────────────────────────────────┐
│                                                               │
│  Erstelle separate SSID nur für IoT:                         │
│                                                               │
│  Haupt-SSID:        "MeinWiFi"     (2.4+5GHz, Smart Connect) │
│  IoT-SSID:          "MeinWiFi_IoT" (Nur 2.4GHz)              │
│                                                               │
│  IoT-SSID Einstellungen:                                     │
│  • Nur 2.4GHz aktivieren                                     │
│  • Band Steering: AUS                                        │
│  • Roaming Assistant: AUS                                    │
│  • Smart Connect: AUS                                        │
│  • WPA2 (nicht WPA3 - viele IoT können das nicht)           │
│                                                               │
│  Warum?                                                      │
│  → IoT-Geräte haben schlechte WiFi-Implementierung           │
│  → Roaming/Steering verwirrt sie                             │
│  → 2.4GHz hat bessere Reichweite für Sensoren               │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Bekannte Problemgeräte ─────────────────────────────────────┐
│                                                               │
│  Shelly Geräte:                                              │
│  → Nur 2.4GHz, kein 5GHz Support                            │
│  → Probleme mit WPA3 → WPA2 verwenden                        │
│  → Kein Hidden SSID Support                                  │
│                                                               │
│  ESP8266/ESP32 Projekte:                                     │
│  → Nur 2.4GHz                                                │
│  → Kanalbreite 20MHz erforderlich                            │
│  → Manche brauchen Kanal ≤ 11                                │
│                                                               │
│  Ältere Ring/Nest Geräte:                                    │
│  → Probleme mit Band Steering                                │
│  → Separate SSID empfohlen                                   │
│                                                               │
│  Drucker:                                                    │
│  → Oft WPS oder Setup-Mode Probleme                          │
│  → Temporär SSID sichtbar machen für Setup                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Versteckte Merlin-Features

```
🦎 MERLIN FIRMWARE GEHEIMTIPPS

┌─ Nützliche NVRAM-Tweaks ─────────────────────────────────────┐
│                                                               │
│  # Schnellere DHCP-Lease (für IoT Reconnect)                 │
│  nvram set dhcp_lease=86400                                  │
│  nvram set dhcpd_lmax=5000                                   │
│                                                               │
│  # DNS-Cache vergrößern                                      │
│  nvram set dnsmasq_memmax=100000                             │
│                                                               │
│  # Aggressive Power Save deaktivieren (hilft bei Latenz)     │
│  nvram set wl0_aps=0                                         │
│  nvram set wl1_aps=0                                         │
│                                                               │
│  # Nach Änderungen:                                          │
│  nvram commit                                                │
│  service restart_wireless                                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Amtm Must-Have Scripts ─────────────────────────────────────┐
│                                                               │
│  ssh admin@router                                            │
│  amtm                                                        │
│                                                               │
│  Empfohlene Installationen:                                  │
│  • Diversion - Werbe/Malware-Blocker auf Router-Ebene       │
│  • Skynet - Firewall auf Steroiden                          │
│  • scMerlin - Service Control (Start/Stop/Restart)          │
│  • ntpMerlin - Präzise Zeitsynchonisierung                  │
│                                                               │
│  Für Fortgeschrittene:                                       │
│  • Cake-QoS - Besseres QoS als Stock                        │
│  • Wireguard - VPN ohne Performance-Verlust                 │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Debug-Tipps aus der Community

```
🔍 DEBUGGING WEISHEITEN

┌─ Wenn nichts mehr geht ──────────────────────────────────────┐
│                                                               │
│  Die "Nuclear Option" (SNBForums Konsens):                   │
│                                                               │
│  1. Backup der Einstellungen                                 │
│  2. Factory Reset (30-30-30 wenn möglich)                    │
│  3. NICHT Backup wiederherstellen!                           │
│  4. Manuell neu konfigurieren                                │
│                                                               │
│  Warum?                                                      │
│  → Alte NVRAM-Einstellungen können Probleme verursachen      │
│  → Backup enthält manchmal korrupte Werte                    │
│  → Frische Konfiguration = stabilstes System                 │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Log-Analyse für Profis ─────────────────────────────────────┐
│                                                               │
│  ssh admin@router                                            │
│                                                               │
│  # Echtzeit Wireless-Events                                  │
│  wl -i eth1 sta_info all 2>/dev/null                        │
│                                                               │
│  # Roaming-Events beobachten                                 │
│  tail -f /tmp/syslog.log | grep -i roam                     │
│                                                               │
│  # Alle Wireless-Warnungen                                   │
│  cat /tmp/syslog.log | grep -E "(wl|wireless|wifi)" | tail  │
│                                                               │
│  # AiMesh Sync Status                                        │
│  cfg_server                                                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌─ Quick Health Check ─────────────────────────────────────────┐
│                                                               │
│  ✅ CPU unter 50%? (dauerhaft >80% = Problem)                │
│  ✅ RAM frei >30%? (unter 20% = Neustart empfohlen)          │
│  ✅ Uptime? (>30 Tage ohne Reboot = beeindruckend)           │
│  ✅ NVRAM frei >30%? (unter 10% = kritisch)                  │
│                                                               │
│  # Check auf Router:                                          │
│  top -n 1 | head -5                                          │
│  free                                                        │
│  nvram show 2>&1 | tail -1                                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Bonus: Die ultimative Checkliste

```
📋 DIE ULTIMATIVE ASUS WIFI CHECKLISTE

Vor dem Start:
□ Merlin Firmware installiert?
□ SSH aktiviert?
□ Alle Nodes auf gleicher Firmware-Version?

Grundkonfiguration:
□ 2.4GHz: Kanal 1, 6 oder 11 (manuell, nicht Auto)
□ 2.4GHz: Kanalbreite 20 MHz
□ 5GHz: Kanal 36-48 oder 149-161 (kein DFS)
□ 5GHz: Kanalbreite 80 MHz (160 nur wenn keine Nachbarn)
□ Gleiche SSID auf allen Bändern ODER separate nach Strategie

Roaming & Steering:
□ Roaming Assistant: AN mit -75 dBm
□ Smart Connect: Nach Strategie (AN oder AUS)
□ Band Steering: Nach Strategie

AiMesh:
□ Wired Backhaul wenn möglich
□ Nodes mittig platziert, nicht am Rand
□ Max 2 Wireless Hops
□ Gleiche Kanäle auf allen Nodes

Für IoT:
□ Separate 2.4GHz-only SSID
□ WPA2 (nicht WPA3)
□ Roaming/Steering AUS für IoT-SSID

Für Gaming:
□ 5GHz bevorzugen
□ QoS mit Gaming-Priorität
□ Ethernet wenn irgendwie möglich

Zigbee:
□ Zigbee-Kanal geprüft (25/26 optimal)
□ Kein Overlap mit WiFi 2.4GHz Kanal

Regelmäßig prüfen:
□ Firmware-Updates (monatlich)
□ CPU/RAM Auslastung
□ NVRAM nicht voll
□ Keine unbekannten Geräte verbunden
```

---

## 🆕 Neue Features (v1.1.0)

### Quick Diagnosis - Schnelle Problemerkennung

```json
{
  "action": "get_quick_diagnosis"
}
```

**Response enthält:**
- `status`: 🔴 KRITISCH / 🟠 PROBLEME / 🟡 HINWEISE / 🟢 OPTIMAL
- `healthScore`: 0-100
- `quickFixes`: Priorisierte Liste mit Lösungen
- `topPriority`: Das wichtigste Problem zuerst
- `suggestions`: Konkrete nächste Schritte

**Ideal für:** Schneller erster Check, bevor du full_intelligence_scan startest.

### Floor Plan Visualization - Grundriss-Ansicht

**1. Grundriss laden:**
```json
{
  "action": "set_floor_plan",
  "params": {
    "floor": 0,
    "name": "Erdgeschoss",
    "imagePath": "C:/Haus/EG.jpg",
    "widthMeters": 12,
    "heightMeters": 10
  }
}
```

Oder per Base64:
```json
{
  "params": {
    "imageBase64": "data:image/jpeg;base64,/9j/4AAQ...",
    ...
  }
}
```

**2. Visualisierung abrufen:**
```json
{
  "action": "get_floor_visualization",
  "params": { "floor": 0 }
}
```

**Response enthält:**
- `svgOverlay`: SVG zum Überlagern auf dem Grundriss
- `asciiPreview`: Text-Vorschau der Etage
- `nodes`: Router/Nodes mit Pixelpositionen
- `devices`: Geräte mit Signalqualität
- `legend`: Farbcodes und Icons

### Placement Recommendations - Platzierungsempfehlungen

```json
{
  "action": "get_placement_recommendations"
}
```

**Response enthält:**
- Konkrete Empfehlungen zum Verschieben von Geräten/Nodes
- Richtungsangaben (1-2 Meter nach links/rechts)
- Stockwerk-Wechsel-Empfehlungen
- ASCII-Visualisierungen
- Konfidenz-Werte für jede Empfehlung

---

## 📊 Empfohlene Action-Reihenfolge

| Situation | Erste Action | Dann |
|-----------|--------------|------|
| User fragt nach WiFi-Problem | `get_quick_diagnosis` | `full_intelligence_scan` |
| User will Überblick | `get_environment_summary` | Details nach Bedarf |
| User hat Grundriss-Bilder | `set_floor_plan` | `get_floor_visualization` |
| Gerät hat schlechtes Signal | `get_placement_recommendations` | Konkrete Tipps geben |
| Switch-Monitoring | `get_switch_status` | `get_port_traffic` |
| Alles prüfen | `full_intelligence_scan` | Detailanalysen |

---

## 🔌 Switch-Monitoring via SNMP

### Switch-Status abfragen

```json
{
  "action": "get_switch_status",
  "params": { "host": "192.168.1.10" }
}
```

Ohne `host` werden alle konfigurierten Switches abgefragt.

**Response enthält:**

- `name`, `vendor`, `model`: Switch-Identifikation
- `portCount`, `activePorts`: Port-Übersicht
- `totalTraffic`: RX/TX Bytes gesamt
- `poeStatus`: PoE-Leistung (wenn verfügbar)
- `temperature`, `cpuLoad`: Hardware-Monitoring

### Port-Traffic Details

```json
{
  "action": "get_port_traffic",
  "params": {
    "host": "192.168.1.10",
    "port": 5
  }
}
```

Ohne `port` werden alle Ports zurückgegeben.

**Response pro Port:**

- `operStatus`: up/down
- `speed`: Link-Geschwindigkeit
- `traffic.rxBytes`, `traffic.txBytes`: Datenmenge
- `traffic.rxErrors`, `traffic.txErrors`: Fehler
- `traffic.utilizationPercent`: Auslastung

---

## 🏠 Home Assistant Sensoren für Port-Traffic

### SNMP-Integration in configuration.yaml

```yaml
sensor:
  - platform: snmp
    name: "Switch Port 1 RX"
    host: 192.168.1.10
    community: public
    baseoid: 1.3.6.1.2.1.2.2.1.10.1
    unit_of_measurement: "bytes"
    
  - platform: snmp
    name: "Switch Port 1 TX"
    host: 192.168.1.10
    community: public
    baseoid: 1.3.6.1.2.1.2.2.1.16.1
    unit_of_measurement: "bytes"

  - platform: snmp
    name: "Switch Port 1 Status"
    host: 192.168.1.10
    community: public
    baseoid: 1.3.6.1.2.1.2.2.1.8.1
    value_template: "{{ 'up' if value == '1' else 'down' }}"
```

### Template-Sensor für Traffic-Rate

```yaml
template:
  - sensor:
      - name: "Switch Port 1 RX Rate"
        unit_of_measurement: "Mbit/s"
        state: >
          {% set current = states('sensor.switch_port_1_rx') | float %}
          {% set previous = state_attr('sensor.switch_port_1_rx', 'previous') | float(0) %}
          {% set delta = current - previous %}
          {{ (delta * 8 / 1000000) | round(2) }}
```

### Wichtige SNMP OIDs

| OID | Beschreibung |
|-----|--------------|
| `1.3.6.1.2.1.2.2.1.8.X` | Port X Status (1=up) |
| `1.3.6.1.2.1.2.2.1.10.X` | Port X RX Bytes |
| `1.3.6.1.2.1.2.2.1.16.X` | Port X TX Bytes |
| `1.3.6.1.2.1.2.2.1.14.X` | Port X RX Errors |
| `1.3.6.1.2.1.2.2.1.20.X` | Port X TX Errors |
| `1.3.6.1.2.1.2.2.1.5.X` | Port X Speed |

### MikroTik-spezifische OIDs

| OID | Beschreibung |
|-----|--------------|
| `1.3.6.1.4.1.14988.1.1.3.10.0` | Temperatur |
| `1.3.6.1.4.1.14988.1.1.3.14.0` | CPU-Last |
| `1.3.6.1.4.1.14988.1.1.15.1.1.6.X` | PoE Power Port X |

---

---

## 🔔 Alerting & Benachrichtigungen

### Alerts konfigurieren

```json
{
  "action": "configure_alerts",
  "params": {
    "webhookUrl": "https://hooks.example.com/alerts",
    "mqttBroker": "mqtt://192.168.1.50:1883",
    "mqttTopic": "openclaw/alerts",
    "minSeverity": "warning",
    "cooldownMinutes": 15,
    "enabled": true
  }
}
```

**Parameter:**

- `webhookUrl`: HTTP-Endpoint für Alerts (POST)
- `mqttBroker`: MQTT-Broker für Alerts
- `mqttTopic`: MQTT-Topic (default: `openclaw/alerts`)
- `minSeverity`: `info`, `warning`, oder `critical`
- `cooldownMinutes`: Minuten zwischen gleichen Alerts
- `enabled`: Alerting aktivieren

### Aktive Alerts abrufen

```json
{
  "action": "get_alerts",
  "params": { "hours": 24 }
}
```

**Response enthält:**

- `active`: Unbestätigte Alerts
- `history`: Alle Alerts der letzten X Stunden
- `summary`: Zähler nach Severity

---

## 📊 VLAN & PoE Monitoring

### VLAN-Info abfragen

```json
{
  "action": "get_vlan_info",
  "params": { "host": "192.168.1.10" }
}
```

### PoE-Status (MikroTik)

```json
{
  "action": "get_poe_status",
  "params": { "host": "192.168.1.10" }
}
```

### PoE ein/ausschalten

```json
{
  "action": "set_poe_enabled",
  "params": {
    "host": "192.168.1.10",
    "port": 5,
    "enabled": false
  }
}
```

---

## 📍 Roaming-Analyse

### Roaming-Verhalten analysieren

```json
{
  "action": "get_roaming_analysis",
  "params": { "macAddress": "AA:BB:CC:DD:EE:FF" }
}
```

**Response enthält:**

- `totalRoams`: Anzahl Roaming-Events
- `pingPongCount`: Ping-Pong-Roaming-Erkennung
- `avgTimeBetweenRoams`: Durchschnittliche Zeit zwischen Roams
- `mostFrequentTransition`: Häufigste Node-Wechsel
- `recommendation`: Empfehlung zur Verbesserung

---

## 📋 Vollständige Action-Liste (39 Actions)

### Basis

| Action | Beschreibung |
|--------|--------------|
| `scan_network` | Mesh-Netzwerk scannen |
| `get_network_health` | Health Score berechnen |
| `get_device_list` | Geräteliste abrufen |
| `get_device_details` | Geräte-Details |
| `get_device_signal_history` | Signal-Historie |
| `get_mesh_nodes` | Mesh-Nodes abrufen |
| `get_wifi_settings` | WiFi-Einstellungen |
| `set_wifi_channel` | Kanal ändern |
| `get_problems` | Probleme erkennen |
| `get_optimization_suggestions` | Optimierungsvorschläge |
| `apply_optimization` | Optimierung anwenden |

### Zigbee & Frequenz

| Action | Beschreibung |
|--------|--------------|
| `scan_zigbee` | Zigbee scannen |
| `get_zigbee_devices` | Zigbee-Geräte |
| `get_frequency_conflicts` | Frequenzkonflikte |
| `get_channel_scan` | Kanalauslastung |

### Erweitert

| Action | Beschreibung |
|--------|--------------|
| `get_spatial_map` | Räumliche Karte |
| `set_node_position` | Node-Position setzen |
| `get_connection_stability` | Verbindungsstabilität |
| `restart_wireless` | WLAN neustarten |
| `scan_rogue_iot` | IoT-APs erkennen |
| `get_heatmap` | Signal-Heatmap |
| `run_benchmark` | Netzwerk-Benchmark |
| `sync_mesh_settings` | Mesh synchronisieren |
| `analyze_network_topology` | SNMP-Topologie |

### Intelligence

| Action | Beschreibung |
|--------|--------------|
| `full_intelligence_scan` | KI-gestützter Komplett-Scan |
| `get_environment_summary` | Umgebungszusammenfassung |
| `get_homeassistant_data` | Home Assistant Daten |
| `get_quick_diagnosis` | Schnelldiagnose |
| `get_placement_recommendations` | Platzierungsempfehlungen |

### Grundriss

| Action | Beschreibung |
|--------|--------------|
| `set_floor_plan` | Grundriss konfigurieren |
| `get_floor_visualization` | Grundriss visualisieren |

### Switch-Monitoring

| Action | Beschreibung |
|--------|--------------|
| `get_switch_status` | Switch-Status |
| `get_port_traffic` | Port-Traffic |
| `get_vlan_info` | VLAN-Konfiguration |
| `get_poe_status` | PoE-Status |
| `set_poe_enabled` | PoE steuern |

### Roaming & Alerting

| Action | Beschreibung |
|--------|--------------|
| `get_roaming_analysis` | Roaming analysieren |
| `configure_alerts` | Alerts konfigurieren |
| `get_alerts` | Alerts abrufen |

---

*Diese Anleitung wird automatisch aktualisiert wenn neue Features hinzugefügt werden.*
