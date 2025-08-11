import React, { useState } from 'react';
import { Trash2, AlertTriangle, Users, School } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

export const AddStudent: React.FC = () => {
  const { 
    classes, 
    students, 
    createClass, 
    createStudent, 
    deleteStudent, 
    deleteClass, 
    loadClasses, 
    loadStudents 
  } = useAppStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [status, setStatus] = useState('active');
  const [classId, setClassId] = useState<number | ''>('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassYear, setNewClassYear] = useState('2024/25');
  const [deleteConfirm, setDeleteConfirm] = useState<{type: 'student' | 'class', id: number, name: string} | null>(null);
  const [showForceDelete, setShowForceDelete] = useState(false);

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

  const handleDeleteStudent = async (studentId: number, forceDelete: boolean = false) => {
    try {
      await deleteStudent(studentId, forceDelete);
      await loadStudents();
      setDeleteConfirm(null);
      setShowForceDelete(false);
    } catch (error) {
      console.error('Delete failed:', error);
      // If soft delete failed, offer force delete option
      if (!forceDelete && (error as string).includes('observations')) {
        setShowForceDelete(true);
      }
    }
  };

  const handleDeleteClass = async (classId: number, forceDelete: boolean = false) => {
    try {
      await deleteClass(classId, forceDelete);
      await Promise.all([loadClasses(), loadStudents()]);
      setDeleteConfirm(null);
      setShowForceDelete(false);
    } catch (error) {
      console.error('Delete failed:', error);
      // If safe delete failed, offer force delete option
      if (!forceDelete && (error as string).includes('students')) {
        setShowForceDelete(true);
      }
    }
  };

  const confirmDelete = (type: 'student' | 'class', id: number, name: string) => {
    setDeleteConfirm({ type, id, name });
    setShowForceDelete(false);
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
    setShowForceDelete(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schüler & Klassen verwalten</h1>
        <p className="text-gray-600 mt-1">Lege Klassen an, füge Schüler*innen hinzu oder lösche sie.</p>
      </div>

      {/* Create Forms */}
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

      {/* Classes List */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <School className="h-5 w-5 mr-2" />
            Klassen ({classes.length})
          </h2>
        </div>
        {classes.length > 0 ? (
          <div className="space-y-3">
            {classes.map((classItem) => {
              const studentCount = students.filter(s => s.class_id === classItem.id && s.status === 'active').length;
              return (
                <div key={classItem.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">{classItem.name}</h3>
                    <p className="text-sm text-gray-500">
                      {classItem.school_year} • {studentCount} Schüler*innen
                    </p>
                  </div>
                  <button
                    onClick={() => confirmDelete('class', classItem.id, classItem.name)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="Klasse löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <School className="mx-auto h-12 w-12 mb-2 text-gray-300" />
            <p>Keine Klassen vorhanden</p>
          </div>
        )}
      </div>

      {/* Students List */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Schüler*innen ({students.length})
          </h2>
        </div>
        {students.length > 0 ? (
          <div className="space-y-3">
            {students.map((student) => {
              const studentClass = classes.find(c => c.id === student.class_id);
              return (
                <div key={student.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {student.first_name} {student.last_name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {studentClass ? `${studentClass.name} (${studentClass.school_year})` : 'Keine Klasse'} • 
                      Status: {student.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </p>
                  </div>
                  <button
                    onClick={() => confirmDelete('student', student.id, `${student.first_name} ${student.last_name}`)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="Schüler*in löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Users className="mx-auto h-12 w-12 mb-2 text-gray-300" />
            <p>Keine Schüler*innen vorhanden</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-3" />
              <h3 className="text-lg font-medium text-gray-900">
                {deleteConfirm.type === 'student' ? 'Schüler*in' : 'Klasse'} löschen
              </h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              Sind Sie sicher, dass Sie {deleteConfirm.type === 'student' ? 'die Schüler*in' : 'die Klasse'} 
              <strong> {deleteConfirm.name}</strong> löschen möchten?
            </p>

            {deleteConfirm.type === 'student' && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>GDPR-Hinweis:</strong> Schüler*innen mit Beobachtungen werden zunächst als "gelöscht" markiert. 
                  Für eine vollständige Löschung (Recht auf Vergessenwerden) verwenden Sie die "Endgültig löschen" Option.
                </p>
              </div>
            )}

            {deleteConfirm.type === 'class' && (
              <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Warnung:</strong> Klassen mit Schüler*innen können nur mit der "Endgültig löschen" Option gelöscht werden.
                  Dies löscht auch alle zugehörigen Schüler*innen und deren Beobachtungen.
                </p>
              </div>
            )}

            {showForceDelete && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 mb-2">
                  Die {deleteConfirm.type === 'student' ? 'Schüler*in hat' : 'Klasse hat'} noch 
                  {deleteConfirm.type === 'student' ? ' Beobachtungen' : ' aktive Schüler*innen'}.
                </p>
                <p className="text-sm text-red-800">
                  <strong>Endgültiges Löschen entfernt alle Daten unwiderruflich!</strong>
                </p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={cancelDelete}
                className="btn-secondary flex-1"
              >
                Abbrechen
              </button>
              
              {!showForceDelete ? (
                <button
                  onClick={() => deleteConfirm.type === 'student' 
                    ? handleDeleteStudent(deleteConfirm.id, false)
                    : handleDeleteClass(deleteConfirm.id, false)
                  }
                  className="btn-primary bg-red-600 hover:bg-red-700 flex-1"
                >
                  {deleteConfirm.type === 'student' ? 'Als gelöscht markieren' : 'Löschen'}
                </button>
              ) : (
                <button
                  onClick={() => deleteConfirm.type === 'student'
                    ? handleDeleteStudent(deleteConfirm.id, true)
                    : handleDeleteClass(deleteConfirm.id, true)
                  }
                  className="btn-primary bg-red-800 hover:bg-red-900 flex-1"
                >
                  Endgültig löschen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

