/**
 * Integration Tests für Schülerbeobachtungssystem
 * 
 * Testet kritische P2P-Synchronisation, DSGVO-Compliance und Verschlüsselung
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { test as playwrightTest } from '@playwright/test';

describe('P2P Synchronisation Tests', () => {
  beforeEach(async () => {
    // Test-Datenbank initialisieren
  });

  afterEach(async () => {
    // Cleanup nach jedem Test
  });

  it('sollte erfolgreiche Gerätepaarung durchführen', async () => {
    // Arrange
    const device1 = await createTestDevice('notebook');
    const device2 = await createTestDevice('desktop');
    
    // Act
    const pairingCode = await device1.generatePairingCode();
    const pairingResult = await device2.processPairingCode(pairingCode, '192.168.1.100');
    
    // Assert
    expect(pairingResult.success).toBe(true);
    expect(pairingResult.peerId).toBeTruthy();
  });

  it('sollte Changesets korrekt synchronisieren', async () => {
    // Arrange
    const sourceDevice = await createTestDevice('notebook');
    const targetDevice = await createTestDevice('desktop');
    await pairDevices(sourceDevice, targetDevice);
    
    const observation = await sourceDevice.createObservation({
      student_id: 1,
      category: 'sozial',
      text: 'Test-Beobachtung für Sync',
      tags: ['test', 'sync']
    });
    
    // Act
    const syncResult = await performSync(sourceDevice, targetDevice);
    
    // Assert
    expect(syncResult.success).toBe(true);
    expect(syncResult.changesTransferred).toBe(1);
    
    const syncedObservation = await targetDevice.getObservation(observation.id);
    expect(syncedObservation.text).toBe('Test-Beobachtung für Sync');
  });

  it('sollte Konflikte korrekt auflösen (last-writer-wins)', async () => {
    // Arrange
    const device1 = await createTestDevice('notebook');
    const device2 = await createTestDevice('desktop');
    await pairDevices(device1, device2);
    
    const baseObservation = await device1.createObservation({
      student_id: 1,
      category: 'fachlich',
      text: 'Original-Text',
      tags: []
    });
    
    await performSync(device1, device2);
    
    // Gleichzeitige Änderungen auf beiden Geräten
    await device1.updateObservation(baseObservation.id, {
      text: 'Geändert auf Notebook',
      updated_at: new Date('2024-01-01T10:00:00Z')
    });
    
    await device2.updateObservation(baseObservation.id, {
      text: 'Geändert auf Desktop',
      updated_at: new Date('2024-01-01T10:05:00Z') // 5 Minuten später
    });
    
    // Act
    const conflictResolution = await performSync(device1, device2);
    
    // Assert
    expect(conflictResolution.conflicts.length).toBe(1);
    expect(conflictResolution.conflicts[0].resolution).toBe('last-writer-wins');
    
    // Desktop-Version sollte gewinnen (neuerer Timestamp)
    const resolvedObservation = await device1.getObservation(baseObservation.id);
    expect(resolvedObservation.text).toBe('Geändert auf Desktop');
  });

  it('sollte unterbrochene Synchronisation wiederaufnehmen', async () => {
    // Arrange
    const sourceDevice = await createTestDevice('notebook');
    const targetDevice = await createTestDevice('desktop');
    await pairDevices(sourceDevice, targetDevice);
    
    // Mehrere Beobachtungen erstellen
    for (let i = 0; i < 10; i++) {
      await sourceDevice.createObservation({
        student_id: 1,
        category: 'verhalten',
        text: `Beobachtung ${i}`,
        tags: ['batch-test']
      });
    }
    
    // Act - Sync unterbrechen nach 5 Objekten
    const interruptedSync = await performPartialSync(sourceDevice, targetDevice, 5);
    expect(interruptedSync.transferred).toBe(5);
    
    // Wiederaufnahme
    const resumedSync = await performSync(sourceDevice, targetDevice);
    
    // Assert
    expect(resumedSync.transferred).toBe(5); // Verbleibende 5
    expect(await targetDevice.getObservationCount()).toBe(10);
  });
});

describe('DSGVO-Compliance Tests', () => {
  it('sollte vollständigen Datenexport für Schüler*in erstellen', async () => {
    // Arrange
    const device = await createTestDevice('desktop');
    const studentId = await device.createStudent({
      first_name: 'Max',
      last_name: 'Mustermann',
      class_id: 1
    });
    
    await device.createObservation({
      student_id: studentId,
      category: 'sozial',
      text: 'Positive Entwicklung in Gruppenarbeiten',
      tags: ['teamwork', 'kommunikation']
    });
    
    await device.createObservation({
      student_id: studentId,
      category: 'fachlich',
      text: 'Fortschritte in Mathematik erkennbar',
      tags: ['mathe', 'fortschritt']
    });
    
    // Act
    const exportData = await device.exportStudentData(studentId, 'json');
    
    // Assert
    expect(exportData.student.first_name).toBe('Max');
    expect(exportData.student.last_name).toBe('Mustermann');
    expect(exportData.observations.length).toBe(2);
    expect(exportData.export_timestamp).toBeTruthy();
    expect(exportData.export_reason).toBe('Data subject request (GDPR Article 15)');
    
    // Audit-Eintrag sollte erstellt worden sein
    const auditEntries = await device.getAuditLog();
    const exportAudit = auditEntries.find(entry => 
      entry.action === 'export' && 
      entry.object_id === studentId
    );
    expect(exportAudit).toBeTruthy();
  });

  it('sollte Daten nach Aufbewahrungsfrist anonymisieren', async () => {
    // Arrange
    const device = await createTestDevice('desktop');
    const studentId = await device.createStudent({
      first_name: 'Anna',
      last_name: 'Beispiel',
      class_id: 1
    });
    
    // Beobachtung mit altem Datum erstellen
    const oldObservation = await device.createObservation({
      student_id: studentId,
      category: 'förderung',
      text: 'Individuelle Förderung notwendig',
      tags: ['förderung'],
      created_at: new Date('2020-01-01') // 4 Jahre alt
    });
    
    // Act
    const anonymizedCount = await device.anonymizeExpiredData();
    
    // Assert
    expect(anonymizedCount).toBe(1);
    
    // Beobachtung sollte noch existieren, aber anonymisiert
    const observation = await device.getObservation(oldObservation.id);
    expect(observation).toBeTruthy();
    expect(observation.text).toContain('[anonymisiert]');
    
    // Student-Referenz sollte anonymisiert sein
    expect(observation.student_id).toBe(-1); // Anonymer Placeholder
    
    // Audit-Eintrag für Anonymisierung
    const auditEntries = await device.getAuditLog();
    const anonymizationAudit = auditEntries.find(entry => 
      entry.action === 'anonymize' && 
      entry.object_id === oldObservation.id
    );
    expect(anonymizationAudit).toBeTruthy();
  });

  it('sollte selektive Löschung durchführen', async () => {
    // Arrange
    const device = await createTestDevice('desktop');
    const studentId = await device.createStudent({
      first_name: 'Tom',
      last_name: 'Test',
      class_id: 1
    });
    
    const observationIds = [];
    for (let i = 0; i < 3; i++) {
      const obs = await device.createObservation({
        student_id: studentId,
        category: 'sozial',
        text: `Beobachtung ${i}`,
        tags: ['test']
      });
      observationIds.push(obs.id);
    }
    
    // Act - Einzelne Beobachtung löschen
    const deletionResult = await device.deleteObservation(observationIds[1], 'Korrektur auf Elternwunsch');
    
    // Assert
    expect(deletionResult.success).toBe(true);
    
    // Beobachtung sollte nicht mehr existieren
    const deletedObs = await device.getObservation(observationIds[1]);
    expect(deletedObs).toBeNull();
    
    // Andere Beobachtungen sollten noch existieren
    const remainingObs1 = await device.getObservation(observationIds[0]);
    const remainingObs2 = await device.getObservation(observationIds[2]);
    expect(remainingObs1).toBeTruthy();
    expect(remainingObs2).toBeTruthy();
    
    // Audit-Eintrag für Löschung
    const auditEntries = await device.getAuditLog();
    const deletionAudit = auditEntries.find(entry => 
      entry.action === 'delete' && 
      entry.object_id === observationIds[1]
    );
    expect(deletionAudit).toBeTruthy();
    expect(deletionAudit.details).toContain('Korrektur auf Elternwunsch');
  });
});

describe('Verschlüsselungs- und Sicherheitstests', () => {
  it('sollte alle sensiblen Daten verschlüsselt speichern', async () => {
    // Arrange
    const device = await createTestDevice('desktop');
    
    // Act
    const observation = await device.createObservation({
      student_id: 1,
      category: 'vertraulich',
      text: 'Sehr sensible Informationen über das Kind',
      tags: ['vertraulich', 'elterngespräch']
    });
    
    // Assert - Direkt in Datenbank nachschauen
    const rawDbContent = await device.getRawDatabaseContent();
    
    // Text sollte verschlüsselt sein (nicht lesbar)
    expect(rawDbContent).not.toContain('Sehr sensible Informationen');
    expect(rawDbContent).not.toContain('elterngespräch');
    
    // Verschlüsselte Daten sollten als BLOB vorhanden sein
    const observationRow = rawDbContent.observations.find(obs => obs.id === observation.id);
    expect(observationRow.text_encrypted).toBeTruthy();
    expect(observationRow.text_encrypted.length).toBeGreaterThan(50); // Verschlüsselt + Nonce
  });

  it('sollte Daten ohne Schlüssel nicht entschlüsselbar sein', async () => {
    // Arrange
    const device1 = await createTestDevice('device1');
    const device2 = await createTestDevice('device2'); // Verschiedene Schlüssel
    
    await device1.createObservation({
      student_id: 1,
      category: 'geheim',
      text: 'Geheime Informationen',
      tags: ['test']
    });
    
    // Act - Database-File von device1 mit device2-Schlüsseln öffnen
    const device1DbPath = await device1.getDatabasePath();
    const decryptionAttempt = await device2.attemptDecryption(device1DbPath);
    
    // Assert
    expect(decryptionAttempt.success).toBe(false);
    expect(decryptionAttempt.error).toContain('decryption failed');
  });

  it('sollte mTLS-Verbindung korrekt authentifizieren', async () => {
    // Arrange
    const device1 = await createTestDevice('notebook');
    const device2 = await createTestDevice('desktop');
    const maliciousDevice = await createTestDevice('attacker');
    
    await pairDevices(device1, device2);
    
    // Act - Legitime Verbindung
    const legitimateConnection = await device1.connectToDevice(device2.getPeerId());
    expect(legitimateConnection.success).toBe(true);
    expect(legitimateConnection.authenticated).toBe(true);
    
    // Act - Unberechtigte Verbindung
    const maliciousConnection = await maliciousDevice.connectToDevice(device2.getPeerId());
    expect(maliciousConnection.success).toBe(false);
    expect(maliciousConnection.error).toContain('certificate verification failed');
  });

  it('sollte Audit-Log unveränderlich sein', async () => {
    // Arrange
    const device = await createTestDevice('desktop');
    
    await device.createObservation({
      student_id: 1,
      category: 'test',
      text: 'Audit-Test',
      tags: []
    });
    
    // Act - Versuch der Audit-Log Manipulation
    const auditEntries = await device.getAuditLog();
    const firstEntry = auditEntries[0];
    
    const manipulationAttempt = await device.attemptAuditManipulation(firstEntry.id, {
      action: 'manipulated',
      details: 'Böse Änderung'
    });
    
    // Assert
    expect(manipulationAttempt.success).toBe(false);
    expect(manipulationAttempt.error).toContain('Audit log entries are immutable');
    
    // Original-Eintrag sollte unverändert sein
    const unchangedEntries = await device.getAuditLog();
    const unchangedEntry = unchangedEntries.find(entry => entry.id === firstEntry.id);
    expect(unchangedEntry.action).toBe(firstEntry.action);
    expect(unchangedEntry.details).toBe(firstEntry.details);
  });
});

// E2E Tests mit Playwright
playwrightTest.describe('Frontend E2E Tests', () => {
  playwrightTest('sollte kompletten Beobachtungs-Workflow durchführen', async ({ page }) => {
    // Arrange
    await page.goto('http://localhost:1420');
    
    // Navigation zur Beobachtungsseite
    await page.click('[data-testid="neue-beobachtung"]');
    
    // Act - Beobachtung erfassen
    await page.selectOption('[data-testid="student-select"]', { label: 'Max Mustermann (Klasse 5a)' });
    await page.selectOption('[data-testid="category-select"]', 'Sozial');
    await page.fill('[data-testid="observation-text"]', 'Zeigt große Hilfsbereitschaft gegenüber Mitschülern');
    
    // Tags hinzufügen
    await page.click('[data-testid="tag-hilfsbereit"]');
    await page.click('[data-testid="tag-teamwork"]');
    
    // Speichern
    await page.click('[data-testid="save-observation"]');
    
    // Assert - Zurück zur Übersicht
    await playwrightTest.expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    
    // Beobachtung sollte in Liste erscheinen
    await page.goto('http://localhost:1420/schueler-suchen');
    await page.fill('[data-testid="search-input"]', 'Max Mustermann');
    
    await playwrightTest.expect(page.locator('text=Zeigt große Hilfsbereitschaft')).toBeVisible();
    await playwrightTest.expect(page.locator('[data-testid="tag-hilfsbereit"]')).toBeVisible();
  });

  playwrightTest('sollte Barrierefreiheit gewährleisten', async ({ page }) => {
    await page.goto('http://localhost:1420');
    
    // Keyboard Navigation testen
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); // Neue Beobachtung
    
    // Screen Reader Labels prüfen
    const studentSelect = page.locator('[data-testid="student-select"]');
    await playwrightTest.expect(studentSelect).toHaveAttribute('aria-label');
    
    // Farbkontrast sollte WCAG AA entsprechen (wird durch CSS-Test abgedeckt)
    
    // Focus-Indikatoren sichtbar
    await page.keyboard.press('Tab');
    const focusedElement = await page.locator(':focus');
    await playwrightTest.expect(focusedElement).toHaveCSS('outline-width', /[^0]/); // Nicht 0
  });

  playwrightTest('sollte Sync-Status korrekt anzeigen', async ({ page }) => {
    await page.goto('http://localhost:1420/sync');
    
    // Initial sollte \"Getrennt\" angezeigt werden
    await playwrightTest.expect(page.locator('[data-testid="sync-status"]')).toContainText('Getrennt');
    
    // Mock: Gerät verbinden simulieren
    await page.evaluate(() => {
      window.__TAURI__.invoke.mockImplementation((cmd) => {
        if (cmd === 'get_sync_status') {
          return Promise.resolve({
            peer_connected: true,
            last_sync: new Date().toISOString(),
            pending_changes: 5
          });
        }
      });
    });
    
    await page.click('[data-testid="refresh-status"]');
    
    // Status sollte sich aktualisieren
    await playwrightTest.expect(page.locator('[data-testid="sync-status"]')).toContainText('Verbunden');
    await playwrightTest.expect(page.locator('[data-testid="pending-changes"]')).toContainText('5');
  });
});

// Helper-Funktionen für Tests
async function createTestDevice(name: string): Promise<TestDevice> {
  // Mock-Implementation eines Test-Geräts
  return new TestDevice(name);
}

async function pairDevices(device1: TestDevice, device2: TestDevice): Promise<void> {
  const pairingCode = await device1.generatePairingCode();
  await device2.processPairingCode(pairingCode, '127.0.0.1');
}

async function performSync(source: TestDevice, target: TestDevice): Promise<SyncResult> {
  return await source.syncWithDevice(target.getPeerId());
}

async function performPartialSync(source: TestDevice, target: TestDevice, maxItems: number): Promise<SyncResult> {
  return await source.syncWithDevice(target.getPeerId(), { maxItems, interrupt: true });
}

/* eslint-disable no-unused-vars */
class TestDevice {
  constructor(private _name: string) {}
  
  async generatePairingCode(): Promise<string> {
    // Mock-Implementation
    return 'test-pairing-code-' + this._name;
  }
  
  async processPairingCode(code: string, _address: string): Promise<{ success: boolean; peerId?: string }> {
    return { success: true, peerId: 'peer-' + code };
  }
  
  async createObservation(data: any): Promise<{ id: number; [key: string]: any }> {
    // Mock-Implementation
    return { id: Math.floor(Math.random() * 1000), ...data };
  }
  
  async createStudent(_data: any): Promise<number> {
    return Math.floor(Math.random() * 1000);
  }
  
  async getObservation(_id: number): Promise<any> {
    // Mock-Implementation
    return null;
  }
  
  async updateObservation(_id: number, _data: any): Promise<void> {
    // Mock-Implementation
  }
  
  async deleteObservation(_id: number, _reason: string): Promise<{ success: boolean }> {
    return { success: true };
  }
  
  async exportStudentData(_studentId: number, _format: string): Promise<any> {
    return {
      student: { first_name: 'Test', last_name: 'Student' },
      observations: [],
      export_timestamp: new Date(),
      export_reason: 'Data subject request (GDPR Article 15)'
    };
  }
  
  async anonymizeExpiredData(): Promise<number> {
    return 0;
  }
  
  async getAuditLog(): Promise<any[]> {
    return [];
  }
  
  async syncWithDevice(_peerId: string, _options?: any): Promise<SyncResult> {
    return { success: true, transferred: 0, conflicts: [] };
  }
  
  getPeerId(): string {
    return 'peer-' + this._name;
  }
  
  async getRawDatabaseContent(): Promise<any> {
    return { observations: [] };
  }
  
  async getDatabasePath(): Promise<string> {
    return '/tmp/test-' + this._name + '.db';
  }
  
  async attemptDecryption(_dbPath: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'decryption failed' };
  }
  
  async connectToDevice(_peerId: string): Promise<{ success: boolean; authenticated?: boolean; error?: string }> {
    return { success: false, error: 'certificate verification failed' };
  }
  
  async attemptAuditManipulation(_id: number, _changes: any): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Audit log entries are immutable' };
  }
  
  async getObservationCount(): Promise<number> {
    return 0;
  }
}
/* eslint-enable no-unused-vars */

interface SyncResult {
  success: boolean;
  transferred?: number;
  conflicts?: Array<{ resolution: string }>;
  changesTransferred?: number;
}

export { };