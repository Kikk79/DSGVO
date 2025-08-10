# Datenschutz-Folgenabschätzung (DPIA) - Schülerbeobachtungssystem

**Erstellungsdatum**: 10.08.2025  
**Version**: 1.0  
**Verantwortlicher**: Schulleitung  
**Datenschutzbeauftragter**: [Name eintragen]

## 1. Systematische Beschreibung der geplanten Verarbeitungsvorgänge

### 1.1 Art der Verarbeitung
**System**: Desktop-Anwendung zur pädagogischen Schülerbeobachtung  
**Zweck**: Dokumentation von Lern- und Entwicklungsbeobachtungen für individuelle Förderung  
**Rechtsgrundlage**: Art. 6 Abs. 1 lit. e DSGVO (öffentliche Aufgabe), Art. 9 Abs. 2 lit. g DSGVO (erhebliches öffentliches Interesse)

### 1.2 Umfang der Verarbeitung
- **Betroffene Personen**: Schüler*innen der Klassen 1-13 (ca. 500 Personen)
- **Kategorien personenbezogener Daten**: 
  - Stammdaten (Name, Klasse)
  - Beobachtungen zu Lernverhalten und -fortschritt
  - Pädagogische Einschätzungen und Förderempfehlungen
- **Verarbeitungsdauer**: Aktive Beobachtungen bis Schuljahresende + 1 Jahr
- **Geografischer Umfang**: Ausschließlich lokal (Schulgebäude, Lehrerheimarbeitsplätze)

### 1.3 Technische Verfahren
- **Speicherung**: Lokal verschlüsselte SQLite-Datenbanken auf 2 Geräten pro Lehrkraft
- **Übertragung**: Point-to-Point Verschlüsselung (mTLS) zwischen Notebook und Desktop
- **Zugriff**: Lokale Anmeldung, optional 2-Faktor-Authentifizierung

## 2. Bewertung der Notwendigkeit und Verhältnismäßigkeit

### 2.1 Rechtmäßigkeit der Verarbeitung
**Rechtsgrundlage Art. 6 DSGVO**: 
- lit. e) Wahrnehmung einer Aufgabe im öffentlichen Interesse (Bildungsauftrag)
- Spezialgesetzliche Grundlagen: Schulgesetze der Länder

**Rechtsgrundlage Art. 9 DSGVO (besondere Kategorien)**:
- lit. g) Verarbeitung aus Gründen eines erheblichen öffentlichen Interesses

### 2.2 Zweckbestimmung und -bindung
**Primärer Zweck**: Individuelle Förderung durch systematische Beobachtung  
**Sekundäre Zwecke**: 
- Entwicklungsdokumentation für Gespräche mit Erziehungsberechtigten
- Grundlage für pädagogische Konferenzen und Förderpläne

**Ausgeschlossene Zwecke**:
- ❌ Leistungsbewertung oder Notengebung
- ❌ Disziplinarische Maßnahmen
- ❌ Weitergabe an Dritte ohne Rechtsgrundlage
- ❌ Kommerzielle Nutzung oder Forschung ohne Einwilligung

### 2.3 Verhältnismäßigkeit
**Datenminimierung**:
- Nur pädagogisch relevante Beobachtungen
- Verzicht auf detaillierte Persönlichkeitsprofile
- Konfigurierbare Datenfelder (Opt-In für sensitive Kategorien)

**Speicherbegrenzung**:
- Automatische Anonymisierung nach 3 Jahren
- Löschung nach spätestens 5 Jahren
- Regelmäßige Prüfung der Erforderlichkeit

## 3. Bewertung der Risiken für Rechte und Freiheiten

### 3.1 Risikoidentifikation

| Risiko-ID | Beschreibung | Betroffene Rechte | Eintrittswahrscheinlichkeit | Schwere |
|-----------|--------------|-------------------|----------------------------|---------|
| R001 | Unbefugter Zugriff auf Beobachtungsdaten | Vertraulichkeit, Privatsphäre | Niedrig | Hoch |
| R002 | Datenverlust durch technische Defekte | Verfügbarkeit, Integrität | Mittel | Mittel |
| R003 | Unbeabsichtigte Weitergabe bei Geräteverlust | Vertraulichkeit | Mittel | Hoch |
| R004 | Diskriminierung durch Beobachtungsverzerrung | Gleichbehandlung, Entwicklung | Niedrig | Sehr hoch |
| R005 | Unerlaubte Datenexporte | Zweckbindung | Niedrig | Hoch |
| R006 | Manipulation von Beobachtungsdaten | Integrität, Fairness | Sehr niedrig | Hoch |

### 3.2 Detaillierte Risikobewertung

#### R001: Unbefugter Zugriff
**Szenario**: Externe oder interne Personen erlangen Zugang zu verschlüsselten Beobachtungsdaten  
**Auswirkungen**: 
- Verletzung der Privatsphäre der Schüler*innen
- Potentielle Stigmatisierung durch sensible Informationen
- Vertrauensverlust in das Bildungssystem

**Betroffene Grundrechte**: Art. 8 GRC (Schutz personenbezogener Daten), Art. 7 GRC (Privatleben)

#### R004: Diskriminierung durch Beobachtungsverzerrung  
**Szenario**: Unbewusste oder bewusste Vorurteile führen zu diskriminierenden Beobachtungen  
**Auswirkungen**:
- Ungleiche Behandlung von Schüler*innen
- Selbstverstärkende negative Entwicklungsspiralen
- Rechtliche Konsequenzen bei nachgewiesener Diskriminierung

**Betroffene Grundrechte**: Art. 21 GRC (Nichtdiskriminierung), Art. 14 GRC (Bildungsrecht)

### 3.3 Risikobewertungsmatrix

```
Schwere/Wahrscheinlichkeit │ Niedrig │ Mittel │ Hoch │ Sehr hoch │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━┼━━━━━━━━━┼━━━━━━━━┼━━━━━━┼━━━━━━━━━━━┤
Sehr niedrig               │   ✓     │   ✓    │  ⚠️   │    🔴     │
Niedrig                    │   ✓     │  ⚠️     │  🔴  │    🔴     │
Mittel                     │  ⚠️      │  🔴    │  🔴  │    🔴     │
Hoch                       │  🔴     │  🔴    │  🔴  │    🔴     │

Legende: ✓ Akzeptabel | ⚠️ Überwachung | 🔴 Maßnahmen erforderlich
```

## 4. Geplante Abhilfemaßnahmen

### 4.1 Technische Maßnahmen

#### Verschlüsselung und Authentifizierung
- **Datenbank-Verschlüsselung**: AES-256-GCM für ruhende Daten
- **Transportverschlüsselung**: TLS 1.3 mit gegenseitiger Authentifizierung
- **Schlüsselverwaltung**: OS-integrierte Keystore-Systeme
- **Zugriffskontrolle**: Gerätepaarung mit kryptographischen Zertifikaten

```rust
// Beispiel: Verschlüsselungsimplementierung
pub struct CryptoManager {
    cipher: ChaCha20Poly1305,
    device_cert: Certificate,
}

impl CryptoManager {
    pub fn encrypt_observation(&self, data: &ObservationData) -> Result<Vec<u8>> {
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
        let ciphertext = self.cipher.encrypt(&nonce, data.as_bytes())?;
        Ok([nonce.as_ref(), &ciphertext].concat())
    }
}
```

#### Datenintegrität und Audit
- **Unveränderliches Audit-Log**: Alle Operationen kryptographisch signiert
- **Checksummen-Validierung**: SHA-256 für Datenintegrität
- **Replay-Schutz**: Nonce-basierte Anfrageverifizierung
- **Backup-Verschlüsselung**: Automatische verschlüsselte Backups

#### Netzwerk-Sicherheit
- **Isolation**: Keine Internet-Verbindung erforderlich
- **mDNS-Filterung**: Nur autorisierte Geräte im lokalen Netz
- **Firewall-Regeln**: Restriktive Port-Konfiguration
- **VPN-Support**: Sichere Verbindung für Remote-Szenarien

### 4.2 Organisatorische Maßnahmen

#### Schulung und Sensibilisierung
- **Datenschutz-Schulung**: Verpflichtende Weiterbildung für alle Nutzer*innen
- **Bias-Training**: Sensibilisierung für unbewusste Vorurteile
- **Technische Einweisung**: Sichere Bedienung der Software
- **Incident Response**: Schulung für Datenschutzvorfälle

#### Qualitätssicherung
- **Vier-Augen-Prinzip**: Kritische Beobachtungen von zweiter Person validieren
- **Regelmäßige Reviews**: Quartalsweise Überprüfung der Beobachtungsqualität
- **Feedback-Systeme**: Mechanismen für Selbst- und Fremdreflektion
- **Supervision**: Fachliche Begleitung bei schwierigen Fällen

#### Governance und Compliance
- **Datenverarbeitung-Register**: Vollständige Dokumentation aller Verarbeitungen
- **Richtlinien-Framework**: Klare Regeln für Beobachtung und Dokumentation
- **Regelmäßige Audits**: Jährliche Compliance-Überprüfung
- **Datenschutz-Management**: Designierte Datenschutzkoordination

### 4.3 Verfahrenstechnische Maßnahmen

#### Einwilligung und Information
- **Informationspflicht**: Transparente Information über Datenverarbeitung
- **Einwilligungsmanagement**: Differenzierte Einwilligungen für optionale Features
- **Widerspruchsrecht**: Einfache Opt-Out Mechanismen
- **Regelmäßige Information**: Updates bei Änderungen der Verarbeitung

#### Betroffenenrechte
- **Auskunftsmechanismus**: Automatisierte Datenexporte in strukturierten Formaten
- **Berichtigungsverfahren**: Einfache Korrektur von fehlerhaften Einträgen
- **Löschungsrecht**: Sichere Datenlöschung mit Bestätigung
- **Datenübertragbarkeit**: Strukturierte Datenexporte für Schulwechsel

#### Qualitätskontrolle
- **Plausibilitätsprüfungen**: Automatische Validierung von Eingaben
- **Konsistenz-Checks**: Überprüfung auf widersprüchliche Beobachtungen
- **Zeitliche Begrenzung**: Automatische Erinnerungen an Aufbewahrungsfristen
- **Anonymisierungs-Pipeline**: Automatisierte Entfernung von Identifikatoren

## 5. Ergebnis der Datenschutz-Folgenabschätzung

### 5.1 Zusammenfassung der Restrisiken

Nach Implementierung aller geplanten Maßnahmen verbleiben folgende Restrisiken:

| Risiko-ID | Restrisiko nach Maßnahmen | Akzeptabilität | Begründung |
|-----------|--------------------------|----------------|-------------|
| R001 | Niedrig | ✅ Akzeptabel | Verschlüsselung + Zugriffskontrolle ausreichend |
| R002 | Sehr niedrig | ✅ Akzeptabel | Backup-Strategien und Redundanz implementiert |
| R003 | Niedrig | ✅ Akzeptabel | Remote-Wipe und Verschlüsselung |
| R004 | Niedrig | ✅ Akzeptabel | Schulung + technische Qualitätssicherung |
| R005 | Sehr niedrig | ✅ Akzeptabel | Audit-Logging aller Exporte |
| R006 | Sehr niedrig | ✅ Akzeptabel | Kryptographische Integrität |

### 5.2 Gesamtbewertung

**Fazit**: Die geplante Datenverarbeitung ist unter Beachtung der implementierten Schutzmaßnahmen **DSGVO-konform und ethisch vertretbar**.

**Begründung**:
1. **Rechtmäßigkeit**: Klare Rechtsgrundlage im öffentlichen Interesse
2. **Verhältnismäßigkeit**: Angemessenes Verhältnis zwischen Nutzen und Eingriffen
3. **Sicherheit**: State-of-the-Art Verschlüsselung und Sicherheitsmaßnahmen
4. **Transparenz**: Vollständige Information der Betroffenen
5. **Kontrollierbarkeit**: Umfassende Audit-Mechanismen
6. **Betroffenenrechte**: Vollständige technische Umsetzung aller DSGVO-Rechte

### 5.3 Empfehlungen

#### Sofortige Maßnahmen (vor Inbetriebnahme)
- [x] Vollständige Verschlüsselung implementieren
- [x] Audit-Logging aktivieren und testen
- [ ] Datenschutz-Schulung für alle Nutzer*innen durchführen
- [ ] Informationsmaterialien für Eltern und Schüler*innen erstellen
- [ ] Incident-Response-Verfahren definieren und kommunizieren

#### Mittelfristige Maßnahmen (6 Monate)
- [ ] Erste Compliance-Überprüfung durchführen
- [ ] Feedback-System für Betroffene etablieren
- [ ] Bias-Detection Mechanismen evaluieren
- [ ] Backup- und Recovery-Verfahren testen

#### Langfristige Überwachung (laufend)
- [ ] Jährliche DPIA-Review durchführen
- [ ] Technologie-Updates auf Datenschutz-Konformität prüfen
- [ ] Nutzerverhalten und Compliance überwachen
- [ ] Wissenschaftliche Begleitung zu Diskriminierungsrisiken

### 5.4 Ansprechpartner und Verantwortlichkeiten

**Verantwortlicher**: Schulleitung  
**Datenschutzbeauftragte(r)**: [Name und Kontakt eintragen]  
**Technische Betreuung**: IT-Abteilung/externe Dienstleister  
**Pädagogische Koordination**: [Name eintragen]

### 5.5 Monitoring und Review

**Review-Zyklus**: Jährlich oder bei wesentlichen Änderungen  
**Nächste geplante Review**: 10.08.2026  
**Auslöser für außerordentliche Review**:
- Neue Rechtsprechung zu Schülerdaten
- Signifikante Technologie-Änderungen
- Datenschutzvorfälle
- Beschwerden von Betroffenen

## Anhänge

### Anhang A: Technische Dokumentation
- Verschlüsselungsstandards und Implementierung
- Netzwerk-Architektur und Sicherheitskonzept
- Backup- und Recovery-Verfahren

### Anhang B: Rechtliche Grundlagen
- Relevante Paragraphen der Schulgesetze
- DSGVO-Artikelzuordnung
- Juristische Gutachten (falls vorhanden)

### Anhang C: Schulungsunterlagen
- Datenschutz-Curriculum für Lehrkräfte
- Bias-Awareness Training
- Technische Bedienungsanleitung

### Anhang D: Vorlagen und Formulare
- Einverständniserklärungen für Eltern
- Information für Schüler*innen (altersgerecht)
- Auskunfts- und Löschungsformulare

---

**Unterschrift Verantwortlicher**: _________________ Datum: __________

**Unterschrift Datenschutzbeauftragte(r)**: _________________ Datum: __________

**Freigabe für Inbetriebnahme**: ☐ Ja ☐ Nein ☐ Mit Auflagen

**Auflagen**: _________________________________________________________________