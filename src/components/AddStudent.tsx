import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

export const AddStudent: React.FC = () => {
  const { classes, createClass, createStudent, loadClasses } = useAppStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [status, setStatus] = useState('active');
  const [classId, setClassId] = useState<number | ''>('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassYear, setNewClassYear] = useState('2024/25');

  const onCreateClass = async () => {
    if (!newClassName.trim()) return;
    await createClass(newClassName.trim(), newClassYear.trim());
    await loadClasses();
    setNewClassName('');
  };

  const onCreateStudent = async () => {
    if (!firstName.trim() || !lastName.trim() || classId === '') return;
    await createStudent(Number(classId), firstName.trim(), lastName.trim(), status);
    setFirstName('');
    setLastName('');
    setStatus('active');
    setClassId('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schüler hinzufügen</h1>
        <p className="text-gray-600 mt-1">Lege Klassen an und füge Schüler*innen hinzu.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-medium text-gray-900">Neue Klasse</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input className="input-field" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="z.B. 5a" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Schuljahr</label>
              <input className="input-field" value={newClassYear} onChange={e => setNewClassYear(e.target.value)} placeholder="2024/25" />
            </div>
            <div>
              <button className="btn-primary" onClick={onCreateClass}>Klasse anlegen</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-medium text-gray-900">Neue/r Schüler*in</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Klasse</label>
              <select className="select-field" value={classId} onChange={e => setClassId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Bitte wählen</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.school_year})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
                <input className="input-field" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
                <input className="input-field" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="select-field" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </select>
            </div>
            <div>
              <button className="btn-primary" onClick={onCreateStudent} disabled={classId === '' || !firstName.trim() || !lastName.trim()}>
                Schüler*in anlegen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

